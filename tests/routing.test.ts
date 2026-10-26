import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setup, signup, text, type TestCtx } from './helpers.ts';
import { ProviderRegistry } from '../server/ai/providers.ts';
import { ProviderError, type AIProvider } from '../server/ai/types.ts';

const fake = (id: string, configured: boolean, local: boolean): AIProvider => ({
  info: () => ({ id, label: id, model: 'm', configured, capabilities: { tools: true, streaming: true, local } }),
  chat: async () => { throw new Error('not used'); },
});

function registry(localUp: boolean) {
  const r = new ProviderRegistry();
  r.register('cloud', fake('cloud', true, false));
  r.register('ollama', fake('ollama', localUp, true));
  return r;
}

describe('provider routing privacy', () => {
  it('uses the chosen provider when it is available', () => {
    expect(registry(true).resolve({ provider: 'ollama' }).info().id).toBe('ollama');
    expect(registry(true).resolve({ provider: 'cloud' }).info().id).toBe('cloud');
  });

  it('never silently falls back from a chosen local model to the cloud', () => {
    expect(() => registry(false).resolve({ provider: 'ollama' })).toThrow(ProviderError);
    expect(() => registry(false).resolve({ provider: 'ollama' })).toThrow(/will not send this to a cloud provider/);
  });

  it('local-only mode restricts routing to local providers', () => {
    expect(registry(true).resolve({ provider: 'cloud', localOnly: true }).info().id).toBe('ollama');
    expect(() => registry(false).resolve({ localOnly: true })).toThrow(/No local model is available/);
  });

  it('keeps the existing fallback between configured providers otherwise', () => {
    expect(registry(false).resolve({}).info().id).toBe('cloud');
  });
});


describe('provider connection test', () => {
  let ctx: TestCtx;
  beforeEach(() => (ctx = setup()));
  afterEach(() => ctx.cleanup());

  it('reports a working provider with latency and records the tokens it used', async () => {
    const c = await signup(ctx);
    ctx.provider.steps.push(() => text('OK'));
    const r = (await c.post('/api/ai/test', {})).data.results;
    expect(r).toEqual([expect.objectContaining({ id: 'fake', ok: true, model: 'fake-1' })]);
    expect(typeof r[0].latencyMs).toBe('number');
    expect((await c.get('/api/usage')).data.last24h.input).toBe(100);
  });

  it('reports provider errors without throwing', async () => {
    const c = await signup(ctx);
    ctx.provider.steps.push(() => { throw new ProviderError('auth', 'Invalid API key.'); });
    const r = (await c.post('/api/ai/test', {})).data.results;
    expect(r[0]).toMatchObject({ ok: false, kind: 'auth', error: 'Invalid API key.' });
  });
});
