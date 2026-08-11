/**
 * You versus the machine. You move first, which is the one advantage on offer.
 *
 * The CPU keeps its own clue list and reasons only from the feedback it is given —
 * it never reads your code. Difficulty changes how well it reasons, not what it
 * knows, so a win is a real win.
 */

import {
  validateCode, evaluate, randomCode, resolveMatch, crackedOnRound, currentRound, CODE_LENGTH,
} from '../../shared/engine.js';
import { createCpu, LEVELS } from '../cpu.js';
import { emitter, ok, fail } from './shared.js';
import * as prefs from '../prefs.js';
import * as sfx from '../sfx.js';

export function createCpuMatch({ playerName = 'You', difficulty = 'racer' }) {
  const events = emitter();
  const level = LEVELS[difficulty] ? LEVELS[difficulty] : LEVELS.racer;

  let cpu = createCpu(level.id);
  let cpuSecret = randomCode();
  let playerSecret = null;
  let mine = [];
  let theirs = [];
  let thinking = false;
  let notice = null;
  let logged = false;
  let timer = null;

  const phase = () => {
    if (!playerSecret) return 'setup';
    return resolveMatch(mine, theirs) ? 'over' : 'playing';
  };

  function takeCpuTurn() {
    thinking = true;
    events.emit();
    const delay = cpu.thinkDelay();
    timer = setTimeout(() => {
      timer = null;
      const guess = cpu.nextGuess(theirs);
      const score = evaluate(playerSecret, guess);
      theirs.push({ guess, ...score });
      thinking = false;
      if (score.position === CODE_LENGTH) {
        notice = `${level.name} read your code.`;
      }
      events.emit();
    }, delay);
  }

  function result() {
    const decided = resolveMatch(mine, theirs);
    if (!decided) return null;
    const reveals = [
      { label: `${level.name}'s code`, code: cpuSecret, rounds: crackedOnRound(mine) },
      { label: 'Your code', code: playerSecret, rounds: crackedOnRound(theirs) },
    ];
    if (!logged) {
      logged = true;
      const outcome = decided.outcome === 'draw' ? 'drawn' : (decided.winner === 'A' ? 'won' : 'lost');
      prefs.recordResult({ mode: 'cpu', difficulty: level.id, outcome, rounds: decided.rounds });
      sfx.play(outcome === 'won' ? 'crack' : outcome === 'lost' ? 'lose' : 'turn');
    }
    if (decided.outcome === 'draw') {
      return {
        kind: 'draw',
        title: 'Dead heat',
        detail: `You both cracked it in round ${decided.rounds}. The ${level.name} will take that.`,
        reveals,
        pending: null,
      };
    }
    const youWon = decided.winner === 'A';
    return {
      kind: 'win',
      title: youWon ? 'You cracked it' : `${level.name} got there first`,
      detail: youWon
        ? `${decided.rounds} ${decided.rounds === 1 ? 'round' : 'rounds'}. Clean.`
        : `It needed ${decided.rounds} ${decided.rounds === 1 ? 'round' : 'rounds'}.`,
      reveals,
      pending: null,
    };
  }

  function view() {
    const currentPhase = phase();
    return {
      mode: 'cpu',
      phase: currentPhase,
      seat: 'A',
      round: currentRound(mine.length, theirs.length),
      me: { name: playerName, guesses: mine, codeLocked: Boolean(playerSecret) },
      them: { name: level.name, guesses: theirs, codeLocked: true },
      yourTurn: currentPhase === 'playing' && !thinking,
      busy: thinking,
      notice,
      result: result(),
      handoff: null,
      secretPrompt: currentPhase === 'setup'
        ? { name: playerName, masked: false, opponentLocked: true }
        : null,
      boards: [
        {
          key: 'me',
          title: 'You',
          sub: `reading ${level.name}`,
          guesses: mine,
          active: currentPhase === 'playing' && !thinking,
        },
        {
          key: 'them',
          title: level.name,
          sub: 'reading you',
          guesses: theirs,
          active: thinking,
        },
      ],
      difficulty: level,
    };
  }

  return {
    mode: 'cpu',
    meta: { difficulty: level.id },
    on: events.on,
    view,

    acknowledgeHandoff() {},

    setSecret(code) {
      if (playerSecret) return fail('Your code is already set.');
      const problem = validateCode(code);
      if (problem) return fail(problem);
      playerSecret = code;
      notice = null;
      events.emit();
      return ok;
    },

    guess(code) {
      if (phase() !== 'playing' || thinking) return fail('Hold on.');
      const problem = validateCode(code);
      if (problem) return fail(problem);
      if (mine.some((g) => g.guess === code)) return fail('You already tried that one.');
      const score = evaluate(cpuSecret, code);
      mine.push({ guess: code, ...score });
      notice = null;
      events.emit();
      // Counts are uneven now, so the match cannot be decided yet: the CPU always
      // gets its reply, even when you have just cracked its code.
      takeCpuTurn();
      return { ...ok, score };
    },

    rematch() {
      clearTimeout(timer);
      cpu = createCpu(level.id);
      cpuSecret = randomCode();
      playerSecret = null;
      mine = [];
      theirs = [];
      thinking = false;
      notice = null;
      logged = false;
      events.emit();
    },

    quit() {
      clearTimeout(timer);
    },
  };
}
