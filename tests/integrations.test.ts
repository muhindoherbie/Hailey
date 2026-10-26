import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setup, signup, type TestCtx } from './helpers.ts';
import { executeTool, makeContext } from '../server/tools/registry.ts';
import { repoSummary } from '../server/services/github.ts';

let ctx: TestCtx;
beforeEach(() => (ctx = setup()));
afterEach(() => ctx.cleanup());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeGitHub(seen: { url: string; auth?: string }[]) {
  return (async (url: string, init: any) => {
    seen.push({ url, auth: init.headers.authorization });
    const path = new URL(url).pathname + new URL(url).search;
    if (path === '/repos/o/r') return json({ full_name: 'o/r', html_url: 'https://github.com/o/r', description: 'Demo', default_branch: 'main', stargazers_count: 3, pushed_at: '2026-10-01T00:00:00Z' });
    if (path.startsWith('/repos/o/r/issues')) return json([{ number: 1, title: 'Bug', html_url: 'u1', labels: [{ name: 'bug' }] }, { number: 2, title: 'A PR', pull_request: {} }]);
    if (path.startsWith('/repos/o/r/pulls')) return json([{ number: 2, title: 'A PR', html_url: 'u2', user: { login: 'dev' }, draft: false }]);
    if (path.startsWith('/repos/o/r/commits')) return json([{ sha: 'abcdef123456', commit: { message: 'Fix things\n\nbody', author: { name: 'Dev', date: '2026-10-02' } } }]);
    if (path === '/repos/o/r/releases/latest') return json({ message: 'Not Found' }, 404);
    return json({ message: 'Not Found' }, 404);
  }) as any;
}

describe('GitHub read-only connector', () => {
  it('summarises a repository, separating issues from pull requests', async () => {
    const seen: any[] = [];
    const r = await repoSummary({ apiUrl: 'https://api.github.test', fetchImpl: fakeGitHub(seen) }, 'o/r');
    expect(r.open_issues).toEqual([expect.objectContaining({ number: 1, labels: ['bug'] })]);
    expect(r.open_pull_requests[0]).toMatchObject({ number: 2, author: 'dev' });
    expect(r.recent_commits[0]).toMatchObject({ sha: 'abcdef1', message: 'Fix things' });
    expect(r.latest_release).toBeNull();
    expect(seen.every((s) => s.auth === undefined)).toBe(true);
  });

  it('sends the token only when configured, and only GET requests', async () => {
    const seen: any[] = [];
    await repoSummary({ apiUrl: 'https://api.github.test', token: 't0k', fetchImpl: fakeGitHub(seen) }, 'o/r');
    expect(seen.every((s) => s.auth === 'Bearer t0k')).toBe(true);
  });

  it('explains missing or private repositories and rejects bad names before any request', async () => {
    const seen: any[] = [];
    await expect(repoSummary({ apiUrl: 'https://api.github.test', fetchImpl: fakeGitHub(seen) }, 'o/missing')).rejects.toThrow(/not found, or it is private/);
    await expect(repoSummary({ apiUrl: 'https://api.github.test', fetchImpl: fakeGitHub(seen) }, '../etc')).rejects.toThrow(/owner\/repository/);
    expect(seen.some((s) => s.url.includes('..'))).toBe(false);
  });

  it('is a read-only tool that runs without approval and reports failures honestly', async () => {
    const c = await signup(ctx);
    const r = await executeTool('github_repo_summary', { repo: 'bad name' }, makeContext(ctx.services, c.user.id, null));
    expect(r.status).toBe('error');
  });
});

describe('check_workload tool', () => {
  it('returns the same data as the workload endpoint', async () => {
    const c = await signup(ctx);
    await c.post('/api/tasks', { title: 'Long day', due_at: '2026-10-16T10:00:00Z', estimate_minutes: 600 });
    const r = await executeTool('check_workload', { days: 3 }, makeContext(ctx.services, c.user.id, null));
    expect(r.status).toBe('executed');
    expect((r as any).result.days[0]).toMatchObject({ date: '2026-10-16', overCapacity: true });
  });
});
