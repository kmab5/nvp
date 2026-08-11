/**
 * Everything remembered between visits: names, sound, hot-seat privacy setting,
 * a small record book, and the online session so a refresh doesn't forfeit.
 * All of it is optional — the game runs fine when storage is unavailable.
 */

const KEY = 'nvp:v2';

const DEFAULTS = {
  sound: true,
  handoffGate: true,
  names: { p1: '', p2: '', online: '' },
  lastDifficulty: 'racer',
  record: { cpu: {}, local: { games: 0 }, online: { won: 0, lost: 0, drawn: 0 } },
  session: null,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    return { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing, quota, or storage disabled — carry on regardless */
  }
}

export function get(path, fallback) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), state)
    ?? fallback;
}

export function set(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = state;
  for (const key of keys) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[last] = value;
  persist();
}

/** Log a finished match. `outcome` is 'won' | 'lost' | 'drawn'. */
export function recordResult({ mode, difficulty, outcome, rounds }) {
  if (mode === 'cpu') {
    const book = state.record.cpu[difficulty] || { won: 0, lost: 0, drawn: 0, best: null };
    book[outcome] = (book[outcome] || 0) + 1;
    if (outcome === 'won' && (book.best === null || rounds < book.best)) book.best = rounds;
    state.record.cpu[difficulty] = book;
  } else if (mode === 'online') {
    state.record.online[outcome] = (state.record.online[outcome] || 0) + 1;
  } else {
    state.record.local.games = (state.record.local.games || 0) + 1;
  }
  persist();
}

export function summary() {
  const cpu = Object.values(state.record.cpu);
  const wins = cpu.reduce((n, b) => n + (b.won || 0), 0)
    + (state.record.online.won || 0);
  const played = cpu.reduce((n, b) => n + (b.won || 0) + (b.lost || 0) + (b.drawn || 0), 0)
    + Object.values(state.record.online).reduce((n, v) => n + (v || 0), 0)
    + (state.record.local.games || 0);
  const bests = cpu.map((b) => b.best).filter((n) => typeof n === 'number');
  return {
    played,
    wins,
    best: bests.length ? Math.min(...bests) : null,
  };
}

export const session = {
  read() {
    const s = state.session;
    if (!s || !s.room || !s.token) return null;
    // Rooms live six hours on the server; don't offer a stale one.
    if (Date.now() - (s.at || 0) > 6 * 60 * 60 * 1000) return null;
    return s;
  },
  save(data) {
    set('session', { ...data, at: Date.now() });
  },
  clear() {
    set('session', null);
  },
};
