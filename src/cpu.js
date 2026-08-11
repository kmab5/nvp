/**
 * The CPU codebreaker.
 *
 * The whole search space is only 3024 codes, so even the hardest level can hold
 * every possibility in memory and reason over it exactly. Difficulty is a matter
 * of how much of that reasoning the CPU is willing to do.
 *
 *   rookie — plays hunches. Only remembers its two most recent clues, and often
 *            throws a wild guess anyway. Beatable.
 *   racer  — perfect bookkeeping: guesses a code that fits every clue so far,
 *            picked at random. Solves in roughly 6 rounds.
 *   ace    — picks the guess that splits the remaining possibilities most
 *            evenly, so each clue cuts as deep as it can. Roughly 4-5 rounds.
 */

import { allCodes, evaluate, isConsistent, CODE_LENGTH } from '../shared/engine.js';

export const LEVELS = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    tagline: 'Forgets clues, plays hunches',
    blurb: 'Works from its last three clues only, and guesses wild a quarter of the time.',
    pace: 'cracks a code in 7 or 8 rounds',
    thinkMs: [350, 700],
  },
  racer: {
    id: 'racer',
    name: 'Racer',
    tagline: 'Sharp, occasionally reckless',
    blurb: 'Long memory and solid deduction, but still takes the odd flyer.',
    pace: 'cracks a code in 5 or 6 rounds',
    thinkMs: [500, 950],
  },
  ace: {
    id: 'ace',
    name: 'Ace',
    tagline: 'Never wastes a question',
    blurb: 'Picks the guess that splits the remaining codes most evenly. No bad games.',
    pace: 'cracks a code in 5 rounds, every time',
    thinkMs: [650, 1250],
  },
};

export const LEVEL_ORDER = ['rookie', 'racer', 'ace'];

const SPACE = allCodes();

// Keeps the Ace level responsive on slow devices. Well above the size the
// candidate set reaches after the opening guess, so it rarely bites.
const MAX_PROBES = 400;
const MAX_SAMPLE = 800;

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function sample(list, limit, random) {
  if (list.length <= limit) return list;
  const copy = list.slice();
  const out = [];
  for (let i = 0; i < limit; i += 1) {
    out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  }
  return out;
}

/**
 * Expected number of survivors if we play `guess` against `candidates`, plus
 * the worst case. Lower is better on both counts.
 */
function splitScore(guess, candidates) {
  const buckets = new Map();
  for (const code of candidates) {
    const { value, position } = evaluate(code, guess);
    const key = value * 8 + position;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let expected = 0;
  let worst = 0;
  for (const n of buckets.values()) {
    expected += n * n;
    if (n > worst) worst = n;
  }
  return { expected: expected / candidates.length, worst };
}

export function createCpu(levelId = 'racer', random = Math.random) {
  const level = LEVELS[levelId] ? LEVELS[levelId] : LEVELS.racer;
  const played = new Set();

  function candidatesFrom(history) {
    return SPACE.filter((code) => !played.has(code) && isConsistent(code, history));
  }

  // Measured over 300 solo games: memory 3 + 25% wild lands the Rookie at ~8
  // rounds average with no games left unsolved. Beatable by a careful human,
  // still fast enough to punish sloppy play.
  const ROOKIE_MEMORY = 3;
  const ROOKIE_WILD = 0.25;

  function rookieGuess(history) {
    const fitting = candidatesFrom(history.slice(-ROOKIE_MEMORY));
    const wild = SPACE.filter((code) => !played.has(code));
    const pool = fitting.length === 0 || random() < ROOKIE_WILD ? wild : fitting;
    return pick(pool.length ? pool : SPACE, random);
  }

  // The Racer is a strong club player rather than a machine: it works from a
  // long but finite memory and occasionally plays a hunch, which is why it
  // sometimes has a genuinely bad game (~5.6 rounds average, worst seen 13).
  const RACER_MEMORY = 4;
  const RACER_WILD = 0.15;

  function racerGuess(history) {
    const fitting = candidatesFrom(history.slice(-RACER_MEMORY));
    if (fitting.length && random() >= RACER_WILD) return pick(fitting, random);
    const unplayed = SPACE.filter((code) => !played.has(code));
    return pick(unplayed.length ? unplayed : SPACE, random);
  }

  function aceGuess(history) {
    // Every opening guess is equivalent under relabelling, so don't burn cycles.
    if (history.length === 0) return pick(SPACE, random);

    const fitting = candidatesFrom(history);
    if (fitting.length === 0) return racerGuess(history);
    if (fitting.length <= 2) return fitting[0];

    const scoring = sample(fitting, MAX_SAMPLE, random);
    const probes = sample(fitting, MAX_PROBES, random);

    let best = probes[0];
    let bestScore = { expected: Infinity, worst: Infinity };
    for (const probe of probes) {
      const score = splitScore(probe, scoring);
      if (
        score.expected < bestScore.expected - 1e-9 ||
        (Math.abs(score.expected - bestScore.expected) < 1e-9 && score.worst < bestScore.worst)
      ) {
        best = probe;
        bestScore = score;
      }
    }
    return best;
  }

  return {
    level,

    /**
     * @param {{guess: string, value: number, position: number}[]} history
     * @returns {string} the CPU's next guess
     */
    nextGuess(history) {
      let guess;
      if (level.id === 'rookie') guess = rookieGuess(history);
      else if (level.id === 'ace') guess = aceGuess(history);
      else guess = racerGuess(history);
      played.add(guess);
      return guess;
    },

    /** How many codes are still in play, for the "thinking" readout. */
    remaining(history) {
      return candidatesFrom(history).length;
    },

    thinkDelay() {
      const [lo, hi] = level.thinkMs;
      return lo + random() * (hi - lo);
    },
  };
}

export function digitsRuledOut(history) {
  const out = new Set();
  for (const turn of history) {
    if (turn.value === 0) {
      for (const ch of turn.guess) out.add(ch);
    }
  }
  return out;
}

export { CODE_LENGTH };
