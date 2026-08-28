import test from 'node:test';
import assert from 'node:assert/strict';

import { faceFor, typeLine, CARD_FACES } from '../src/cards/cardFaces.js';

const standardCard = { id: 'A-spades-0', rank: 'A', suit: 'spades' };
const rtgCreature = {
  id: 'rtg-w-001', face: 'rtg', name: 'Dawnbreak Recruit', cost: '{W}',
  symbols: ['W'], colors: ['W'], cmc: 1, type: 'Creature',
  subtype: 'Human Soldier', power: 2, toughness: 1, text: '', flavor: 'lore',
};

// --- faceFor -----------------------------------------------------------
//
// D76: the whole point of the registry is that an unmarked card renders
// EXACTLY as it always did. Every existing preset ships cards with no
// `face` field at all.

test('faceFor: a card with no face falls back to standard', () => {
  assert.equal(faceFor(standardCard), CARD_FACES.standard);
});

test('faceFor: an rtg card selects the rtg face', () => {
  assert.equal(faceFor(rtgCreature), CARD_FACES.rtg);
});

test('faceFor: an unknown face falls back to standard rather than throwing', () => {
  // A card from a future deck type must degrade to something renderable,
  // not blank the table.
  assert.equal(faceFor({ id: 'x', face: 'holographic' }), CARD_FACES.standard);
});

// --- typeLine ----------------------------------------------------------

test('typeLine: joins type and subtype with an em dash, like a real card', () => {
  assert.equal(typeLine(rtgCreature), 'Creature — Human Soldier');
});

test('typeLine: a card with no subtype is just its type', () => {
  assert.equal(typeLine({ type: 'Instant' }), 'Instant');
});

test('typeLine: a basic land keeps its full printed subtype', () => {
  assert.equal(
    typeLine({ type: 'Land', subtype: 'Basic Land — Plains' }),
    'Land — Basic Land — Plains',
  );
});

// --- registry shape ----------------------------------------------------

test('every registered face exposes a render function', () => {
  // Mirrors how PILE_TYPES/ZONE_TYPES/DECK_TYPES are contract-checked:
  // a face that forgets `render` would fail at paint time, per card.
  for (const [name, face] of Object.entries(CARD_FACES)) {
    assert.equal(typeof face.render, 'function', `${name} must have render()`);
  }
});
