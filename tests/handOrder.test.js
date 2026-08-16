import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileOrder, sortByRank, sortBySuit } from '../src/handOrder.js';

function card(id, rank, suit) {
  return { id, rank, suit };
}

test('reconcileOrder: keeps existing ids in their prior position', () => {
  const prev = ['a', 'b', 'c'];
  const current = [card('a', '2', 'clubs'), card('b', '3', 'clubs'), card('c', '4', 'clubs')];
  assert.deepEqual(reconcileOrder(prev, current), ['a', 'b', 'c']);
});

test('reconcileOrder: appends newly seen ids at the end, in arrival order', () => {
  const prev = ['a', 'b'];
  const current = [card('a', '2', 'clubs'), card('b', '3', 'clubs'), card('c', '4', 'clubs'), card('d', '5', 'clubs')];
  assert.deepEqual(reconcileOrder(prev, current), ['a', 'b', 'c', 'd']);
});

test('reconcileOrder: drops ids no longer present', () => {
  const prev = ['a', 'b', 'c'];
  const current = [card('a', '2', 'clubs'), card('c', '4', 'clubs')];
  assert.deepEqual(reconcileOrder(prev, current), ['a', 'c']);
});

test('reconcileOrder: reorders after a manual drag (moved id keeps its new prior position)', () => {
  const prev = ['b', 'a', 'c']; // caller already reordered a<->b via drag
  const current = [card('a', '2', 'clubs'), card('b', '3', 'clubs'), card('c', '4', 'clubs')];
  assert.deepEqual(reconcileOrder(prev, current), ['b', 'a', 'c']);
});

test('reconcileOrder: starting from an empty order just takes arrival order', () => {
  const current = [card('a', '2', 'clubs'), card('b', '3', 'clubs')];
  assert.deepEqual(reconcileOrder([], current), ['a', 'b']);
});

test('sortByRank: orders A through K ascending, same rank grouped by suit', () => {
  const cards = [card('kc', 'K', 'clubs'), card('ah', 'A', 'hearts'), card('2c', '2', 'clubs'), card('ac', 'A', 'clubs')];
  assert.deepEqual(sortByRank(cards), ['ac', 'ah', '2c', 'kc']);
});

test('sortByRank: JOKER always sorts last', () => {
  const cards = [card('j', 'JOKER', null), card('ac', 'A', 'clubs'), card('kc', 'K', 'clubs')];
  assert.deepEqual(sortByRank(cards), ['ac', 'kc', 'j']);
});

test('sortBySuit: groups by suit (clubs, diamonds, hearts, spades), rank ascending within suit', () => {
  const cards = [card('kh', 'K', 'hearts'), card('2c', '2', 'clubs'), card('ad', 'A', 'diamonds'), card('ac', 'A', 'clubs')];
  assert.deepEqual(sortBySuit(cards), ['ac', '2c', 'ad', 'kh']);
});

test('sortBySuit: JOKER always sorts last', () => {
  const cards = [card('j', 'JOKER', null), card('as', 'A', 'spades'), card('ac', 'A', 'clubs')];
  assert.deepEqual(sortBySuit(cards), ['ac', 'as', 'j']);
});
