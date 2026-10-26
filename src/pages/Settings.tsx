import { useEffect, useState, type ReactNode } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { BarChart, ErrorBox, Loading, Modal, Seg, Switch, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { api, del, patch, post } from '../lib/api';
import { useSession } from '../lib/session';
import { fmtDateTime } from '../lib/format';
import { speak } from '../lib/voice';

const SECTIONS = [
  ['profile', 'Profile & assistant', 'user'],
  ['ai', 'AI provider & usage', 'sparkle'],
  ['memory', 'Memory', 'brain'],
  ['permissions', 'Permissions', 'shield'],
  ['notifications', 'Notifications & routines', 'bell'],
  ['appearance', 'Appearance & accessibility', 'sun'],
  ['regional', 'Language & region', 'globe'],
  ['voice', 'Voice', 'mic'],
  ['integrations', 'Integrations', 'link'],
  ['privacy', 'Privacy, data & account', 'lock'],
] as const;

export default function Settings() {
  const [section, setSection] = useState<string>(() => location.hash.slice(1) || 'profile');
  useEffect(() => {
    const h = () => setSection(location.hash.slice(1) || 'profile');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const go = (s: string) => {
    history.replaceState(null, '', `#${s}`);
    setSection(s);
  };
  return (
    <Shell title="Settings">
      <div className="page">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: 24 }} className="settings-grid">
          <nav className="settings-nav desktop-only" aria-label="Settings sections">
            {SECTIONS.map(([id, label, icon]) => (
              <button key={id} className={`nav-item ${section === id ? 'active' : ''}`} onClick={() => go(id)}><Icon name={icon} size={16} />{label}</button>
            ))}
          </nav>
          <div>
            <select className="select mobile-only" style={{ marginBottom: 14, width: '100%' }} value={section} onChange={(e) => go(e.target.value)} aria-label="Settings section">
              {SECTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            {section === 'profile' && <Profile />}
            {section === 'ai' && <AI />}
            {section === 'memory' && <MemorySettings />}
            {section === 'permissions' && <Permissions />}
            {section === 'notifications' && <Notifications />}
            {section === 'appearance' && <Appearance />}
            {section === 'regional' && <Regional />}
            {section === 'voice' && <Voice />}
            {section === 'integrations' && <Integrations />}
            {section === 'privacy' && <Privacy />}
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 860px) { .settings-grid { grid-template-columns: 1fr !important; } }`}</style>
    </Shell>
  );
}

function Card({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="card pad" style={{ marginBottom: 16 }}>
      <h2>{title}</h2>
      {desc && <p className="small muted" style={{ marginTop: 4 }}>{desc}</p>}
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="grow"><div style={{ fontWeight: 600 }}>{label}</div>{desc && <div className="desc">{desc}</div>}</div>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

/** Saves a settings patch and shows a toast on success/failure. */
function useSave() {
  const { saveSettings } = useSession();
  const toast = useToast();
  return async (p: any, msg = 'Saved') => {
    try {
      await saveSettings(p);
      toast(msg);
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
}

function Profile() {
  const { me } = useSession();
  const save = useSave();
  const s = me!.settings.profile;
  const [name, setName] = useState(s.displayName);
  const [instr, setInstr] = useState(s.customInstructions);
  return (
    <Card title="Profile & assistant" desc="How Hailey addresses you and how she responds. Changes apply to new conversations.">
      <Row label="Your name"><input className="input" style={{ width: 240 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== s.displayName && save({ profile: { displayName: name } })} aria-label="Display name" /></Row>
      <Row label="Response style">
        <Seg label="Response style" value={s.assistantStyle} onChange={(v) => save({ profile: { assistantStyle: v } })} options={[{ value: 'balanced', label: 'Balanced' }, { value: 'concise', label: 'Concise' }, { value: 'detailed', label: 'Detailed' }, { value: 'warm', label: 'Warm' }]} />
      </Row>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="ci">Instructions for Hailey</label>
        <textarea id="ci" className="textarea" maxLength={2000} value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="e.g. I run a community pharmacy in Kampala. Use UGX for money. Keep plans practical." />
        <div className="row"><span className="hint grow">{instr.length}/2000</span><button className="btn sm primary" disabled={instr === s.customInstructions} onClick={() => save({ profile: { customInstructions: instr } })}>Save instructions</button></div>
      </div>
    </Card>
  );
}

function AI() {
  const { me } = useSession();
  const save = useSave();
  const usage = useData<any>('/usage');
  const s = me!.settings.ai;
  const providers = me!.server.providers;
  const usable = providers.filter((p) => p.configured && (!s.localOnly || p.capabilities.local));
  const active = usable.find((p) => p.id === s.provider) ?? usable[0];
  const [limit, setLimit] = useState(String(s.dailyTokenLimit ?? usage.data?.dailyLimit ?? ''));
  useEffect(() => {
    if (usage.data && s.dailyTokenLimit == null) setLimit(String(usage.data.dailyLimit));
  }, [usage.data, s.dailyTokenLimit]);
  const [monthly, setMonthly] = useState(String(s.monthlyTokenLimit ?? 0));
  const [health, setHealth] = useState<{ busy: boolean; results?: any[] }>({ busy: false });
  const testProviders = async () => {
    setHealth({ busy: true });
    try {
      setHealth({ busy: false, results: (await post<any>('/ai/test', {})).results });
    } catch (e: any) {
      setHealth({ busy: false, results: [{ id: 'error', label: 'Connection test', ok: false, error: e?.message ?? 'Failed' }] });
    }
  };
  const u = usage.data;
  return (
    <>
      <Card title="AI provider" desc="API keys live only on the server (.env) — never in the browser or in GitHub. Hailey can use Claude or any OpenAI-compatible endpoint, including a free local model with Ollama.">
        {providers.map((p) => (
          <Row key={p.id} label={p.label} desc={<>{p.configured ? <>Model: <code>{p.model}</code>{p.capabilities.local ? ' · runs locally (free)' : ''}{p.pricing ? ` · ~$${p.pricing.input}/$${p.pricing.output} per million input/output tokens` : ''}{!p.capabilities.tools ? ' · chat only (no tools)' : ''}</> : p.note}</>}>
            {p.configured ? (
              active?.id === p.id ? <span className="badge success"><Icon name="check" size={12} />Active</span> : <button className="btn sm" onClick={() => save({ ai: { provider: p.id } }, `Switched to ${p.label}`)}>Use this</button>
            ) : <span className="badge">Not configured</span>}
          </Row>
        ))}
        {active?.id === 'anthropic' && (
          <>
            <Row label="Claude model" desc="Haiku is the cheapest; Opus is the most capable.">
              <select className="select" style={{ width: 220 }} value={s.model ?? active.model} onChange={(e) => save({ ai: { model: e.target.value } })} aria-label="Claude model">
                {['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Row>
            <Row label="Thinking effort" desc="Higher effort gives better answers on hard problems but uses more tokens.">
              <Seg label="Effort" value={s.effort} onChange={(v) => save({ ai: { effort: v } })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
            </Row>
          </>
        )}
        {providers.some((p) => p.configured) && (
          <Row label="Connection test" desc="Sends a tiny test prompt (no personal data) to each configured provider. Uses a few tokens.">
            <button className="btn sm" disabled={health.busy} onClick={testProviders}>{health.busy ? 'Testing…' : 'Test connection'}</button>
          </Row>
        )}
        {health.results?.map((h) => (
          <div key={h.id} className={`callout ${h.ok ? 'success' : 'warning'} small`} style={{ marginTop: 6 }} role="status">
            <Icon name={h.ok ? 'check' : 'info'} size={16} />{h.label}: {h.ok ? `connected · ${h.model} · ${h.latencyMs} ms` : h.error}
          </div>
        ))}
        <Row label="Local-only mode" desc="Keep conversations on your own machine. If no local model is available, Hailey stops and tells you instead of using a cloud provider.">
          <Switch label="Local-only mode" checked={!!s.localOnly} onChange={(v) => save({ ai: { localOnly: v } }, v ? 'Local-only mode on' : 'Local-only mode off')} />
        </Row>
        {!providers.some((p) => p.configured) && (
          <div className="callout warning small" style={{ marginTop: 10 }}><Icon name="info" size={16} />No provider is configured. See the README section “Connect an AI model”.</div>
        )}
      </Card>
      <Card title="Usage & limits" desc="Hailey stops sending AI requests once the 24-hour or 30-day token limit is reached.">
        <Row label="Daily token limit" desc="0 = no limit">
          <input className="input" type="number" min={0} style={{ width: 160 }} value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Daily token limit" />
          <button className="btn sm" onClick={() => save({ ai: { dailyTokenLimit: Number(limit) || 0 } })}>Save</button>
        </Row>
        <Row label="Monthly token limit" desc="Rolling 30 days · 0 = no limit">
          <input className="input" type="number" min={0} style={{ width: 160 }} value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-label="Monthly token limit" />
          <button className="btn sm" onClick={() => save({ ai: { monthlyTokenLimit: Number(monthly) || 0 } })}>Save</button>
        </Row>
        {usage.loading && !u ? <Loading rows={2} /> : u && (
          <>
            <div className="grid three" style={{ margin: '14px 0' }}>
              <Stat label="Tokens, last 24 h" value={(u.last24h.input + u.last24h.output).toLocaleString()} />
              <Stat label="Tokens, last 30 days" value={(u.last30d.input + u.last30d.output).toLocaleString()} />
              <Stat label="Estimated cost, 30 days" value={`$${u.last30d.cost.toFixed(2)}`} />
            </div>
            {u.byDay.length > 0 && <BarChart data={u.byDay.map((d: any) => ({ label: d.day.slice(5), value: d.tokens }))} height={160} />}
            {u.byModel.length > 0 && (
              <table className="data" style={{ marginTop: 10 }}><thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Est. cost</th></tr></thead>
                <tbody>{u.byModel.map((m: any) => <tr key={m.model}><td>{m.model}</td><td>{m.input.toLocaleString()}</td><td>{m.output.toLocaleString()}</td><td>${m.cost.toFixed(3)}</td></tr>)}</tbody></table>
            )}
            <p className="faint tiny" style={{ marginTop: 8 }}>{u.note}</p>
          </>
        )}
      </Card>
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{value}</div><div className="faint small">{label}</div>
  </div>
);

function MemorySettings() {
  const { me } = useSession();
  const save = useSave();
  const m = me!.settings.memory;
  const cats = ['profile', 'preference', 'goal', 'routine', 'project', 'date', 'fact', 'summary'];
  return (
    <Card title="Memory" desc="Long-term memory lets Hailey remember what matters between conversations. Manage individual memories on the Memory page.">
      <Row label="Use long-term memory" desc="When off, Hailey neither reads nor saves memories."><Switch label="Use long-term memory" checked={m.enabled} onChange={(v) => save({ memory: { enabled: v } })} /></Row>
      <Row label="When Hailey wants to remember something" desc="Sensitive details (health, finances, IDs, beliefs) and guesses always need your approval.">
        <select className="select" style={{ width: 280 }} value={m.saveMode} onChange={(e) => save({ memory: { saveMode: e.target.value } })} aria-label="Memory save mode">
          <option value="ask_sensitive">Save what I say; ask about sensitive or inferred</option>
          <option value="ask">Always ask me first</option>
          <option value="explicit">Only when I explicitly say “remember”</option>
        </select>
      </Row>
      <Row label="Retention" desc="Automatically forget new memories after this many days (0 = keep until deleted).">
        <input className="input" type="number" min={0} style={{ width: 120 }} defaultValue={m.retentionDays} onBlur={(e) => Number(e.target.value) !== m.retentionDays && save({ memory: { retentionDays: Number(e.target.value) || 0 } })} aria-label="Retention days" />
      </Row>
      <div style={{ marginTop: 12 }}>
        <div className="label" style={{ marginBottom: 6 }}>Categories Hailey may use</div>
        <div className="row wrap">{cats.map((c) => (
          <label key={c} className="checkbox small" style={{ marginRight: 12 }}>
            <input type="checkbox" checked={!m.disabledCategories.includes(c)} onChange={(e) => save({ memory: { disabledCategories: e.target.checked ? m.disabledCategories.filter((x: string) => x !== c) : [...m.disabledCategories, c] } })} />{c}
          </label>
        ))}</div>
      </div>
    </Card>
  );
}

function Permissions() {
  const { me } = useSession();
  const save = useSave();
  const tools = useData<any>('/tools');
  const p = me!.settings.permissions;
  const setMode = async (name: string, mode: string) => {
    await save({ permissions: { tools: { ...p.tools, [name]: mode } } }, 'Permission updated');
    tools.reload();
  };
  const groups = [['read', 'Read-only — looks things up, changes nothing'], ['reversible', 'Reversible changes — creates or edits your data'], ['consequential', 'Consequential — deletions; always need approval']];
  return (
    <>
      <Card title="Permissions" desc="Hailey only acts through these narrowly scoped tools — there is no general computer or shell access. Revoke any tool at any time.">
        <Row label="Allow reversible changes without asking" desc="E.g. creating tasks, reminders and notes when you ask for them. Turn off to approve each one.">
          <Switch label="Allow reversible changes" checked={p.autoReversible} onChange={(v) => save({ permissions: { autoReversible: v } }).then(() => tools.reload())} />
        </Row>
      </Card>
      {tools.loading && !tools.data ? <Loading /> : groups.map(([risk, label]) => (
        <Card key={risk} title={label.split(' — ')[0]} desc={label.split(' — ')[1]}>
          {tools.data?.tools.filter((t: any) => t.risk === risk).map((t: any) => (
            <Row key={t.name} label={t.name.replace(/_/g, ' ')} desc={t.description}>
              <select className="select" style={{ width: 150 }} value={t.mode} onChange={(e) => setMode(t.name, e.target.value)} aria-label={`Permission for ${t.name}`}>
                {risk !== 'consequential' && <option value="auto">Allowed</option>}
                <option value="ask">Ask me first</option>
                <option value="off">Turned off</option>
              </select>
            </Row>
          ))}
        </Card>
      ))}
    </>
  );
}

function urlB64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function Notifications() {
  const { me } = useSession();
  const save = useSave();
  const toast = useToast();
  const n = me!.settings.notifications;
  const push = me!.server.push;
  const devices = useData<any>('/push/devices');
  const routines = useData<any>('/routines');
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState(false);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

  const enable = async () => {
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') throw new Error('Notifications were not allowed. You can change this in your browser’s site settings.');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error('The offline/notification service is not active. Use the installed or production build (npm run build && npm start).');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(push.publicKey!) });
      const json = sub.toJSON();
      await post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys, label: `${navigator.platform || 'Device'} · ${navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d]+/)?.[0] ?? 'browser'}` });
      toast('Notifications enabled on this device');
      devices.reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Push notifications" desc="Reminders are scheduled on the server and delivered even when Hailey is closed. On Android, install Hailey to your home screen for the most reliable delivery; on Windows the browser must be allowed to run in the background.">
        {!push.configured ? (
          <div className="callout warning small"><Icon name="info" size={16} />Push is not configured on the server. Run <code>npm run setup</code> to generate VAPID keys, then restart. Reminders still appear in-app under Notifications.</div>
        ) : !supported ? (
          <div className="callout warning small"><Icon name="info" size={16} />This browser doesn’t support web push. Reminders will appear in-app.</div>
        ) : (
          <Row label="This device" desc={perm === 'granted' ? 'Permission granted.' : perm === 'denied' ? 'Blocked in browser settings.' : 'Not enabled yet.'}>
            <button className="btn primary sm" disabled={busy || perm === 'denied'} onClick={enable}>{busy ? 'Enabling…' : 'Enable on this device'}</button>
            <button className="btn sm" onClick={() => post('/push/test').then((r) => toast(r.sent ? `Test sent to ${r.sent} device(s)` : 'No devices received it — enable notifications first', r.sent ? 'info' : 'error')).catch((e) => toast(e.message, 'error'))}>Send test</button>
          </Row>
        )}
        <Row label="Send push notifications" desc="Turn off to keep reminders in-app only."><Switch label="Push notifications" checked={n.push} onChange={(v) => save({ notifications: { push: v } })} /></Row>
        <Row label="Quiet hours" desc="Reminders due during quiet hours are delivered when they end.">
          <input type="time" className="input" style={{ width: 120 }} defaultValue={n.quietHoursStart ?? ''} onBlur={(e) => save({ notifications: { quietHoursStart: e.target.value || undefined } })} aria-label="Quiet hours start" />
          <span className="faint">to</span>
          <input type="time" className="input" style={{ width: 120 }} defaultValue={n.quietHoursEnd ?? ''} onBlur={(e) => save({ notifications: { quietHoursEnd: e.target.value || undefined } })} aria-label="Quiet hours end" />
        </Row>
        {devices.data?.devices.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="label">Subscribed devices</div>
            <ul className="list">{devices.data.devices.map((d: any) => (
              <li key={d.id} className="list-item"><Icon name="bell" size={16} /><span className="grow small">{d.device_label || 'Device'} · since {fmtDateTime(d.created_at, { time: false })}</span>
                <button className="btn ghost sm" onClick={async () => { await del(`/push/devices/${d.id}`); devices.reload(); }}>Remove</button></li>
            ))}</ul>
          </div>
        )}
      </Card>
      <Card title="Routines" desc="Scheduled summaries built from your real data. Routines only notify you — they never take actions on their own.">
        {routines.data?.routines.map((r: any) => (
          <Row key={r.id} label={r.kind === 'morning_briefing' ? 'Morning briefing' : 'Evening review'} desc={<>{r.kind === 'morning_briefing' ? 'Today’s tasks, overdue items, reminders and project deadlines.' : 'What you completed, what’s still open, project progress and tomorrow’s priorities.'}{r.last_run_at && <> · Last run {fmtDateTime(r.last_run_at)}: {r.last_status === 'failed' ? <span className="badge danger">failed</span> : 'ok'}</>}</>}>
            <input type="time" className="input" style={{ width: 120 }} defaultValue={r.time_local} onBlur={async (e) => { if (e.target.value && e.target.value !== r.time_local) { await patch(`/routines/${r.id}`, { time_local: e.target.value }); toast('Time saved'); routines.reload(); } }} aria-label="Routine time" />
            <Switch label={`Enable ${r.kind}`} checked={r.enabled} onChange={async (v) => { await patch(`/routines/${r.id}`, { enabled: v }); routines.reload(); }} />
          </Row>
        ))}
      </Card>
    </>
  );
}

function Appearance() {
  const { me } = useSession();
  const save = useSave();
  const a = me!.settings.appearance;
  return (
    <Card title="Appearance & accessibility">
      <Row label="Theme"><Seg label="Theme" value={a.theme} onChange={(v) => save({ appearance: { theme: v } })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Row>
      <Row label="Text size"><Seg label="Text size" value={a.textSize} onChange={(v) => save({ appearance: { textSize: v } })} options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]} /></Row>
      <Row label="Reduce motion" desc="Turns off animations."><Switch label="Reduce motion" checked={a.reduceMotion} onChange={(v) => save({ appearance: { reduceMotion: v } })} /></Row>
      <div className="callout small" style={{ marginTop: 12 }}>
        <Icon name="info" size={16} />
        <div>Keyboard shortcuts: <span className="kbd">Ctrl K</span> search · <span className="kbd">/</span> focus the message box · <span className="kbd">Alt 1–7</span> switch sections · <span className="kbd">Esc</span> close dialogs · <span className="kbd">Enter</span> send, <span className="kbd">Shift Enter</span> new line.</div>
      </div>
    </Card>
  );
}

function Regional() {
  const { me } = useSession();
  const save = useSave();
  const r = me!.settings.regional;
  const zones: string[] = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : [r.timeZone];
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Card title="Language & region" desc="Used for dates, reminders, briefings and natural-language scheduling.">
      <Row label="Time zone" desc={deviceTz !== r.timeZone ? `This device is set to ${deviceTz}.` : undefined}>
        <select className="select" style={{ width: 260 }} value={r.timeZone} onChange={(e) => save({ regional: { timeZone: e.target.value } })} aria-label="Time zone">
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        {deviceTz !== r.timeZone && <button className="btn sm" onClick={() => save({ regional: { timeZone: deviceTz } })}>Use device</button>}
      </Row>
      <Row label="Date format">
        <select className="select" style={{ width: 200 }} value={r.locale} onChange={(e) => save({ regional: { locale: e.target.value } })} aria-label="Date format">
          <option value="en-GB">16 Oct 2026 (UK)</option><option value="en-US">Oct 16, 2026 (US)</option><option value="en-UG">Uganda (en-UG)</option><option value="en-KE">Kenya (en-KE)</option><option value="fr-FR">Français</option><option value="sw-KE">Kiswahili</option>
        </select>
      </Row>
      <Row label="12-hour clock"><Switch label="12-hour clock" checked={r.hour12} onChange={(v) => save({ regional: { hour12: v } })} /></Row>
    </Card>
  );
}

function Voice() {
  const { me } = useSession();
  const save = useSave();
  const v = me!.settings.voice;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  const sttSupported = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  return (
    <Card title="Voice" desc="Optional. Hailey only listens while the microphone button is active, and never records in the background.">
      {!sttSupported && <div className="callout warning small" style={{ marginBottom: 10 }}><Icon name="info" size={16} />Voice input isn’t available in this browser (it works in Chrome and Edge). You can still type.</div>}
      <div className="callout small" style={{ marginBottom: 10 }}><Icon name="info" size={16} />In Chrome and Edge, speech-to-text is processed by the browser maker’s online speech service (Google or Microsoft). Read-aloud uses voices installed on your device.</div>
      <Row label="Enable voice features"><Switch label="Enable voice" checked={v.enabled} onChange={(x) => save({ voice: { enabled: x } })} /></Row>
      <Row label="Speech language">
        <select className="select" style={{ width: 200 }} value={v.language} onChange={(e) => save({ voice: { language: e.target.value } })} aria-label="Speech language">
          {['en-US', 'en-GB', 'en-UG', 'en-KE', 'sw-KE', 'fr-FR', 'lg-UG'].map((l) => <option key={l}>{l}</option>)}
        </select>
      </Row>
      <Row label="Read replies aloud automatically"><Switch label="Read replies aloud" checked={v.speakReplies} onChange={(x) => save({ voice: { speakReplies: x } })} /></Row>
      <Row label="Voice">
        <select className="select" style={{ width: 240 }} value={v.voiceName} onChange={(e) => save({ voice: { voiceName: e.target.value } })} aria-label="Voice">
          <option value="">Default</option>{voices.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.lang})</option>)}
        </select>
        <button className="btn sm" onClick={() => speak('Hello, I’m Hailey. This is how I sound.', { lang: v.language, voiceName: v.voiceName })}>Test</button>
      </Row>
    </Card>
  );
}

function Integrations() {
  const toast = useToast();
  const confirm = useConfirm();
  const { me } = useSession();
  const feed = useData<any>('/calendar/feed');
  const [url, setUrl] = useState<string | null>(null);
  return (
    <>
      <Card title="Calendar feed (read-only)" desc="Show your Hailey tasks with due dates in Google Calendar, Outlook or your phone’s calendar by subscribing to a private link. Hailey does not read or change your calendars.">
        {feed.data?.enabled && !url && <p className="small" style={{ marginBottom: 8 }}>A feed link is active (created {fmtDateTime(feed.data.created_at)}). For security the link is only shown once — create a new one if you need it again.</p>}
        {url && (
          <div className="callout brand small" style={{ marginBottom: 10, wordBreak: 'break-all' }}>
            <div className="grow"><strong>Your private feed URL</strong> (treat it like a password):<br /><code>{url}</code></div>
            <button className="btn sm" onClick={() => { void navigator.clipboard.writeText(url); toast('Copied'); }}>Copy</button>
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary sm" onClick={async () => { const r = await post('/calendar/feed'); setUrl(r.url); feed.reload(); }}>{feed.data?.enabled ? 'Create a new link (old one stops working)' : 'Create feed link'}</button>
          {feed.data?.enabled && <button className="btn danger sm" onClick={async () => { if (await confirm({ title: 'Turn off the calendar feed?', body: 'Calendars subscribed to it will stop updating.', confirm: 'Turn off', danger: true })) { await del('/calendar/feed'); setUrl(null); feed.reload(); toast('Feed turned off'); } }}>Turn off</button>}
        </div>
        <p className="faint tiny" style={{ marginTop: 8 }}>Google Calendar: Other calendars → From URL. Outlook: Add calendar → Subscribe from web. The calendar app must be able to reach your Hailey server’s public address.</p>
      </Card>
      <Card title="Connected services" desc="What this Hailey server has configured. Keys are managed in the server’s .env file.">
        <Row label="AI">{me!.server.providers.filter((p) => p.configured).map((p) => <span key={p.id} className="badge success">{p.label}</span>)}{!me!.server.providers.some((p) => p.configured) && <span className="badge">None</span>}</Row>
        <Row label="Web research"><span className={`badge ${me!.server.search.configured ? 'success' : ''}`}>{me!.server.search.provider ?? 'Not configured'}</span></Row>
        <Row label="Push notifications"><span className={`badge ${me!.server.push.configured ? 'success' : ''}`}>{me!.server.push.configured ? 'Configured' : 'Not configured'}</span></Row>
        <Row label="Email, messaging & two-way calendar sync" desc="Not connected. Hailey cannot send email or messages, or edit external calendars, in this version."><span className="badge">Not available</span></Row>
      </Card>
    </>
  );
}

function Privacy() {
  const toast = useToast();
  const confirm = useConfirm();
  const { logout } = useSession();
  const sessions = useData<any>('/auth/sessions');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Card title="Your data" desc="Everything is stored in the SQLite database and uploads folder on your Hailey server. Nothing is sold or shared. AI requests send the relevant conversation, retrieved memories and attached document text to the AI provider you configured.">
        <Row label="Export all data" desc="A JSON file with your tasks, notes, projects, memories, conversations and settings."><a className="btn sm" href="/api/export" download><Icon name="download" size={14} />Download export</a></Row>
        <Row label="Offline copy on this device" desc="Pages you open are cached for offline reading. New tasks, task edits and note edits made offline are queued here and synced when you reconnect; conflicts are shown for review. Signing out clears both."><span className="badge">Read + queued edits</span></Row>
        <Row label="Sync" desc="All devices read and write the same server, so changes appear everywhere after a refresh. Offline edits are not queued — make changes when online."><span className="badge success">Server-based</span></Row>
      </Card>
      <Card title="Signed-in devices">
        {sessions.loading ? <Loading rows={2} /> : (
          <ul className="list">{sessions.data?.sessions.map((s: any) => (
            <li key={s.id} className="list-item"><Icon name="user" size={16} /><span className="grow small ellipsis">{s.user_agent || 'Unknown device'} · since {fmtDateTime(s.created_at, { time: false })}</span>{s.current && <span className="badge brand">This device</span>}</li>
          ))}</ul>
        )}
        <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { const r = await post('/auth/sessions/revoke-others'); toast(`Signed out ${r.revoked} other device(s)`); sessions.reload(); }}>Sign out all other devices</button>
      </Card>
      <Card title="Change password">
        <div className="grid two">
          <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} aria-label="Current password" />
          <input className="input" type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} aria-label="New password" />
        </div>
        <button className="btn sm primary" style={{ marginTop: 10 }} disabled={!pw.current || pw.next.length < 10} onClick={async () => {
          try { await post('/auth/password', pw); toast('Password changed. Other devices were signed out.'); setPw({ current: '', next: '' }); } catch (e: any) { toast(e.message, 'error'); }
        }}>Change password</button>
      </Card>
      <Card title="Delete account" desc="Permanently deletes your account and every task, note, document, memory, conversation and setting. This cannot be undone — export first if you want a copy.">
        <button className="btn danger" onClick={async () => { if (await confirm({ title: 'Delete your Hailey account?', body: 'You will be asked for your password next.', confirm: 'Continue', danger: true })) setDeleting(true); }}>Delete my account…</button>
      </Card>
      {deleting && <DeleteAccount onClose={() => setDeleting(false)} onDeleted={() => { toast('Account deleted'); void logout(); }} />}
      <ErrorBox error={sessions.error} />
    </>
  );
}

function DeleteAccount({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Delete account permanently" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn danger solid" disabled={typed !== 'DELETE' || !password} onClick={async () => {
        try { await api('/auth/delete-account', { method: 'POST', body: { password, confirm: 'DELETE' } }); onDeleted(); } catch (e: any) { setError(e.message); }
      }}>Delete everything</button>
    </>}>
      <div className="stack">
        <input className="input" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
        <input className="input" placeholder="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" />
        {error && <div className="callout danger small">{error}</div>}
      </div>
    </Modal>
  );
}
