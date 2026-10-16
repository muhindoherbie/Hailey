// Restores a backup made by `npm run backup`. Stop the Hailey server first.
// Usage: npm run restore -- ./backups/hailey-2026-10-16T08-00-00
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function restore(backupDir: string, dataDir: string) {
  const src = resolve(backupDir, 'hailey.db');
  if (!existsSync(src)) throw new Error(`No hailey.db in ${backupDir}`);
  const check = new DatabaseSync(src, { readOnly: true });
  const ok = (check.prepare('PRAGMA integrity_check').get() as any).integrity_check;
  check.close();
  if (ok !== 'ok') throw new Error(`Backup is damaged (integrity check: ${ok}); nothing was changed.`);
  mkdirSync(dataDir, { recursive: true });
  const target = resolve(dataDir, 'hailey.db');
  // Keep the current data as a safety copy instead of overwriting it.
  if (existsSync(target)) {
    const safety = resolve(dataDir, `pre-restore-${Date.now()}`);
    mkdirSync(safety, { recursive: true });
    for (const f of ['hailey.db', 'hailey.db-wal', 'hailey.db-shm']) if (existsSync(resolve(dataDir, f))) renameSync(resolve(dataDir, f), join(safety, f));
    for (const sub of ['uploads', 'exports']) if (existsSync(resolve(dataDir, sub))) renameSync(resolve(dataDir, sub), join(safety, sub));
  }
  cpSync(src, target);
  for (const sub of ['uploads', 'exports']) {
    rmSync(resolve(dataDir, sub), { recursive: true, force: true });
    if (existsSync(resolve(backupDir, sub))) cpSync(resolve(backupDir, sub), resolve(dataDir, sub), { recursive: true });
  }
  return target;
}

if (process.argv[1]?.endsWith('restore.ts')) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run restore -- <backup folder>');
    process.exit(1);
  }
  try {
    const t = restore(dir, process.env.DATA_DIR || './data');
    console.log(`Restored to ${t}. Your previous data was kept in a "pre-restore-…" folder. Start Hailey again.`);
  } catch (err: any) {
    console.error(`Restore failed: ${err.message}`);
    process.exit(1);
  }
}
