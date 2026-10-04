import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureHand } from '../tools/gin/scoring.mjs';

// Same card/hand helpers as ginCards.test.js - Recard's own id shape.
const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => {
  const rank = short.slice(0, -1);
  const suit = SUITS[short.at(-1)];
  return { id: `${rank}-${suit}-0`, rank, suit };
};
const hand = (text) => text.split(' ').map((short) => card(short));

// measureHand is RAW NUMBERS only (deadwood + lay-off) - no winner, no
// points, no bonus. Those decisions are games/gin/scoring.yaml's own
// named states now (tests/ginScoreMachine.test.js), not this function's
// job - direct user request: keep meld-finding in code, make the SCORING
// RULES themselves XState, not a branch buried in a function.

test('a clean knock: deadwood numbers only, no opponent cards to lay off', () => {
  const result = measureHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // 7-set (0) + 2-3-4c run (0) + 5s deadwood (5)
    opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h'), // no melds at all: 10+10+10+9+8+6+4 = 57, none layable
    outcome: 'knock',
  });
  assert.equal(result.knockerDeadwood, 5);
  assert.equal(result.opponentDeadwoodBeforeLayoff, 57);
  assert.equal(result.laidOff, 0);
  assert.equal(result.opponentDeadwoodAfterLayoff, 57);
});

test('a knock the opponent can lay off against, reducing their own deadwood', () => {
  const result = measureHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // 7-set + 2-3-4c run, deadwood 5s=5
    opponentHand: hand('5c Kd Qs Jh 9c 8d 6h'), // 5c extends 2c-3c-4c-5c run; rest deadwood 10+10+10+9+8+6=53
    outcome: 'knock',
  });
  assert.equal(result.laidOff, 1, 'the 5c lays off onto the run');
  assert.equal(result.opponentDeadwoodBeforeLayoff, 58);
  assert.equal(result.opponentDeadwoodAfterLayoff, 53, '58 - 5 (the laid-off 5c)');
});

test('an opponent hand that already melds to 0 needs no lay-off at all', () => {
  const result = measureHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c Kd'), // 7-set(0) + 2c-3c-4c run(0), deadwood Kd=10
    opponentHand: hand('8h 8s 8d 9c 10c Jc Qc'), // 8-set(0) + 9c-10c-Jc-Qc run(0) - 0 deadwood
    outcome: 'knock',
  });
  assert.equal(result.knockerDeadwood, 10);
  assert.equal(result.opponentDeadwoodAfterLayoff, 0);
});

test('gin: the opponent may NOT lay off, even onto a meld a card of theirs would otherwise extend', () => {
  const result = measureHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5c'), // 7-set(0) + 2c-3c-4c-5c run(0), deadwood 0 - gin
    // 6c WOULD extend the 2c-3c-4c-5c run to 6c if layoff were allowed (removing 6 points) -
    // proves this is forbidden specifically, not just that no layoff was available.
    opponentHand: hand('6c Kd Qs Jh 9h 8d 4h'),
    outcome: 'gin',
  });
  assert.equal(result.knockerDeadwood, 0);
  assert.equal(result.laidOff, 0, 'no lay-off is ever allowed against gin');
  assert.equal(result.opponentDeadwoodBeforeLayoff, 57, '6+10+10+10+9+8+4');
  assert.equal(result.opponentDeadwoodAfterLayoff, 57, 'unchanged - the 6c stays dead, gin forbids laying it off');
});
