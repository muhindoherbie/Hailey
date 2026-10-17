// Bundles the Hailey server into one ESM file for the desktop app (desktop/build/).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('desktop/build', { recursive: true, force: true });
mkdirSync('desktop/build', { recursive: true });
await build({
  entryPoints: { server: 'desktop/server-entry.ts' },
  outdir: 'desktop/build',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  minify: true,
  legalComments: 'linked',
  // CommonJS dependencies inside an ESM bundle need require/__dirname.
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  logLevel: 'warning',
});
cpSync('server/db/migrations', 'desktop/build/migrations', { recursive: true });
cpSync('dist', 'desktop/build/web', { recursive: true });
cpSync('.env.example', 'desktop/build/hailey.env.example');
console.log('Bundled server, migrations, web app and settings template into desktop/build');
