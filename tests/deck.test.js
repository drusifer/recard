import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANKS, SUITS, buildDeck, shuffle, deal } from '../src/deck.js';
import { DECK_TYPES } from '../src/decks/deckTypes.js';
import * as standardDeck from '../src/decks/standardDeck.js';
import * as pinochleDeck from '../src/decks/pinochleDeck.js';

test('buildDeck: standard 52, no jokers, single deck', () => {
  const deck = buildDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((c) => c.id)).size, 52);
});

// --- D47 (Sprint 17): deck TYPE as its own concept, `DeckDefinition`
// per D38's rejected-alternative wording - proves it's a real, separate
// axis from Pile type by building a second real deck type. ---

test('DECK_TYPES registry exposes standard and pinochle', () => {
  assert.deepEqual(Object.keys(DECK_TYPES).sort(), ['pinochle', 'standard']);
  assert.equal(DECK_TYPES.standard, standardDeck);
  assert.equal(DECK_TYPES.pinochle, pinochleDeck);
});

test('buildDeck: type defaults to "standard" - matches every prior sprint\'s behavior exactly', () => {
  assert.deepEqual(buildDeck({}), buildDeck({ type: 'standard' }));
});

test('buildDeck: an unknown type throws rather than silently building nothing/something wrong', () => {
  assert.throws(() => buildDeck({ type: 'nonsense' }), /Unknown deck type/);
});

test('pinochle: 48 cards per deck - two of each 9/10/J/Q/K/A, per suit, no 2-8, no jokers', () => {
  const deck = buildDeck({ type: 'pinochle' });
  assert.equal(deck.length, 48);
  assert.equal(new Set(deck.map((c) => c.id)).size, 48, 'every card still needs a unique id, despite real duplicate ranks/suits');
  for (const card of deck) {
    assert.ok(pinochleDeck.RANKS.includes(card.rank), `${card.rank} is not a pinochle rank`);
    assert.ok(pinochleDeck.SUITS.includes(card.suit));
  }
  for (const rank of pinochleDeck.RANKS) {
    for (const suit of pinochleDeck.SUITS) {
      const count = deck.filter((c) => c.rank === rank && c.suit === suit).length;
      assert.equal(count, 2, `expected exactly 2 of ${rank}-${suit}, got ${count}`);
    }
  }
});

test('pinochle: numDecks combines whole pinochle decks, same meaning as standardDeck\'s own param', () => {
  assert.equal(buildDeck({ type: 'pinochle', numDecks: 2 }).length, 96);
});

test('pinochle: jokers is accepted but silently ignored - not a rule in this deck type', () => {
  const deck = buildDeck({ type: 'pinochle', jokers: 4 });
  assert.equal(deck.length, 48, 'jokers must not appear or change the count');
  assert.ok(!deck.some((c) => c.rank === 'JOKER'));
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
