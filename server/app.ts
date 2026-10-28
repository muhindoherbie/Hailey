import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { ZodError } from 'zod';
import type { AppEnv, Services } from './context.ts';
import { HttpError } from './context.ts';
import { ProviderError } from './ai/types.ts';
import { securityHeaders, csrfGuard, requireAuth, rateLimit, clientIp, offlineReplay } from './middleware.ts';
import { authRoutes } from './routes/auth.ts';
import { dataRoutes } from './routes/data.ts';
import { chatRoutes } from './routes/chat.ts';
import { fileRoutes } from './routes/files.ts';
import { miscRoutes, icsRoute } from './routes/misc.ts';

export function createApp(services: Services, opts: { staticDir?: string } = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });
  app.use('*', securityHeaders);

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message, code: err.code }, err.status as any);
    if (err instanceof ZodError) {
      return c.json({ error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), code: 'validation' }, 400);
    }
    if (err instanceof ProviderError) {
      const status = err.kind === 'not_configured' ? 503 : err.kind === 'rate_limited' ? 429 : err.kind === 'bad_request' ? 400 : 502;
      return c.json({ error: err.message, code: err.kind, retryable: err.retryable }, status);
    }
    if ((err as any)?.name === 'BodyLimitError') return c.json({ error: 'Upload is too large.', code: 'too_large' }, 413);
    // Never leak internals: log server-side, return a generic message.
    console.error('[error]', c.req.method, c.req.path, (err as Error)?.stack ?? err);
    return c.json({ error: 'Something went wrong on the server. Please try again.', code: 'internal' }, 500);
  });

  // Shares normally go to the service worker; this only runs if it isn't installed yet.
  app.post('/share-target', (c) => c.redirect('/share?error=no-sw', 303));

  app.get('/api/health', (c) => c.json({ ok: true, time: services.now().toISOString() }));

  // Digital Asset Links: proves the Hailey Android app and this site belong together.
  app.get('/.well-known/assetlinks.json', (c) => {
    const pkg = services.config.ANDROID_PACKAGE_NAME;
    const prints = (services.config.ANDROID_CERT_SHA256 ?? '').split(',').map((f) => f.trim().toUpperCase()).filter(Boolean);
    if (!pkg || !prints.length) return c.json([]);
    return c.json([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
    }]);
  });

  const api = new Hono<AppEnv>();
  api.use('*', csrfGuard);
  api.use('*', rateLimit({ name: 'api', windowMs: 60_000, max: 600, key: clientIp }));
  api.use('/documents', bodyLimit({ maxSize: (services.config.MAX_UPLOAD_MB + 1) * 1024 * 1024, onError: (c) => c.json({ error: `File is too large. The limit is ${services.config.MAX_UPLOAD_MB} MB.`, code: 'too_large' }, 413) }));
  api.use('*', async (c, next) => {
    if (c.req.path.endsWith('/documents') && c.req.method === 'POST') return next();
    return bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (cc) => cc.json({ error: 'Request is too large.', code: 'too_large' }, 413) })(c, next);
  });
  api.route('/auth', authRoutes());
  const priv = new Hono<AppEnv>();
  priv.use('*', requireAuth);
  priv.use('*', offlineReplay);
  priv.route('/', dataRoutes());
  priv.route('/', chatRoutes());
  priv.route('/', fileRoutes());
  priv.route('/', miscRoutes());
  api.route('/', priv);
  app.route('/api', api);
  app.route('/ics', icsRoute());
  app.all('/api/*', (c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

  // Serve the built PWA. Unknown paths fall back to index.html for client-side routing.
  const staticDir = opts.staticDir;
  if (staticDir && existsSync(staticDir)) {
    const root = relative(process.cwd(), staticDir) || '.';
    app.use('/assets/*', async (c, next) => {
      await next();
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.use('/sw.js', async (c, next) => {
      await next();
      c.header('Cache-Control', 'no-cache');
    });
    app.use('*', serveStatic({ root }));
    const indexHtml = readFileSync(resolve(staticDir, 'index.html'), 'utf8');
    app.get('*', (c) => {
      c.header('Cache-Control', 'no-cache');
      return c.html(indexHtml);
    });
  } else {
    app.get('/', (c) => c.text('Hailey API is running. Build the web app with `npm run build`, or run `npm run dev` for development.'));
  }
  return app;
}
