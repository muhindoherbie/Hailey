import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { loadConfig } from './config.ts';
import { Db } from './db/index.ts';
import { createRegistry } from './ai/providers.ts';
import { createSearchService } from './services/search.ts';
import { createPushService } from './services/push.ts';
import { startScheduler } from './services/scheduler.ts';
import { createApp } from './app.ts';
import type { Services } from './context.ts';

export interface StartOptions {
  /** Environment to read configuration from (defaults to process.env). */
  env?: Record<string, string | undefined>;
  /** Built web app folder (dist). */
  staticDir?: string;
  /** SQL migrations folder; defaults to the one next to the database module. */
  migrationsDir?: string;
  log?: (line: string) => void;
}

export interface RunningHailey {
  url: string;
  services: Services;
  stop: () => Promise<void>;
}

/** Starts the Hailey server. Used by the command line (server/index.ts) and the desktop app. */
export function startHailey(opts: StartOptions = {}): Promise<RunningHailey> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const config = loadConfig(opts.env);
  const db = new Db(resolve(config.DATA_DIR, 'hailey.db'), opts.migrationsDir);
  const services: Services = {
    db,
    config,
    providers: createRegistry(config),
    search: createSearchService({ searxngUrl: config.SEARXNG_URL, braveKey: config.BRAVE_SEARCH_API_KEY }),
    push: createPushService(db, { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY, subject: config.VAPID_SUBJECT }),
    now: () => new Date(),
  };
  const app = createApp(services, { staticDir: opts.staticDir });
  const stopScheduler = startScheduler(services);

  return new Promise((resolveStart, reject) => {
    const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
      const host = info.address === '0.0.0.0' || info.address === '::' ? 'localhost' : info.address;
      const url = `http://${host}:${info.port}`;
      const providers = services.providers.list().filter((p) => p.configured).map((p) => `${p.label} (${p.model})`);
      log(`Hailey is running at ${url}`);
      log(`  AI providers: ${providers.length ? providers.join(', ') : 'none configured — see README'}`);
      log(`  Web research: ${services.search.available().provider ?? 'not configured'}`);
      log(`  Push notifications: ${services.push.configured() ? 'enabled' : 'not configured (run npm run setup)'}`);
      resolveStart({
        url,
        services,
        stop: () =>
          new Promise<void>((done) => {
            stopScheduler();
            server.close(() => {
              db.close();
              done();
            });
            setTimeout(done, 5000).unref?.();
          }),
      });
    });
    server.on('error', (err: any) => {
      stopScheduler();
      db.close();
      reject(err?.code === 'EADDRINUSE' ? new Error(`Port ${config.PORT} is already in use — is Hailey already running?`) : err);
    });
  });
}
