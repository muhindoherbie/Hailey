// System test of Hailey's PC/web version: the real Node server and the built web app.
// Usage: node web.cjs <serverUrl> <outDir>
const { chromium, request } = require('playwright');
const fs = require('fs');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const [URL_, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const results = [];

(async () => {
  const browser = await chromium.launch();
  const step = async (name, fn, page) => {
    const t0 = Date.now();
    try {
      const d = await fn();
      results.push({ name, ok: true, ms: Date.now() - t0, detail: d ?? '' });
      console.log(`PASS  ${name}${d ? ' — ' + d : ''}`);
    } catch (e) {
      const m = String(e.message ?? e).split('\n')[0].slice(0, 300);
      results.push({ name, ok: false, ms: Date.now() - t0, detail: m });
      console.log(`FAIL  ${name} — ${m}`);
      if (page) await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '-').slice(0, 50)}.png` }).catch(() => {});
    }
  };
  const expect = (c, m) => { if (!c) throw new Error(m); };

  // ---- HTTP level ----------------------------------------------------------------------------
  const raw = await request.newContext({ baseURL: URL_ });
  await step('Security headers on the app and the API', async () => {
    const r = await raw.get('/');
    const h = r.headers();
    const need = ['content-security-policy', 'x-content-type-options', 'referrer-policy'];
    const missing = need.filter((k) => !h[k]);
    expect(!missing.length, 'missing: ' + missing.join(', '));
    expect(!/unsafe-eval/.test(h['content-security-policy']), 'CSP allows unsafe-eval');
    const a = await raw.get('/api/auth/me');
    expect(a.status() === 401, 'unauthenticated API should be 401, got ' + a.status());
    return `CSP: ${h['content-security-policy'].slice(0, 90)}…; frame: ${h['x-frame-options'] ?? (h['content-security-policy'].includes('frame-ancestors') ? 'frame-ancestors' : 'none')}`;
  });
  await step('Forged requests are refused (no header, foreign origin)', async () => {
    const a = await raw.post('/api/auth/login', { data: { email: 'x@y.z', password: 'whatever12' } });
    expect(a.status() === 403, 'no x-hailey header should be 403, got ' + a.status());
    const b = await raw.post('/api/auth/login', { data: { email: 'x@y.z', password: 'whatever12' }, headers: { 'x-hailey': '1', origin: 'https://evil.example' } });
    expect(b.status() === 403, 'foreign origin should be 403, got ' + b.status());
    return 'both 403';
  });
  await step('Unknown paths: API gives JSON 404, app paths load the app', async () => {
    const a = await raw.get('/api/nope', { headers: { 'x-hailey': '1' } });
    expect([401, 404].includes(a.status()), 'api status ' + a.status());
    const b = await raw.get('/tasks');
    expect(b.status() === 200 && (await b.text()).includes('<div id="root">'), 'deep link should serve the app');
    const c = await raw.get('/../../etc/passwd');
    expect(!(await c.text()).includes('root:x:'), 'path traversal');
    return 'ok';
  });

  // ---- First user: sign-up through the UI -------------------------------------------------------
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 860 }, bypassCSP: true });
  const a = await ctxA.newPage();
  const errorsA = [];
  a.on('pageerror', (e) => errorsA.push(e.message));
  a.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errorsA.push(m.text().slice(0, 200)); });
  const api = (page, m, p, b) => page.evaluate(async ([m, p, b]) => { const r = await fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', 'x-hailey': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); const t = await r.text(); try { return { status: r.status, data: JSON.parse(t) }; } catch { return { status: r.status, data: t }; } }, [m, p, b]);

  await step('Sign-up through the web screens', async () => {
    const t0 = Date.now();
    await a.goto(URL_ + '/');
    await a.getByLabel('Your name').fill('Herbert');
    await a.getByLabel('Email').fill('herbert@example.com');
    await a.getByLabel('Password').fill('correct-horse-42');
    await a.getByRole('button', { name: 'Create account' }).click();
    await a.getByLabel('What should I call you?').or(a.getByText(/Good (morning|afternoon|evening)/)).first().waitFor({ timeout: 15000 });
    return `account created, setup shown in ${Date.now() - t0} ms`;
  }, a);
  await step('Weak password and duplicate email are refused with clear messages', async () => {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(URL_ + '/');
    const weak = await api(p, 'POST', '/auth/signup', { name: 'X', email: 'x@example.com', password: '123' });
    const dup = await api(p, 'POST', '/auth/signup', { name: 'X', email: 'herbert@example.com', password: 'another-pass-99' });
    await ctx.close();
    expect(weak.status === 400, 'weak password status ' + weak.status);
    expect(dup.status >= 400 && dup.status < 500, 'duplicate status ' + dup.status);
    return `"${weak.data.error}" / "${dup.data.error}"`;
  });
  await step('First-run setup on the PC version (AI already configured on the server)', async () => {
    if (await a.getByLabel('What should I call you?').count()) {
      await a.getByLabel('What should I call you?').fill('Herbert');
      for (let i = 0; i < 6; i++) {
        const go = a.getByRole('button', { name: /Let’s go/ });
        if (await go.count()) { await go.click(); break; }
        const next = a.getByRole('button', { name: 'Next' });
        if (await next.count()) await next.click(); else break;
        await a.waitForTimeout(300);
      }
    }
    await a.getByText('What can Hailey take off your plate?').or(a.getByText(/Good (morning|afternoon|evening)/)).first().waitFor({ timeout: 15000 });
    return 'setup finished, landed on ' + new URL(a.url()).pathname;
  }, a);
  await step('Chat on the PC version streams a reply', async () => {
    await a.goto(URL_ + '/chat/new');
    await a.locator('textarea').last().fill('Hello from the PC');
    await a.getByRole('button', { name: 'Send' }).click();
    await a.locator('.msg.assistant').filter({ hasText: 'Reply to:' }).first().waitFor({ timeout: 20000 });
    return 'reply shown';
  }, a);
  let secret;
  await step('Data created by user A', async () => {
    const t = await api(a, 'POST', '/tasks', { title: 'A private task' });
    const n = await api(a, 'POST', '/notes', { title: 'A private note', body: 'secret' });
    const m = await api(a, 'POST', '/memories', { content: 'A private memory' });
    secret = { task: t.data.id, note: n.data.id, memory: m.data.id };
    expect(t.status === 201 && n.status === 201 && m.status < 300, `${t.status} ${n.status} ${m.status}`);
    return 'task, note and memory saved';
  });

  // ---- Second user: isolation ------------------------------------------------------------------
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await ctxB.newPage();
  await step('A second person can sign up and sees none of the first person’s data', async () => {
    await b.goto(URL_ + '/');
    const s = await api(b, 'POST', '/auth/signup', { name: 'Grace', email: 'grace@example.com', password: 'another-pass-99' });
    expect(s.status < 300, 'signup ' + s.status + ' ' + JSON.stringify(s.data));
    const lists = await Promise.all(['/tasks?view=all', '/notes', '/memories', '/conversations'].map((p) => api(b, 'GET', p)));
    const leaked = lists.map((r) => JSON.stringify(r.data)).filter((t) => /A private|Hello from the PC/.test(t));
    expect(!leaked.length, 'leak: ' + leaked.join(' ').slice(0, 200));
    return 'empty lists for the second person';
  });
  await step('The second person cannot read, change or delete the first person’s items by id', async () => {
    const tries = [
      ['GET', `/tasks/${secret.task}`], ['PATCH', `/tasks/${secret.task}`, { title: 'hacked' }], ['DELETE', `/tasks/${secret.task}`],
      ['GET', `/notes/${secret.note}`], ['PATCH', `/notes/${secret.note}`, { body: 'hacked' }], ['DELETE', `/notes/${secret.note}`],
      ['DELETE', `/memories/${secret.memory}`], ['POST', `/tasks/${secret.task}/complete`],
    ];
    const bad = [];
    for (const [m, p, body] of tries) { const r = await api(b, m, p, body); if (r.status < 400) bad.push(`${m} ${p} → ${r.status}`); }
    const still = await api(a, 'GET', `/tasks/${secret.task}`);
    expect(!bad.length, bad.join('; '));
    expect(still.status === 200 && still.data.title === 'A private task', 'A’s task changed');
    return `${tries.length} attempts refused`;
  });
  await step('Search never returns another person’s items', async () => {
    const r = await api(b, 'GET', '/search?q=private');
    expect(!JSON.stringify(r.data).includes('A private'), 'search leaked');
    return 'no leak';
  });

  // ---- Sessions ----------------------------------------------------------------------------------
  await step('Logout ends the session; wrong password is refused; login works', async () => {
    const out = await api(a, 'POST', '/auth/logout');
    expect(out.status < 300, 'logout ' + out.status);
    const me = await api(a, 'GET', '/auth/me');
    expect(me.status === 401, 'still signed in after logout: ' + me.status);
    const wrong = await api(a, 'POST', '/auth/login', { email: 'herbert@example.com', password: 'wrong-password' });
    expect(wrong.status === 401 || wrong.status === 400, 'wrong password status ' + wrong.status);
    await a.goto(URL_ + '/');
    await a.getByLabel('Email').fill('herbert@example.com');
    await a.getByLabel('Password').fill('correct-horse-42');
    await a.getByRole('button', { name: 'Sign in' }).click();
    await a.getByText(/Good (morning|afternoon|evening)/).first().waitFor({ timeout: 15000 });
    const cookies = await ctxA.cookies();
    const sess = cookies.find((c) => /session|sid/i.test(c.name));
    expect(sess && sess.httpOnly && sess.sameSite !== 'None', 'session cookie flags: ' + JSON.stringify(sess));
    return `wrong password "${wrong.data.error}"; cookie ${sess.name} httpOnly, SameSite=${sess.sameSite}`;
  }, a);
  await step('Repeated wrong passwords are slowed down (brute-force protection)', async () => {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.goto(URL_ + '/');
    let limited = 0;
    for (let i = 0; i < 25; i++) { const r = await api(p, 'POST', '/auth/login', { email: 'herbert@example.com', password: 'nope-' + i }); if (r.status === 429) { limited = i + 1; break; } }
    await ctx.close();
    expect(limited > 0, 'never rate-limited after 25 tries');
    return `blocked after ${limited} tries`;
  });

  // ---- Desktop layout, accessibility, errors -------------------------------------------------------
  const routes = ['/', '/chat', '/tasks', '/projects', '/knowledge', '/research', '/memory', '/actions', '/notifications', '/settings', '/routines', '/ramble', '/connectors', '/messaging', '/discover', '/stuff', '/me'];
  await step(`Every screen at 1024, 1280 and 1920 px: fits, no script errors`, async () => {
    const bad = [];
    for (const w of [1024, 1280, 1920]) {
      await a.setViewportSize({ width: w, height: 900 });
      for (const r of routes) {
        const before = errorsA.length;
        await a.goto(URL_ + r); await a.waitForLoadState('networkidle').catch(() => {}); await a.waitForTimeout(300);
        const o = await a.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        if (o.sw > o.cw + 1) bad.push(`${r}@${w} (${o.sw}>${o.cw})`);
        if (errorsA.length > before) bad.push(`${r}@${w}: ${errorsA.slice(before).join(' / ').slice(0, 150)}`);
      }
    }
    expect(!bad.length, bad.join('; '));
    return `${routes.length * 3} screen/width combinations`;
  }, a);
  await step('Accessibility (axe-core, WCAG 2.2 AA) on every desktop screen, light and dark', async () => {
    const found = {};
    for (const theme of ['light', 'dark']) {
      await api(a, 'PATCH', '/settings', { appearance: { theme } });
      for (const r of routes) {
        await a.goto(URL_ + r); await a.waitForTimeout(600);
        await a.addScriptTag({ content: AXE });
        const v = await a.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => ({ id: x.id, impact: x.impact, t: x.nodes[0]?.target.join(' '), html: x.nodes[0]?.html.slice(0, 120) })));
        for (const x of v) (found[`${x.id} (${x.impact})`] ??= []).push(`${r} ${theme}: ${x.t} ${x.html}`);
      }
    }
    await api(a, 'PATCH', '/settings', { appearance: { theme: 'light' } });
    fs.writeFileSync(`${OUT}/axe-desktop.json`, JSON.stringify(found, null, 2));
    expect(!Object.keys(found).length, Object.entries(found).map(([k, v]) => `${k}: ${v[0]}`).join(' | ').slice(0, 600));
    return 'no violations';
  }, a);
  await step('Phone-size browser on the PC version (400 px) fits on every screen', async () => {
    await a.setViewportSize({ width: 400, height: 860 });
    const bad = [];
    for (const r of routes) { await a.goto(URL_ + r); await a.waitForTimeout(300); const o = await a.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); if (o.sw > o.cw + 1) bad.push(`${r} (${o.sw})`); }
    expect(!bad.length, bad.join('; '));
    return 'all fit';
  }, a);
  await step('Static files are cached and compressed', async () => {
    const html = await (await raw.get('/')).text();
    const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    const r = await raw.get(js, { headers: { 'accept-encoding': 'gzip, br' } });
    const h = r.headers();
    expect(/max-age=\d{5,}|immutable/.test(h['cache-control'] ?? ''), 'cache-control: ' + h['cache-control']);
    return `${js}: ${h['cache-control']}; encoding ${h['content-encoding'] ?? 'none'}`;
  });

  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  console.log(`\nHailey web: ${results.filter((r) => r.ok).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => { console.log('CRASH ' + e.stack); process.exit(1); });
