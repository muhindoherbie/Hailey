// Hailey for Windows: runs the Hailey server inside the app, shows it in a window,
// and keeps running in the system tray so reminders and phone access keep working.
import { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage, Notification, session } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Packaged: bundled server/web/migrations live in resources/hailey (unpacked). Dev: desktop/build.
const res = app.isPackaged ? join(process.resourcesPath, 'hailey') : join(here, 'build');
const iconPath = join(app.isPackaged ? process.resourcesPath : here, 'icon.png');

const userDir = app.getPath('userData'); // %APPDATA%\Hailey
const envFile = join(userDir, 'hailey.env');
const logFile = join(userDir, 'hailey.log');

let hailey = null;
let win = null;
let tray = null;
let tunnel = null;
let quitting = false;

function log(line) {
  try {
    writeFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`, { flag: 'a' });
  } catch {}
}

/** Reads KEY=VALUE lines (comments and blanks ignored). */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

function setEnvValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

/** First run: create the settings file from the template and generate push keys. */
function ensureSettings(generateVapidKeys) {
  mkdirSync(userDir, { recursive: true });
  if (!existsSync(envFile)) copyFileSync(join(res, 'hailey.env.example'), envFile);
  let text = readFileSync(envFile, 'utf8');
  const env = parseEnv(text);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    const k = generateVapidKeys();
    text = setEnvValue(setEnvValue(text, 'VAPID_PUBLIC_KEY', k.publicKey), 'VAPID_PRIVATE_KEY', k.privateKey);
    writeFileSync(envFile, text);
  }
}

function serverEnv() {
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  return {
    ...env,
    NODE_ENV: 'production',
    DATA_DIR: env.DATA_DIR && env.DATA_DIR !== './data' ? env.DATA_DIR : join(userDir, 'data'),
    HOST: '127.0.0.1',
    PORT: env.PORT || '8787',
  };
}

/** Cloud mode: HAILEY_REMOTE_URL=https://… in hailey.env opens that Hailey instead of running one here. */
function remoteUrl() {
  const url = (parseEnv(readFileSync(envFile, 'utf8')).HAILEY_REMOTE_URL ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+$/i.test(url) ? url : null;
}

async function startServer() {
  const { startHailey, generateVapidKeys } = await import(pathToFileURL(join(res, 'server.mjs')).href);
  ensureSettings(generateVapidKeys);
  const remote = remoteUrl();
  if (remote) {
    hailey = { url: remote, remote: true, stop: async () => {} };
    log(`cloud mode: using ${remote}`);
    return;
  }
  hailey = await startHailey({
    env: serverEnv(),
    staticDir: join(res, 'web'),
    migrationsDir: join(res, 'migrations'),
    log,
  });
  log(`started at ${hailey.url}`);
}

function createWindow() {
  if (win) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Hailey',
    icon: iconPath,
    backgroundColor: '#101214',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.loadURL(hailey.url);
  // Links to other sites (sources, downloads hosts) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(hailey.url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  // Closing the window keeps Hailey running in the tray (reminders keep working).
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
      if (!app.__trayHintShown && Notification.isSupported()) {
        new Notification({
          title: 'Hailey is still running',
          body: hailey?.remote ? 'Hailey stays in the tray. Right-click the tray icon to quit.' : 'Reminders keep working. Right-click the tray icon to quit.',
        }).show();
        app.__trayHintShown = true;
      }
    }
  });
  win.on('closed', () => (win = null));
}

// ---------- Phone access (ngrok) ----------
function ngrokPath() {
  const p = join(process.env.LOCALAPPDATA ?? '', 'ngrok', 'ngrok.exe');
  return existsSync(p) ? p : null;
}

function tunnelUrl() {
  const url = parseEnv(readFileSync(envFile, 'utf8')).PUBLIC_URL ?? '';
  return /^https:\/\/[a-z0-9.-]+\.ngrok(-free)?\.(app|dev|io)$/i.test(url) ? url : null;
}

function startTunnel() {
  const exe = ngrokPath();
  const url = tunnelUrl();
  if (!exe || !url) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Phone access',
      message: 'Phone access needs ngrok and your ngrok address.',
      detail: `${exe ? '' : '• Install ngrok to %LOCALAPPDATA%\\ngrok and connect your account (see the README).\n'}${url ? '' : '• Set PUBLIC_URL in Hailey’s settings to your https://….ngrok-free.dev address, then restart Hailey.\n'}`,
    });
    return;
  }
  tunnel = spawn(exe, ['http', serverEnv().PORT, `--url=${url}`, '--log=stdout'], { windowsHide: true });
  tunnel.stdout.on('data', (d) => log(`[ngrok] ${String(d).trim()}`));
  tunnel.on('exit', (code) => {
    log(`[ngrok] exited ${code}`);
    tunnel = null;
    refreshTray();
  });
  refreshTray();
}

function stopTunnel() {
  tunnel?.kill();
  tunnel = null;
  refreshTray();
}

// ---------- Tray ----------
function refreshTray() {
  if (!tray) return;
  const startup = app.getLoginItemSettings().openAtLogin;
  tray.setToolTip(tunnel ? 'Hailey — phone access on' : 'Hailey');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Hailey', click: createWindow },
      { type: 'separator' },
      hailey?.remote
        ? { label: `Using cloud Hailey (${hailey.url})`, enabled: false }
        : tunnel
          ? { label: `Phone access: on (${tunnelUrl()})`, click: stopTunnel, toolTip: 'Click to turn off' }
          : { label: 'Turn on phone access', click: startTunnel },
      { type: 'separator' },
      { label: 'Edit settings (AI keys, address)…', click: () => shell.openPath(envFile) },
      { label: 'Restart Hailey (after editing settings)', click: restart },
      { label: 'Open data folder', click: () => shell.openPath(userDir) },
      { label: 'Start Hailey when Windows starts', type: 'checkbox', checked: startup, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
      { type: 'separator' },
      { label: 'Quit Hailey', click: quit },
    ]),
  );
}

async function restart() {
  const hadTunnel = !!tunnel;
  stopTunnel();
  await hailey?.stop();
  try {
    await startServer();
    win?.loadURL(hailey.url);
    if (hadTunnel) startTunnel();
  } catch (err) {
    dialog.showErrorBox('Hailey could not restart', String(err?.message ?? err));
  }
}

async function quit() {
  quitting = true;
  stopTunnel();
  await hailey?.stop();
  app.quit();
}

// ---------- Smoke test (used by the release build to verify the packaged app) ----------
async function smokeTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hailey-smoke-'));
  try {
    const { startHailey, generateVapidKeys } = await import(pathToFileURL(join(res, 'server.mjs')).href);
    const keys = generateVapidKeys();
    const h = await startHailey({
      env: { DATA_DIR: dir, PORT: '8899', HOST: '127.0.0.1', PUBLIC_URL: 'http://127.0.0.1:8899', VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey },
      staticDir: join(res, 'web'),
      migrationsDir: join(res, 'migrations'),
      log: () => {},
    });
    const health = await (await fetch(`${h.url}/api/health`)).json();
    const page = await fetch(`${h.url}/`);
    const signup = await fetch(`${h.url}/api/auth/signup`, {
      method: 'POST',
      headers: { 'x-hailey': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke', email: 'smoke@hailey.test', password: 'smoke test password' }),
    });
    await h.stop();
    const ok = health.ok === true && page.status === 200 && signup.status === 201;
    console.log(`SMOKE ${ok ? 'PASS' : 'FAIL'} health=${health.ok} page=${page.status} signup=${signup.status} electron=${process.versions.electron} node=${process.versions.node}`);
    return ok ? 0 : 1;
  } catch (err) {
    console.log(`SMOKE FAIL ${err?.stack ?? err}`);
    return 1;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

// ---------- Startup ----------
if (process.argv.includes('--smoke-test')) {
  app.whenReady().then(async () => app.exit(await smokeTest()));
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => createWindow());
  app.on('window-all-closed', () => {}); // keep running in the tray
  app.whenReady().then(async () => {
    app.setAppUserModelId('app.hailey.desktop');
    // Free ngrok addresses show a warning page to browsers; this header skips it for Hailey.
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.ngrok-free.dev/*', 'https://*.ngrok-free.app/*', 'https://*.ngrok.dev/*', 'https://*.ngrok.app/*'] },
      (details, callback) => {
        details.requestHeaders['ngrok-skip-browser-warning'] = '1';
        callback({ requestHeaders: details.requestHeaders });
      },
    );
    try {
      await startServer();
    } catch (err) {
      dialog.showErrorBox('Hailey could not start', `${err?.message ?? err}\n\nDetails are in ${logFile}`);
      app.exit(1);
      return;
    }
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
    tray.on('click', createWindow);
    refreshTray();
    if (!process.argv.includes('--hidden')) createWindow();
  });
  app.on('before-quit', () => {
    quitting = true;
  });
}
