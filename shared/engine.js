/**
 * NVP — core rules. Shared verbatim by the browser and the serverless API so
 * scoring can never drift between the two.
 *
 * A code is 4 digits, drawn from 1-9, with no repeats and no zero.
 *   Value    = how many of the guessed digits appear in the secret
 *   Position = how many of those sit in the right slot
 * Position is always <= Value. Position === 4 means the code is cracked.
 */

export const CODE_LENGTH = 4;
export const DIGITS = '123456789';

/** Strip everything that is not an allowed digit. */
export function sanitize(input) {
  return String(input ?? '')
    .split('')
    .filter((ch) => DIGITS.includes(ch))
    .join('');
}

/**
 * @returns {string|null} null when the code is legal, otherwise the reason.
 */
export function validateCode(code) {
  const raw = String(code ?? '');
  if (raw.length !== CODE_LENGTH) return `Codes are ${CODE_LENGTH} digits long.`;
  if (raw.includes('0')) return 'Zero is out. Use 1 through 9.';
  for (const ch of raw) {
    if (!DIGITS.includes(ch)) return 'Digits only, 1 through 9.';
  }
  if (new Set(raw).size !== raw.length) return 'No repeated digits.';
  return null;
}

export function isValidCode(code) {
  return validateCode(code) === null;
}

/** Score a guess against a secret. Both must be valid codes. */
export function evaluate(secret, guess) {
  let value = 0;
  let position = 0;
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const ch = guess[i];
    if (secret.includes(ch)) value += 1;
    if (secret[i] === ch) position += 1;
  }
  return { value, position };
}

export function isCracked(score) {
  return score.position === CODE_LENGTH;
}

/** Every legal code: 9 x 8 x 7 x 6 = 3024 of them. */
export function allCodes() {
  const out = [];
  const digits = DIGITS.split('');
  const walk = (prefix, pool) => {
    if (prefix.length === CODE_LENGTH) {
      out.push(prefix);
      return;
    }
    for (let i = 0; i < pool.length; i += 1) {
      walk(prefix + pool[i], pool.slice(0, i).concat(pool.slice(i + 1)));
    }
  };
  walk('', digits);
  return out;
}

export function randomCode(random = Math.random) {
  const pool = DIGITS.split('');
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const idx = Math.floor(random() * pool.length);
    code += pool.splice(idx, 1)[0];
  }
  return code;
}

/** Does `code` agree with every clue collected so far? */
export function isConsistent(code, history) {
  for (const turn of history) {
    const score = evaluate(code, turn.guess);
    if (score.value !== turn.value || score.position !== turn.position) return false;
  }
  return true;
}

/**
 * Turn order is derived, never stored: seat A opens, seat B answers.
 * A guesses when the guess counts are level, B guesses when it owes one.
 */
export function seatToMove(countA, countB) {
  return countA === countB ? 'A' : 'B';
}

/** Round number currently being played (1-based). */
export function currentRound(countA, countB) {
  return Math.min(countA, countB) + 1;
}

/** Which round a seat cracked the code on, or null. */
export function crackedOnRound(guesses) {
  for (let i = 0; i < guesses.length; i += 1) {
    if (guesses[i].position === CODE_LENGTH) return i + 1;
  }
  return null;
}

/**
 * Resolve a match. Both seats always play the same number of rounds, so the
 * player who moves second always gets a reply — cracking it first only wins if
 * the opponent cannot match it in the same round.
 *
 * @returns {null | {outcome: 'win'|'draw', winner: 'A'|'B'|null, rounds: number}}
 */
export function resolveMatch(guessesA, guessesB) {
  if (guessesA.length !== guessesB.length || guessesA.length === 0) return null;
  const a = crackedOnRound(guessesA);
  const b = crackedOnRound(guessesB);
  if (a === null && b === null) return null;
  const rounds = guessesA.length;
  if (a !== null && b !== null) return { outcome: 'draw', winner: null, rounds };
  return { outcome: 'win', winner: a !== null ? 'A' : 'B', rounds };
}
