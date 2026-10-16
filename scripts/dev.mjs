// Runs the API server (with auto-restart) and the Vite dev server together.
import { spawn } from 'node:child_process';

const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited with ${code}`);
    process.exit(code ?? 0);
  });
  return p;
};

const server = run('server', 'npm', ['run', 'dev:server']);
const client = run('client', 'npm', ['run', 'dev:client']);
const stop = () => {
  server.kill();
  client.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
console.log('\nHailey dev: open http://localhost:5173 (API on :8787)\n');
