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
    assert.ok(preset.cardsPerPlayer >= 1);
    assert.equal(typeof preset.usesMiddle, 'boolean');
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
