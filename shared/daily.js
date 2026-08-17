/**
 * NVP Daily — one code, everybody, every day.
 *
 * The puzzle is derived from the date rather than fetched, which is what lets
 * the website and the Android app produce the same code on the same day with no
 * server, no account, and nothing to keep in sync. Two players comparing grids
 * are provably looking at the same puzzle.
 *
 * The date is local, matching what people expect from this kind of daily: the
 * puzzle rolls over at your midnight, not somewhere else's.
 */

import { allCodes, CODE_LENGTH } from './engine.js';

/** Day zero. Puzzle #1 was 1 January 2026. */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_ATTEMPTS = 8;

/** 'YYYY-MM-DD' in the player's own timezone. */
export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Sequential puzzle number, 1-based, from the local date. */
export function puzzleNumber(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - EPOCH) / DAY_MS) + 1;
}

/**
 * xmur3 — a small string hash with good avalanche behaviour. Written out rather
 * than pulled from a library because both platforms must compute it identically
 * and forever; a dependency that changes its implementation would silently
 * change every future puzzle.
 */
function seedFrom(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * mulberry32 — a small, fast PRNG. Like the hash above, written out rather than
 * imported because the sequence must stay identical across both platforms and
 * across every future version.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPACE = allCodes();

/**
 * The puzzle order: a fixed shuffle of all 3,024 codes, walked one per day.
 *
 * Hashing the date to an index would be simpler, but it draws with replacement —
 * a code would recur every few hundred days purely by chance, and a daily player
 * would notice solving the same code twice. Walking a permutation instead means
 * no repeat until all 3,024 are used, which is a little over eight years.
 */
const ORDER = (() => {
  const codes = SPACE.slice();
  const random = mulberry32(seedFrom('nvp-daily-order-v1'));
  for (let i = codes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  return codes;
})();

/** The code for a given day. Same input, same answer, on every device. */
export function dailyCode(date = new Date()) {
  // Negative puzzle numbers (dates before the epoch) wrap rather than crash.
  const index = ((puzzleNumber(date) - 1) % ORDER.length + ORDER.length) % ORDER.length;
  return ORDER[index];
}

/** Milliseconds until the next puzzle unlocks, for the countdown. */
export function msUntilNextPuzzle(now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getTime() - now.getTime();
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// --- sharing --------------------------------------------------------------

const POSITION = '🟩';
const VALUE = '🟨';
const EMPTY = '⬜';

/**
 * One attempt as pips. Deliberately digit-free: the grid reproduces the shape of
 * a solve exactly while giving away nothing, so it's safe to post while other
 * people are still playing.
 */
export function pipRow({ value, position }) {
  return POSITION.repeat(position)
    + VALUE.repeat(Math.max(0, value - position))
    + EMPTY.repeat(Math.max(0, CODE_LENGTH - value));
}

export function pipGrid(guesses) {
  return guesses.map(pipRow).join('\n');
}

export function shareText({ number, guesses, solved, link }) {
  const score = solved ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  return [
    `NVP Daily #${number} — ${score}`,
    '',
    pipGrid(guesses),
    link ? `\n${link}` : '',
  ].join('\n').trim();
}

// --- progress -------------------------------------------------------------

/**
 * Streak from a record of past days. A streak survives only consecutive dates,
 * and counts back from today or yesterday — so it doesn't break the moment
 * midnight passes but before that day has been played.
 */
export function streakFrom(history, today = new Date()) {
  if (!history) return 0;
  const has = (date) => {
    const entry = history[dayKey(date)];
    return entry && entry.solved;
  };
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!has(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!has(cursor)) return 0;
  }
  let streak = 0;
  while (has(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Wins by attempt count, for the histogram. */
export function distribution(history) {
  const buckets = Array.from({ length: MAX_ATTEMPTS }, () => 0);
  let played = 0;
  let solvedCount = 0;
  for (const entry of Object.values(history || {})) {
    played += 1;
    if (entry.solved && entry.attempts >= 1 && entry.attempts <= MAX_ATTEMPTS) {
      buckets[entry.attempts - 1] += 1;
      solvedCount += 1;
    }
  }
  return { buckets, played, solved: solvedCount };
}
