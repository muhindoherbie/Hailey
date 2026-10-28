import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { ErrorBox, Loading } from '../components/ui';
import { useData } from '../lib/hooks';
import { Link } from '../lib/router';
import { fmtDateTime } from '../lib/format';
import { useMascot } from '../lib/mascot';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Your stuff": everything Hailey is holding for you, with a way into each. */
export default function Stuff() {
  const { data: d, error, loading, reload } = useData<any>('/stuff', { cache: true });
  const { name } = useMascot();
  const tiles = d ? [
    {
      to: '/tasks', icon: 'tasks', title: 'Tasks & reminders',
      main: plural(d.tasks.open, 'open task'),
      sub: [d.tasks.overdue && `${d.tasks.overdue} overdue`, d.tasks.dueToday && `${d.tasks.dueToday} due today`, d.reminders.upcoming && plural(d.reminders.upcoming, 'reminder') + ' this week'].filter(Boolean).join(' · ') || 'Nothing urgent',
      warn: d.tasks.overdue > 0,
    },
    { to: '/routines', icon: 'clock', title: 'Routines', main: plural(d.routines.active, 'routine') + ' on', sub: d.routines.custom ? plural(d.routines.custom, 'of your own', 'of your own') : 'Add your first one' },
    { to: '/knowledge', icon: 'book', title: 'Notes & documents', main: plural(d.notes, 'note'), sub: plural(d.documents, 'document') },
    { to: '/projects', icon: 'folder', title: 'Projects', main: plural(d.projects, 'active project'), sub: 'Goals, milestones and progress' },
    { to: '/memory', icon: 'brain', title: `What ${name} remembers`, main: plural(d.memories.active, 'memory', 'memories'), sub: d.memories.waiting ? `${d.memories.waiting} waiting for your OK` : 'You’re in control of all of it', warn: d.memories.waiting > 0 },
    { to: '/connectors', icon: 'link', title: 'Connected apps', main: d.apps ? plural(d.apps, 'app') : 'None yet', sub: 'Email, calendar, notes and more' },
    { to: '/messaging', icon: 'send', title: 'Messaging', main: d.chats ? plural(d.chats, 'linked chat') : 'Not set up', sub: 'Telegram and WhatsApp' },
    { to: '/research', icon: 'globe', title: 'Research', main: 'Search the web', sub: 'With sources you can check' },
  ] : [];

  return (
    <Shell title="Your stuff">
      <div className="page">
        <div className="page-head"><div>
          <h1>Your stuff</h1>
          <p className="sub">Everything {name} is holding for you — tasks, routines, notes, memories and the apps it can use.</p>
        </div></div>
        {d?.approvals > 0 && (
          <Link to="/actions" className="callout warning stuff-alert"><Icon name="shield" size={18} /><span className="grow"><b>{plural(d.approvals, 'action')}</b> waiting for your approval</span><Icon name="send" size={16} /></Link>
        )}
        {d?.reminders.next && (
          <p className="small muted" style={{ marginBottom: 14 }}><Icon name="bell" size={14} /> Next reminder: <b>{d.reminders.next.title}</b> · {fmtDateTime(d.reminders.next.remind_at)}</p>
        )}
        {loading && !d ? <Loading rows={4} /> : error && !d ? <ErrorBox error={error} retry={reload} /> : (
          <div className="stuff-grid">
            {tiles.map((t) => (
              <Link key={t.to} to={t.to} className="card stuff-tile">
                <span className="qi"><Icon name={t.icon} /></span>
                <span className="st-title">{t.title}</span>
                <span className="st-main">{t.main}</span>
                <span className={`small ${t.warn ? 'warn-text' : 'muted'}`}>{t.sub}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
