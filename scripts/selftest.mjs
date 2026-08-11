import assert from 'node:assert/strict';
import {
  validateCode, evaluate, allCodes, randomCode, resolveMatch,
  seatToMove, currentRound, isConsistent,
} from '../shared/engine.js';
import { createCpu, LEVEL_ORDER } from '../src/cpu.js';

// --- rules -----------------------------------------------------------------
assert.equal(validateCode('1234'), null);
assert.ok(validateCode('0123'));      // zero banned
assert.ok(validateCode('1123'));      // repeat banned
assert.ok(validateCode('123'));       // too short
assert.ok(validateCode('12345'));     // too long
assert.ok(validateCode('12a4'));      // non digit

assert.deepEqual(evaluate('1234', '1234'), { value: 4, position: 4 });
assert.deepEqual(evaluate('1234', '4321'), { value: 4, position: 0 });
assert.deepEqual(evaluate('1234', '5678'), { value: 0, position: 0 });
assert.deepEqual(evaluate('1234', '1567'), { value: 1, position: 1 });
assert.deepEqual(evaluate('1234', '2156'), { value: 2, position: 0 });
// symmetric: it must not matter which side is the secret
for (let i = 0; i < 500; i += 1) {
  const a = randomCode(); const b = randomCode();
  assert.deepEqual(evaluate(a, b), evaluate(b, a));
}
const space = allCodes();
assert.equal(space.length, 3024);
assert.equal(new Set(space).size, 3024);
assert.ok(space.every((c) => validateCode(c) === null));

// --- turn order & resolution ----------------------------------------------
assert.equal(seatToMove(0, 0), 'A');
assert.equal(seatToMove(1, 0), 'B');
assert.equal(currentRound(0, 0), 1);
assert.equal(currentRound(2, 2), 3);
assert.equal(currentRound(3, 2), 3);

const crack = { guess: '1234', value: 4, position: 4 };
const miss = { guess: '5678', value: 0, position: 0 };
assert.equal(resolveMatch([crack], []), null);            // round not complete
assert.equal(resolveMatch([miss], [miss]), null);          // nobody home
assert.deepEqual(resolveMatch([crack], [miss]), { outcome: 'win', winner: 'A', rounds: 1 });
assert.deepEqual(resolveMatch([miss], [crack]), { outcome: 'win', winner: 'B', rounds: 1 });
assert.deepEqual(resolveMatch([crack], [crack]), { outcome: 'draw', winner: null, rounds: 1 });
assert.deepEqual(
  resolveMatch([miss, crack], [miss, miss]),
  { outcome: 'win', winner: 'A', rounds: 2 },
);

// --- CPU strength ---------------------------------------------------------
function playSolo(levelId, secret) {
  const cpu = createCpu(levelId);
  const history = [];
  for (let round = 1; round <= 40; round += 1) {
    const guess = cpu.nextGuess(history);
    const score = evaluate(secret, guess);
    history.push({ guess, ...score });
    assert.ok(isConsistent(secret, history), 'secret must stay consistent with its own clues');
    if (score.position === 4) return round;
  }
  return Infinity;
}

const RUNS = 220;
console.log('level   avg rounds   worst   solved<=8   ms/game');
for (const levelId of LEVEL_ORDER) {
  const rounds = [];
  const t0 = performance.now();
  for (let i = 0; i < RUNS; i += 1) rounds.push(playSolo(levelId, randomCode()));
  const ms = (performance.now() - t0) / RUNS;
  const solved = rounds.filter((r) => r !== Infinity);
  const avg = solved.reduce((s, r) => s + r, 0) / solved.length;
  const worst = Math.max(...solved);
  const fast = rounds.filter((r) => r <= 8).length / RUNS;
  assert.equal(solved.length, RUNS, `${levelId} failed to solve some games`);
  console.log(
    `${levelId.padEnd(8)}${avg.toFixed(2).padStart(9)}${String(worst).padStart(8)}` +
    `${(fast * 100).toFixed(0).padStart(11)}%${ms.toFixed(1).padStart(10)}`,
  );
}

console.log('\nall engine + cpu assertions passed');
