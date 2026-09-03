import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeck } from '../src/deck.js';
import { DECK_TYPES } from '../src/decks/deckTypes.js';
import { DECKS } from '../src/decks/rtg/catalog.js';

test('DECK_TYPES: rtg is registered alongside standard and pinochle', () => {
  assert.ok(DECK_TYPES.rtg, 'registry entry exists');
  assert.equal(typeof DECK_TYPES.rtg.build, 'function');
});

test('buildDeck: an rtg deck is exactly 60 cards', () => {
  const deck = buildDeck({ type: 'rtg', deckList: 'rtg-mono-white' });
  assert.equal(deck.length, 60);
});

test('buildDeck: every physical card gets a unique id', () => {
  // A deck runs 4 copies of the same printed card; state keys on
  // `card.id`, so duplicate ids would make four cards act as one.
  const deck = buildDeck({ type: 'rtg', deckList: 'rtg-mono-white' });
  assert.equal(new Set(deck.map((card) => card.id)).size, 60);
});

test('buildDeck: each card keeps its printed id for art and catalog lookup', () => {
  const deck = buildDeck({ type: 'rtg', deckList: 'rtg-mono-white' });
  const recruit = deck.find((card) => card.pileableId === 'rtg-w-001');
  assert.ok(recruit, 'printed id preserved separately from the instance id');
  assert.notEqual(recruit.id, recruit.pileableId, 'instance id is distinct');
  assert.equal(recruit.name, 'Dawnbreak Recruit');
});

test('buildDeck: rtg cards carry the rtg face so they render as MTG cards', () => {
  const deck = buildDeck({ type: 'rtg', deckList: 'rtg-mono-white' });
  assert.ok(deck.every((card) => card.face === 'rtg'));
});

test('buildDeck: rtg cards carry the fields the face renders', () => {
  const deck = buildDeck({ type: 'rtg', deckList: 'rtg-mono-blue' });
  const creature = deck.find((card) => card.type === 'Creature');
  for (const field of ['name', 'cost', 'symbols', 'type', 'text', 'flavor', 'power', 'toughness']) {
    assert.ok(creature[field] !== undefined, `missing ${field}`);
  }
});

test('buildDeck: rejects an unknown deck list by name', () => {
  assert.throws(
    () => buildDeck({ type: 'rtg', deckList: 'rtg-mono-chartreuse' }),
    /rtg-mono-chartreuse/,
  );
});

test('buildDeck: defaults to the first deck when no deckList is given', () => {
  // The existing deck-config UI has no deck-list field; a preset that
  // forgets one must still produce a playable 60-card library.
  assert.equal(buildDeck({ type: 'rtg' }).length, 60);
});

test('every catalogued deck builds to 60 cards', () => {
  // Guards the catalog and the builder together: all 15 shipped decks
  // must actually be constructible, not just the one used in a preset.
  for (const deck of DECKS) {
    assert.equal(buildDeck({ type: 'rtg', deckList: deck.id }).length, 60, deck.id);
  }
});

test('buildDeck: standard decks are completely unaffected', () => {
  // The regression that matters: `deckList` is additive and must not
  // perturb any existing deck type.
  assert.equal(buildDeck().length, 52);
  assert.equal(buildDeck({ type: 'standard', jokers: 2 }).length, 54);
});
