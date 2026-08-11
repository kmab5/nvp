/**
 * Local dev server: `npm start`.
 *
 * Vercel serves the static files and runs api/game.js for you in production; this
 * reproduces both with the standard library so the game is playable from a fresh
 * clone with no CLI, no account and no install. `vercel dev` also works if you
 * have it — this is the zero-setup path.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/game.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function collectBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
  });
}

/** Adapts node's res to the small slice of the Vercel response API we use. */
function adapt(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (payload) => res.end(payload);
  return res;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/game') {
    const body = req.method === 'POST' ? await collectBody(req) : undefined;
    const query = Object.fromEntries(url.searchParams);
    return handler({ method: req.method, body, query, headers: req.headers }, adapt(res));
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const path = join(ROOT, normalize(requested).replace(/^(\.\.[/\\])+/, ''));

  try {
    const info = await stat(path);
    if (info.isDirectory()) throw new Error('directory');
    const file = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    return res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
});

server.listen(PORT, () => {
  const persistent = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  console.log(`NVP running at http://localhost:${PORT}`);
  console.log(persistent
    ? 'Rooms: Redis (shared across instances)'
    : 'Rooms: in-memory (fine locally, single process only)');
});
