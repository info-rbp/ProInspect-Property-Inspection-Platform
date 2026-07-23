#!/usr/bin/env node
// Reports whether the VITE_* keys behind the Settings page's "Firebase"
// and "AI Commentary" cards are present in the current shell environment
// and/or in apps/web/.env.local before running a build. This is advisory
// only (never fails CI) — see docs/development/environment-configuration.md
// for what each key controls and where to set it per environment.
import { readFile } from 'node:fs/promises';

const ENV_LOCAL_PATH = 'apps/web/.env.local';

const AI_COMMENTARY_KEYS = ['VITE_API_BASE_URL'];
const FIREBASE_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];
const OPTIONAL_KEYS = ['VITE_FIREBASE_APP_CHECK_SITE_KEY'];

async function readEnvLocal() {
  try {
    const raw = await readFile(ENV_LOCAL_PATH, 'utf8');
    const values = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return values;
  } catch {
    return null;
  }
}

function resolve(key, envLocal) {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.trim()) return { value: fromProcess.trim(), source: 'process env' };
  const fromFile = envLocal?.[key];
  if (fromFile && fromFile.trim()) return { value: fromFile.trim(), source: ENV_LOCAL_PATH };
  return null;
}

function reportGroup(title, keys, envLocal) {
  const resolved = keys.map((key) => ({ key, hit: resolve(key, envLocal) }));
  const missing = resolved.filter((r) => !r.hit).map((r) => r.key);
  console.log(`\n${title}`);
  for (const { key, hit } of resolved) {
    console.log(`  ${hit ? 'OK  ' : 'MISS'}  ${key}${hit ? ` (from ${hit.source})` : ''}`);
  }
  return missing;
}

const envLocal = await readEnvLocal();
console.log('Checking VITE_* keys behind the Settings page status cards...');
if (!envLocal) {
  console.log(`\nNote: ${ENV_LOCAL_PATH} not found. Copy apps/web/.env.example to get started:`);
  console.log('  cp apps/web/.env.example apps/web/.env.local');
}

const missingAi = reportGroup('AI Commentary card:', AI_COMMENTARY_KEYS, envLocal);
const missingFirebase = reportGroup('Firebase card (all six required together):', FIREBASE_KEYS, envLocal);
reportGroup('Optional:', OPTIONAL_KEYS, envLocal);

console.log('\nSummary:');
console.log(missingAi.length ? '  AI Commentary: NOT configured — VITE_API_BASE_URL missing.' : '  AI Commentary: configured.');
console.log(missingFirebase.length ? `  Firebase: NOT configured — missing ${missingFirebase.join(', ')}.` : '  Firebase: configured.');
console.log('\nThese are build-time Vite variables: after editing apps/web/.env.local, rebuild with:');
console.log('  npm run build:packages && npm run build --workspace @pcr/web');
console.log('\nSee docs/development/environment-configuration.md for full details, including why');
console.log('the mock-login accounts always show the Firebase card as "Needs attention".');
