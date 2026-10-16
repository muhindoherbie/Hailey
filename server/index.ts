import { serve } from '@hono/node-server';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { Db } from './db/index.ts';
import { createRegistry } from './ai/providers.ts';
import { createSearchService } from './services/search.ts';
import { createPushService } from './services/push.ts';
import { startScheduler } from './services/scheduler.ts';
import { createApp } from './app.ts';
import type { Services } from './context.ts';

const config = loadConfig();
const db = new Db(resolve(config.DATA_DIR, 'hailey.db'));
const services: Services = {
  db,
  config,
  providers: createRegistry(config),
  search: createSearchService({ searxngUrl: config.SEARXNG_URL, braveKey: config.BRAVE_SEARCH_API_KEY }),
  push: createPushService(db, { publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY, subject: config.VAPID_SUBJECT }),
  now: () => new Date(),
};

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const app = createApp(services, { staticDir });
const stopScheduler = startScheduler(services);

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  const providers = services.providers.list().filter((p) => p.configured).map((p) => `${p.label} (${p.model})`);
  console.log(`Hailey is running at http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}`);
  console.log(`  AI providers: ${providers.length ? providers.join(', ') : 'none configured — see README'}`);
  console.log(`  Web research: ${services.search.available().provider ?? 'not configured'}`);
  console.log(`  Push notifications: ${services.push.configured() ? 'enabled' : 'not configured (run npm run setup)'}`);
});

function shutdown() {
  console.log('Shutting down…');
  stopScheduler();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
