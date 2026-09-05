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
  assert.deepEqual(preset.piles, [
    { kind: 'foundation', ownerId: null, count: 4 },
    { kind: 'cascade', ownerId: null, count: 7 },
  ]);
  assert.equal(preset.cardsPerPlayer, 0, 'no traditional hand - the table IS the deal');
});

test('Spit preset: 2 shared rank-adjacent piles + a cascade per player', () => {
  const preset = PRESETS.find((p) => p.name === 'Spit');
  assert.ok(preset);
  assert.deepEqual(preset.piles, [
    { kind: 'rankAdjacent', ownerId: null, count: 2 },
    { kind: 'cascade', ownerId: 'perPlayer', count: 1 },
  ]);
});

test('every preset without a declared piles field is unaffected (undefined, not [])', () => {
  // US-83 joins Solitaire/Spit as a preset that declares a starting
  // table. The guard's point is that presets which DON'T declare piles
  // stay untouched (`undefined`, never `[]`), so new declaring presets
  // get added here deliberately rather than the assertion being relaxed.
  const declaresPiles = new Set(['Solitaire', 'Spit', 'Recard the Gathering', 'Chips & Tokens',
    'Poker — 5 Card Draw', "Texas Hold'em"]);
  for (const preset of PRESETS) {
    if (declaresPiles.has(preset.name)) continue;
    assert.equal(preset.piles, undefined, `${preset.name} should not declare piles`);
  }
});

test('Gin Rummy preset: no discard pile - the game does not use one', () => {
  const preset = PRESETS.find((p) => p.name === 'Gin Rummy');
  assert.ok(preset);
  assert.equal(preset.piles, undefined);
});

// --- Deck selection at the host form (US-110, direct user request:
// "add deck selection to the start menu if the game yaml has multiple
// decks... we don't need all the decks in every game.") ---
import { filterDeckChoicePiles } from '../src/presets.js';

test('RtG declares deckChoices - one entry per catalog deck, matching its own table piles by id', () => {
  const preset = PRESETS.find((p) => p.name === 'Recard the Gathering');
  assert.ok(preset.deckChoices?.length > 1, 'RtG has more than one deck to choose from');
  const deckPileIds = new Set(preset.piles.filter((p) => p.kind === 'deck').map((p) => p.id));
  for (const choice of preset.deckChoices) {
    assert.ok(choice.id && choice.name, 'a deck choice needs both an id and a display name');
    assert.ok(deckPileIds.has(choice.id), `deckChoice "${choice.id}" must match a real declared deck pile`);
  }
});

// Direct follow-up request: "use an image from one of the powerful
// cards in each deck and show the deck colors".
test('RtG deckChoices carry colors and a signatureCard - what the picker needs to show art and colors', () => {
  const preset = PRESETS.find((p) => p.name === 'Recard the Gathering');
  for (const choice of preset.deckChoices) {
    assert.ok(choice.colors?.length > 0, `${choice.id} has no colors`);
    assert.ok(choice.signatureCard?.printedId, `${choice.id} has no signatureCard`);
  }
});

test('every OTHER preset declares no deckChoices - a preset opts in, it is never assumed', () => {
  for (const preset of PRESETS) {
    if (preset.name === 'Recard the Gathering') continue;
    assert.equal(preset.deckChoices, undefined, `${preset.name} should not declare deckChoices`);
  }
});

test('filterDeckChoicePiles: with no deckChoices on the preset, every pile passes through unfiltered', () => {
  const preset = PRESETS.find((p) => p.name === 'Spit');
  assert.deepEqual(filterDeckChoicePiles(preset, ['anything']), preset.piles);
  assert.deepEqual(filterDeckChoicePiles(preset, null), preset.piles);
});

test('filterDeckChoicePiles: chosenIds null (no selection made) keeps every declared pile, decks included', () => {
  const preset = PRESETS.find((p) => p.name === 'Recard the Gathering');
  assert.deepEqual(filterDeckChoicePiles(preset, null), preset.piles);
});

test('filterDeckChoicePiles: only the CHOSEN deck piles survive - every non-deck pile (battlefield/stack/tokens) is untouched', () => {
  const preset = PRESETS.find((p) => p.name === 'Recard the Gathering');
  const chosen = [preset.deckChoices[0].id, preset.deckChoices[1].id];
  const filtered = filterDeckChoicePiles(preset, chosen);

  const deckIdsInFiltered = filtered.filter((p) => p.kind === 'deck').map((p) => p.id);
  assert.deepEqual(deckIdsInFiltered.toSorted(), chosen.toSorted(), 'exactly the chosen decks, no others');

  const nonDeckBefore = preset.piles.filter((p) => p.kind !== 'deck');
  const nonDeckAfter = filtered.filter((p) => p.kind !== 'deck');
  assert.deepEqual(nonDeckAfter, nonDeckBefore, 'battlefield/discard/exile/stack/tokens are never gated by deck choice');
});

test('filterDeckChoicePiles: choosing every deck reproduces the original piles exactly', () => {
  const preset = PRESETS.find((p) => p.name === 'Recard the Gathering');
  const allIds = preset.deckChoices.map((d) => d.id);
  assert.deepEqual(filterDeckChoicePiles(preset, allIds), preset.piles);
});
