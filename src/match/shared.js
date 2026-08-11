/** Bits every match controller needs. */

export function emitter() {
  const listeners = new Set();
  return {
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit() {
      for (const fn of [...listeners]) fn();
    },
  };
}

export const ok = { ok: true };
export const fail = (error) => ({ ok: false, error });

/**
 * All three controllers report results in this shape so the play screen never
 * has to know which mode it is showing.
 *
 * @typedef {object} MatchResult
 * @property {'win'|'draw'} kind
 * @property {string} title      headline, written for whoever is looking
 * @property {string} detail     one line of explanation
 * @property {{label:string, code:string, rounds:number|null}[]} reveals
 * @property {string|null} pending  set while waiting on the other side
 */
