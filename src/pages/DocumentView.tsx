import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { BarChart, ErrorBox, LineChart, Loading, fmtBytes, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { del, post } from '../lib/api';
import { Link, navigate } from '../lib/router';
import { fmtDateTime } from '../lib/format';
import { useSession } from '../lib/session';
import { ApiDownload, ApiImg } from '../components/ApiFile';

export default function DocumentView({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useSession();
  const { data: d, error, loading, reload, setData } = useData<any>(`/documents/${id}`);
  const isSheet = d && (d.kind === 'csv' || d.kind === 'xlsx');
  const isImage = d?.kind === 'image';
  const [sheet, setSheet] = useState('');
  const analysis = useData<any>(isSheet ? `/documents/${id}/analysis${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}` : null);
  const [summarizing, setSummarizing] = useState(false);
  const [showText, setShowText] = useState(false);
  const ai = me!.server.providers.some((p) => p.configured);

  if (loading && !d) return <Shell title="Document"><div className="page"><Loading /></div></Shell>;
  if (!d) return <Shell title="Document"><div className="page"><ErrorBox error={error} retry={reload} /></div></Shell>;

  const summarize = async () => {
    setSummarizing(true);
    try {
      const r = await post(`/documents/${id}/summarize`);
      setData({ ...d, summary: r.summary, key_points: r.key_points });
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSummarizing(false);
    }
  };
  const ask = async () => {
    const conv = await post('/conversations', { project_id: d.project_id ?? null, title: d.filename });
    sessionStorage.setItem(`hailey:first:${conv.id}`, JSON.stringify({ text: isSheet ? `Analyse this spreadsheet and tell me what stands out.` : isImage ? 'What can you tell me about this image?' : `Help me understand this document. What are the most important points?`, attachments: [id] }));
    navigate(`/chat/${conv.id}`);
  };
  const report = async (format: string) => {
    try {
      const r = await post(`/documents/${id}/report`, { format });
      window.location.href = r.download_url;
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const a = analysis.data?.analysis;
  return (
    <Shell title={<Link to="/knowledge?tab=documents" className="muted">Documents</Link>} actions={
      <>
        <ApiDownload className="btn sm" href={`/api/documents/${id}/download`} name={d.filename}><Icon name="download" size={15} /><span className="desktop-only">Original</span></ApiDownload>
        <button className="btn primary sm" onClick={ask} disabled={!ai}><Icon name="chat" size={15} /><span className="desktop-only">Ask Hailey</span></button>
      </>
    }>
      <div className="page">
        <div className="page-head">
          <div className="grow">
            <h1 className="ellipsis">{d.filename}</h1>
            <div className="sub small">{d.kind.toUpperCase()} · {fmtBytes(d.size)}{isImage ? '' : ` · ${d.text_chars.toLocaleString()} characters extracted`} · uploaded {fmtDateTime(d.created_at)}</div>
          </div>
        </div>

        {isImage && (
          <section className="card pad">
            <ApiImg className="doc-image" src={`/api/documents/${id}/preview`} alt={d.filename} />
            <p className="faint small" style={{ marginTop: 8 }}>Use <b>Ask Hailey</b> to have the AI look at this image. That needs a model that can view images, such as Claude.</p>
          </section>
        )}

        {!isSheet && !isImage && (
          <section className="card pad stack">
            <div className="row"><h2 className="grow">Summary</h2>
              <button className="btn sm" onClick={summarize} disabled={summarizing || !ai}>{summarizing ? 'Summarising…' : d.summary ? 'Regenerate' : 'Summarise'}</button>
            </div>
            {!ai && <p className="faint small">Connect an AI provider to generate summaries.</p>}
            {d.summary ? <p>{d.summary}</p> : !summarizing && ai && <p className="faint small">No summary yet.</p>}
            {d.key_points.length > 0 && (<><h3>Key points</h3><ul>{d.key_points.map((k: string, i: number) => <li key={i}>{k}</li>)}</ul></>)}
            {d.summary && <p className="faint tiny">AI-generated from the extracted text. Check important details against the original.</p>}
          </section>
        )}

        {isSheet && (
          <section className="stack-lg">
            {analysis.loading && !a && <Loading />}
            <ErrorBox error={analysis.error} retry={analysis.reload} />
            {a && (
              <>
                <div className="row wrap">
                  {analysis.data.sheets.length > 1 && (
                    <select className="select" style={{ maxWidth: 220 }} value={sheet || a.sheet} onChange={(e) => setSheet(e.target.value)} aria-label="Sheet">{analysis.data.sheets.map((s: string) => <option key={s}>{s}</option>)}</select>
                  )}
                  <span className="badge">{a.rowCount.toLocaleString()} rows</span>
                  <span className="badge">{a.columns.length} columns</span>
                  <span className="spacer" />
                  <span className="small muted">Report:</span>
                  {['docx', 'pdf', 'xlsx', 'md'].map((f) => <button key={f} className="btn sm" onClick={() => report(f)}>{f.toUpperCase()}</button>)}
                </div>
                {a.cleaning.length > 0 && <div className="callout warning small"><Icon name="info" size={16} /><div>{a.cleaning.map((c: string) => <div key={c}>{c}</div>)}</div></div>}
                <div className="card">
                  <div className="card-head"><h3>Columns</h3></div>
                  <div className="card-body table-wrap" style={{ border: 0 }}>
                    <table className="data">
                      <thead><tr><th>Column</th><th>Type</th><th>Values</th><th>Missing</th><th>Sum</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr></thead>
                      <tbody>{a.columns.map((c: any) => (
                        <tr key={c.name}><td>{c.name}</td><td><span className="badge">{c.type}</span></td><td>{c.count}</td><td style={{ color: c.missing ? 'var(--warning)' : undefined }}>{c.missing}</td><td>{fmt(c.sum)}</td><td>{fmt(c.mean)}</td><td>{fmt(c.median)}</td><td>{fmt(c.min)}</td><td>{fmt(c.max)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
                <div className="grid two">
                  {a.rankings.map((r: any) => (
                    <div key={r.by} className="card pad"><h3 style={{ marginBottom: 8 }}>Top {r.group} by total {r.by}</h3><BarChart data={r.items.map((i: any) => ({ label: i.label, value: i.total }))} /></div>
                  ))}
                  {a.trends.map((t: any) => (
                    <div key={t.value} className="card pad">
                      <h3>{t.value} by month</h3>
                      <p className="small muted" style={{ marginBottom: 8 }}>{t.direction}{t.changePct != null ? ` · ${t.changePct > 0 ? '+' : ''}${t.changePct}% first → last month` : ''}</p>
                      <LineChart data={t.points.map((p: any) => ({ label: p.period, value: p.total }))} />
                    </div>
                  ))}
                </div>
                {a.anomalies.length > 0 && (
                  <div className="card pad"><h3 style={{ marginBottom: 6 }}>Values worth checking</h3>
                    <ul className="small">{a.anomalies.slice(0, 15).map((x: any, i: number) => <li key={i}>Row {x.row}, <strong>{x.column}</strong>: {x.value.toLocaleString()} — {x.reason}</li>)}</ul>
                  </div>
                )}
                <div className="card pad small muted"><strong>How these figures were calculated</strong><ul>{a.notes.map((n: string) => <li key={n}>{n}</li>)}</ul></div>
                <div className="card"><div className="card-head"><h3>Preview (first 100 rows)</h3></div>
                  <div className="card-body"><div className="table-wrap"><table className="data">
                    <thead><tr>{analysis.data.preview.headers.map((h: string) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{analysis.data.preview.rows.map((r: any[], i: number) => <tr key={i}>{r.map((c, j) => <td key={j}>{c ?? ''}</td>)}</tr>)}</tbody>
                  </table></div></div>
                </div>
              </>
            )}
          </section>
        )}

        {!isImage && <section style={{ marginTop: 18 }}>
          <button className="btn ghost sm" onClick={() => setShowText((s) => !s)} aria-expanded={showText}><Icon name={showText ? 'chevronDown' : 'chevronRight'} size={14} />Extracted text ({d.chunks.length} sections)</button>
          {showText && (
            <div className="stack" style={{ marginTop: 10 }}>
              {d.chunks.map((c: any) => (
                <div key={c.seq} className="card pad small"><div className="badge" style={{ marginBottom: 6 }}>{c.locator}</div><pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{c.text}</pre></div>
              ))}
            </div>
          )}
        </section>}

        <div style={{ marginTop: 24 }}>
          <button className="btn danger sm" onClick={async () => {
            if (!(await confirm({ title: `Delete ${d.filename}?`, body: 'The file and its extracted text will be permanently deleted.', confirm: 'Delete', danger: true }))) return;
            await del(`/documents/${id}`);
            toast('Document deleted');
            navigate('/knowledge?tab=documents');
          }}><Icon name="trash" size={14} />Delete document</button>
        </div>
      </div>
    </Shell>
  );
}

const fmt = (v: any) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v));
