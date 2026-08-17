import assert from 'node:assert/strict';
import { validateCode, evaluate } from '../shared/engine.js';
import {
  MAX_ATTEMPTS, dayKey, puzzleNumber, dailyCode, pipRow, pipGrid, shareText,
  streakFrom, distribution, formatCountdown, msUntilNextPuzzle,
} from '../shared/daily.js';

// --- the code must be a legal code, every single day ----------------------
const start = new Date(2026, 0, 1);
const seen = new Map();
for (let i = 0; i < 800; i += 1) {
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const code = dailyCode(date);
  assert.equal(validateCode(code), null, `day ${dayKey(date)} produced an illegal code: ${code}`);
  seen.set(code, (seen.get(code) || 0) + 1);
}
console.log(`800 days: all legal codes, ${seen.size} distinct`);
// The daily walks a permutation, so there must be no repeat at all until the
// whole space of 3,024 codes is exhausted.
assert.equal(seen.size, 800, 'a code repeated within the first 800 days');

// And confirm the full cycle really is a permutation.
const cycle = new Set();
for (let i = 0; i < 3024; i += 1) {
  cycle.add(dailyCode(new Date(2026, 0, 1 + i)));
}
assert.equal(cycle.size, 3024, 'the daily order is not a full permutation');
// Day 3025 is where it wraps — over eight years away.
assert.equal(dailyCode(new Date(2026, 0, 1 + 3024)), dailyCode(new Date(2026, 0, 1)));
console.log('full cycle: 3024 distinct codes before any repeat (~8.3 years)');

// --- determinism: same day, same answer, always --------------------------
const sample = new Date(2026, 5, 15, 13, 45);
const later = new Date(2026, 5, 15, 23, 59);
assert.equal(dailyCode(sample), dailyCode(later), 'the code must not change during the day');
assert.notEqual(dailyCode(sample), dailyCode(new Date(2026, 5, 16)), 'a new day needs a new code');
assert.equal(dailyCode(sample), dailyCode(new Date(2026, 5, 15)));
console.log(`15 June 2026 is always ${dailyCode(sample)} — puzzle #${puzzleNumber(sample)}`);

// --- puzzle numbering ----------------------------------------------------
assert.equal(puzzleNumber(new Date(2026, 0, 1)), 1);
assert.equal(puzzleNumber(new Date(2026, 0, 2)), 2);
assert.equal(puzzleNumber(new Date(2026, 11, 31)), 365);
assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');

// --- pips must reproduce the board without leaking a digit ---------------
assert.equal(pipRow({ value: 4, position: 4 }), '🟩🟩🟩🟩');
assert.equal(pipRow({ value: 2, position: 1 }), '🟩🟨⬜⬜');
assert.equal(pipRow({ value: 0, position: 0 }), '⬜⬜⬜⬜');
assert.equal(pipRow({ value: 3, position: 0 }), '🟨🟨🟨⬜');

const run = [
  { guess: '1234', value: 1, position: 0 },
  { guess: '5678', value: 2, position: 1 },
  { guess: '5178', value: 4, position: 4 },
];
const text = shareText({ number: 42, guesses: run, solved: true, link: 'https://nvp.example' });
assert.ok(text.startsWith('NVP Daily #42 — 3/8'));
assert.ok(text.includes('🟩🟩🟩🟩'));
assert.ok(!/[1-9]/.test(pipGrid(run)), 'the grid must never contain a digit');
assert.ok(text.includes('https://nvp.example'));

const failed = shareText({ number: 7, guesses: run.slice(0, 2), solved: false });
assert.ok(failed.startsWith('NVP Daily #7 — X/8'));

// --- streaks -------------------------------------------------------------
const today = new Date(2026, 5, 15);
const day = (offset) => {
  const d = new Date(2026, 5, 15 + offset);
  return dayKey(d);
};

assert.equal(streakFrom({}, today), 0);
assert.equal(streakFrom({ [day(0)]: { solved: true } }, today), 1);
assert.equal(
  streakFrom({ [day(0)]: { solved: true }, [day(-1)]: { solved: true }, [day(-2)]: { solved: true } }, today),
  3,
);
// A gap ends the streak.
assert.equal(
  streakFrom({ [day(0)]: { solved: true }, [day(-2)]: { solved: true } }, today),
  1,
);
// Not having played today yet doesn't break a run that's alive through yesterday.
assert.equal(
  streakFrom({ [day(-1)]: { solved: true }, [day(-2)]: { solved: true } }, today),
  2,
);
// A loss breaks it.
assert.equal(streakFrom({ [day(0)]: { solved: false }, [day(-1)]: { solved: true } }, today), 1);

// --- distribution --------------------------------------------------------
const stats = distribution({
  a: { solved: true, attempts: 3 },
  b: { solved: true, attempts: 3 },
  c: { solved: true, attempts: 5 },
  d: { solved: false, attempts: 8 },
});
assert.equal(stats.played, 4);
assert.equal(stats.solved, 3);
assert.equal(stats.buckets[2], 2);   // two solves in three
assert.equal(stats.buckets[4], 1);
assert.equal(stats.buckets.length, MAX_ATTEMPTS);

// --- countdown -----------------------------------------------------------
assert.equal(formatCountdown(0), '00:00:00');
assert.equal(formatCountdown(3661000), '01:01:01');
const mid = new Date(2026, 5, 15, 23, 0, 0);
const left = msUntilNextPuzzle(mid);
assert.ok(left > 0 && left <= 60 * 60 * 1000, `unexpected countdown: ${left}ms`);

// --- a full solve is winnable within the attempt limit -------------------
// Play the daily the way a competent solver would and confirm 8 attempts is a
// fair budget rather than a coin flip.
const { allCodes, isConsistent } = await import('../shared/engine.js');
const SPACE = allCodes();
let total = 0;
let failures = 0;
const TRIALS = 120;
for (let i = 0; i < TRIALS; i += 1) {
  const date = new Date(2026, 0, 1 + i);
  const secret = dailyCode(date);
  const history = [];
  let solvedIn = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const pool = SPACE.filter((c) => isConsistent(c, history));
    const guess = pool[Math.floor(pool.length / 2)];
    const score = evaluate(secret, guess);
    history.push({ guess, ...score });
    if (score.position === 4) { solvedIn = attempt; break; }
  }
  if (solvedIn) total += solvedIn;
  else failures += 1;
}
console.log(
  `solver: ${((TRIALS - failures) / TRIALS * 100).toFixed(0)}% solved, `
  + `avg ${(total / (TRIALS - failures)).toFixed(2)} of ${MAX_ATTEMPTS} attempts`,
);
assert.ok(failures / TRIALS < 0.05, `${MAX_ATTEMPTS} attempts is too tight: ${failures} failures`);

console.log('\nall daily assertions passed');
