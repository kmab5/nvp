/**
 * Two devices, one room code.
 *
 * The server is the referee: it holds both codes, scores every guess and decides
 * whose turn it is. This controller is a thin translation layer between the
 * polled server state and the same view shape the offline modes produce.
 *
 * Because the game is turn-based, polling is enough — no sockets to keep warm on
 * a platform that doesn't keep processes alive.
 */

import { api, createPoller, NetError } from '../net.js';
import { validateCode, CODE_LENGTH } from '../../shared/engine.js';
import { emitter, ok, fail } from './shared.js';
import * as prefs from '../prefs.js';
import * as sfx from '../sfx.js';

export function createOnlineMatch({ room, token, seat, initialState }) {
  const events = emitter();
  let server = initialState || null;
  let notice = null;
  let busy = false;
  let connection = 'live';
  let logged = null;
  let lastTurnAlert = null;

  function absorb(next) {
    const wasMyTurn = server && server.toMove === seat;
    server = next;
    connection = 'live';
    if (next.toMove === seat && !wasMyTurn && next.phase === 'playing') {
      if (lastTurnAlert !== next.me.guesses.length) {
        lastTurnAlert = next.me.guesses.length;
        sfx.play('turn');
      }
    }
    events.emit();
  }

  const poller = createPoller({
    room,
    token,
    onState: absorb,
    onError: (error, failures) => {
      if (error.status === 404 || error.status === 403) {
        connection = 'gone';
        notice = 'This room is gone. Head back to the menu.';
        prefs.session.clear();
      } else if (failures >= 2) {
        connection = 'stalled';
      }
      events.emit();
    },
    // Poll briskly while the opponent holds the move; ease off when it's on you.
    interval: () => {
      if (!server) return 1200;
      if (server.phase === 'over') return 2500;
      if (server.phase === 'waiting' || server.phase === 'setup') return 1500;
      return server.toMove === seat ? 3500 : 1400;
    },
  });

  async function send(work) {
    busy = true;
    events.emit();
    try {
      const response = await work();
      if (response && response.state) absorb(response.state);
      return ok;
    } catch (error) {
      const message = error instanceof NetError ? error.message : 'That did not go through.';
      sfx.play('reject');
      poller.poke();
      return fail(message);
    } finally {
      busy = false;
      events.emit();
    }
  }

  function result() {
    if (!server || server.phase !== 'over' || !server.result) return null;
    const { outcome, winner, exhausted } = server.result;
    const opponent = server.opponent;
    const reveals = [
      {
        label: `${opponent ? opponent.name : 'Opponent'}'s code`,
        code: opponent ? opponent.secret : null,
        rounds: server.me.crackedOnRound,
      },
      { label: 'Your code', code: server.me.secret, rounds: opponent ? opponent.crackedOnRound : null },
    ];

    const iWon = outcome === 'win' && winner === seat;
    const key = outcome === 'draw' ? 'drawn' : (iWon ? 'won' : 'lost');
    if (logged !== server.epoch) {
      logged = server.epoch;
      prefs.recordResult({ mode: 'online', outcome: key, rounds: server.result.rounds });
      sfx.play(key === 'won' ? 'crack' : key === 'lost' ? 'lose' : 'turn');
    }

    const pending = server.me.wantsRematch
      ? `Waiting for ${opponent ? opponent.name : 'your opponent'} to accept.`
      : (opponent && opponent.wantsRematch
        ? `${opponent.name} wants a rematch.`
        : null);

    if (exhausted) {
      return {
        kind: 'draw',
        title: 'Out of rounds',
        detail: `${server.result.rounds} rounds each and neither code fell.`,
        reveals,
        pending,
      };
    }
    if (outcome === 'draw') {
      return {
        kind: 'draw',
        title: 'Dead heat',
        detail: `Both codes fell in round ${server.result.rounds}.`,
        reveals,
        pending,
      };
    }
    return {
      kind: 'win',
      title: iWon ? 'You cracked it' : `${opponent ? opponent.name : 'Your opponent'} cracked it`,
      detail: iWon
        ? `${server.result.rounds} ${server.result.rounds === 1 ? 'round' : 'rounds'}. Clean.`
        : `It took them ${server.result.rounds} `
          + `${server.result.rounds === 1 ? 'round' : 'rounds'}.`,
      reveals,
      pending,
    };
  }

  function view() {
    if (!server) {
      return {
        mode: 'online',
        phase: 'connecting',
        seat,
        round: 1,
        me: { name: 'You', guesses: [], codeLocked: false },
        them: { name: 'Opponent', guesses: [], codeLocked: false },
        yourTurn: false,
        busy: true,
        notice,
        result: null,
        handoff: null,
        secretPrompt: null,
        boards: [],
        room,
        connection,
      };
    }

    const opponent = server.opponent;
    const themName = opponent ? opponent.name : 'Opponent';

    return {
      mode: 'online',
      phase: server.phase === 'waiting' ? 'lobby' : server.phase,
      seat,
      round: server.round,
      me: {
        name: server.me.name,
        guesses: server.me.guesses,
        codeLocked: server.me.codeLocked,
      },
      them: {
        name: themName,
        guesses: opponent ? opponent.guesses : [],
        codeLocked: opponent ? opponent.codeLocked : false,
      },
      yourTurn: server.phase === 'playing' && server.toMove === seat && !busy,
      busy,
      notice,
      result: result(),
      handoff: null,
      secretPrompt: server.phase === 'setup'
        ? {
          name: server.me.name,
          masked: false,
          opponentLocked: Boolean(opponent && opponent.codeLocked),
          alreadySet: server.me.codeLocked,
        }
        : null,
      boards: [
        {
          key: 'me',
          title: 'You',
          sub: `reading ${themName}`,
          guesses: server.me.guesses,
          active: server.phase === 'playing' && server.toMove === seat,
        },
        {
          key: 'them',
          title: themName,
          sub: 'reading you',
          guesses: opponent ? opponent.guesses : [],
          active: server.phase === 'playing' && server.toMove !== seat,
        },
      ],
      room,
      connection,
      opponentPresent: Boolean(opponent),
      codeLength: CODE_LENGTH,
    };
  }

  return {
    mode: 'online',
    meta: { room, seat },
    on: events.on,
    view,

    acknowledgeHandoff() {},

    setSecret(code) {
      const problem = validateCode(code);
      if (problem) return Promise.resolve(fail(problem));
      return send(() => api.setSecret(room, token, code));
    },

    guess(code) {
      const problem = validateCode(code);
      if (problem) return Promise.resolve(fail(problem));
      return send(() => api.guess(room, token, code));
    },

    rematch() {
      return send(() => api.rematch(room, token, true));
    },

    quit() {
      poller.stop();
      prefs.session.clear();
      // Frees the seat so the room can be reused; failure here is harmless.
      api.leave(room, token).catch(() => {});
    },
  };
}
