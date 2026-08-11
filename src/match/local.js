/**
 * Two players, one device.
 *
 * The privacy problem is the whole problem here: both codes have to be entered on
 * the same screen, and the device changes hands after every guess. So the match
 * carries a gate — whenever the seat with the move changes, play stops behind a
 * full-screen handoff card until the incoming player confirms they're the one
 * holding it. Codes are masked as they're typed for the same reason.
 *
 * Guess history is public information in this game, so nothing else needs hiding.
 */

import {
  validateCode, evaluate, seatToMove, currentRound, resolveMatch, crackedOnRound, CODE_LENGTH,
} from '../../shared/engine.js';
import { emitter, ok, fail } from './shared.js';
import * as prefs from '../prefs.js';

const other = (seat) => (seat === 'A' ? 'B' : 'A');

export function createLocalMatch({ names, gate = true }) {
  const events = emitter();
  const seats = {
    A: { name: names.A || 'Player 1', secret: null, guesses: [] },
    B: { name: names.B || 'Player 2', secret: null, guesses: [] },
  };
  let acked = 'A';
  let notice = null;
  let logged = false;

  const phase = () => {
    if (!seats.A.secret || !seats.B.secret) return 'setup';
    return resolveMatch(seats.A.guesses, seats.B.guesses) ? 'over' : 'playing';
  };

  const activeSeat = () => (phase() === 'setup'
    ? (!seats.A.secret ? 'A' : 'B')
    : seatToMove(seats.A.guesses.length, seats.B.guesses.length));

  function result() {
    const decided = resolveMatch(seats.A.guesses, seats.B.guesses);
    if (!decided) return null;
    const reveals = ['A', 'B'].map((seat) => ({
      label: `${seats[seat].name}'s code`,
      code: seats[seat].secret,
      rounds: crackedOnRound(seats[other(seat)].guesses),
    }));
    if (decided.outcome === 'draw') {
      return {
        kind: 'draw',
        title: 'Dead heat',
        detail: `Both codes fell in round ${decided.rounds}. Nobody gets to gloat.`,
        reveals,
        pending: null,
      };
    }
    const winner = seats[decided.winner].name;
    return {
      kind: 'win',
      title: `${winner} wins`,
      detail: `Cracked it in ${decided.rounds} `
        + `${decided.rounds === 1 ? 'round' : 'rounds'}.`,
      reveals,
      pending: null,
    };
  }

  function view() {
    const currentPhase = phase();
    const seat = activeSeat();
    const me = seats[seat];
    const them = seats[other(seat)];
    const decided = result();

    if (decided && !logged) {
      logged = true;
      prefs.recordResult({ mode: 'local', outcome: 'drawn' });
    }

    return {
      mode: 'local',
      phase: currentPhase,
      seat,
      round: currentRound(seats.A.guesses.length, seats.B.guesses.length),
      me: { name: me.name, guesses: me.guesses, codeLocked: Boolean(me.secret) },
      them: { name: them.name, guesses: them.guesses, codeLocked: Boolean(them.secret) },
      yourTurn: currentPhase === 'playing',
      busy: false,
      notice,
      result: decided,
      // The gate is the only reason this mode needs anything the others don't.
      handoff: gate && acked !== seat && currentPhase !== 'over'
        ? {
          name: me.name,
          reason: currentPhase === 'setup' ? 'to set a secret code' : 'to take a turn',
        }
        : null,
      secretPrompt: currentPhase === 'setup'
        ? { name: me.name, masked: true, opponentLocked: Boolean(them.secret) }
        : null,
      // Fixed left-to-right order: the board must not swap sides mid-match just
      // because the device changed hands.
      boards: ['A', 'B'].map((key) => ({
        key,
        title: seats[key].name,
        sub: `reading ${seats[other(key)].name}`,
        guesses: seats[key].guesses,
        active: key === seat && currentPhase === 'playing',
      })),
    };
  }

  return {
    mode: 'local',
    meta: { names: { A: seats.A.name, B: seats.B.name } },
    on: events.on,
    view,

    acknowledgeHandoff() {
      acked = activeSeat();
      notice = null;
      events.emit();
    },

    setSecret(code) {
      if (phase() !== 'setup') return fail('Both codes are already locked in.');
      const problem = validateCode(code);
      if (problem) return fail(problem);
      const seat = activeSeat();
      if (seats[other(seat)].secret === code) {
        return fail('Pick a different code — your opponent used that one.');
      }
      seats[seat].secret = code;
      notice = null;
      events.emit();
      return ok;
    },

    guess(code) {
      if (phase() !== 'playing') return fail('Not right now.');
      const problem = validateCode(code);
      if (problem) return fail(problem);
      const seat = activeSeat();
      if (seats[seat].guesses.some((g) => g.guess === code)) {
        return fail('You already tried that one.');
      }
      const score = evaluate(seats[other(seat)].secret, code);
      seats[seat].guesses.push({ guess: code, ...score });
      notice = score.position === CODE_LENGTH ? `${seats[seat].name} cracked it.` : null;
      events.emit();
      return { ...ok, score };
    },

    rematch() {
      for (const seat of ['A', 'B']) {
        seats[seat].secret = null;
        seats[seat].guesses = [];
      }
      acked = 'A';
      notice = null;
      logged = false;
      events.emit();
    },

    quit() {},
  };
}
