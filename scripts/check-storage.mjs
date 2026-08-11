/**
 * `npm run check-storage`
 *
 * Run this after connecting Redis and before you trust online play with it.
 * It reads the same env vars store.js does, tells you which driver that
 * produces, and — if it's Redis — writes and reads back a real value against
 * your actual database, using the same EVAL command the game itself sends. A
 * green result here means what the "it loaded fine" test in a browser cannot:
 * that two different serverless instances would actually see the same room.
 */

import { readFileSync, existsSync } from 'node:fs';

function loadDotEnv() {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const [, key, rawValue = ''] = match;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const URL_KEYS = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL', 'REDIS_REST_URL'];
const TOKEN_KEYS = ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_REST_TOKEN'];

const foundUrlKey = URL_KEYS.find((k) => process.env[k]);
const foundTokenKey = TOKEN_KEYS.find((k) => process.env[k]);

console.log('Checking environment...\n');
for (const key of [...URL_KEYS, ...TOKEN_KEYS]) {
  const present = Boolean(process.env[key]);
  console.log(`  ${present ? '✓' : '·'} ${key}${present ? '' : ' (not set)'}`);
}
console.log();

if (!foundUrlKey || !foundTokenKey) {
  console.log('No credential pair found — store.js will fall back to in-memory storage.');
  console.log('That is expected for local dev. Before relying on online play in production:');
  console.log('  1. Vercel dashboard → your project → Storage → Create Database → Upstash Redis');
  console.log('  2. Connect it to this project (this sets KV_REST_API_URL / KV_REST_API_TOKEN)');
  console.log('  3. Redeploy, then run this script again with those two values in a local .env');
  console.log('     — or just curl https://<your-app>.vercel.app/api/health after deploying.');
  process.exit(0);
}

console.log(`Using ${foundUrlKey} / ${foundTokenKey}\n`);

const { store, isPersistent, readRoom, writeRoom } = await import('../api/_lib/store.js');

if (!isPersistent) {
  console.error('✗ Credentials are set but store.js still picked the in-memory driver.');
  console.error('  That should not happen — check for typos in the variable names above.');
  process.exit(1);
}

console.log(`Driver: ${store.name}\n`);
console.log('Running a real round trip against your database...');

const key = `__check__:${Date.now()}`;
const started = Date.now();

try {
  const before = await readRoom(key);
  if (before.data !== null) throw new Error('unexpectedly found existing data at a fresh key');

  const probe = { checkedAt: started, note: 'safe to ignore, expires in 6 hours' };
  const wrote = await writeRoom(key, before.version, probe);
  if (!wrote) throw new Error('the compare-and-swap write was rejected on a fresh key');

  const after = await readRoom(key);
  if (!after.data || after.data.checkedAt !== started) {
    throw new Error('wrote successfully but the read-back did not match — investigate before deploying');
  }

  // Confirm a stale version is correctly rejected — this is the whole reason the
  // CAS write exists, and it is worth proving against the real database rather
  // than trusting the memory-driver test to stand in for it.
  const rejected = await writeRoom(key, before.version, { checkedAt: 0 });
  if (rejected) throw new Error('a stale write was accepted — the CAS check is not enforcing versions');

  console.log(`\n✓ All good. Round trip took ${Date.now() - started}ms.`);
  console.log('  Online play will hold up across multiple serverless instances.');
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  console.error('  Common causes: EVAL / Lua scripting disabled for your plan, a read-only token,');
  console.error('  or credentials copied from the wrong database. Check the Upstash console.');
  process.exit(1);
}
