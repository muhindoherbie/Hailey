/**
 * Read-only GitHub connector: a summary of one repository (metadata, open issues and pull
 * requests, latest release, recent commits). It never writes. Everything returned is
 * third-party content and is treated as untrusted by the agent.
 */
export class GitHubError extends Error {}

export const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

type Fetch = typeof fetch;

export async function repoSummary(opts: { token?: string; apiUrl: string; fetchImpl?: Fetch }, repo: string) {
  if (!REPO_RE.test(repo)) throw new GitHubError('Use the form owner/repository, e.g. muhindoherbie/Hailey.');
  const f = opts.fetchImpl ?? fetch;
  const get = async (path: string) => {
    const res = await f(`${opts.apiUrl}/repos/${repo}${path}`, {
      headers: {
        accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Hailey',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) throw new GitHubError(`GitHub repository ${repo} was not found${opts.token ? '' : ', or it is private (set GITHUB_TOKEN on the server for private repositories)'}.`);
    if (res.status === 401) throw new GitHubError('The GitHub token on the server was rejected.');
    if (res.status === 403 || res.status === 429) throw new GitHubError('GitHub rate limit reached. Try again later, or set GITHUB_TOKEN on the server for a higher limit.');
    if (!res.ok) throw new GitHubError(`GitHub returned an error (${res.status}).`);
    return res.json() as Promise<any>;
  };
  const meta = await get('');
  const [issues, pulls, commits, release] = await Promise.all([
    get('/issues?state=open&per_page=20'),
    get('/pulls?state=open&per_page=10'),
    get(`/commits?per_page=5&sha=${encodeURIComponent(meta.default_branch)}`),
    get('/releases/latest').catch((e) => (e instanceof GitHubError && /not found/.test(e.message) ? null : Promise.reject(e))),
  ]);
  const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    repo: meta.full_name, url: meta.html_url, description: clip(meta.description, 300), private: !!meta.private,
    default_branch: meta.default_branch, stars: meta.stargazers_count, pushed_at: meta.pushed_at,
    open_issues: (issues as any[]).filter((i) => !i.pull_request).slice(0, 10)
      .map((i) => ({ number: i.number, title: clip(i.title, 200), url: i.html_url, labels: (i.labels ?? []).map((l: any) => l.name), updated_at: i.updated_at })),
    open_pull_requests: (pulls as any[]).map((p) => ({ number: p.number, title: clip(p.title, 200), url: p.html_url, author: p.user?.login, draft: !!p.draft, updated_at: p.updated_at })),
    latest_release: release ? { tag: release.tag_name, name: clip(release.name, 200), url: release.html_url, published_at: release.published_at } : null,
    recent_commits: (commits as any[]).map((c) => ({ sha: String(c.sha).slice(0, 7), message: clip(c.commit?.message?.split('\n')[0], 200), author: c.commit?.author?.name, date: c.commit?.author?.date })),
  };
}
