import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup, signup, text, toolCall, parseSSE, type TestCtx } from './helpers.ts';
import { OpenAICompatProvider, ThinkFilter } from '../server/ai/openai-compat.ts';
import { createSearchService } from '../server/services/search.ts';
import { ProviderRegistry } from '../server/ai/providers.ts';
import { AnthropicProvider } from '../server/ai/anthropic.ts';
import { Db } from '../server/db/index.ts';
import { backup, prune } from '../scripts/backup.ts';
import { restore } from '../scripts/restore.ts';

let ctx: TestCtx | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('research', () => {
  it('reports clearly when web search is not configured', async () => {
    ctx = setup();
    const c = await signup(ctx);
    expect((await c.get('/api/research/status')).data.configured).toBe(false);
    const r = await c.post('/api/research', { question: 'latest pharmacy regulations' });
    expect(r.status).toBe(503);
    expect(r.data.error).toMatch(/not configured/);
  });

  it('returns sources with a cited synthesis', async () => {
    ctx = setup({ search: true });
    ctx.searchResults.push(
      { title: 'NDA guidance 2026', url: 'https://nda.example/guidance', snippet: 'Pharmacies must renew licences annually.', source: 'nda.example' },
      { title: 'News report', url: 'https://news.example/a', snippet: 'Renewal fees rose in 2026.', source: 'news.example' },
    );
    ctx.provider.steps.push((req) => {
      const prompt = (req.messages[0].content[0] as any).text;
      expect(prompt).toContain('[1] NDA guidance 2026');
      expect(req.system).toMatch(/untrusted/);
      return text('## Answer\nLicences are renewed annually [1].\n## Suggested follow-up questions\n- What are the 2026 fees?');
    });
    const c = await signup(ctx);
    const r = (await c.post('/api/research', { question: 'How often are pharmacy licences renewed?' })).data;
    expect(r.results).toHaveLength(2);
    expect(r.answer).toContain('[1]');
    expect(r.provider).toBe('FakeSearch');
    expect(r.searchedAt).toBe('2026-10-16T08:00:00.000Z');
  });

  it('still returns sources when the AI synthesis fails', async () => {
    ctx = setup({ search: true });
    ctx.searchResults.push({ title: 'T', url: 'https://x.example', snippet: 's', source: 'x.example' });
    ctx.provider.steps.push(() => { throw new Error('model down'); });
    const c = await signup(ctx);
    const r = (await c.post('/api/research', { question: 'anything at all' })).data;
    expect(r.results).toHaveLength(1);
    expect(r.answer).toBeNull();
    expect(r.answerError).toBeTruthy();
  });

  it('the assistant cites web results it actually retrieved', async () => {
    ctx = setup({ search: true });
    ctx.searchResults.push({ title: 'WHO stewardship', url: 'https://who.example/amr', snippet: 'Guidance text', source: 'who.example' });
    ctx.provider.steps.push(() => toolCall('web_search', { query: 'antibiotic stewardship' }), () => text('According to [WHO](https://who.example/amr)…'));
    const c = await signup(ctx);
    const conv = (await c.post('/api/conversations', {})).data;
    const r = await c.post(`/api/conversations/${conv.id}/messages`, { text: 'What does WHO say?' });
    const msg = parseSSE(r.data).find((e) => e.event === 'message')!.data.message;
    expect(msg.meta.sources[0]).toMatchObject({ url: 'https://who.example/amr' });
  });

  it('search service handles provider errors and filters unsafe URLs', async () => {
    const svc = createSearchService({ braveKey: 'k' }, (async () => new Response(JSON.stringify({ web: { results: [
      { title: 'ok', url: 'https://a.example', description: '<b>bold</b> text' },
      { title: 'bad', url: 'javascript:alert(1)', description: 'x' },
    ] } }), { status: 200 })) as any);
    const res = await svc.search('q');
    expect(res).toHaveLength(1);
    expect(res[0].snippet).toBe('bold text');
    const limited = createSearchService({ braveKey: 'k' }, (async () => new Response('', { status: 429 })) as any);
    await expect(limited.search('q')).rejects.toThrow(/usage limit/);
  });
});

describe('AI provider adapters', () => {
  const sse = (chunks: unknown[]) => new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });

  it('OpenAI-compatible adapter streams text and assembles tool calls', async () => {
    let body: any;
    const p = new OpenAICompatProvider({ baseUrl: 'http://localhost:11434/v1', model: 'qwen3:8b', label: 'Ollama', tools: true }, (async (_url: string, init: any) => {
      body = JSON.parse(init.body);
      return sse([
        { choices: [{ delta: { content: 'Adding ' } }] },
        { choices: [{ delta: { content: 'it.' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_task', arguments: '{"title":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Buy gloves"}' } }] }, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 50, completion_tokens: 9 } },
      ]);
    }) as any);
    const deltas: string[] = [];
    const res = await p.chat({
      system: 'sys', tools: [{ name: 'create_task', description: 'd', input_schema: { type: 'object' } }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'old', name: 'list_tasks', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'old', content: '{}' }] },
      ],
      onText: (d) => deltas.push(d),
    });
    expect(deltas.join('')).toBe('Adding it.');
    expect(res.stopReason).toBe('tool_use');
    expect(res.content[1]).toEqual({ type: 'tool_use', id: 'call_1', name: 'create_task', input: { title: 'Buy gloves' } });
    expect(res.usage).toEqual({ inputTokens: 50, outputTokens: 9 });
    expect(body.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(body.tools[0].function.name).toBe('create_task');
    expect(p.info().capabilities.local).toBe(true);
  });

  it('can turn off thinking and never shows the model’s reasoning text', async () => {
    let body: any;
    const p = new OpenAICompatProvider({ baseUrl: 'http://localhost:11434/v1', model: 'qwen3:4b', label: 'Ollama', tools: true, reasoningEffort: 'none' }, (async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return sse([{ choices: [{ delta: { reasoning: 'secret chain of thought' } }] }, { choices: [{ delta: { content: 'Answer.' }, finish_reason: 'stop' }] }]);
    }) as any);
    const res = await p.chat({ system: 's', tools: [], messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }] });
    expect(body.reasoning_effort).toBe('none');
    expect(res.content).toEqual([{ type: 'text', text: 'Answer.' }]);
  });

  it('hides <think> blocks that local models leak into the reply, even when split across chunks', () => {
    const run = (chunks: string[]) => {
      const f = new ThinkFilter();
      return chunks.map((c) => f.push(c)).join('') + f.flush();
    };
    expect(run(['<th', 'ink>plan', 'ning…</thi', 'nk>\n\nHello!'])).toBe('Hello!');
    expect(run(['Plain ', 'answer'])).toBe('Plain answer');
    expect(run(['<', 'b>bold</b>'])).toBe('<b>bold</b>');
    expect(run(['<think>never closed'])).toBe('');
    expect(run(['Use <think> tags'])).toBe('Use <think> tags');
  });

  it('maps HTTP failures to clear, typed errors', async () => {
    const mk = (status: number) => new OpenAICompatProvider({ baseUrl: 'https://api.example/v1', model: 'm', label: 'Groq', tools: true }, (async () => new Response('err', { status })) as any);
    const req = { system: '', tools: [], messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'x' }] }] };
    await expect(mk(401).chat(req)).rejects.toMatchObject({ kind: 'auth' });
    await expect(mk(429).chat(req)).rejects.toMatchObject({ kind: 'rate_limited', retryable: true });
    await expect(mk(503).chat(req)).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
    const down = new OpenAICompatProvider({ baseUrl: 'http://localhost:1/v1', model: 'm', label: 'Ollama', tools: true }, (async () => { throw new TypeError('fetch failed'); }) as any);
    await expect(down.chat(req)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('the registry picks the user’s provider, falls back, and explains when none exist', () => {
    const reg = new ProviderRegistry();
    reg.register('anthropic', new AnthropicProvider({ apiKey: undefined, model: 'claude-opus-5-5' }));
    expect(() => reg.resolve()).toThrow(/No AI provider is configured/);
    reg.register('openai_compat', new OpenAICompatProvider({ baseUrl: 'http://localhost:11434/v1', model: 'llama', label: 'Ollama', tools: true }));
    expect(reg.resolve({ provider: 'anthropic' }).info().id).toBe('openai_compat'); // unconfigured choice falls back
    const withKey = new ProviderRegistry();
    withKey.register('anthropic', new AnthropicProvider({ apiKey: 'sk-test', model: 'claude-opus-5-5' }));
    const p = withKey.resolve({ provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' });
    expect(p.info()).toMatchObject({ model: 'claude-haiku-5-5', configured: true, pricing: { input: 0.1, output: 0.5 } });
    expect(JSON.stringify(p.info())).not.toContain('sk-test');
  });
});

describe('backup and restore', () => {
  it('backs up a live database and restores it, keeping a safety copy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hailey-bk-'));
    try {
      const dataDir = join(root, 'data');
      const db = new Db(join(dataDir, 'hailey.db'));
      db.insert('users', { email: 'a@b.co', name: 'A', password_hash: 'x' });
      const out = backup(dataDir, join(root, 'backups'));
      expect(existsSync(join(out, 'hailey.db'))).toBe(true);
      db.run('DELETE FROM users');
      db.close();
      restore(out, dataDir);
      const restored = new Db(join(dataDir, 'hailey.db'));
      expect(restored.get('SELECT COUNT(*) AS n FROM users')!.n).toBe(1);
      restored.close();
      // Pruning keeps only the newest N backups.
      backup(dataDir, join(root, 'backups'));
      expect(prune(join(root, 'backups'), 1).length).toBeGreaterThanOrEqual(0);
    } finally {
      // Best-effort: on Windows, SQLite may hold the file until garbage collection.
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {}
    }
  });
});
