import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, SUITS, buildDeck, shuffle, deal } from '../src/deck.js';

test('buildDeck: standard 52, no jokers, single deck', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

test('buildDeck: jokers and multiple decks scale linearly', () => {
  const deck = buildDeck({ numDecks: 2, jokers: 2 });
  assert.equal(deck.length, 52 * 2 + 2 * 2);
  const jokerCount = deck.filter((c) => c.rank === 'JOKER').length;
  assert.equal(jokerCount, 4);
});

test('buildDeck: every card has a rank and suit (jokers excepted)', () => {
  const deck = buildDeck();
  for (const card of deck) {
    assert.ok(RANKS.includes(card.rank));
    assert.ok(SUITS.includes(card.suit));
  }
});

test('shuffle: returns same cards in a (likely) different order, does not mutate input', () => {
  const deck = buildDeck();
  const original = [...deck];
  const rng = mulberry32(42);
  const shuffled = shuffle(deck, rng);

  assert.deepEqual(deck, original, 'shuffle must not mutate its input');
  assert.equal(shuffled.length, deck.length);
  assert.deepEqual(
    [...shuffled].sort((a, b) => a.id.localeCompare(b.id)),
    [...deck].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.notDeepEqual(shuffled, deck, 'a real shuffle should reorder a 52-card deck');
});

test('shuffle: deterministic given the same rng seed', () => {
  const deckA = buildDeck();
  const deckB = buildDeck();
  const shuffledA = shuffle(deckA, mulberry32(7));
  const shuffledB = shuffle(deckB, mulberry32(7));
  assert.deepEqual(shuffledA, shuffledB);
});

test('deal: distributes round-robin and returns correct remainder', () => {
  const deck = buildDeck();
  const { hands, remaining } = deal(deck, 4, 5);

  assert.equal(hands.length, 4);
  for (const hand of hands) assert.equal(hand.length, 5);
  assert.equal(remaining.length, 52 - 4 * 5);

  const dealtIds = hands.flat().map((c) => c.id);
  assert.equal(new Set(dealtIds).size, 20, 'no card dealt twice');
  for (const card of remaining) assert.ok(!dealtIds.includes(card.id));
});

test('deal: throws if asking for more cards than the deck has', () => {
  const deck = buildDeck();
  assert.throws(() => deal(deck, 4, 14));
});

function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
