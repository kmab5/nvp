/**
 * The room model.
 *
 * Design rules that keep online play honest and race-free:
 *
 *  1. Secrets never leave the server until the match is over. The client posts a
 *     guess; the server scores it. A player cannot read the answer out of the
 *     network tab, and cannot lie about their own score.
 *  2. Nothing about turn order is stored. Whose move it is, which round it is and
 *     who won are all derived from the two guess lists, so there is no pointer
 *     for two simultaneous requests to disagree about.
 *  3. Each player only ever appends to their own guess list.
 */

import {
  CODE_LENGTH, validateCode, evaluate, sanitize,
  seatToMove, currentRound, resolveMatch, crackedOnRound,
} from '../../shared/engine.js';

export const MAX_ROUNDS = 30;
export const NAME_MAX = 14;

const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
const ROOM_LENGTH = 5;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bytes = (n) => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

export function newRoomId() {
  return Array.from(bytes(ROOM_LENGTH))
    .map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length])
    .join('');
}

export function newToken() {
  return Array.from(bytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeRoomId(input) {
  return String(input ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_LENGTH);
}

export function cleanName(input, fallback) {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || fallback;
}

export function emptySeat(name, token) {
  return { token, name, secret: null, guesses: [], rematch: false, seen: Date.now() };
}

export function createRoom(roomId, hostName) {
  const token = newToken();
  return {
    room: roomId,
    createdAt: Date.now(),
    epoch: 1,
    seats: { A: emptySeat(cleanName(hostName, 'Player 1'), token), B: null },
  };
}

export function seatOf(room, token) {
  if (!room || !token) return null;
  if (room.seats.A && room.seats.A.token === token) return 'A';
  if (room.seats.B && room.seats.B.token === token) return 'B';
  return null;
}

export const other = (seat) => (seat === 'A' ? 'B' : 'A');

/** 'waiting' -> 'setup' -> 'playing' -> 'over'. Fully derived from the seats. */
export function phaseOf(room) {
  const { A, B } = room.seats;
  if (!A || !B) return 'waiting';
  if (!A.secret || !B.secret) return 'setup';
  return resolveMatch(A.guesses, B.guesses) || A.guesses.length >= MAX_ROUNDS
    ? 'over'
    : 'playing';
}

export function resultOf(room) {
  const { A, B } = room.seats;
  if (!A || !B) return null;
  const decided = resolveMatch(A.guesses, B.guesses);
  if (decided) return decided;
  if (A.guesses.length >= MAX_ROUNDS && A.guesses.length === B.guesses.length) {
    return { outcome: 'draw', winner: null, rounds: A.guesses.length, exhausted: true };
  }
  return null;
}

/**
 * Both players asked for a rematch: wipe the board, keep the seats and names.
 * Run server-side on every request, so whichever request notices first performs
 * it and the next one sees the bumped epoch and does nothing.
 */
export function applyRematch(room) {
  const { A, B } = room.seats;
  if (!A || !B || !A.rematch || !B.rematch) return false;
  for (const seat of [A, B]) {
    seat.secret = null;
    seat.guesses = [];
    seat.rematch = false;
  }
  room.epoch += 1;
  return true;
}

export function setSecret(room, seat, code) {
  const player = room.seats[seat];
  if (!player) throw new ApiError(403, 'You are not seated in this room.');
  if (phaseOf(room) === 'playing' || phaseOf(room) === 'over') {
    throw new ApiError(409, 'The code is locked in for this match.');
  }
  const clean = sanitize(code);
  const problem = validateCode(clean);
  if (problem) throw new ApiError(400, problem);
  player.secret = clean;
  player.seen = Date.now();
}

export function addGuess(room, seat, code) {
  const me = room.seats[seat];
  const them = room.seats[other(seat)];
  if (!me || !them) throw new ApiError(409, 'Waiting for the other player.');
  if (phaseOf(room) !== 'playing') throw new ApiError(409, 'No guesses right now.');
  if (seatToMove(room.seats.A.guesses.length, room.seats.B.guesses.length) !== seat) {
    throw new ApiError(409, "It is not your turn.");
  }
  const clean = sanitize(code);
  const problem = validateCode(clean);
  if (problem) throw new ApiError(400, problem);
  if (me.guesses.some((g) => g.guess === clean)) {
    throw new ApiError(400, 'You already tried that code.');
  }
  const score = evaluate(them.secret, clean);
  me.guesses.push({ guess: clean, value: score.value, position: score.position, at: Date.now() });
  me.seen = Date.now();
  return score;
}

/**
 * What a given seat is allowed to see. The opponent's secret and token are
 * stripped until the match is decided.
 */
export function viewFor(room, seat) {
  const phase = phaseOf(room);
  const me = room.seats[seat];
  const them = room.seats[other(seat)];
  const result = resultOf(room);
  const revealed = phase === 'over';

  const publicSeat = (player) => ({
    name: player.name,
    codeLocked: Boolean(player.secret),
    guesses: player.guesses.map(({ guess, value, position }) => ({ guess, value, position })),
    wantsRematch: Boolean(player.rematch),
    crackedOnRound: crackedOnRound(player.guesses),
    lastSeen: player.seen,
  });

  return {
    room: room.room,
    epoch: room.epoch,
    phase,
    seat,
    codeLength: CODE_LENGTH,
    maxRounds: MAX_ROUNDS,
    round: currentRound(room.seats.A.guesses.length, room.seats.B?.guesses.length ?? 0),
    toMove: phase === 'playing'
      ? seatToMove(room.seats.A.guesses.length, room.seats.B.guesses.length)
      : null,
    me: { ...publicSeat(me), secret: me.secret },
    opponent: them ? { ...publicSeat(them), secret: revealed ? them.secret : null } : null,
    result,
  };
}
