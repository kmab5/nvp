/**
 * A tiny stand-in for Upstash's REST API.
 *
 * Not a Redis reimplementation — just enough of the wire contract to prove that
 * `api/_lib/store.js` speaks it correctly: single-command POST with a JSON array
 * body, Bearer auth, `{ result }` responses, and real support for the one EVAL
 * script the store depends on for its compare-and-swap.
 *
 * This is what lets the redis code path get exercised in CI/local runs without
 * a live Upstash database — it is not a substitute for testing against the real
 * thing before you rely on it (see scripts/check-storage.mjs for that).
 */

import { createServer } from 'node:http';

const TOKEN = 'mock-token';

export function startMockUpstash({ port = 0, requireAuth = true } = {}) {
  const hashes = new Map(); // key -> { v, d }

  function hget(key, field) {
    const row = hashes.get(key);
    return row ? row[field] ?? null : null;
  }

  function hset(key, ...pairs) {
    const row = hashes.get(key) || {};
    for (let i = 0; i < pairs.length; i += 2) row[pairs[i]] = pairs[i + 1];
    hashes.set(key, row);
  }

  function evalCas(script, numKeys, key, expected, next, payload, ttl) {
    // Only ever asked to run the one script store.js ships. Reject anything else,
    // same as a real Redis would refuse an unrecognised script body.
    if (!script.includes("redis.call('HGET'")) throw new Error('unsupported script');
    const current = hget(key, 'v');
    const matches = (!current && String(expected) === '0') || current === String(expected);
    if (matches) {
      hset(key, 'v', String(next), 'd', String(payload));
      return 1;
    }
    return 0;
  }

  function run([cmd, ...args]) {
    switch (String(cmd).toUpperCase()) {
      case 'HGETALL': {
        const row = hashes.get(args[0]);
        return row ? Object.entries(row).flat() : [];
      }
      case 'EVAL':
        return evalCas(args[0], Number(args[1]), args[2], args[3], args[4], args[5], args[6]);
      default:
        throw new Error(`mock does not implement ${cmd}`);
    }
  }

  const server = createServer((req, res) => {
    if (requireAuth && req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end(JSON.stringify({ error: 'bad token' }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const command = JSON.parse(raw);
        const result = run(command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));
      } catch (error) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const { port: bound } = server.address();
      resolve({
        url: `http://127.0.0.1:${bound}`,
        token: TOKEN,
        rowCount: () => hashes.size,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
