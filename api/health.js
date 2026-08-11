/**
 * GET /api/health
 *
 * The one question this answers: is online play backed by real shared storage,
 * or the in-memory fallback that only works by accident (single instance, one
 * lucky warm-start)? Curl this right after deploying, and again a few minutes
 * later once traffic has spread across instances — a driver that reports
 * "memory" from a fresh cold start most of the time means the env vars never
 * reached the deployed functions.
 *
 * Writes to a dedicated key, never a real room, and cleans up after itself.
 */

import { store, isPersistent, readRoom, writeRoom } from './_lib/store.js';

const KEY = '__health__';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const started = Date.now();
  const report = { driver: store.name, persistent: isPersistent };

  try {
    const before = await readRoom(KEY);
    const probe = { ping: started };
    const wrote = await writeRoom(KEY, before.version, probe);
    if (!wrote) throw new Error('write was rejected — another health check ran at the same instant');
    const after = await readRoom(KEY);
    const roundTripOk = after.data && after.data.ping === started;

    report.ok = Boolean(roundTripOk);
    report.roundTripMs = Date.now() - started;
    if (!roundTripOk) report.detail = 'wrote and read back, but the payload did not match';
  } catch (error) {
    report.ok = false;
    report.detail = error.message;
  }

  if (!isPersistent) {
    report.warning = 'Using in-memory storage. Fine for local dev; in production, rooms will '
      + 'behave inconsistently as soon as traffic spans more than one instance. Connect a Redis '
      + '(Vercel Storage → Upstash Redis) and redeploy.';
  }

  res.status(report.ok ? 200 : 500).send(JSON.stringify(report, null, 2));
}
