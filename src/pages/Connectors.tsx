import { useState } from 'react';
import { Shell } from '../components/Shell';
import { Icon } from '../components/Icon';
import { Empty, ErrorBox, Loading, Modal, Switch, useConfirm, useToast } from '../components/ui';
import { useData } from '../lib/hooks';
import { del, patch, post } from '../lib/api';
import { fmtDateTime } from '../lib/format';

const RISK_LABEL: Record<string, string> = { read: 'reads only', reversible: 'makes changes', consequential: 'can delete' };

export default function Connectors() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useData<any>('/connectors');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(id);
    try {
      await fn();
      if (done) toast(done);
      reload();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell title="Connected apps" actions={<button className="btn primary sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Connect an app</button>}>
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div>
          <h1>Connected apps</h1>
          <p className="sub">Let Hailey use your other apps — email, calendar, notes, project tools — through MCP, the open standard for AI connectors. Hailey can read with them freely; anything that sends, changes or deletes waits for your approval unless you say otherwise.</p>
        </div></div>

        {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : data.connectors.length === 0 ? (
          <Empty icon="link" title="No apps connected yet" action={<button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Connect an app</button>}>
            Paste the address of an MCP server. Many apps and connector services give you one.
          </Empty>
        ) : (
          <div className="stack">
            {data.connectors.map((c: any) => (
              <section key={c.id} className="card pad">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}{c.server_name && c.server_name !== c.name && <span className="faint small"> · {c.server_name}</span>}</div>
                    <div className="small faint ellipsis">{c.url}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      {c.tools.length} tool{c.tools.length === 1 ? '' : 's'} · {c.has_token ? 'token saved' : 'no token'}
                      {c.last_checked_at && <> · checked {fmtDateTime(c.last_checked_at)}</>}
                    </div>
                    {c.last_error && <p className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>{c.last_error}</p>}
                  </div>
                  <Switch label={`${c.enabled ? 'Turn off' : 'Turn on'} ${c.name}`} checked={c.enabled} onChange={(v) => act(c.id, () => patch(`/connectors/${c.id}`, { enabled: v }))} />
                </div>
                <div className="row wrap" style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}><Icon name="settings" size={14} />{open === c.id ? 'Hide tools' : 'Tools & permissions'}</button>
                  <button className="btn ghost sm" disabled={busy === c.id} onClick={() => act(c.id, () => post(`/connectors/${c.id}/refresh`), 'Tool list refreshed')}><Icon name="refresh" size={14} />{busy === c.id ? 'Checking…' : 'Refresh'}</button>
                  <TokenButton connector={c} onSaved={reload} />
                  <button className="btn ghost sm" onClick={async () => {
                    if (!(await confirm({ title: `Disconnect ${c.name}?`, body: 'Hailey will stop using it and its saved token is deleted. Past chats are kept.', confirm: 'Disconnect', danger: true }))) return;
                    void act(c.id, () => del(`/connectors/${c.id}`), `${c.name} disconnected`);
                  }}><Icon name="trash" size={14} />Disconnect</button>
                </div>
                {open === c.id && (
                  <ul className="list divided" style={{ marginTop: 12 }}>
                    {c.tools.map((t: any) => (
                      <li key={t.key} className="list-item" style={{ alignItems: 'flex-start' }}>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="small" style={{ fontWeight: 600 }}>{t.title || t.name} <span className={`badge ${t.risk === 'consequential' ? 'danger' : t.risk === 'read' ? '' : 'accent'}`}>{RISK_LABEL[t.risk]}</span></div>
                          <div className="tiny muted">{t.description}</div>
                        </div>
                        <select className="input" style={{ width: 'auto' }} value={t.mode} aria-label={`Permission for ${t.name}`}
                          onChange={(e) => act(c.id, () => patch(`/connectors/${c.id}`, { tool_modes: { [t.key]: e.target.value } }))}>
                          {t.risk !== 'consequential' && <option value="auto">Allowed</option>}
                          <option value="ask">Ask me first</option>
                          <option value="off">Off</option>
                        </select>
                      </li>
                    ))}
                    {c.tools.length === 0 && <li className="list-item small muted">This app offers no tools.</li>}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <section className="card pad stack" style={{ marginTop: 24 }}>
          <h2>Where to get an address</h2>
          <ul className="small" style={{ paddingLeft: 18 }}>
            <li><b>Connector services</b> such as Zapier MCP, Composio or Pipedream link Gmail, Google Calendar, Outlook, Slack, Notion, Todoist and thousands of other apps, and give you one personal MCP address. Sign in there, pick the apps and actions, and paste the address here.</li>
            <li><b>Apps with their own MCP server</b> (for example GitHub, Linear or Atlassian) list the address and how to create an access token in their documentation. Use the “Streamable HTTP” address — it often ends in <code>/mcp</code>.</li>
            <li><b>Your own server</b> on your home network works too, once whoever runs Hailey sets <code>MCP_ALLOW_PRIVATE_NETWORK=true</code>{data?.allowPrivate ? ' (it is on for this server)' : ''}.</li>
          </ul>
          <p className="small muted">Apps that require signing in through a browser pop-up (OAuth) aren’t supported directly yet; a connector service handles that sign-in for you. Treat an MCP address that includes a key like a password.</p>
        </section>
      </div>
      {adding && <AddConnector onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); }} />}
    </Shell>
  );
}

function AddConnector({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await post('/connectors', { name, url, token: token || undefined });
      toast(`${c.name} connected — ${c.tools.length} tool${c.tools.length === 1 ? '' : 's'} available`);
      onAdded();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Connect an app" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={busy || !name.trim() || !url.trim()} onClick={save}>{busy ? 'Connecting…' : 'Connect'}</button>
    </>}>
      <div className="stack">
        <div className="field"><label htmlFor="cn-name">Name</label><input id="cn-name" className="input" maxLength={40} placeholder="e.g. Work email" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="cn-url">MCP server address</label><input id="cn-url" className="input" inputMode="url" placeholder="https://…/mcp" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <div className="field">
          <label htmlFor="cn-token">Access token <span className="faint">(optional)</span></label>
          <input id="cn-token" className="input" type="password" autoComplete="off" placeholder="Paste a token if the app gave you one" value={token} onChange={(e) => setToken(e.target.value)} />
          <div className="hint">Sent to the app as a Bearer token. It’s stored encrypted on your Hailey server and never shown again.</div>
        </div>
        {err && <div className="callout warning small"><Icon name="alert" size={16} />{err}</div>}
      </div>
    </Modal>
  );
}

function TokenButton({ connector, onSaved }: { connector: any; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const save = async (value: string | null) => {
    try {
      await patch(`/connectors/${connector.id}`, { token: value });
      toast(value ? 'Token saved' : 'Token removed');
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}><Icon name="lock" size={14} />{connector.has_token ? 'Change token' : 'Add token'}</button>
      {open && (
        <Modal title={`Access token for ${connector.name}`} onClose={() => setOpen(false)} footer={<>
          {connector.has_token && <button className="btn danger" onClick={() => save(null)}>Remove token</button>}
          <span className="grow" />
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn primary" disabled={!token.trim()} onClick={() => save(token.trim())}>Save</button>
        </>}>
          <div className="field"><label htmlFor="tk">New token</label><input id="tk" className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></div>
        </Modal>
      )}
    </>
  );
}
