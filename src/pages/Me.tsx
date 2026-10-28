import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Avatar, type Accessory } from '../components/Avatar';
import { useToast } from '../components/ui';
import { Link } from '../lib/router';
import { useSession } from '../lib/session';
import { useMascot } from '../lib/mascot';

const ACCESSORIES: { id: Accessory | 'auto'; label: string; needs?: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'none', label: 'Nothing' },
  { id: 'party', label: 'Party hat' },
  { id: 'crown', label: 'Crown', needs: 'a 4-week streak' },
  { id: 'chef', label: 'Chef’s hat', needs: 'Chef mode' },
  { id: 'cap', label: 'Graduation cap', needs: 'Tutor mode' },
  { id: 'headband', label: 'Sports headband', needs: 'Coach mode' },
];

/** "Me": you, your assistant, and every setting and inbox — the phone's fifth tab. */
export default function Me() {
  const { me, counts, logout, saveSettings } = useSession();
  const toast = useToast();
  const { accessory, achievements: a, earned, name } = useMascot();
  const choice = me!.settings.profile.mascotAccessory ?? 'auto';
  const links = [
    { to: '/notifications', icon: 'bell', label: 'Notifications', count: counts.unread },
    { to: '/actions', icon: 'shield', label: 'Approvals', count: counts.pendingActions },
    { to: '/messaging', icon: 'send', label: 'Messaging (Telegram, WhatsApp)' },
    { to: '/connectors', icon: 'link', label: 'Connected apps' },
    { to: '/settings', icon: 'settings', label: 'Settings' },
    { to: '/settings#profile', icon: 'user', label: `Profile, ${name}’s name & modes` },
  ];
  return (
    <Shell title="Me">
      <div className="page narrow">
        <section className="card me-hero">
          <Avatar size={110} accessory={accessory} state={a?.legendary ? 'happy' : 'idle'} />
          <div className="grow">
            <h1>{me!.settings.profile.displayName || me!.user.name}</h1>
            <p className="muted small">{me!.user.email}</p>
            {a && (
              <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                <span className="badge">🔥 {a.streak} week{a.streak === 1 ? '' : 's'} in a row</span>
                <span className="badge">✅ {a.tasksDone} tasks done</span>
                {a.legendary && <span className="badge brand">👑 Legendary</span>}
              </div>
            )}
          </div>
        </section>

        <section className="card pad" style={{ marginTop: 14 }}>
          <h2>Dress up {name}</h2>
          <p className="small muted">Earn accessories by using {name}. “Automatic” wears your mode’s hat, or the crown once you’re legendary.</p>
          <div className="acc-picker" role="radiogroup" aria-label="Accessory">
            {ACCESSORIES.map((x) => {
              const ok = x.id === 'auto' || earned(x.id as Accessory);
              return (
                <button key={x.id} role="radio" aria-checked={choice === x.id} disabled={!ok} className={`acc-opt ${choice === x.id ? 'on' : ''}`}
                  title={ok ? x.label : `Unlock with ${x.needs}`}
                  onClick={() => saveSettings({ profile: { mascotAccessory: x.id } }).catch((e: any) => toast(e.message, 'error'))}>
                  <Avatar size={46} accessory={x.id === 'auto' ? accessory : (x.id as Accessory)} />
                  <span className="tiny">{x.label}</span>
                  {!ok && <span className="tiny faint">🔒 {x.needs}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <ul className="list divided">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="list-item clickable me-link">
                  <Icon name={l.icon} size={18} /><span className="grow">{l.label}</span>
                  {!!l.count && <span className="count">{l.count}</span>}
                  <Icon name="send" size={14} style={{ color: 'var(--text-3)' }} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <button className="btn" style={{ marginTop: 14, width: '100%' }} onClick={() => void logout()}><Icon name="logout" size={16} />Sign out</button>
      </div>
    </Shell>
  );
}
