import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setup } from './helpers.ts';
import { createApp } from '../server/app.ts';

// These checks run against the production build. Run `npm run build` first (CI does).
const dist = resolve('dist');
const built = existsSync(resolve(dist, 'index.html'));

const pngSize = (file: string) => {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe.skipIf(!built)('installable PWA build', () => {
  const ctx = setup();
  const app = createApp(ctx.services, { staticDir: dist });
  afterAll(() => ctx.cleanup());

  it('has a valid web app manifest with installable icons', () => {
    const m = JSON.parse(readFileSync(resolve(dist, 'manifest.webmanifest'), 'utf8'));
    expect(m).toMatchObject({ name: 'Hailey', short_name: 'Hailey', display: 'standalone', start_url: '/' });
    const sizes = m.icons.map((i: any) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(m.icons.some((i: any) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons) {
      const [w, h] = pngSize(resolve(dist, icon.src.slice(1)));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it('links the manifest and ships a service worker with offline and push handling', () => {
    expect(readFileSync(resolve(dist, 'index.html'), 'utf8')).toContain('rel="manifest"');
    const sw = readFileSync(resolve(dist, 'sw.js'), 'utf8');
    expect(sw).toContain('index.html'); // precached app shell
    expect(sw).toMatch(/addEventListener\(`push`|addEventListener\("push"|addEventListener\('push'/);
    expect(sw).toMatch(/notificationclick/);
  });

  it('serves the app shell for client routes, and the service worker uncached', async () => {
    const page = await app.request('http://localhost/tasks');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    const sw = await app.request('http://localhost/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    const api = await app.request('http://localhost/api/nope');
    expect(api.status).toBe(401); // unknown API paths never fall through to the HTML shell
  });

  it('includes responsive layout rules for phones', () => {
    const css = readFileSync(resolve(dist, 'assets', require_css()), 'utf8');
    expect(css).toMatch(/@media[^{]*860px/);
    expect(css).toContain('.grid>*{min-width:0}'); // no horizontal overflow on phones
    expect(css).toContain('.bottom-nav');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toMatch(/prefers-color-scheme:\s?dark/);
  });
});

function require_css() {
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  return html.match(/assets\/([^"]+\.css)/)![1];
}
