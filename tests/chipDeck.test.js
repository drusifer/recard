import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../src/deck.js';
import { createInitialState, pilesOf } from '../src/state.js';
import { PRESETS } from '../src/presets.js';

/**
 * Sprint pileObjects, Phase 102 (US-105). A chip supply is a DECK_TYPE,
 * not a new preset schema and not a reducer change - D107's claim was
 * that a declared pile already pre-stocks through `buildDeck` (D81), so
 * this phase should touch `state.js` not at all. These tests are what
 * make that claim checkable rather than asserted.
 */

test('buildDeck: the chips deck type builds chips, not cards', () => {
  const supply = buildDeck({ type: 'chips', deckList: 'standard-chips' });
  assert.ok(supply.length > 0);
  assert.ok(supply.every((chip) => chip.pileableType === 'chip'), 'every one is a chip');
  assert.ok(supply.every((chip) => chip.id), 'every one has a unique-ish id');
  assert.equal(new Set(supply.map((chip) => chip.id)).size, supply.length, 'ids are unique');
});

// Smith Gate 1 condition A, at the supply level: a supply of identical
// discs is the failure this condition exists to prevent, so the built
// supply must actually span colours.
test('buildDeck: a chip supply spans more than one colour', () => {
  const colours = new Set(buildDeck({ type: 'chips', deckList: 'standard-chips' }).map((chip) => chip.colour));
  assert.ok(colours.size > 1, `a supply of one colour is the thing Gate 1 rejected: ${[...colours]}`);
});

test('buildDeck: the token list builds tokens carrying labels', () => {
  const tokens = buildDeck({ type: 'chips', deckList: 'standard-tokens' });
  assert.ok(tokens.every((token) => token.pileableType === 'token'));
  assert.ok(tokens.every((token) => token.label), 'a token is marked, that is what makes it a token');
});

test('buildDeck: rejects an unknown chip list by name, rather than building an empty supply', () => {
  assert.throws(() => buildDeck({ type: 'chips', deckList: 'no-such-list' }), /no-such-list/);
});

// The demonstration: the sprint's ONLY user-visible output.
test('the chips preset puts a real, stocked chip pile on the table with no manual setup', () => {
  const preset = Object.values(PRESETS).find((p) => p.piles?.some((pile) => pile.deckType === 'chips'));
  assert.ok(preset, 'a preset declares a chip supply');

  // `piles` is read from the THIRD argument (gameConfig), the same way
  // `main.js` assembles it from the chosen preset - not from the deck
  // config in the first.
  const state = createInitialState({}, () => 0.5, { piles: preset.piles, zones: preset.zones });
  const stocked = pilesOf(state).filter((pile) => pile.cards.some((item) => item.pileableType === 'chip'));
  assert.ok(stocked.length > 0, 'the chips are on the table at state creation, before anyone acts');
  assert.ok(stocked[0].cards.length > 1);
});

test('every other preset is untouched - none of them gains a chip', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (preset.piles?.some((pile) => pile.deckType === 'chips')) continue;
    const state = createInitialState({}, () => 0.5, { piles: preset.piles, zones: preset.zones });
    const chips = pilesOf(state).flatMap((pile) => pile.cards).filter((item) => item.pileableType === 'chip');
    assert.equal(chips.length, 0, `${name} must not gain chips`);
  }
});


// --- Smith's *user test findings, T102.2 -----------------------------

// BUG 2: both supply piles fell back to the default name "Pile", so
// nothing on screen said which held chips and which held tokens.
test('the chip and token supplies are NAMED, not both left as the default "Pile"', () => {
  const preset = PRESETS.find((p) => p.piles?.some((pile) => pile.deckType === 'chips'));
  const names = preset.piles.filter((pile) => pile.deckType === 'chips').map((pile) => pile.name);
  assert.ok(names.every(Boolean), `every supply declares a name, got ${JSON.stringify(names)}`);
  assert.equal(new Set(names).size, names.length, 'and they differ from each other');
});

// BUG 1: 40 chips rendered flat across three wrapped rows. A declared
// pile can carry a starting spread now, so a supply stacks the way a
// real one does - reusing D106's primitive rather than adding another.
test('a declared pile may carry a starting spread, and it reaches the built pile', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: null, count: 1, id: 'stacked', spread: 0.8 }],
  });
  assert.equal(pilesOf(state).find((pile) => pile.id === 'stacked').spread, 0.8);
});

test('a declared pile with no spread is untouched - undefined, so its type default applies', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: null, count: 1, id: 'plain-one' }],
  });
  assert.equal(pilesOf(state).find((pile) => pile.id === 'plain-one').spread, undefined);
});

test('the chip supplies declare a spread, so they stack instead of spanning the table', () => {
  const preset = PRESETS.find((p) => p.piles?.some((pile) => pile.deckType === 'chips'));
  const supplies = preset.piles.filter((p) => p.deckType === 'chips');
  for (const pile of supplies) {
    assert.ok(pile.spread > 0.5, `${pile.name} should stack, got spread ${pile.spread}`);
  }
});
