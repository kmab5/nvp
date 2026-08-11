/** Client half of the online protocol: one endpoint, plus polling. */

const ENDPOINT = '/api/game';

export class NetError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(init) {
  let res;
  try {
    res = await fetch(...init);
  } catch {
    throw new NetError('No connection. Check your network and try again.', 0);
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new NetError(body.error || `Request failed (${res.status}).`, res.status);
  return body;
}

const post = (payload) => request([ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  cache: 'no-store',
}]);

export const api = {
  createRoom: (name) => post({ action: 'create', name }),
  joinRoom: (room, name) => post({ action: 'join', room, name }),
  setSecret: (room, token, code) => post({ action: 'secret', room, token, code }),
  guess: (room, token, code) => post({ action: 'guess', room, token, code }),
  rematch: (room, token, want = true) => post({ action: 'rematch', room, token, want }),
  leave: (room, token) => post({ action: 'leave', room, token }),
  state: (room, token) => request([
    `${ENDPOINT}?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  ]),
  // Deliberately doesn't throw — a broken health check should never block the
  // lobby, only skip the warning banner that depends on it.
  health: () => request(['/api/health', { cache: 'no-store' }]).catch(() => null),
};

/**
 * Polls the room, faster while you are waiting on the opponent and slower when
 * the ball is in your court. Pauses entirely on a hidden tab, and backs off
 * after consecutive failures rather than hammering a broken endpoint.
 */
export function createPoller({ room, token, onState, onError, interval = () => 1600 }) {
  let timer = null;
  let stopped = false;
  let failures = 0;
  let inFlight = false;

  async function tick() {
    if (stopped || inFlight) return;
    if (document.hidden) return schedule();
    inFlight = true;
    try {
      const { state } = await api.state(room, token);
      failures = 0;
      onState(state);
    } catch (error) {
      failures += 1;
      if (onError) onError(error, failures);
      if (error.status === 403 || error.status === 404) return stop();
    } finally {
      inFlight = false;
    }
    return schedule();
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    const base = interval();
    const backoff = failures ? Math.min(8000, base * 2 ** Math.min(failures, 3)) : base;
    timer = setTimeout(tick, backoff);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  }

  function onVisible() {
    if (!document.hidden) {
      clearTimeout(timer);
      tick();
    }
  }

  document.addEventListener('visibilitychange', onVisible);
  tick();

  return { stop, poke: () => { clearTimeout(timer); tick(); } };
}

export function shareLink(room) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = `?room=${room}`;
  return url.toString();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
