import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, actionsForPileKind, actionsForCard, targetsForAction } from '../src/pileActions.js';

const deck = { id: 'deck', kind: 'deck', ownerId: null };
const myHand = { id: 'hand:me', kind: 'hand', ownerId: 'me' };
const theirHand = { id: 'hand:you', kind: 'hand', ownerId: 'you' };
const table = { id: 'table', kind: 'zone', ownerId: null };
const myZone = { id: 'z:me', kind: 'zone', ownerId: 'me' };
const ALL = [deck, myHand, theirHand, table, myZone];

// UPDATED for D34 (Sprint 12): `draw` moved off the per-card table onto
// the pile-level one (`pileLevelActions`, tested in
// tests/pileLevelActions.test.js) - it was dead here anyway (grepped
// ui.js/main.js: the deck has never rendered a per-card hover row).
test('each pile type declares its own actions (D25/D34)', () => {
  assert.deepEqual(actionsForPileKind('deck'), [], 'every deck action is pile-level now, D34');
  assert.deepEqual(actionsForPileKind('hand'), ['play']);
  assert.deepEqual(actionsForPileKind('zone'), ['reveal', 'pickup', 'move']);
  assert.deepEqual(actionsForPileKind('nonsense'), [], 'an unknown kind offers nothing, it does not throw');
});

test('every action names a destination kind or explicitly none', () => {
  for (const [id, spec] of Object.entries(ACTIONS)) {
    assert.ok(spec.label, `${id} needs a label`);
    assert.ok(spec.target === null || ['hand', 'zone'].includes(spec.target), `${id} target`);
  }
});

test('a hand offers actions only to its own owner', () => {
  assert.deepEqual(actionsForCard(myHand, { id: 'c' }, 'me'), ['play']);
  assert.deepEqual(actionsForCard(theirHand, { id: 'c' }, 'me'), [],
    "another player's hand offers you nothing");
});

test('a face-up zone card can be picked up or moved, but not turned over', () => {
  assert.deepEqual(actionsForCard(table, { faceUp: true, owner: null }, 'me'), ['pickup', 'move']);
});

test('a shared face-down card: anyone may turn it over or move it, nobody may pick it up', () => {
  const card = { faceDown: true, owner: null };
  assert.deepEqual(actionsForCard(table, card, 'me'), ['reveal', 'move']);
  assert.deepEqual(actionsForCard(table, card, 'someone-else'), ['reveal', 'move'],
    '"put or take is open to all" (US-19) applies to unowned face-down cards');
});

test("someone else's still-hidden private card offers nothing (matches the reducer)", () => {
  const card = { faceDown: true, owner: 'you' };
  assert.deepEqual(actionsForCard(table, card, 'me'), [],
    'a non-owner can neither reveal nor move it - offering either would be a lie');
  assert.deepEqual(actionsForCard(table, card, 'you'), ['reveal', 'move'],
    'but its owner can do both');
});

test('targets: play and move light up zones, pickup lights up your own hand', () => {
  assert.deepEqual(targetsForAction('play', ALL, { viewerId: 'me' }), ['table', 'z:me']);
  assert.deepEqual(targetsForAction('pickup', ALL, { viewerId: 'me' }), ['hand:me'],
    "never another player's hand");
});

// D35: draw's spec now lives in PILE_ACTIONS, not ACTIONS - this proves
// targetsForAction actually checks both tables rather than silently
// returning no targets for a pile-level action (which would mean a
// dragged Draw could never light up anywhere to drop it).
test('targets: draw (now pile-level, D34) still lights up your own hand via targetsForAction', () => {
  assert.deepEqual(targetsForAction('draw', ALL, { viewerId: 'me' }), ['hand:me']);
});

test('move excludes the pile the card already sits in', () => {
  assert.deepEqual(
    targetsForAction('move', ALL, { viewerId: 'me', fromPileId: 'table' }),
    ['z:me'],
    'lighting up the pile it is already in would offer a no-op',
  );
});

test('an in-place action has no targets to highlight', () => {
  assert.deepEqual(targetsForAction('reveal', ALL, { viewerId: 'me' }), []);
  assert.deepEqual(targetsForAction('not-an-action', ALL, { viewerId: 'me' }), []);
});
