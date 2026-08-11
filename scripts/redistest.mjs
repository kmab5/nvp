/**
 * Runs the *actual* Redis driver in store.js — not the in-memory fallback —
 * against the mock protocol server. store.js picks its driver from environment
 * variables at import time, so those have to be set before the import happens,
 * which is why this is a separate process rather than folded into apitest.mjs.
 */

import assert from 'node:assert/strict';
import { startMockUpstash } from './mock-upstash.mjs';

const mock = await startMockUpstash();
process.env.KV_REST_API_URL = mock.url;
process.env.KV_REST_API_TOKEN = mock.token;

const { store, isPersistent, readRoom, writeRoom, updateRoom } = await import('../api/_lib/store.js');

assert.equal(store.name, 'redis', 'should select the redis driver once credentials are present');
assert.equal(isPersistent, true);

// basic round trip
let { version, data } = await readRoom('TEST1');
assert.equal(version, 0);
assert.equal(data, null);

let committed = await writeRoom('TEST1', 0, { hello: 'world' });
assert.equal(committed, true);

({ version, data } = await readRoom('TEST1'));
assert.equal(version, 1);
assert.deepEqual(data, { hello: 'world' });

// a write against a stale version is rejected, exactly like the memory driver
committed = await writeRoom('TEST1', 0, { hello: 'stale' });
assert.equal(committed, false);
({ data } = await readRoom('TEST1'));
assert.deepEqual(data, { hello: 'world' }, 'stale write must not have applied');

// updateRoom retries through a real race, same as the API integration test does
// against the memory driver — this time the CAS is enforced by the mock's EVAL.
let seen = 0;
const results = await Promise.all(
  Array.from({ length: 5 }, (_, i) => updateRoom('TEST2', (room) => {
    seen += 1;
    return { ...(room || { hits: [] }), hits: [...(room ? room.hits : []), i] };
  })),
);
assert.equal(results.length, 5);
const final = await readRoom('TEST2');
assert.equal(final.data.hits.length, 5, 'every concurrent update must have landed');
assert.ok(seen >= 5, 'contention should have forced at least one retry');

await mock.close();
console.log('redis driver: selected correctly, round trip and CAS races both hold');
