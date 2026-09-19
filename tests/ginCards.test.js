import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardValue, candidateMelds, bestMelds, layoffs } from '../tools/gin/cards.mjs';

// '7h' -> { id: '7-hearts-0', rank: '7', suit: 'hearts' } - Recard's own id shape.
const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => {
  const rank = short.slice(0, -1);
  const suit = SUITS[short.at(-1)];
  return { id: `${rank}-${suit}-0`, rank, suit };
};
const hand = (text) => text.split(' ').map((short) => card(short));
const ids = (cards) => cards.map((c) => c.id).toSorted();

test('cardValue: ace 1, pips face value, court cards 10', () => {
  assert.deepEqual(hand('Ah 2c 7d 10s Jh Qc Kd').map((c) => cardValue(c)), [1, 2, 7, 10, 10, 10, 10]);
});

test('candidateMelds: every set of 3-4 of a rank and every run of 3+ in a suit, ace low only', () => {
  const short = (meld) => meld.cards.map((c) => c.rank + c.suit[0]).join(',');
  const described = candidateMelds(hand('7h 7s 7d 7c Ah 2h 3h Qd Kd As')).map((m) => `${m.kind}:${short(m)}`).toSorted();
  assert.deepEqual(described, [
    'run:Ah,2h,3h',
    'set:7c,7d,7h',
    'set:7c,7d,7h,7s',
    'set:7c,7d,7s',
    'set:7c,7h,7s',
    'set:7d,7h,7s',
  ], 'Q-K-A is not a run: aces are low');
});

test('bestMelds: resolves a card that fits a set AND a run by total deadwood, not greedily', () => {
  // Greedy "take the 4-set" leaves 8h 9h as 17 deadwood; the exact
  // answer splits the sevens: 7s-7d-7c set + 7h-8h-9h run = gin.
  const result = bestMelds(hand('7h 7s 7d 7c 8h 9h'));
  assert.equal(result.deadwoodPoints, 0);
  assert.equal(result.melds.length, 2);
});

test('bestMelds: when a card can only serve one meld, keeps the arrangement with less deadwood', () => {
  // Set 7-7-7 leaves 8h 9h (17); run 7h-8h-9h leaves 7s 7d (14).
  const result = bestMelds(hand('7h 7s 7d 8h 9h'));
  assert.equal(result.deadwoodPoints, 14);
  assert.deepEqual(ids(result.deadwood), ids(hand('7s 7d')));
});

test('bestMelds: a 10-card gin hand has zero deadwood; unmelded cards all count', () => {
  assert.equal(bestMelds(hand('Ah 2h 3h 4h 9c 9d 9s Js Qs Ks')).deadwoodPoints, 0);
  const loose = bestMelds(hand('Ah 3c 5d 7s 9h Jc Kd 2s 4h 6c'));
  assert.equal(loose.melds.length, 0);
  assert.equal(loose.deadwoodPoints, 1 + 3 + 5 + 7 + 9 + 10 + 10 + 2 + 4 + 6);
});

test('layoffs: cards that extend a run at either end (chained) or complete a set', () => {
  const melds = [{ kind: 'run', cards: hand('5s 6s 7s') }, { kind: 'set', cards: hand('9c 9d 9s') }];
  const laid = layoffs(hand('3s 4s 8s 9h Kc'), melds);
  assert.deepEqual(ids(laid), ids(hand('3s 4s 8s 9h')),
    '3s lays off after 4s extends the run - lay-offs chain');
  assert.deepEqual(layoffs(hand('Kc 2d'), melds), []);
});
