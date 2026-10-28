import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { ErrorBox, Loading, Switch, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { del, patch, post } from '../lib/api';
import { Link } from '../lib/router';
import { fmtDateTime } from '../lib/format';

export default function Messaging() {
  const { data, error, loading, reload } = useData<any>('/channels');
  const tg = data?.channels.find((c: any) => c.kind === 'telegram');
  const wa = data?.channels.find((c: any) => c.kind === 'whatsapp');
  return (
    <Shell title="Messaging">
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div>
          <h1>Talk to Hailey from your messaging apps</h1>
          <p className="sub">Message Hailey from Telegram or WhatsApp as you would a friend — text, voice notes and photos. Add her to a family or team group to keep lists and plans in one place. Each chat gets its own conversation here in Hailey.</p>
        </div></div>
        {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : (
          <div className="stack-lg">
            {!data.transcription && (
              <div className="callout small"><Icon name="mic" size={16} /><span>Voice notes need free speech-to-text on the server: set <code>TRANSCRIBE_BASE_URL</code> (e.g. Groq’s free tier, <code>https://api.groq.com/openai/v1</code>, with <code>TRANSCRIBE_API_KEY</code>) or point it at a local Whisper server. Text and photos work without it.</span></div>
            )}
            <TelegramCard ch={tg} reload={reload} />
            <WhatsAppCard ch={wa} reload={reload} publicUrl={data.publicUrl} />
            <section className="card pad small muted">
              <h3 style={{ marginBottom: 6 }}>Privacy in chats</h3>
              <ul style={{ paddingLeft: 18 }}>
                <li>Only chats you link with a one-time code are answered. In your private chat, only your own account is answered.</li>
                <li>In groups Hailey answers only when mentioned or replied to, can add tasks, reminders and notes, look things up and find places — but can’t see your memories, tasks, notes or documents.</li>
                <li>Anything that needs approval shows <b>Approve</b> / <b>Decline</b> buttons in your private chat, and waits in <Link to="/actions">Approvals</Link>.</li>
                <li>Send <code>/stop</code> in any chat to make Hailey go quiet there, <code>/start</code> to bring her back.</li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Chats({ ch, reload }: { ch: any; reload: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  if (!ch.chats.length) return null;
  return (
    <ul className="list divided" style={{ marginTop: 10 }}>
      {ch.chats.map((c: any) => (
        <li key={c.id} className="list-item">
          <Icon name={c.is_group ? 'user' : 'chat'} size={16} />
          <span className="grow ellipsis">{c.title || (c.is_group ? 'Group' : 'Private chat')}<span className="faint small"> · {c.is_group ? 'group' : 'private'} · linked {fmtDateTime(c.created_at, { time: false })}</span></span>
          {c.conversation_id && <Link className="btn ghost sm" to={`/chat/${c.conversation_id}`}>Open</Link>}
          <Switch label={`${c.muted ? 'Unmute' : 'Mute'} ${c.title}`} checked={!c.muted} onChange={async (v) => { await patch(`/channel-chats/${c.id}`, { muted: !v }); reload(); }} />
          <button className="btn ghost icon sm" aria-label={`Unlink ${c.title}`} onClick={async () => {
            if (!(await confirm({ title: `Unlink ${c.title || 'this chat'}?`, body: 'Hailey stops answering there. Its conversation stays in Chat.', confirm: 'Unlink', danger: true }))) return;
            await del(`/channel-chats/${c.id}`).catch((e) => toast(e.message, 'error'));
            reload();
          }}><Icon name="x" size={14} /></button>
        </li>
      ))}
    </ul>
  );
}

function Pairing({ ch, reload, howTo }: { ch: any; reload: () => void; howTo: string }) {
  const [code, setCode] = useState<string | null>(ch.pairing_code);
  return (
    <div className="callout small" style={{ marginTop: 10, alignItems: 'center' }}>
      <Icon name="lock" size={16} />
      {code ? <span className="grow">{howTo} <b className="mono" style={{ fontSize: '1.15em', letterSpacing: 2 }}>{code}</b> — valid for 15 minutes.</span>
        : <span className="grow">Link a chat or group with a one-time code.</span>}
      <button className="btn sm" onClick={async () => { setCode((await post(`/channels/${ch.id}/pair`)).pairing_code); reload(); }}>{code ? 'New code' : 'Get a code'}</button>
    </div>
  );
}

function ChannelHeader({ ch, title, sub, reload }: { ch: any; title: string; sub: string; reload: () => void }) {
  const confirm = useConfirm();
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow"><h2>{title}</h2><p className="small muted">{sub}</p></div>
        <Switch label={`${ch.enabled ? 'Turn off' : 'Turn on'} ${title}`} checked={ch.enabled} onChange={async (v) => { await patch(`/channels/${ch.id}`, { enabled: v }); reload(); }} />
      </div>
      {ch.last_error && <p className="small" style={{ color: 'var(--danger)' }}>{ch.last_error}</p>}
      <div className="row wrap" style={{ marginTop: 8 }}>
        <label className="checkbox small"><input type="checkbox" checked={ch.config.transcribe_voice !== false} onChange={async (e) => { await patch(`/channels/${ch.id}`, { transcribe_voice: e.target.checked }); reload(); }} />Transcribe voice notes</label>
        <span className="grow" />
        <button className="btn ghost sm" onClick={async () => {
          if (!(await confirm({ title: `Disconnect ${title}?`, body: 'All linked chats are unlinked and the saved token is deleted.', confirm: 'Disconnect', danger: true }))) return;
          await del(`/channels/${ch.id}`);
          reload();
        }}><Icon name="trash" size={14} />Disconnect</button>
      </div>
    </>
  );
}

function TelegramCard({ ch, reload }: { ch: any; reload: () => void }) {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  if (ch) {
    return (
      <section className="card pad">
        <ChannelHeader ch={ch} title="Telegram" sub={`Your bot: @${ch.config.bot_username}${ch.last_seen_at ? ` · last message ${fmtDateTime(ch.last_seen_at)}` : ''}`} reload={reload} />
        <Pairing ch={ch} reload={reload} howTo={`Open @${ch.config.bot_username} in Telegram and send`} />
        <p className="tiny faint" style={{ marginTop: 6 }}>For a group: add @{ch.config.bot_username} to the group, then send <code>/link CODE</code> there. In @BotFather, turn off <i>Group Privacy</i> only if you want Hailey to see unmentioned messages (not needed).</p>
        <Chats ch={ch} reload={reload} />
      </section>
    );
  }
  return (
    <section className="card pad stack">
      <h2>Telegram <span className="badge brand">free</span></h2>
      <ol className="small" style={{ paddingLeft: 18 }}>
        <li>In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> and send <code>/newbot</code>. Pick a name (e.g. “Hailey”) and a username ending in <i>bot</i>.</li>
        <li>BotFather replies with a token like <code>123456789:AAE…</code>. Paste it here.</li>
        <li>Hailey shows a 6-digit code — send it to your new bot. Done. No public web address is needed.</li>
      </ol>
      <div className="row wrap">
        <input className="input grow" type="password" autoComplete="off" placeholder="Bot token from @BotFather" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Telegram bot token" />
        <button className="btn primary" disabled={busy || token.trim().length < 20} onClick={async () => {
          setBusy(true);
          try {
            await post('/channels/telegram', { token });
            toast('Telegram connected — now send the code to your bot');
            reload();
          } catch (e: any) {
            toast(e.message, 'error');
          } finally {
            setBusy(false);
          }
        }}>{busy ? 'Connecting…' : 'Connect Telegram'}</button>
      </div>
    </section>
  );
}

function WhatsAppCard({ ch, reload, publicUrl }: { ch: any; reload: () => void; publicUrl: string }) {
  const toast = useToast();
  const [f, setF] = useState({ phone_number_id: '', access_token: '', app_secret: '' });
  const [busy, setBusy] = useState(false);
  const local = /localhost|127\.0\.0\.1/.test(publicUrl);
  if (ch) {
    return (
      <section className="card pad">
        <ChannelHeader ch={ch} title="WhatsApp" sub={`Business number ${ch.config.display_phone || ch.config.phone_number_id}`} reload={reload} />
        <div className="small" style={{ marginTop: 10 }}>
          <div className="label">Webhook (paste into Meta → WhatsApp → Configuration)</div>
          <div className="row wrap"><code className="grow ellipsis">{ch.webhook_url}</code><button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(ch.webhook_url).then(() => toast('Copied'))}><Icon name="copy" size={14} />Copy</button></div>
          <div className="row wrap" style={{ marginTop: 6 }}><span className="grow">Verify token: <code>{ch.config.verify_token}</code></span><button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(ch.config.verify_token).then(() => toast('Copied'))}><Icon name="copy" size={14} />Copy</button></div>
          <p className="tiny faint" style={{ marginTop: 4 }}>Then subscribe the webhook to the <i>messages</i> field.</p>
        </div>
        <Pairing ch={ch} reload={reload} howTo="From your own WhatsApp, send this to the business number:" />
        <Chats ch={ch} reload={reload} />
      </section>
    );
  }
  return (
    <section className="card pad stack">
      <h2>WhatsApp <span className="badge">free for chats you start</span></h2>
      {local && <div className="callout warning small"><Icon name="info" size={16} />WhatsApp needs Hailey on a public HTTPS address (set <code>PUBLIC_URL</code>, e.g. your ngrok or Cloudflare Tunnel address). Telegram above works without one.</div>}
      <ol className="small" style={{ paddingLeft: 18 }}>
        <li>At <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com</a>, create an app of type <i>Business</i> and add the <b>WhatsApp</b> product. Meta gives you a free test number, or add your own business number.</li>
        <li>Copy the <b>Phone number ID</b> and create a <b>permanent access token</b> (Business settings → System users) with <i>whatsapp_business_messaging</i>. Copy the <b>App secret</b> from App settings → Basic.</li>
        <li>Paste them here, then copy the webhook address and verify token Hailey shows into Meta’s WhatsApp configuration.</li>
      </ol>
      <p className="tiny faint">Meta doesn’t charge for conversations you start by messaging the number (service conversations). Hailey only replies — it never starts paid template conversations. WhatsApp groups aren’t supported by Meta’s API; use Telegram for groups.</p>
      <div className="grid two">
        <input className="input" placeholder="Phone number ID" value={f.phone_number_id} onChange={(e) => setF({ ...f, phone_number_id: e.target.value })} aria-label="Phone number ID" />
        <input className="input" type="password" placeholder="App secret" value={f.app_secret} onChange={(e) => setF({ ...f, app_secret: e.target.value })} aria-label="App secret" />
      </div>
      <input className="input" type="password" autoComplete="off" placeholder="Permanent access token" value={f.access_token} onChange={(e) => setF({ ...f, access_token: e.target.value })} aria-label="Access token" />
      <div><button className="btn primary" disabled={busy || !f.phone_number_id || !f.access_token || !f.app_secret} onClick={async () => {
        setBusy(true);
        try {
          await post('/channels/whatsapp', f);
          toast('WhatsApp connected — now set up the webhook in Meta');
          reload();
        } catch (e: any) {
          toast(e.message, 'error');
        } finally {
          setBusy(false);
        }
      }}>{busy ? 'Connecting…' : 'Connect WhatsApp'}</button></div>
    </section>
  );
}
