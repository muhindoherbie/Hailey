import { useState, type FormEvent, type ReactNode } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { TaskItem } from '../components/TaskItem';
import { Avatar } from '../components/Avatar';
import { useMascot } from '../lib/mascot';
import { Empty, ErrorBox, Loading, Modal, StaleNote, Switch, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { useSession } from '../lib/session';
import { Link, navigate } from '../lib/router';
import { fmtDateTime, relative, getPrefs } from '../lib/format';
import { post } from '../lib/api';
import { useDictation } from '../lib/voice';

const WIDGET_NAMES: Record<string, string> = {
  briefing: 'Daily briefing', today: 'Today’s tasks', upcoming: 'Upcoming deadlines & reminders', projects: 'Active projects',
  quick: 'Quick actions', recent: 'Recent conversations & work', review: 'Completed & outstanding', suggestions: 'Suggestions',
  week: 'Your week in numbers', discover: 'Ideas to try',
};

export function Home() {
  const { me, saveSettings } = useSession();
  const { data, error, loading, stale, reload } = useData<any>('/dashboard', { cache: true });
  const [customize, setCustomize] = useState(false);
  // Widgets added in later versions appear for everyone, after the ones they already arranged.
  const saved: { id: string; visible: boolean }[] = me!.settings.dashboard.widgets;
  const widgets = [...saved, ...Object.keys(WIDGET_NAMES).filter((id) => !saved.some((w) => w.id === id)).map((id) => ({ id, visible: true }))];
  const discover = useData<any>('/discover');
  const mascot = useMascot();
  const name = me!.settings.profile.displayName || me!.user.name;

  const hour = data?.hour ?? new Date().getHours();
  const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const now = new Intl.DateTimeFormat(getPrefs().locale, { timeZone: getPrefs().timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: getPrefs().hour12 }).format(new Date());

  const render: Record<string, () => ReactNode> = {
    briefing: () => data && (
      <section className="card pad briefing" aria-labelledby="w-brief">
        <div className="row" style={{ marginBottom: 8 }}>
          <Icon name="sparkle" size={16} style={{ color: 'var(--accent)' }} />
          <h2 id="w-brief" style={{ fontSize: '0.95rem' }}>Daily briefing</h2>
          <span className="spacer" />
          <Link to={`/chat/new?q=${encodeURIComponent('Help me plan my day using my tasks, deadlines and projects.')}`} className="btn sm">Plan my day</Link>
        </div>
        <p>{data.briefing}</p>
        <p className="faint tiny" style={{ marginTop: 8 }}>Built from your saved tasks, reminders and projects only.</p>
      </section>
    ),
    quick: () => (
      <section aria-label="Quick actions" className="quick">
        <Link to="/ramble"><span className="qi"><Icon name="mic" /></span>Ramble it out</Link>
        <Link to="/tasks?new=1"><span className="qi"><Icon name="plus" /></span>Add task</Link>
        <Link to="/knowledge?new=note"><span className="qi"><Icon name="note" /></span>New note</Link>
        <Link to="/knowledge?tab=documents&upload=1"><span className="qi"><Icon name="upload" /></span>Upload document</Link>
        <Link to="/research"><span className="qi"><Icon name="globe" /></span>Research</Link>
        <Link to="/routines"><span className="qi"><Icon name="clock" /></span>Routines</Link>
      </section>
    ),
    today: () => data && (
      <Widget title="Today" icon="tasks" link={{ to: '/tasks', label: 'All tasks' }}>
        {[...data.overview.overdue, ...data.overview.due].length === 0 ? (
          <Empty icon="check" title="Nothing due today">Add a task, or ask Hailey to help plan your day.</Empty>
        ) : (
          <ul className="list">
            {[...data.overview.overdue, ...data.overview.due].slice(0, 8).map((t: any) => (
              <TaskItem key={t.id} task={{ ...t, status: 'open', project_name: t.project }} onChanged={() => reload()} />
            ))}
          </ul>
        )}
        {data.overview.overdue.length > 0 && <CarryForward ids={data.overview.overdue.map((t: any) => t.id)} onDone={reload} />}
      </Widget>
    ),
    upcoming: () => data && (
      <Widget title="Coming up" icon="calendar">
        {data.overview.upcoming.length === 0 && data.overview.reminders.length === 0 ? (
          <p className="muted small">No deadlines or reminders in the next 7 days.</p>
        ) : (
          <ul className="list">
            {data.overview.reminders.map((r: any) => (
              <li key={r.id} className="list-item"><Icon name="bell" size={16} style={{ color: 'var(--accent)' }} /><span className="grow">{r.title}</span><span className="faint small">{r.at}</span></li>
            ))}
            {data.overview.upcoming.slice(0, 8).map((t: any) => (
              <li key={t.id} className="list-item"><span className={`pill-prio prio-${t.priority}`} /><span className="grow ellipsis">{t.title}</span><span className="faint small">{fmtDateTime(t.due_at, { weekday: true })}</span></li>
            ))}
          </ul>
        )}
      </Widget>
    ),
    projects: () => data && (
      <Widget title="Active projects" icon="folder" link={{ to: '/projects', label: 'All projects' }}>
        {data.overview.projects.length === 0 ? (
          <Empty icon="folder" title="No active projects" action={<Link className="btn sm" to="/projects?new=1">Create a project</Link>} />
        ) : (
          <ul className="list">
            {data.overview.projects.map((p: any) => (
              <li key={p.id} className="list-item clickable" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="faint small ellipsis">{p.next_action ? `Next: ${p.next_action}` : 'No next action set'}</div>
                </div>
                {p.open_blockers > 0 && <span className="badge danger">{p.open_blockers} blocked</span>}
                {p.tasks_total > 0 && <span className="badge">{p.tasks_done}/{p.tasks_total}</span>}
              </li>
            ))}
          </ul>
        )}
      </Widget>
    ),
    recent: () => data && (
      <Widget title="Recent" icon="clock">
        {data.recentConversations.length === 0 && data.recentWork.length === 0 ? (
          <p className="muted small">Your recent conversations and work will appear here.</p>
        ) : (
          <ul className="list">
            {data.recentConversations.slice(0, 4).map((c: any) => (
              <li key={c.id} className="list-item clickable" onClick={() => navigate(`/chat/${c.id}`)}><Icon name="chat" size={16} /><span className="grow ellipsis">{c.title}</span><span className="faint tiny">{relative(c.updated_at)}</span></li>
            ))}
            {data.recentWork.slice(0, 5).map((a: any) => (
              <li key={a.id} className="list-item"><Icon name="check" size={16} style={{ color: 'var(--text-3)' }} /><span className="grow ellipsis small">{a.summary}</span><span className="faint tiny">{relative(a.created_at)}</span></li>
            ))}
          </ul>
        )}
      </Widget>
    ),
    review: () => data && (
      <Widget title="Review" icon="chart">
        <div className="grid two" style={{ gap: 10 }}>
          <Stat n={data.overview.completedToday.length} label="completed today" />
          <Stat n={data.overview.completedYesterday.length} label="completed yesterday" />
          <Stat n={data.overview.due.length} label="still due today" />
          <Stat n={data.overview.overdue.length} label="overdue" warn={data.overview.overdue.length > 0} />
        </div>
        {data.overview.workload.estimatedMinutes > 0 && (
          <p className="small muted" style={{ marginTop: 10 }}>Estimated workload today: {Math.round(data.overview.workload.estimatedMinutes / 6) / 10} h</p>
        )}
      </Widget>
    ),
    week: () => data?.week && (
      <Widget title="Your week in numbers" icon="chart">
        <div className="grid two" style={{ gap: 10 }}>
          <Stat n={data.week.tasksCompleted} label="tasks done" />
          <Stat n={data.week.tasksAdded} label="tasks added" />
          <Stat n={data.week.remindersSent} label="reminders sent" />
          <Stat n={data.week.notesSaved + data.week.routineRuns} label="notes & routine runs" />
        </div>
        {data.streak > 1 && <p className="small" style={{ marginTop: 10 }}>🔥 {data.streak} weeks in a row with {me!.settings.profile.assistantName || 'Hailey'}. <Link to="/settings#profile">See what you’ve unlocked</Link></p>}
      </Widget>
    ),
    discover: () => discover.data?.cards?.length > 0 && (
      <Widget title="Ideas to try" icon="sparkle" link={{ to: '/discover', label: 'See all' }}>
        <ul className="list">
          {discover.data.cards.slice(0, 4).map((c: any) => (
            <li key={c.id} className="list-item clickable" onClick={() => navigate(c.action === 'chat' ? `/chat/new?q=${encodeURIComponent(c.prompt)}` : c.action === 'routine' ? `/routines?idea=${c.routine}` : c.action === 'ramble' ? '/ramble' : c.action === 'voice' ? '/chat/new?voice=1' : c.id === 'group' ? '/messaging' : '/connectors')}>
              <Icon name={c.icon} size={16} /><div className="grow"><div className="small" style={{ fontWeight: 600 }}>{c.title}</div><div className="tiny muted">{c.blurb}</div></div>
            </li>
          ))}
        </ul>
      </Widget>
    ),
    suggestions: () => data && data.suggestions.length > 0 && (
      <Widget title="Suggestions" icon="sparkle">
        <ul className="list">
          {data.suggestions.map((s: any, i: number) => (
            <li key={i} className="list-item">
              <div className="grow"><div>{s.text}</div><div className="faint tiny">Based on: {s.basis}</div></div>
              {s.action === 'memories' && <Link to="/memory?status=proposed" className="btn sm">Review</Link>}
            </li>
          ))}
        </ul>
      </Widget>
    ),
  };

  // The briefing, week and ideas now live in the highlight cards at the top.
  const IN_CARDS = new Set(['briefing', 'week', 'discover']);
  const visible = widgets.filter((w) => w.visible && render[w.id] && !IN_CARDS.has(w.id));
  const full = new Set(['quick']);

  return (
    <Shell title="Home" actions={<button className="btn ghost sm" onClick={() => setCustomize(true)}><Icon name="settings" size={16} /><span className="desktop-only">Customise</span></button>}>
      <div className="page">
        <div className="home-hero">
          <Link to="/chat/new?voice=1" className="home-mascot" aria-label={`Talk to ${mascot.name}`} title="Tap to talk hands-free"><Avatar size={104} accessory={mascot.accessory} /></Link>
          <div className="greet">{greet}, {name.split(' ')[0]}</div>
          <div className="date">{now}</div>
          <AskBar />
          <div className="starter-chips" role="list" aria-label="Quick starts">
            {[
              ['tasks', 'Plan my day', '/chat/new?q=' + encodeURIComponent('Help me plan my day using my tasks, deadlines and projects.')],
              ['mic', 'Ramble it out', '/ramble'],
              ['bell', 'Remind me…', '/chat/new?q=' + encodeURIComponent('Remind me ')],
              ['speaker', 'Just talk', '/chat/new?voice=1'],
              ['sparkle', 'Ideas', '/discover'],
            ].map(([icon, label, to]) => <span key={label} role="listitem" className="li-wrap"><Link to={to} className="chip"><Icon name={icon} size={15} />{label}</Link></span>)}
          </div>
        </div>
        <StaleNote savedAt={stale} />
        <ErrorBox error={error} retry={reload} />
        {data && <HighlightCards data={data} idea={discover.data?.cards?.[0]} streakName={mascot.name} />}
        {data?.recentConversations?.length > 0 && (
          <section className="home-section">
            <div className="row"><h2 className="grow">Recent chats</h2><Link to="/chat" className="small">All chats</Link></div>
            <div className="recent-chats">
              {data.recentConversations.slice(0, 6).map((c: any) => (
                <Link key={c.id} to={`/chat/${c.id}`} className="card recent-chat"><Icon name="chat" size={16} /><span className="grow ellipsis">{c.title}</span><span className="tiny faint">{relative(c.updated_at)}</span></Link>
              ))}
            </div>
          </section>
        )}
        <h2 className="home-section-title">Your day</h2>
        {loading && !data ? <Loading rows={4} /> : (
          <div className="grid two">
            {visible.map((w) => {
              const node = render[w.id]();
              if (!node) return null;
              return <div key={w.id} style={full.has(w.id) ? { gridColumn: '1 / -1' } : undefined}>{node}</div>;
            })}
          </div>
        )}
        {data && data.notifications.length > 0 && (
          <p className="small muted" style={{ marginTop: 16 }}><Link to="/notifications">{data.notifications.length} unread notification{data.notifications.length > 1 ? 's' : ''}</Link></p>
        )}
      </div>
      {customize && (
        <CustomizeDashboard widgets={widgets.filter((w) => !IN_CARDS.has(w.id))} onClose={() => setCustomize(false)} onSave={(w) => saveSettings({ dashboard: { widgets: w } })} />
      )}
    </Shell>
  );
}

/** Swipeable cards at the top of Home: the day at a glance, each one tappable. */
function HighlightCards({ data, idea, streakName }: { data: any; idea?: any; streakName: string }) {
  const o = data.overview;
  const due = o.overdue.length + o.due.length;
  const next = o.reminders[0] ?? null;
  const nextTask = o.upcoming[0] ?? null;
  const cards: { key: string; tone: string; icon: string; kicker: string; title: string; body: string; to: string }[] = [
    {
      key: 'today', tone: o.overdue.length ? 'warn' : 'brand', icon: 'tasks', kicker: 'Today',
      title: due ? `${due} thing${due > 1 ? 's' : ''} to do` : 'Nothing due today',
      body: o.overdue.length ? `${o.overdue.length} overdue — tap to sort them out` : due ? [...o.overdue, ...o.due].slice(0, 2).map((t: any) => t.title).join(' · ') : 'Enjoy it, or plan something new.',
      to: '/tasks',
    },
    { key: 'brief', tone: 'sun', icon: 'sun', kicker: 'Your briefing', title: 'Here’s your day', body: data.briefing, to: '/chat/new?q=' + encodeURIComponent('Help me plan my day using my tasks, deadlines and projects.') },
    {
      key: 'next', tone: 'sky', icon: next ? 'bell' : 'calendar', kicker: 'Coming up',
      title: next ? next.title : nextTask ? nextTask.title : 'A clear week ahead',
      body: next ? `Reminder · ${next.at}` : nextTask ? `Due ${fmtDateTime(nextTask.due_at, { weekday: true })}` : 'No deadlines or reminders in the next 7 days.',
      to: '/tasks?view=upcoming',
    },
  ];
  if (data.week) {
    cards.push({
      key: 'week', tone: 'leaf', icon: 'chart', kicker: 'Your week',
      title: `${data.week.tasksCompleted} done this week`,
      body: data.streak > 1 ? `🔥 ${data.streak} weeks in a row with ${streakName}${data.streak >= 4 ? ' — legendary 👑' : ''}` : `${data.week.tasksAdded} added · ${data.week.remindersSent} reminders sent`,
      to: '/me',
    });
  }
  if (idea) cards.push({ key: 'idea', tone: 'berry', icon: idea.icon, kicker: 'Try this', title: idea.title, body: idea.blurb, to: '/discover' });
  return (
    <section className="highlights" aria-label="Your day at a glance">
      {cards.map((c) => (
        <Link key={c.key} to={c.to} className={`highlight hl-${c.tone}`}>
          <span className="hl-kicker"><Icon name={c.icon} size={14} />{c.kicker}</span>
          <span className="hl-title">{c.title}</span>
          <span className="hl-body">{c.body}</span>
        </Link>
      ))}
    </section>
  );
}

function Widget({ title, icon, link, children }: { title: string; icon: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="card" style={{ height: '100%' }}>
      <div className="card-head">
        <Icon name={icon} size={16} style={{ color: 'var(--text-3)' }} />
        <h2>{title}</h2>
        <span className="spacer" />
        {link && <Link to={link.to} className="small">{link.label}</Link>}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

const Stat = ({ n, label, warn }: { n: number; label: string; warn?: boolean }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: warn ? 'var(--danger)' : undefined }}>{n}</div>
    <div className="faint small">{label}</div>
  </div>
);

function CarryForward({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="callout warning small" style={{ marginTop: 10, alignItems: 'center' }}>
      <span className="grow">{ids.length} overdue task{ids.length > 1 ? 's' : ''}. Move them to today?</span>
      <button className="btn sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await post('/tasks/carry-forward', { task_ids: ids });
          toast(r.status === 'executed' ? `Moved ${r.result.moved.length} task(s) to today` : r.error ?? 'Could not move tasks', r.status === 'executed' ? 'info' : 'error');
          onDone();
        } catch (e: any) {
          toast(e.message, 'error');
        } finally {
          setBusy(false);
        }
      }}>Carry forward</button>
    </div>
  );
}

function AskBar() {
  const [q, setQ] = useState('');
  const { me } = useSession();
  const voice = useDictation(me!.settings.voice.language, (t) => setQ((x) => (x ? `${x} ${t}` : t)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/chat/new?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <>
      <form className="ask" onSubmit={submit} role="search">
        <Icon name="sparkle" style={{ color: 'var(--brand)' }} />
        <label htmlFor="ask" className="sr-only">Ask {me!.settings.profile.assistantName || 'Hailey'}</label>
        <input id="ask" data-composer enterKeyHint="send" placeholder={voice.listening ? 'Listening…' : 'What’s on your mind?'} value={voice.interim ? `${q} ${voice.interim}` : q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {me!.settings.voice.enabled && voice.supported && (
          <button type="button" className={`btn ghost icon ${voice.listening ? 'recording' : ''}`} onClick={voice.listening ? voice.stop : voice.start} aria-label={voice.listening ? 'Stop recording' : 'Speak'} aria-pressed={voice.listening}>
            <Icon name={voice.listening ? 'stop' : 'mic'} />
          </button>
        )}
        {q.trim() || !voice.supported
          ? <button className="btn primary icon" disabled={!q.trim()} aria-label="Ask"><Icon name="send" /></button>
          : <Link to="/chat/new?voice=1" className="btn primary icon" aria-label="Talk hands-free" title="Talk hands-free"><Icon name="speaker" /></Link>}
      </form>
      {voice.listening && <p className="faint tiny" style={{ marginTop: 6 }}>Recording… speech is transcribed by your browser’s speech service.</p>}
      {voice.error && <p className="small" style={{ color: 'var(--danger)', marginTop: 6 }}>{voice.error}</p>}
    </>
  );
}

function CustomizeDashboard({ widgets, onClose, onSave }: { widgets: { id: string; visible: boolean }[]; onClose: () => void; onSave: (w: any) => Promise<any> }) {
  const [list, setList] = useState(widgets);
  const toast = useToast();
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <Modal title="Customise home" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { try { await onSave(list); toast('Home layout saved'); onClose(); } catch (e: any) { toast(e.message, 'error'); } }}>Save</button>
      </>
    }>
      <p className="muted small" style={{ marginBottom: 10 }}>Choose what appears on your home screen and in what order.</p>
      <ul className="list divided">
        {list.map((w, i) => (
          <li key={w.id} className="list-item">
            <Switch label={`Show ${WIDGET_NAMES[w.id]}`} checked={w.visible} onChange={(v) => setList(list.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} />
            <span className={`grow ${w.visible ? '' : 'faint'}`}>{WIDGET_NAMES[w.id] ?? w.id}</span>
            <button className="btn ghost icon sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${WIDGET_NAMES[w.id]} up`}><Icon name="arrowUp" size={16} /></button>
            <button className="btn ghost icon sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${WIDGET_NAMES[w.id]} down`}><Icon name="arrowDown" size={16} /></button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
