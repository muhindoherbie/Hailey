import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { TaskItem } from '../components/TaskItem';
import { Empty, ErrorBox, Loading, Markdown, StaleNote, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { del, patch, post, get } from '../lib/api';
import { Link, navigate } from '../lib/router';
import { fmtDateTime, relative } from '../lib/format';
import { ProjectForm } from './Projects';
import { TaskEditor } from './Tasks';

const KINDS = [
  { id: 'milestone', label: 'Milestones', icon: 'flag' },
  { id: 'decision', label: 'Decisions', icon: 'check' },
  { id: 'risk', label: 'Risks', icon: 'alert' },
  { id: 'blocker', label: 'Blockers', icon: 'stop' },
];

export default function ProjectDetail({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: p, error, loading, stale, reload } = useData<any>(`/projects/${id}`, { cache: true });
  const workspaces = useData<any>('/workspaces');
  const projects = useData<any>('/projects?status=active');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('overview');
  const [newTask, setNewTask] = useState('');
  const [taskEdit, setTaskEdit] = useState<any>(null);

  if (loading && !p) return <Shell title="Project"><div className="page"><Loading rows={5} /></div></Shell>;
  if (!p) return <Shell title="Project"><div className="page"><ErrorBox error={error} retry={reload} /></div></Shell>;

  const addTask = async () => {
    if (!newTask.trim()) return;
    try {
      await post('/tasks', { title: newTask, project_id: id });
      setNewTask('');
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const chatAbout = async (prompt: string) => {
    const conv = await post('/conversations', { project_id: id, title: `${p.name}` });
    sessionStorage.setItem(`hailey:first:${conv.id}`, JSON.stringify({ text: prompt, attachments: [] }));
    navigate(`/chat/${conv.id}`);
  };

  return (
    <Shell title={p.name} actions={
      <>
        <button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" size={15} /><span className="desktop-only">Edit</span></button>
        <button className="btn primary sm" onClick={() => chatAbout(`Let's continue working on the project "${p.name}". Summarise where it stands and suggest the next steps.`)}><Icon name="chat" size={15} /><span className="desktop-only">Continue with Hailey</span></button>
      </>
    }>
      <div className="page">
        <StaleNote savedAt={stale} />
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <span className="badge brand">{p.status}</span>
          {p.deadline && <span className="badge"><Icon name="flag" size={12} /> Due {fmtDateTime(p.deadline, { time: false, year: true })}</span>}
          {p.progress.percent != null && <span className="badge">{p.progress.tasksDone}/{p.progress.tasksTotal} tasks · {p.progress.percent}%</span>}
          {p.progress.milestonesTotal > 0 && <span className="badge">{p.progress.milestonesDone}/{p.progress.milestonesTotal} milestones</span>}
        </div>
        {p.progress.percent != null && <div className="progress" style={{ marginBottom: 18 }}><span style={{ width: `${p.progress.percent}%` }} /></div>}

        <div className="tabs" role="tablist">
          {['overview', 'tasks', 'notes & files', 'activity'].map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>

        {tab === 'overview' && (
          <div className="grid two">
            <section className="card pad stack">
              <div><div className="label">Next action</div><p style={{ fontWeight: 600 }}>{p.next_action || <span className="faint">Not set</span>}</p></div>
              <div><div className="label">Description</div>{p.description ? <Markdown text={p.description} /> : <p className="faint">No description.</p>}</div>
              <div><div className="label">Goals</div>{p.goals ? <Markdown text={p.goals} /> : <p className="faint">No goals written yet.</p>}</div>
              <div className="row wrap">
                <button className="btn sm" onClick={() => chatAbout(`Help me build an action plan for "${p.name}": milestones, dependencies and tasks. Ask me anything you need first.`)}><Icon name="sparkle" size={14} />Plan with Hailey</button>
                <button className="btn sm" onClick={() => chatAbout(`Review risks and blockers for "${p.name}" and suggest mitigations.`)}>Review risks</button>
                <button className="btn sm" onClick={() => chatAbout(`Write a short progress summary for "${p.name}" from its tasks, milestones and recent activity.`)}>Progress summary</button>
              </div>
            </section>
            <section className="stack">
              {KINDS.map((k) => <ItemList key={k.id} kind={k} project={p} onChanged={reload} />)}
            </section>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="card pad">
            <div className="row" style={{ marginBottom: 10 }}>
              <input className="input" placeholder="Add a task to this project" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} aria-label="New project task" />
              <button className="btn primary" onClick={addTask}>Add</button>
            </div>
            {p.tasks.length === 0 ? <p className="muted small">No tasks yet.</p> : (
              <ul className="list">{p.tasks.map((t: any) => <TaskItem key={t.id} task={t} showProject={false} onChanged={reload} onOpen={(x) => get(`/tasks/${x.id}`).then(setTaskEdit)} />)}</ul>
            )}
          </div>
        )}

        {tab === 'notes & files' && (
          <div className="grid two">
            <section className="card">
              <div className="card-head"><h3 className="grow">Notes</h3><button className="btn sm" onClick={async () => { const n = await post('/notes', { title: `${p.name} — note`, body: '', project_id: id }); navigate(`/knowledge/notes/${n.id}`); }}><Icon name="plus" size={14} />New</button></div>
              <div className="card-body">
                {p.notes.length === 0 ? <p className="muted small">No notes linked.</p> : <ul className="list">{p.notes.map((n: any) => <li key={n.id} className="list-item clickable" onClick={() => navigate(`/knowledge/notes/${n.id}`)}><Icon name="note" size={16} /><span className="grow ellipsis">{n.title}</span><span className="faint tiny">{relative(n.updated_at)}</span></li>)}</ul>}
              </div>
            </section>
            <section className="card">
              <div className="card-head"><h3 className="grow">Documents</h3><Link className="btn sm" to={`/knowledge?tab=documents&upload=1&project=${id}`}><Icon name="upload" size={14} />Upload</Link></div>
              <div className="card-body">
                {p.documents.length === 0 ? <p className="muted small">No documents linked.</p> : <ul className="list">{p.documents.map((d: any) => <li key={d.id} className="list-item clickable" onClick={() => navigate(`/knowledge/documents/${d.id}`)}><Icon name="file" size={16} /><span className="grow ellipsis">{d.filename}</span><span className="badge">{d.kind}</span></li>)}</ul>}
              </div>
            </section>
          </div>
        )}

        {tab === 'activity' && (
          <div className="card pad">
            {p.activity.length === 0 ? <Empty icon="clock" title="No activity yet" /> : (
              <ul className="list divided">{p.activity.map((a: any) => <li key={a.id} className="list-item"><span className="grow small">{a.summary}</span><span className="faint tiny">{fmtDateTime(a.created_at)}</span></li>)}</ul>
            )}
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <button className="btn danger sm" onClick={async () => {
            if (!(await confirm({ title: `Delete “${p.name}”?`, body: 'Milestones, decisions, risks and activity are deleted. Tasks, notes and documents are kept but unlinked.', confirm: 'Delete project', danger: true }))) return;
            await del(`/projects/${id}`);
            toast('Project deleted');
            navigate('/projects');
          }}><Icon name="trash" size={14} />Delete project</button>
        </div>
      </div>
      {editing && <ProjectForm project={p} workspaces={workspaces.data?.workspaces ?? []} onClose={() => setEditing(false)} onSaved={() => reload()} />}
      {taskEdit && <TaskEditor task={taskEdit} projects={projects.data?.projects ?? []} onClose={() => setTaskEdit(null)} onSaved={reload} />}
    </Shell>
  );
}

function ItemList({ kind, project, onChanged }: { kind: { id: string; label: string; icon: string }; project: any; onChanged: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const items = project.items.filter((i: any) => i.kind === kind.id);
  const add = async () => {
    try {
      await post(`/projects/${project.id}/items`, { kind: kind.id, title });
      setTitle('');
      setAdding(false);
      onChanged();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="card">
      <div className="card-head">
        <Icon name={kind.icon} size={15} style={{ color: 'var(--text-3)' }} />
        <h3 className="grow">{kind.label}</h3>
        <button className="btn ghost icon sm" onClick={() => setAdding((a) => !a)} aria-label={`Add ${kind.id}`}><Icon name="plus" size={16} /></button>
      </div>
      <div className="card-body">
        {items.length === 0 && !adding && <p className="faint small">None recorded.</p>}
        <ul className="list">
          {items.map((i: any) => (
            <li key={i.id} className="list-item" style={{ padding: '4px 0', minHeight: 32 }}>
              {(kind.id === 'milestone' || kind.id === 'blocker' || kind.id === 'risk') && (
                <input type="checkbox" checked={i.done} aria-label={`Mark ${i.title} ${kind.id === 'milestone' ? 'reached' : 'resolved'}`} onChange={async (e) => { await patch(`/project-items/${i.id}`, { done: e.target.checked }); onChanged(); }} style={{ accentColor: 'var(--brand)' }} />
              )}
              <span className={`grow small ${i.done ? 'faint' : ''}`} style={{ textDecoration: i.done ? 'line-through' : undefined }}>{i.title}{i.detail ? <span className="faint"> — {i.detail}</span> : null}</span>
              {i.due_at && <span className="faint tiny">{fmtDateTime(i.due_at, { time: false })}</span>}
              <button className="btn ghost icon sm" aria-label={`Remove ${i.title}`} onClick={async () => { await del(`/project-items/${i.id}`); onChanged(); }}><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ul>
        {adding && (
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && add()} placeholder={`New ${kind.id}`} aria-label={`New ${kind.id}`} />
            <button className="btn sm primary" disabled={!title.trim()} onClick={add}>Add</button>
          </div>
        )}
      </div>
    </div>
  );
}
