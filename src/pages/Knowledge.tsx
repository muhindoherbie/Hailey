import { useEffect, useRef, useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Loading, StaleNote, fmtBytes, useConfirm, useToast } from '../components/ui';
import { useData, useDebounced } from '../lib/hooks';
import { del, post, upload } from '../lib/api';
import { navigate, useLocation } from '../lib/router';
import { relative } from '../lib/format';

export default function Knowledge() {
  const { query } = useLocation();
  const [tab, setTab] = useState(query.get('tab') ?? 'notes');
  const creating = useRef(false);
  useEffect(() => {
    if (query.get('new') === 'note' && !creating.current) {
      creating.current = true;
      post('/notes', { title: 'Untitled note', body: '' }).then((n) => navigate(`/knowledge/notes/${n.id}?fresh=1`, { replace: true }));
    }
  }, [query]);
  return (
    <Shell title="Knowledge">
      <div className="page">
        <div className="tabs" role="tablist">
          {[['notes', 'Notes'], ['documents', 'Documents'], ['exports', 'Generated files']].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {tab === 'notes' && <Notes />}
        {tab === 'documents' && <Documents autoUpload={!!query.get('upload')} projectId={query.get('project') ?? undefined} />}
        {tab === 'exports' && <Exports />}
      </div>
    </Shell>
  );
}

function Notes() {
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [kind, setKind] = useState('');
  const dq = useDebounced(q);
  const params = new URLSearchParams({ ...(dq ? { q: dq } : {}), ...(folder ? { folder } : {}), ...(kind ? { kind } : {}) });
  const { data, error, loading, stale, reload } = useData<any>(`/notes?${params}`, { cache: true });
  const create = async () => {
    const n = await post('/notes', { title: 'Untitled note', body: '', folder });
    navigate(`/knowledge/notes/${n.id}?fresh=1`);
  };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        <select className="select" style={{ maxWidth: 180 }} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
          <option value="">All folders</option>{data?.folders.map((f: string) => <option key={f}>{f}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 160 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
          <option value="">All types</option><option value="note">Notes</option><option value="article">Articles</option><option value="research">Research</option>
        </select>
        <span className="spacer" />
        <button className="btn primary" onClick={create}><Icon name="plus" size={16} />New note</button>
      </div>
      <StaleNote savedAt={stale} />
      <ErrorBox error={error} retry={reload} />
      {loading && !data ? <Loading /> : data?.notes.length === 0 ? (
        <Empty icon="note" title={dq ? 'No notes match' : 'No notes yet'} action={!dq && <button className="btn primary" onClick={create}>Write your first note</button>}>
          Notes are searchable by you and by Hailey. Save chat answers, research and ideas here.
        </Empty>
      ) : (
        <div className="grid three">
          {data?.notes.map((n: any) => (
            <article key={n.id} className="card pad" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }} onClick={() => navigate(`/knowledge/notes/${n.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/knowledge/notes/${n.id}`)}>
              <div className="row">{n.pinned && <Icon name="pin" size={14} style={{ color: 'var(--accent)' }} />}<h3 className="grow ellipsis">{n.title}</h3>{n.kind !== 'note' && <span className="badge">{n.kind}</span>}</div>
              <p className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 60 }}>{n.excerpt?.replace(/[#*_`>]/g, '') || 'Empty note'}</p>
              <div className="row faint tiny">{n.folder && <span><Icon name="folder" size={11} /> {n.folder}</span>}{n.tags.slice(0, 3).map((t: string) => <span key={t}>#{t}</span>)}<span className="spacer" />{relative(n.updated_at)}</div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function Documents({ autoUpload, projectId }: { autoUpload: boolean; projectId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, error, loading, stale, reload } = useData<any>(`/documents${dq ? `?q=${encodeURIComponent(dq)}` : ''}`, { cache: true });
  const supported = useData<any>('/documents/supported');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoUpload) setTimeout(() => input.current?.click(), 300);
  }, [autoUpload]);

  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const f of [...files]) {
      setBusy(f.name);
      try {
        const r = await upload(f, projectId ? { project_id: projectId } : {});
        toast(`Uploaded ${r.document.filename} (${r.chunks} searchable section${r.chunks === 1 ? '' : 's'})`);
      } catch (e: any) {
        toast(`${f.name}: ${e.message}`, 'error');
      }
    }
    setBusy(null);
    reload();
  };

  return (
    <>
      <div
        className={`dropzone ${over ? 'over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void send(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" hidden multiple accept={supported.data?.extensions.join(',') ?? '.pdf,.txt,.md,.docx,.csv,.xlsx'} onChange={(e) => { void send(e.target.files); e.target.value = ''; }} />
        {busy ? <><span className="spinner" style={{ verticalAlign: 'middle' }} /> Processing {busy}…</> : (
          <>
            <Icon name="upload" size={22} /><div style={{ fontWeight: 600, marginTop: 6 }}>Drop files here or click to upload</div>
            <div className="small faint">PDF (with selectable text), Word (.docx), text, Markdown, CSV, Excel (.xlsx) and photos · up to {supported.data?.maxMb ?? 100} MB (photos are shrunk to fit 5 MB) · macros and formulas are never run</div>
          </>
        )}
      </div>
      <div className="row" style={{ margin: '16px 0 12px' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search by file name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <span className="faint small">Use the search bar (Ctrl K) to search inside documents.</span>
      </div>
      <StaleNote savedAt={stale} />
      <ErrorBox error={error} retry={reload} />
      {loading && !data ? <Loading /> : data?.documents.length === 0 ? (
        <Empty icon="file" title="No documents yet">Upload files so Hailey can summarise, search and analyse them.</Empty>
      ) : (
        <div className="card">
          <ul className="list divided">
            {data?.documents.map((d: any) => (
              <li key={d.id} className="list-item clickable" onClick={() => navigate(`/knowledge/documents/${d.id}`)}>
                <Icon name={d.kind === 'csv' || d.kind === 'xlsx' ? 'chart' : 'file'} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{d.filename}</div>
                  <div className="faint tiny ellipsis">{d.summary ? d.summary.slice(0, 140) : `${d.kind.toUpperCase()} · ${fmtBytes(d.size)} · ${relative(d.created_at)}`}</div>
                </div>
                <span className="badge">{d.kind}</span>
                <button className="btn ghost icon sm" aria-label={`Delete ${d.filename}`} onClick={async (e) => {
                  e.stopPropagation();
                  if (!(await confirm({ title: `Delete ${d.filename}?`, body: 'The file and its extracted text will be permanently deleted.', confirm: 'Delete', danger: true }))) return;
                  try { await del(`/documents/${d.id}`); toast('Deleted'); reload(); } catch (err: any) { toast(err.message, 'error'); }
                }}><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Exports() {
  const toast = useToast();
  const { data, error, loading, reload } = useData<any>('/exports');
  return (
    <>
      <p className="muted small" style={{ marginBottom: 12 }}>Files Hailey generated for you — reports, documents, spreadsheets and presentations.</p>
      <ErrorBox error={error} retry={reload} />
      {loading && !data ? <Loading /> : data?.exports.length === 0 ? (
        <Empty icon="download" title="No generated files yet">Ask Hailey to “turn this into a Word document” or export a chat or analysis.</Empty>
      ) : (
        <div className="card"><ul className="list divided">
          {data?.exports.map((x: any) => (
            <li key={x.id} className="list-item">
              <Icon name="file" />
              <div className="grow" style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontWeight: 600 }}>{x.filename}</div><div className="faint tiny">{x.format.toUpperCase()} · {fmtBytes(x.size)} · {relative(x.created_at)}</div></div>
              <a className="btn sm" href={`/api/exports/${x.id}/download`}><Icon name="download" size={14} />Download</a>
              <button className="btn ghost icon sm" aria-label={`Delete ${x.filename}`} onClick={async () => { await del(`/exports/${x.id}`); toast('Deleted'); reload(); }}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ul></div>
      )}
    </>
  );
}
