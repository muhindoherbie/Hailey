import { useEffect, useRef, useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { ErrorBox, Loading, Markdown, Modal, StaleNote, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { api, del, patch, post } from '../lib/api';
import { Link, navigate, useLocation } from '../lib/router';
import { relative } from '../lib/format';

export default function NoteEditor({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { query } = useLocation();
  const { data, error, loading, stale, reload } = useData<any>(`/notes/${id}`, { cache: true });
  const projects = useData<any>('/projects?status=active');
  const [note, setNote] = useState<any>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>(query.get('fresh') ? 'edit' : 'preview');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [linking, setLinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<any>(null);

  useEffect(() => {
    if (data && !note) setNote({ ...data, tagsText: data.tags.join(', ') });
  }, [data, note]);

  // Autosave shortly after typing stops.
  const update = (k: string, v: any) => {
    const next = { ...note, [k]: v };
    setNote(next);
    latest.current = next;
    setSaving('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };
  const save = async () => {
    const n = latest.current;
    if (!n) return;
    try {
      await patch(`/notes/${id}`, {
        title: n.title.trim() || 'Untitled note', body: n.body, folder: n.folder, kind: n.kind, pinned: n.pinned,
        tags: n.tagsText.split(',').map((t: string) => t.trim()).filter(Boolean), project_id: n.project_id || null,
      });
      setSaving('saved');
    } catch (e: any) {
      setSaving('error');
      toast(e.message, 'error');
    }
  };
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      void save();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Shell title="Note"><div className="page narrow"><Loading /></div></Shell>;
  if (!note) return <Shell title="Note"><div className="page narrow"><ErrorBox error={error} retry={reload} /></div></Shell>;

  return (
    <Shell title={<Link to="/knowledge" className="muted">Knowledge</Link>} actions={
      <>
        <span className="faint small" aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : ''}</span>
        <div className="seg">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Read</button>
        </div>
      </>
    }>
      <div className="page narrow">
        <StaleNote savedAt={stale} />
        <input className="input" style={{ fontSize: '1.5rem', fontWeight: 700, border: 0, padding: '4px 0', background: 'none' }} value={note.title} onChange={(e) => update('title', e.target.value)} aria-label="Title" disabled={!!stale} />
        <div className="row wrap small" style={{ margin: '8px 0 16px' }}>
          <select className="select" style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }} value={note.kind} onChange={(e) => update('kind', e.target.value)} aria-label="Type" disabled={!!stale}>
            <option value="note">Note</option><option value="article">Article</option><option value="research">Research</option>
          </select>
          <input className="input" style={{ width: 150, minHeight: 32, padding: '4px 8px' }} placeholder="Folder" value={note.folder} onChange={(e) => update('folder', e.target.value)} aria-label="Folder" disabled={!!stale} />
          <input className="input" style={{ width: 200, minHeight: 32, padding: '4px 8px' }} placeholder="tags, comma separated" value={note.tagsText} onChange={(e) => update('tagsText', e.target.value)} aria-label="Tags" disabled={!!stale} />
          <select className="select" style={{ width: 'auto', minHeight: 32, padding: '4px 8px' }} value={note.project_id ?? ''} onChange={(e) => update('project_id', e.target.value)} aria-label="Project" disabled={!!stale}>
            <option value="">No project</option>{projects.data?.projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className={`btn sm ${note.pinned ? 'primary' : ''}`} onClick={() => update('pinned', !note.pinned)} aria-pressed={note.pinned}><Icon name="pin" size={14} />{note.pinned ? 'Pinned' : 'Pin'}</button>
        </div>
        {note.source_url && <p className="small" style={{ marginBottom: 10 }}>Source: <a href={note.source_url} target="_blank" rel="noopener noreferrer nofollow">{note.source_url}</a></p>}
        {mode === 'edit' ? (
          <textarea className="textarea" style={{ minHeight: '55vh', fontFamily: 'var(--mono)', fontSize: '0.9em' }} value={note.body} onChange={(e) => update('body', e.target.value)} placeholder="Write in Markdown…" aria-label="Note body" disabled={!!stale} autoFocus={!!query.get('fresh')} />
        ) : (
          <div className="card pad" style={{ minHeight: 200 }}>{note.body ? <Markdown text={note.body} /> : <p className="faint">Empty note. Switch to Edit to write.</p>}</div>
        )}

        <section style={{ marginTop: 18 }}>
          <div className="row"><h3 className="grow">Linked items</h3><button className="btn sm" onClick={() => setLinking(true)}><Icon name="link" size={14} />Link</button></div>
          {data.links.length === 0 ? <p className="faint small" style={{ marginTop: 6 }}>Link this note to tasks, projects or documents.</p> : (
            <ul className="list">{data.links.map((l: any) => (
              <li key={l.link_id} className="list-item">
                <Icon name={({ task: 'tasks', project: 'folder', document: 'file', note: 'note' } as any)[l.type]} size={16} />
                <Link className="grow" to={l.type === 'task' ? `/tasks?focus=${l.id}` : l.type === 'project' ? `/projects/${l.id}` : l.type === 'document' ? `/knowledge/documents/${l.id}` : `/knowledge/notes/${l.id}`}>{l.title}</Link>
                <button className="btn ghost icon sm" aria-label="Remove link" onClick={async () => { await del(`/links/${l.link_id}`); reload(); }}><Icon name="x" size={14} /></button>
              </li>
            ))}</ul>
          )}
        </section>

        <div className="row wrap" style={{ marginTop: 24 }}>
          <span className="faint small">Updated {relative(data.updated_at)}</span>
          <span className="spacer" />
          <ExportMenu title={note.title} body={note.body} />
          <button className="btn danger sm" onClick={async () => {
            if (!(await confirm({ title: 'Delete this note?', body: `“${note.title}” will be permanently deleted.`, confirm: 'Delete', danger: true }))) return;
            if (timer.current) clearTimeout(timer.current);
            await del(`/notes/${id}`);
            toast('Note deleted');
            navigate('/knowledge');
          }}><Icon name="trash" size={14} />Delete</button>
        </div>
      </div>
      {linking && <LinkPicker noteId={id} onClose={() => setLinking(false)} onLinked={reload} />}
    </Shell>
  );
}

function ExportMenu({ title, body }: { title: string; body: string }) {
  const toast = useToast();
  const go = async (format: string) => {
    try {
      const r = await post('/exports', { title: title || 'Note', format, markdown: body || ' ' });
      window.location.href = r.download_url;
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="row">
      <span className="small muted">Export:</span>
      {['docx', 'pdf', 'md', 'pptx'].map((f) => <button key={f} className="btn sm" onClick={() => go(f)}>{f.toUpperCase()}</button>)}
    </div>
  );
}

function LinkPicker({ noteId, onClose, onLinked }: { noteId: string; onClose: () => void; onLinked: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const toast = useToast();
  useEffect(() => {
    if (q.length < 2) return setHits([]);
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q)}`).then((d) => setHits(d.results.filter((r: any) => ['task', 'project', 'document', 'note'].includes(r.entity) && r.id !== noteId))), 200);
    return () => clearTimeout(t);
  }, [q, noteId]);
  return (
    <Modal title="Link to…" onClose={onClose}>
      <input className="input" autoFocus placeholder="Search tasks, projects, documents, notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items to link" />
      <ul className="list" style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
        {hits.map((h) => (
          <li key={`${h.entity}${h.id}`} className="list-item clickable" onClick={async () => {
            try { await post('/links', { from_type: 'note', from_id: noteId, to_type: h.entity, to_id: h.id }); onLinked(); onClose(); } catch (e: any) { toast(e.message, 'error'); }
          }}><span className="badge">{h.entity}</span><span className="grow ellipsis">{h.title}</span></li>
        ))}
      </ul>
    </Modal>
  );
}
