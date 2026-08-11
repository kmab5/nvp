/**
 * The only backend NVP has.
 *
 *   GET  /api/game?room=ABCDE&token=...        current state, redacted for you
 *   POST /api/game  { action, ... }
 *        create  { name }                      -> { room, token, seat, state }
 *        join    { room, name }                -> { room, token, seat, state }
 *        secret  { room, token, code }
 *        guess   { room, token, code }
 *        rematch { room, token, want }
 *        leave   { room, token }
 *
 * Turn-based play needs no sockets: the client polls, and every write is a
 * compare-and-swap so nothing is lost when both players act at once.
 */

import { isPersistent, readRoom, updateRoom, writeRoom } from './_lib/store.js';
import {
  ApiError, createRoom, newRoomId, newToken, normalizeRoomId, cleanName,
  emptySeat, seatOf, phaseOf, viewFor, setSecret, addGuess, applyRematch,
} from './_lib/room.js';

const MAX_BODY = 2048;

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(status).send(JSON.stringify(body));
}

function readBody(req) {
  const raw = req.body;
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  const text = String(raw);
  if (text.length > MAX_BODY) throw new ApiError(413, 'That request was too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Could not read that request.');
  }
}

/** Load a room and confirm the caller is seated in it. */
async function requireSeat(roomId, token) {
  const id = normalizeRoomId(roomId);
  if (!id) throw new ApiError(400, 'Missing room code.');
  const { version, data } = await readRoom(id);
  if (!data) throw new ApiError(404, 'That room has expired or never existed.');
  const seat = seatOf(data, token);
  if (!seat) throw new ApiError(403, 'You are not seated in this room.');
  return { id, version, room: data, seat };
}

async function handleCreate(res, body) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newRoomId();
    const existing = await readRoom(id);
    if (existing.data) continue;
    const room = createRoom(id, body.name);
    const committed = await writeRoom(id, 0, room);
    if (!committed) continue;
    return send(res, 201, {
      room: id,
      token: room.seats.A.token,
      seat: 'A',
      state: viewFor(room, 'A'),
    });
  }
  throw new ApiError(503, 'Could not open a room. Try again.');
}

async function handleJoin(res, body) {
  const id = normalizeRoomId(body.room);
  if (!id) throw new ApiError(400, 'Enter a room code.');
  const token = newToken();
  let seat = 'B';

  const { data } = await updateRoom(id, (room) => {
    if (!room) throw new ApiError(404, 'No room with that code. Check the letters.');
    applyRematch(room);
    if (room.seats.B) {
      // Rejoining with a known token is handled by GET, so a full room is full.
      throw new ApiError(409, 'That room already has two players.');
    }
    const fallback = room.seats.A.name === 'Player 2' ? 'Player 1' : 'Player 2';
    room.seats.B = emptySeat(cleanName(body.name, fallback), token);
    seat = 'B';
    return room;
  });

  return send(res, 200, { room: id, token, seat, state: viewFor(data, seat) });
}

async function handleSecret(res, body) {
  const found = await requireSeat(body.room, body.token);
  const { data } = await updateRoom(found.id, (room) => {
    if (!room) throw new ApiError(404, 'That room has expired.');
    const seat = seatOf(room, body.token);
    if (!seat) throw new ApiError(403, 'You are not seated in this room.');
    applyRematch(room);
    setSecret(room, seat, body.code);
    return room;
  });
  return send(res, 200, { state: viewFor(data, found.seat) });
}

async function handleGuess(res, body) {
  const found = await requireSeat(body.room, body.token);
  const { data } = await updateRoom(found.id, (room) => {
    if (!room) throw new ApiError(404, 'That room has expired.');
    const seat = seatOf(room, body.token);
    if (!seat) throw new ApiError(403, 'You are not seated in this room.');
    addGuess(room, seat, body.code);
    return room;
  });
  return send(res, 200, { state: viewFor(data, found.seat) });
}

async function handleRematch(res, body) {
  const found = await requireSeat(body.room, body.token);
  const want = body.want !== false;
  const { data } = await updateRoom(found.id, (room) => {
    if (!room) throw new ApiError(404, 'That room has expired.');
    const seat = seatOf(room, body.token);
    if (!seat) throw new ApiError(403, 'You are not seated in this room.');
    if (phaseOf(room) !== 'over') throw new ApiError(409, 'This match is still running.');
    room.seats[seat].rematch = want;
    room.seats[seat].seen = Date.now();
    applyRematch(room);
    return room;
  });
  return send(res, 200, { state: viewFor(data, found.seat) });
}

async function handleLeave(res, body) {
  const found = await requireSeat(body.room, body.token).catch(() => null);
  if (!found) return send(res, 200, { ok: true });
  await updateRoom(found.id, (room) => {
    if (!room) return undefined;
    const seat = seatOf(room, body.token);
    if (!seat) return undefined;
    room.seats[seat] = null;
    if (!room.seats.A && !room.seats.B) return { ...room, closed: true };
    return room;
  });
  return send(res, 200, { ok: true });
}

async function handleState(res, query) {
  const found = await requireSeat(query.room, query.token);
  const { data } = await updateRoom(found.id, (room) => {
    if (!room) throw new ApiError(404, 'That room has expired.');
    const seat = seatOf(room, query.token);
    if (!seat) throw new ApiError(403, 'You are not seated in this room.');
    const changed = applyRematch(room);
    const stale = Date.now() - (room.seats[seat].seen || 0) > 20000;
    if (!changed && !stale) return undefined; // nothing worth a write
    room.seats[seat].seen = Date.now();
    return room;
  });
  const room = data;
  const seat = seatOf(room, query.token);
  return send(res, 200, { state: viewFor(room, seat), persistent: isPersistent });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      return await handleState(res, { room: query.room, token: query.token });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      throw new ApiError(405, 'Method not allowed.');
    }

    const body = readBody(req);
    switch (body.action) {
      case 'create': return await handleCreate(res, body);
      case 'join': return await handleJoin(res, body);
      case 'secret': return await handleSecret(res, body);
      case 'guess': return await handleGuess(res, body);
      case 'rematch': return await handleRematch(res, body);
      case 'leave': return await handleLeave(res, body);
      default: throw new ApiError(400, 'Unknown action.');
    }
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[nvp/api]', error);
    return send(res, status, {
      error: status >= 500 ? 'Something broke on our side. Try again.' : error.message,
    });
  }
}
