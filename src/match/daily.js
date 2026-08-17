/**
 * The daily puzzle, as a match controller.
 *
 * Single-player, so there's no opponent and no turn order — but it exposes the
 * same shape as the other controllers (view/on/guess/quit) so the UI layers can
 * treat it the same way.
 *
 * Progress is saved after every guess, not just at the end. Closing the tab
 * mid-puzzle and coming back should resume exactly where you were, and there is
 * no second chance at a daily, so losing three guesses to a refresh would be
 * genuinely annoying.
 */

import { validateCode, evaluate, CODE_LENGTH } from '../../shared/engine.js';
import {
  MAX_ATTEMPTS, dailyCode, dayKey, puzzleNumber, msUntilNextPuzzle,
  streakFrom, distribution, shareText,
} from '../../shared/daily.js';
import { emitter, ok, fail } from './shared.js';
import * as prefs from '../prefs.js';
import * as sfx from '../sfx.js';

const HISTORY = 'daily.history';

export function createDailyMatch({ now = () => new Date(), link = '' } = {}) {
  const events = emitter();
  const today = now();
  const key = dayKey(today);
  const number = puzzleNumber(today);
  const secret = dailyCode(today);

  const history = prefs.get(HISTORY, {}) || {};
  const saved = history[key];

  // Resume an in-progress day, or start a fresh one.
  let guesses = saved?.guesses ? saved.guesses.slice() : [];
  let notice = null;

  const solved = () => guesses.some((g) => g.position === CODE_LENGTH);
  const done = () => solved() || guesses.length >= MAX_ATTEMPTS;

  function persist() {
    const record = prefs.get(HISTORY, {}) || {};
    record[key] = {
      number,
      guesses,
      attempts: guesses.length,
      solved: solved(),
      finished: done(),
    };
    // Keep the file small: a year of history is far more than anything shown.
    const keys = Object.keys(record).sort();
    while (keys.length > 400) delete record[keys.shift()];
    prefs.set(HISTORY, record);
  }

  function view() {
    const record = prefs.get(HISTORY, {}) || {};
    const stats = distribution(record);
    return {
      mode: 'daily',
      phase: done() ? 'over' : 'playing',
      number,
      date: key,
      guesses,
      attempts: guesses.length,
      maxAttempts: MAX_ATTEMPTS,
      remaining: Math.max(0, MAX_ATTEMPTS - guesses.length),
      solved: solved(),
      // Only ever revealed once the day is finished.
      secret: done() ? secret : null,
      notice,
      streak: streakFrom(record, today),
      stats,
      msUntilNext: msUntilNextPuzzle(now()),
      shareText: done()
        ? shareText({ number, guesses, solved: solved(), link })
        : null,
    };
  }

  return {
    mode: 'daily',
    on: events.on,
    view,

    guess(code) {
      if (done()) return fail('Today\'s puzzle is finished.');
      const problem = validateCode(code);
      if (problem) return fail(problem);
      if (guesses.some((g) => g.guess === code)) return fail('You already tried that one.');

      const score = evaluate(secret, code);
      guesses.push({ guess: code, ...score });
      notice = null;
      persist();

      if (score.position === CODE_LENGTH) sfx.play('crack');
      else if (guesses.length >= MAX_ATTEMPTS) sfx.play('lose');
      else sfx.play('submit');

      events.emit();
      return { ...ok, score };
    },

    /** Daily has no rematch — that's the point of it. */
    rematch() {},
    acknowledgeHandoff() {},
    quit() {},
  };
}
