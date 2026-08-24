import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets.js';
import { RULES_REFERENCE } from '../src/rulesReference.js';
import { DECK_TYPES } from '../src/decks/deckTypes.js';
import { buildDeck } from '../src/deck.js';

test('every preset has a config the host UI can use directly', () => {
  for (const preset of PRESETS) {
    assert.ok(preset.name, 'preset needs a name');
    assert.ok(preset.numDecks >= 1);
    assert.ok(preset.jokers >= 0);
    // D53: was `>= 1` until Solitaire/Spit - both deal the whole deck
    // into declared `zones` (tableau/stock/center piles), not into a
    // traditional per-player hand, so `0` is a real, honest value here,
    // not a placeholder standing in for "no preset needs this yet".
    assert.ok(preset.cardsPerPlayer >= 0);
  }
});

test('usesMiddle is retired - no preset carries it any more', () => {
  for (const preset of PRESETS) {
    assert.equal(preset.usesMiddle, undefined, `${preset.name} should not have usesMiddle`);
  }
});

// --- D49 (Sprint 19): the preset schema extends to DeckDefinition/
// GameConfig, so a preset can actually reach a non-standard deck type
// or (later) a GameConfig field - not just deck size/deal count. ---

test('D49: type, when a preset sets one, is a real registered deck type', () => {
  for (const preset of PRESETS) {
    if (preset.type === undefined) continue; // 'standard' by omission - the common case
    assert.ok(DECK_TYPES[preset.type], `preset "${preset.name}" names an unregistered deck type "${preset.type}"`);
  }
});

test('D49: Pinochle deals from a real 48-card deck, enough for its own cardsPerPlayer x 4', () => {
  const preset = PRESETS.find((p) => p.name === 'Pinochle');
  assert.ok(preset, 'the Pinochle preset must exist');
  assert.equal(preset.type, 'pinochle');
  const deck = buildDeck({ type: preset.type, numDecks: preset.numDecks, jokers: preset.jokers });
  assert.equal(deck.length, 48);
  assert.ok(preset.cardsPerPlayer * 4 <= deck.length, 'a 4-player deal must not ask for more cards than a single pinochle deck has');
});

test('every preset has a matching rules-reference entry (Smith Gate 1: linked, not disconnected)', () => {
  for (const preset of PRESETS) {
    assert.ok(
      RULES_REFERENCE[preset.name],
      `preset "${preset.name}" has no matching entry in RULES_REFERENCE`,
    );
  }
});

test('every rules-reference entry has the same consistent shape', () => {
  for (const [name, entry] of Object.entries(RULES_REFERENCE)) {
    assert.equal(typeof entry.goal, 'string', `${name}.goal`);
    assert.equal(typeof entry.setup, 'string', `${name}.setup`);
    assert.equal(typeof entry.turns, 'string', `${name}.turns`);
    assert.ok(entry.goal.length > 0 && entry.setup.length > 0 && entry.turns.length > 0);
  }
});

// --- D53 (Sprint 22): Solitaire/Spit are the first presets that
// declare a starting `zones` layout.

test('Solitaire preset: 4 foundations + 7 cascades, shared (not per-player)', () => {
  const preset = PRESETS.find((p) => p.name === 'Solitaire');
  assert.ok(preset);
  assert.deepEqual(preset.zones, [
    { kind: 'foundation', ownerId: null, count: 4 },
    { kind: 'cascade', ownerId: null, count: 7 },
  ]);
  assert.equal(preset.cardsPerPlayer, 0, 'no traditional hand - the table IS the deal');
});

test('Spit preset: 2 shared rank-adjacent piles + a cascade per player', () => {
  const preset = PRESETS.find((p) => p.name === 'Spit');
  assert.ok(preset);
  assert.deepEqual(preset.zones, [
    { kind: 'rankAdjacent', ownerId: null, count: 2 },
    { kind: 'cascade', ownerId: 'perPlayer', count: 1 },
  ]);
});

test('every preset without a declared zones field is unaffected (undefined, not [])', () => {
  const declaresZones = ['Solitaire', 'Spit', 'Gin Rummy'];
  for (const preset of PRESETS) {
    if (declaresZones.includes(preset.name)) continue;
    assert.equal(preset.zones, undefined, `${preset.name} should not declare zones`);
  }
});

test('Gin Rummy preset: a real discard pile, declared - not the generic shared Table zone standing in for one', () => {
  const preset = PRESETS.find((p) => p.name === 'Gin Rummy');
  assert.ok(preset);
  assert.deepEqual(preset.zones, [{ kind: 'discard', ownerId: null, count: 1 }]);
});
