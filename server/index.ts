import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHailey } from './start.ts';

const staticDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

try {
  const hailey = await startHailey({ staticDir });
  const shutdown = async () => {
    console.log('Shutting down…');
    await hailey.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err: any) {
  console.error(`Hailey could not start: ${err?.message ?? err}`);
  process.exit(1);
}
