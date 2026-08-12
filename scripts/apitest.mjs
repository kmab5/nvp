import assert from 'node:assert/strict';
import handler from '../api/game.js';

// Minimal stand-in for Vercel's req/res pair.
function call(method, { body, query } = {}) {
  return new Promise((resolve) => {
    const res = {
      _status: 200,
      setHeader() {},
      status(code) { this._status = code; return this; },
      send(text) { resolve({ status: this._status, body: JSON.parse(text) }); },
    };
    handler({ method, body, query: query || {} }, res);
  });
}

const post = (body) => call('POST', { body });
const get = (room, token) => call('GET', { query: { room, token } });

// --- open a room, join it -------------------------------------------------
const created = await post({ action: 'create', name: 'Sami' });
assert.equal(created.status, 201);
const room = created.body.room;
const A = created.body.token;
assert.match(room, /^[A-Z2-9]{5}$/);
assert.equal(created.body.state.phase, 'waiting');
assert.equal(created.body.state.opponent, null);

assert.equal((await post({ action: 'join', room: 'ZZZZZ', name: 'x' })).status, 404);

const joined = await post({ action: 'join', room: room.toLowerCase(), name: 'Nardos' });
assert.equal(joined.status, 200);
const B = joined.body.token;
assert.equal(joined.body.seat, 'B');
assert.equal(joined.body.state.phase, 'setup');
assert.equal((await post({ action: 'join', room, name: 'Gatecrasher' })).status, 409);

// --- secrets stay secret --------------------------------------------------
assert.equal((await post({ action: 'secret', room, token: A, code: '1123' })).status, 400);
assert.equal((await post({ action: 'secret', room, token: A, code: '1023' })).status, 400);
assert.equal((await post({ action: 'secret', room, token: 'bogus', code: '1234' })).status, 403);
assert.equal((await post({ action: 'secret', room, token: A, code: '1234' })).status, 200);

let state = (await get(room, B)).body.state;
assert.equal(state.phase, 'setup');
assert.equal(state.opponent.codeLocked, true);
assert.equal(state.opponent.secret, null, 'opponent secret must not leak during setup');

// guessing before both codes are in is refused
assert.equal((await post({ action: 'guess', room, token: A, code: '5678' })).status, 409);

await post({ action: 'secret', room, token: B, code: '9876' });
state = (await get(room, A)).body.state;
assert.equal(state.phase, 'playing');
assert.equal(state.toMove, 'A');
assert.equal(state.round, 1);
assert.equal(state.opponent.secret, null, 'still hidden while playing');

// --- turn order is enforced ----------------------------------------------
assert.equal((await post({ action: 'guess', room, token: B, code: '1234' })).status, 409);
let r = await post({ action: 'guess', room, token: A, code: '9871' });
assert.equal(r.status, 200);
assert.deepEqual(
  r.body.state.me.guesses.at(-1),
  { guess: '9871', value: 3, position: 3 },
);
assert.equal(r.body.state.toMove, 'B');
assert.equal((await post({ action: 'guess', room, token: A, code: '9876' })).status, 409);
assert.equal((await post({ action: 'guess', room, token: B, code: '9871' })).status, 200);

// no repeating your own guess
assert.equal((await post({ action: 'guess', room, token: A, code: '9871' })).status, 400);

// --- second mover always gets a reply (no first-move win) ----------------
await post({ action: 'guess', room, token: A, code: '9876' }); // A cracks B's code
state = (await get(room, A)).body.state;
assert.equal(state.phase, 'playing', 'B must still get to answer in the same round');
assert.equal(state.toMove, 'B');
assert.equal((await post({ action: 'guess', room, token: A, code: '1357' })).status, 409);

const final = await post({ action: 'guess', room, token: B, code: '1234' }); // B matches
state = final.body.state;
assert.equal(state.phase, 'over');
assert.deepEqual(state.result, { outcome: 'draw', winner: null, rounds: 2 });
assert.equal(state.opponent.secret, '1234', 'codes revealed once the match is over');

// --- rematch handshake ---------------------------------------------------
state = (await post({ action: 'rematch', room, token: A })).body.state;
assert.equal(state.phase, 'over');
assert.equal(state.me.wantsRematch, true);
state = (await post({ action: 'rematch', room, token: B })).body.state;
assert.equal(state.phase, 'setup', 'both agreed, board is wiped');
assert.equal(state.epoch, 2);
assert.equal(state.me.guesses.length, 0);
assert.equal(state.me.secret, null);
assert.equal(state.me.name, 'Nardos', 'names survive a rematch');

// --- a decisive win, and simultaneous writes ----------------------------
await post({ action: 'secret', room, token: A, code: '1234' });
await post({ action: 'secret', room, token: B, code: '5678' });
await post({ action: 'guess', room, token: A, code: '5678' });
await post({ action: 'guess', room, token: B, code: '1111' }).catch(() => {});
await post({ action: 'guess', room, token: B, code: '9123' });
state = (await get(room, A)).body.state;
assert.equal(state.phase, 'over');
assert.deepEqual(state.result, { outcome: 'win', winner: 'A', rounds: 1 });

// two clients hammering the same room concurrently must not lose a write
const r2 = await post({ action: 'create', name: 'P1' });
const room2 = r2.body.room;
const A2 = r2.body.token;
const B2 = (await post({ action: 'join', room: room2, name: 'P2' })).body.token;
const results = await Promise.all([
  post({ action: 'secret', room: room2, token: A2, code: '1234' }),
  post({ action: 'secret', room: room2, token: B2, code: '5678' }),
  get(room2, A2),
  get(room2, B2),
]);
assert.ok(results.every((x) => x.status === 200), 'concurrent writes all succeed');
state = (await get(room2, A2)).body.state;
assert.equal(state.phase, 'playing', 'both secrets survived the race');
assert.equal(state.me.codeLocked, true);
assert.equal(state.opponent.codeLocked, true);

// --- leaving --------------------------------------------------------------
assert.equal((await post({ action: 'leave', room: room2, token: B2 })).status, 200);
assert.equal((await get(room2, B2)).status, 403);
assert.equal((await get(room2, A2)).body.state.phase, 'waiting');

// the survivor must be reset, or the next joiner inherits a half-played match
state = (await get(room2, A2)).body.state;
assert.equal(state.me.codeLocked, false, 'survivor secret cleared on opponent leave');
assert.equal(state.me.guesses.length, 0, 'survivor guesses cleared on opponent leave');

const C2 = (await post({ action: 'join', room: room2, name: 'Fresh' })).body.token;
state = (await get(room2, C2)).body.state;
assert.equal(state.phase, 'setup', 'a new joiner starts a clean match');
assert.equal(state.opponent.codeLocked, false);
assert.equal(state.opponent.guesses.length, 0);

// --- declining a rematch frees the seat ----------------------------------
const r3 = await post({ action: 'create', name: 'P1' });
const room3 = r3.body.room;
const A3 = r3.body.token;
const B3 = (await post({ action: 'join', room: room3, name: 'P2' })).body.token;
await post({ action: 'secret', room: room3, token: A3, code: '1234' });
await post({ action: 'secret', room: room3, token: B3, code: '5678' });
await post({ action: 'guess', room: room3, token: A3, code: '5678' });
await post({ action: 'guess', room: room3, token: B3, code: '9123' });
assert.equal((await get(room3, A3)).body.state.phase, 'over');

// A asks, B declines by leaving
await post({ action: 'rematch', room: room3, token: A3, want: true });
assert.equal((await get(room3, A3)).body.state.me.wantsRematch, true);
assert.equal((await get(room3, B3)).body.state.opponent.wantsRematch, true,
  'the other player can see the request');
await post({ action: 'rematch', room: room3, token: B3, want: false });
await post({ action: 'leave', room: room3, token: B3 });
state = (await get(room3, A3)).body.state;
assert.equal(state.opponent, null, 'declining frees the seat');
assert.equal(state.phase, 'waiting');
assert.equal(state.me.wantsRematch, false, 'the stale request is cleared too');

assert.equal((await post({ action: 'nonsense' })).status, 400);
assert.equal((await call('PUT', { body: {} })).status, 405);

console.log('all api assertions passed');
