import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHand } from '../tools/gin/scoring.mjs';

// Same card/hand helpers as ginCards.test.js - Recard's own id shape.
const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => {
  const rank = short.slice(0, -1);
  const suit = SUITS[short.at(-1)];
  return { id: `${rank}-${suit}-0`, rank, suit };
};
const hand = (text) => text.split(' ').map((short) => card(short));

test('a clean knock: winner is the knocker, points are the deadwood DIFFERENCE', () => {
  // Knocker: 7-7-7 set + Q-K-A(low, not a run with Q/K)... keep it simple:
  const result = scoreHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // 7-set (0) + 2-3-4c run (0) + 5s deadwood (5)
    opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h'), // no melds at all: 10+10+10+9+8+6+4 = 57, none layable
    outcome: 'knock',
  });
  assert.equal(result.winner, 'knocker');
  assert.equal(result.knockerDeadwood, 5);
  assert.equal(result.opponentDeadwoodBeforeLayoff, 57);
  assert.equal(result.laidOff, 0);
  assert.equal(result.opponentDeadwoodAfterLayoff, 57);
  assert.equal(result.points, 52, '57 - 5, no undercut bonus');
  assert.equal(result.undercut, false);
});

test('a knock the opponent can lay off against, reducing their own deadwood', () => {
  const result = scoreHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // 7-set + 2-3-4c run, deadwood 5s=5
    // Opponent holds 7c - lays off onto the knocker's 7-set, and 2d3d(no, not same suit as run)...
    // simplest layoff: 6c completes/extends the 2c-3c-4c run (6c is not adjacent - use 5c instead,
    // but 5s is the knocker's own discard-kept card, no conflict - different card id/suit is fine).
    opponentHand: hand('5c Kd Qs Jh 9c 8d 6h'), // 5c extends 2c-3c-4c-5c run; rest deadwood 10+10+10+9+8+6=53
    outcome: 'knock',
  });
  assert.equal(result.winner, 'knocker');
  assert.equal(result.laidOff, 1, 'the 5c lays off onto the run');
  assert.equal(result.opponentDeadwoodBeforeLayoff, 58);
  assert.equal(result.opponentDeadwoodAfterLayoff, 53, '58 - 5 (the laid-off 5c)');
  assert.equal(result.points, 48, '53 - 5');
});

test('undercut: the opponent\'s deadwood, AFTER layoff, is less than or equal to the knocker\'s - opponent wins, +25', () => {
  const result = scoreHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c Kd'), // 7-set(0) + 2c-3c-4c run(0), deadwood Kd=10
    opponentHand: hand('8h 8s 8d 9c 10c Jc Qc'), // 8-set(0) + 9c-10c-Jc-Qc run(0) - 0 deadwood, no layoff even needed
    outcome: 'knock',
  });
  assert.equal(result.winner, 'opponent');
  assert.equal(result.undercut, true);
  assert.equal(result.opponentDeadwoodAfterLayoff, 0);
  assert.equal(result.points, 10 + 25, 'knocker deadwood - opponent deadwood (10-0) + the 25 undercut bonus');
});

test('gin: the opponent may NOT lay off, even onto a meld a card of theirs would otherwise extend', () => {
  const result = scoreHand({
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5c'), // 7-set(0) + 2c-3c-4c-5c run(0), deadwood 0 - gin
    // 6c WOULD extend the 2c-3c-4c-5c run to 6c if layoff were allowed (removing 6 points) -
    // proves this is forbidden specifically, not just that no layoff was available.
    opponentHand: hand('6c Kd Qs Jh 9h 8d 4h'),
    outcome: 'gin',
  });
  assert.equal(result.winner, 'knocker');
  assert.equal(result.knockerDeadwood, 0);
  assert.equal(result.laidOff, 0, 'no lay-off is ever allowed against gin');
  assert.equal(result.opponentDeadwoodBeforeLayoff, 57, '6+10+10+10+9+8+4');
  assert.equal(result.opponentDeadwoodAfterLayoff, 57, 'unchanged - the 6c stays dead, gin forbids laying it off');
  assert.equal(result.points, 57 + 25, 'full opponent deadwood (layoff forbidden) + gin bonus');
  assert.equal(result.undercut, false);
});
