// Creates a consistent backup of the database and uploaded files.
// Usage: npm run backup            -> ./backups/hailey-YYYY-MM-DDTHH-MM-SS/
//        npm run backup -- <dir>   -> a folder of your choice (e.g. a synced cloud drive)
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function backup(dataDir: string, outRoot: string) {
  const dbPath = resolve(dataDir, 'hailey.db');
  if (!existsSync(dbPath)) throw new Error(`No database found at ${dbPath}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const out = resolve(outRoot, `hailey-${stamp}`);
  mkdirSync(out, { recursive: true });
  // VACUUM INTO writes a consistent snapshot even while the server is running.
  const db = new DatabaseSync(dbPath);
  db.exec(`VACUUM INTO '${join(out, 'hailey.db').replace(/'/g, "''")}'`);
  db.close();
  for (const sub of ['uploads', 'exports']) {
    const src = resolve(dataDir, sub);
    if (existsSync(src)) cpSync(src, join(out, sub), { recursive: true });
  }
  // Verify the snapshot opens and passes an integrity check.
  const check = new DatabaseSync(join(out, 'hailey.db'), { readOnly: true });
  const ok = (check.prepare('PRAGMA integrity_check').get() as any).integrity_check;
  const users = (check.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n;
  check.close();
  if (ok !== 'ok') throw new Error(`Backup integrity check failed: ${ok}`);
  writeFileSync(join(out, 'BACKUP.txt'), `Hailey backup\nCreated: ${new Date().toISOString()}\nUsers: ${users}\nIntegrity: ${ok}\nRestore with: npm run restore -- "${out}"\n`);
  return out;
}

/** Keeps the newest `keep` backups in a folder and deletes older ones. */
export function prune(outRoot: string, keep: number) {
  if (!existsSync(outRoot)) return [];
  const dirs = readdirSync(outRoot).filter((d) => d.startsWith('hailey-')).sort();
  const remove = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const d of remove) rmSync(join(outRoot, d), { recursive: true, force: true });
  return remove;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('backup.ts')) {
  const dataDir = process.env.DATA_DIR || './data';
  const outRoot = process.argv[2] || './backups';
  try {
    const out = backup(dataDir, outRoot);
    const removed = prune(outRoot, Number(process.env.BACKUP_KEEP || 14));
    console.log(`Backup written to ${out}${removed.length ? ` (removed ${removed.length} old backup(s))` : ''}`);
  } catch (err: any) {
    console.error(`Backup failed: ${err.message}`);
    process.exit(1);
  }
}
