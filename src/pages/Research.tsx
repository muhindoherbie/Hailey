import { useState, type FormEvent } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Markdown, Spinner, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { post, ApiError } from '../lib/api';
import { Link, navigate } from '../lib/router';
import { fmtDateTime } from '../lib/format';

export default function Research() {
  const toast = useToast();
  const status = useData<any>('/research/status');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const run = async (e?: FormEvent, q = question) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post('/research', { question: q });
      setResult(r);
      setHistory((h) => [r, ...h.filter((x) => x.question !== r.question)].slice(0, 10));
    } catch (err: any) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!result) return;
    const sources = result.results.map((r: any, i: number) => `${i + 1}. [${r.title}](${r.url})${r.published ? ` — ${r.published}` : ''}`).join('\n');
    const body = `**Question:** ${result.question}\n\n_Searched ${fmtDateTime(result.searchedAt)} via ${result.provider}._\n\n${result.answer ?? '_No AI synthesis — sources only._'}\n\n## Sources\n${sources}`;
    try {
      const n = await post('/notes', { title: `Research: ${result.question.slice(0, 120)}`, body, kind: 'research', tags: ['research'] });
      toast('Saved to Knowledge', 'info', { label: 'Open', run: () => navigate(`/knowledge/notes/${n.id}`) });
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const followUps: string[] = result?.answer
    ? (result.answer.split(/##\s*Suggested follow-up questions/i)[1] ?? '').split('\n').map((l: string) => l.replace(/^\s*[-*\d.]+\s*/, '').trim()).filter((l: string) => l.length > 8).slice(0, 4)
    : [];

  return (
    <Shell title="Research">
      <div className="page narrow">
        <div className="page-head"><div><h1>Research</h1><p className="sub">Live web search with cited sources. Hailey separates what sources say from interpretation and flags gaps.</p></div></div>
        {status.data && !status.data.configured && (
          <div className="callout warning" style={{ marginBottom: 16 }}>
            <Icon name="info" size={18} style={{ flex: 'none', marginTop: 2 }} />
            <div><strong>Web research isn’t set up on this server, so no searches can be performed.</strong> Add a free self-hosted <code>SEARXNG_URL</code> or a <code>BRAVE_SEARCH_API_KEY</code> (free tier) to the server’s <code>.env</code>. Meanwhile you can <Link to="/chat/new">ask Hailey</Link> — answers will come from the model’s existing knowledge, not live sources.</div>
          </div>
        )}
        <form className="ask" onSubmit={run} style={{ marginTop: 0 }}>
          <Icon name="globe" style={{ color: 'var(--brand)' }} />
          <label htmlFor="rq" className="sr-only">Research question</label>
          <input id="rq" data-composer placeholder="What do you want to find out?" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={!status.data?.configured} />
          <button className="btn primary" disabled={busy || !question.trim() || !status.data?.configured}>{busy ? <Spinner /> : 'Research'}</button>
        </form>
        <div style={{ marginTop: 18 }}>
          <ErrorBox error={error} retry={() => run()} />
          {busy && <div className="card pad row"><Spinner /> Searching and reading sources…</div>}
          {!busy && result && (
            <div className="stack-lg">
              <div className="row wrap small muted">
                <span>Searched {fmtDateTime(result.searchedAt)} via {result.provider} · {result.results.length} results</span>
                <span className="spacer" />
                <button className="btn sm" onClick={saveNote}><Icon name="note" size={14} />Save as research note</button>
              </div>
              {result.answer ? (
                <section className="card pad"><Markdown text={result.answer} /><p className="faint tiny" style={{ marginTop: 10 }}>Synthesised by AI from the search snippets below. Open the sources to verify.</p></section>
              ) : (
                <div className="callout small"><Icon name="info" size={16} />{result.answerError ?? 'No AI provider is connected, so only the sources are shown.'}</div>
              )}
              {followUps.length > 0 && (
                <div className="row wrap">{followUps.map((f) => <button key={f} className="btn sm" onClick={() => { setQuestion(f); void run(undefined, f); }}>{f}</button>)}</div>
              )}
              <section>
                <h2 style={{ marginBottom: 10 }}>Sources</h2>
                <ol className="stack" style={{ paddingLeft: 20 }}>
                  {result.results.map((r: any, i: number) => (
                    <li key={i}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" style={{ fontWeight: 600 }}>{r.title}</a>
                      <div className="faint tiny">{r.source}{r.published ? ` · ${r.published}` : ''}</div>
                      <p className="small muted">{r.snippet}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          )}
          {!busy && !result && !error && status.data?.configured && (
            <Empty icon="globe" title="Ask a research question">For example: “What are the current WHO guidelines on antibiotic stewardship in community pharmacies?”</Empty>
          )}
          {history.length > 1 && (
            <section style={{ marginTop: 24 }}>
              <h3 className="muted" style={{ marginBottom: 6 }}>This session</h3>
              <ul className="list">{history.slice(1).map((h) => <li key={h.question} className="list-item clickable" onClick={() => { setResult(h); setQuestion(h.question); }}><Icon name="clock" size={14} /><span className="grow ellipsis small">{h.question}</span></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
