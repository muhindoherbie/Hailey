// First-time setup: creates .env from .env.example and generates push-notification keys.
// Safe to re-run — it never overwrites values you have already set.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import webpush from 'web-push';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example');
}
let env = readFileSync('.env', 'utf8');
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const set = (k, v) => {
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
};

if (!get('VAPID_PUBLIC_KEY') || !get('VAPID_PRIVATE_KEY')) {
  const keys = webpush.generateVAPIDKeys();
  set('VAPID_PUBLIC_KEY', keys.publicKey);
  set('VAPID_PRIVATE_KEY', keys.privateKey);
  console.log('Generated push notification (VAPID) keys');
}
writeFileSync('.env', env);
console.log('\nNext steps:');
if (!get('ANTHROPIC_API_KEY') && !get('OPENAI_COMPAT_BASE_URL')) {
  console.log('  • Add an AI provider to .env — ANTHROPIC_API_KEY, or OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_MODEL for a free local Ollama model.');
}
console.log('  • Run "npm run build" then "npm start", and open http://localhost:8787');
console.log('  • .env holds secrets: it is git-ignored. Never commit it or paste it anywhere public.');
