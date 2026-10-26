import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Loading, Modal, StaleNote, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { del, patch, post } from '../lib/api';
import { isQueued, writeOrQueue } from '../lib/sync';
import { Link, navigate, useLocation } from '../lib/router';
import { fmtDateTime } from '../lib/format';

const WS_ICONS = ['heart', 'briefcase', 'book', 'code', 'folder', 'target', 'globe', 'chart'];

export default function Projects() {
  const { query } = useLocation();
  const [ws, setWs] = useState<string>('');
  const [status, setStatus] = useState('active');
  const [creating, setCreating] = useState(!!query.get('new'));
  const [manageWs, setManageWs] = useState(false);
  const workspaces = useData<any>('/workspaces', { cache: true });
  const { data, error, loading, stale, reload } = useData<any>(`/projects?${new URLSearchParams({ ...(ws ? { workspace_id: ws } : {}), ...(status !== 'all' ? { status } : {}) })}`, { cache: true });
  const wsList = (workspaces.data?.workspaces ?? []).filter((w: any) => !w.archived);

  return (
    <Shell title="Projects" actions={<button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New project</button>}>
      <div className="page">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <button className={`btn sm ${!ws ? 'primary' : ''}`} onClick={() => setWs('')}>All workspaces</button>
          {wsList.map((w: any) => (
            <button key={w.id} className={`btn sm ${ws === w.id ? 'primary' : ''}`} onClick={() => setWs(w.id)}><Icon name={w.icon} size={15} />{w.name}</button>
          ))}
          <button className="btn ghost sm" onClick={() => setManageWs(true)}><Icon name="settings" size={15} />Workspaces</button>
        </div>
        <div className="seg" style={{ marginBottom: 16 }}>
          {['active', 'paused', 'done', 'archived', 'all'].map((s) => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
        </div>
        <StaleNote savedAt={stale} />
        <ErrorBox error={error} retry={reload} />
        {loading && !data ? <Loading /> : data?.projects.length === 0 ? (
          <Empty icon="folder" title="No projects here yet" action={<button className="btn primary" onClick={() => setCreating(true)}>Create a project</button>}>
            Projects keep goals, milestones, decisions, tasks and notes together so you can resume without re-explaining.
          </Empty>
        ) : (
          <div className="grid three">
            {data?.projects.map((p: any) => {
              const pct = p.tasks_total ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
              return (
                <Link key={p.id} to={`/projects/${p.id}`} className="card pad" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="row"><h3 className="grow ellipsis">{p.name}</h3>{p.status !== 'active' && <span className="badge">{p.status}</span>}</div>
                  {p.workspace_name && <div className="faint tiny">{p.workspace_name}</div>}
                  <p className="small muted" style={{ minHeight: 40 }}>{p.next_action ? <>Next: {p.next_action}</> : p.description?.slice(0, 120) || 'No next action yet.'}</p>
                  <div className="row small faint">
                    {p.deadline && <span><Icon name="flag" size={12} /> {fmtDateTime(p.deadline, { time: false })}</span>}
                    {p.open_blockers > 0 && <span className="badge danger">{p.open_blockers} blocker{p.open_blockers > 1 ? 's' : ''}</span>}
                    <span className="spacer" />
                    <span>{p.tasks_done}/{p.tasks_total} tasks</span>
                  </div>
                  <div className="progress" aria-label={`${pct}% of tasks complete`}><span style={{ width: `${pct}%` }} /></div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {creating && <ProjectForm workspaces={wsList} defaultWs={ws} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />}
      {manageWs && <WorkspaceManager list={workspaces.data?.workspaces ?? []} onClose={() => setManageWs(false)} onChanged={() => workspaces.reload()} />}
    </Shell>
  );
}

export function ProjectForm({ project, workspaces, defaultWs, onClose, onSaved }: { project?: any; workspaces: any[]; defaultWs?: string; onClose: () => void; onSaved: (p: any) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: project?.name ?? '', description: project?.description ?? '', goals: project?.goals ?? '', next_action: project?.next_action ?? '',
    deadline: project?.deadline?.slice(0, 10) ?? '', workspace_id: project?.workspace_id ?? defaultWs ?? '', status: project?.status ?? 'active',
  });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try {
      const body = { ...f, deadline: f.deadline ? new Date(`${f.deadline}T12:00:00Z`).toISOString() : null, workspace_id: f.workspace_id || null };
      const p: any = project
        ? await writeOrQueue('PATCH', `/projects/${project.id}`, body, { label: `Edit to project “${f.name}”`, entity: `projects:${project.id}`, base: project.updated_at })
        : await post('/projects', body);
      if (isQueued(p)) {
        toast('Saved on this device — it will sync when you’re back online');
        onSaved({ ...project, ...body });
      } else {
        toast(project ? 'Project saved' : 'Project created');
        onSaved(p);
      }
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal wide title={project ? 'Edit project' : 'New project'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!f.name.trim()} onClick={save}>Save</button></>}>
      <div className="stack">
        <div className="field"><label htmlFor="p-name">Name</label><input id="p-name" className="input" value={f.name} onChange={set('name')} /></div>
        <div className="grid two">
          <div className="field"><label htmlFor="p-ws">Workspace</label>
            <select id="p-ws" className="select" value={f.workspace_id} onChange={set('workspace_id')}><option value="">None</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          </div>
          <div className="field"><label htmlFor="p-dl">Deadline</label><input id="p-dl" type="date" className="input" value={f.deadline} onChange={set('deadline')} /></div>
          {project && (
            <div className="field"><label htmlFor="p-st">Status</label>
              <select id="p-st" className="select" value={f.status} onChange={set('status')}>{['active', 'paused', 'done', 'archived'].map((s) => <option key={s}>{s}</option>)}</select>
            </div>
          )}
        </div>
        <div className="field"><label htmlFor="p-desc">Description</label><textarea id="p-desc" className="textarea" value={f.description} onChange={set('description')} /></div>
        <div className="field"><label htmlFor="p-goals">Goals</label><textarea id="p-goals" className="textarea" value={f.goals} onChange={set('goals')} placeholder="What does success look like?" /></div>
        <div className="field"><label htmlFor="p-next">Next action</label><input id="p-next" className="input" value={f.next_action} onChange={set('next_action')} /></div>
      </div>
    </Modal>
  );
}

function WorkspaceManager({ list, onClose, onChanged }: { list: any[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [items, setItems] = useState(list);
  useEffect(() => setItems(list), [list]);
  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      toast(msg);
      onChanged();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <Modal title="Workspaces" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      <p className="small muted" style={{ marginBottom: 10 }}>Workspaces organise projects, notes and chats. They are for organisation only, not access control.</p>
      <ul className="list divided">
        {items.map((w) => (
          <li key={w.id} className="list-item">
            <select className="select" style={{ width: 70 }} value={w.icon} aria-label="Icon" onChange={(e) => act(() => patch(`/workspaces/${w.id}`, { icon: e.target.value }), 'Icon updated')}>
              {WS_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <input className="input grow" defaultValue={w.name} aria-label="Workspace name" onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && act(() => patch(`/workspaces/${w.id}`, { name: e.target.value.trim() }), 'Renamed')} />
            <button className="btn ghost sm" onClick={() => act(() => patch(`/workspaces/${w.id}`, { archived: !w.archived }), w.archived ? 'Restored' : 'Archived')}>{w.archived ? 'Restore' : 'Archive'}</button>
            <button className="btn ghost icon sm" aria-label={`Delete ${w.name}`} onClick={async () => {
              if (await confirm({ title: `Delete “${w.name}”?`, body: 'Projects, notes and chats in it are kept but no longer assigned to a workspace.', confirm: 'Delete', danger: true })) act(() => del(`/workspaces/${w.id}`), 'Workspace deleted');
            }}><Icon name="trash" size={15} /></button>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New workspace name" />
        <button className="btn primary" disabled={!name.trim()} onClick={() => act(() => post('/workspaces', { name }), 'Workspace created').then(() => setName(''))}>Add</button>
      </div>
    </Modal>
  );
}
