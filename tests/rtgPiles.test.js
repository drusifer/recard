import test from 'node:test';
import assert from 'node:assert/strict';

import { PILE_TYPES, CHANGE_PILE_TYPE_KINDS } from '../src/piles/pileTypes.js';
import { BattlefieldPile } from '../src/piles/BattlefieldPile.js';
import { ExilePile } from '../src/piles/ExilePile.js';
import { StackPile } from '../src/piles/StackPile.js';
import { LandsPile } from '../src/piles/LandsPile.js';
import { reduce } from '../src/state.js';

const shared = { isOwner: false, isShared: true, cards: [] };
const stranger = { isOwner: false, isShared: false, cards: [] };

// --- registry ----------------------------------------------------------

test('PILE_TYPES: the three MTG pile kinds are registered', () => {
  assert.equal(PILE_TYPES.battlefield, BattlefieldPile);
  assert.equal(PILE_TYPES.exile, ExilePile);
  assert.equal(PILE_TYPES.stack, StackPile);
});

test('CHANGE_PILE_TYPE_KINDS: the three MTG kinds are eligible', () => {
  for (const kind of ['battlefield', 'exile', 'stack']) {
    assert.ok(CHANGE_PILE_TYPE_KINDS.includes(kind), kind);
  }
});

// --- BattlefieldPile ---------------------------------------------------

test('BattlefieldPile: a permanent can be tapped, moved and picked up', () => {
  // Tapping IS `rotate` (D76 note): the battlefield is the one pile
  // where it's the primary interaction, so it must stay offered.
  const card = { id: 'c1', faceUp: true, owner: null };
  const actions = new BattlefieldPile({ kind: 'battlefield' }).pileableActions(card, 'p1');
  assert.ok(actions.includes('rotate'));
  assert.ok(actions.includes('move'));
  assert.ok(actions.includes('pickup'));
});

test('BattlefieldPile: offers untapAll, and never split or take', () => {
  const actions = new BattlefieldPile({}).pileActions(shared);
  assert.ok(actions.includes('untapAll'), 'the untap step is a real, frequent action');
  // You do not scoop up the battlefield the way you scoop a pile of
  // cards - every permanent on it belongs to a distinct game object.
  assert.ok(!actions.includes('split'));
  assert.ok(!actions.includes('take'));
});

test('BattlefieldPile: a non-owner of a personal battlefield gets nothing', () => {
  assert.deepEqual(new BattlefieldPile({}).pileActions(stranger), []);
});

// *nit (direct user request): "add tighter/looser actions to the
// battlefield pile" - offered by the base class for every ROW-laid-out
// pile kind; this pile just wasn't including them in its own override.
test('BattlefieldPile: offers tighten and loosen, disabled at the spread ceiling/floor', () => {
  const pile = new BattlefieldPile({});
  assert.ok(pile.pileActions(shared).includes('tighten'));
  assert.ok(pile.pileActions(shared).includes('loosen'));
  assert.deepEqual(pile.disabledActions(2, { spread: pile.constructor.maxSpread }).includes('tighten'), true);
  assert.deepEqual(pile.disabledActions(2, { spread: 0 }).includes('loosen'), true);
});

// --- ExilePile ---------------------------------------------------------

// *nit (direct user request, reversed): "exile is one-way" used to mean
// no card action at all (`pileableActions` always `[]`). `docs/
// ARCHITECTURE.md`'s "Core invariant" forbids that - drag-and-drop is
// always available, exile included. Exiled cards ARE face-up, and now
// get the same reveal/pickup/move/rotate as any other visible card.
test('ExilePile: exiled cards are face-up and get the same card actions as any other pile', () => {
  const faceUp = { id: 'c1', faceUp: true, owner: null };
  assert.deepEqual(new ExilePile({ kind: 'exile' }).pileableActions(faceUp, 'p1'), ['conceal', 'pickup', 'move', 'rotate']);
});

test('ExilePile: never offers take — exile cannot be scooped back', () => {
  const actions = new ExilePile({}).pileActions(shared);
  assert.ok(!actions.includes('take'));
  assert.ok(!actions.includes('split'));
});

// --- StackPile ---------------------------------------------------------

test('StackPile: is last-in-first-out — a new spell goes on top', () => {
  const pile = { id: 's', kind: 'stack', cards: [{ id: 'first' }] };
  const after = new StackPile(pile).insertPileable({ id: 'second' });
  assert.equal(after.cards[0].id, 'second', 'most recent resolves first');
});

test('StackPile: the top item can be taken off to resolve it', () => {
  const actions = new StackPile({ kind: 'stack' }).pileableActions({ id: 'c', faceUp: true }, 'p1');
  assert.ok(actions.includes('move'), 'resolving = moving it to wherever it goes');
});

// --- UNTAP_ALL reducer -------------------------------------------------

function stateWithBattlefield(cards) {
  return {
    players: [{ id: 'p1', name: 'P1' }],
    piles: [{ id: 'bf-p1', kind: 'battlefield', ownerId: 'p1', cards }],
    zones: [],
    scores: {},
  };
}

test('UNTAP_ALL: every tapped permanent returns to portrait', () => {
  const state = stateWithBattlefield([
    { id: 'a', orientation: 'landscape' },
    { id: 'b', orientation: 'portrait' },
    { id: 'c', orientation: 'landscape' },
  ]);
  const after = reduce(state, { type: 'UNTAP_ALL', pileId: 'bf-p1', playerId: 'p1' });
  assert.deepEqual(after.piles[0].cards.map((c) => c.orientation), ['portrait', 'portrait', 'portrait']);
});

test('UNTAP_ALL: does not mutate the input state', () => {
  const state = stateWithBattlefield([{ id: 'a', orientation: 'landscape' }]);
  reduce(state, { type: 'UNTAP_ALL', pileId: 'bf-p1', playerId: 'p1' });
  assert.equal(state.piles[0].cards[0].orientation, 'landscape');
});

test('UNTAP_ALL: an empty battlefield is a harmless no-op, not an error', () => {
  const state = stateWithBattlefield([]);
  assert.doesNotThrow(() => reduce(state, { type: 'UNTAP_ALL', pileId: 'bf-p1', playerId: 'p1' }));
});

test('UNTAP_ALL: rejects an unknown pile', () => {
  const state = stateWithBattlefield([]);
  assert.throws(
    () => reduce(state, { type: 'UNTAP_ALL', pileId: 'nope', playerId: 'p1' }),
    /nope/,
  );
});

test('UNTAP_ALL: a non-owner cannot untap someone else\'s battlefield', () => {
  const state = stateWithBattlefield([{ id: 'a', orientation: 'landscape' }]);
  assert.throws(
    () => reduce(state, { type: 'UNTAP_ALL', pileId: 'bf-p1', playerId: 'p2' }),
    /authoriz/i,
  );
});

// --- LandsPile -----------------------------------------------------------

// Direct user request: "I want to organize my lands by color, each
// color stacked vertically, overlapped so it's easy to count/tap/untap"
// - reuses GroupedPile (the same shape chips/tokens already use, "one
// stack per group value, side by side"), grouped by colour.

test('LandsPile: groups by colour, deriving it from mana text for a colourless-field basic land', () => {
  const plains = { id: 'p', colors: [], text: '{T}: Add {W}.' };
  const island = { id: 'i', colors: [], text: '{T}: Add {U}.' };
  const dual = { id: 'd', colors: ['B', 'R'], text: '' };
  assert.equal(LandsPile.sortValue(plains), 'W');
  assert.equal(LandsPile.sortValue(island), 'U');
  assert.equal(LandsPile.sortValue(dual), 'B', 'multicolour groups under its FIRST colour');
});

test('LandsPile: a land with no derivable colour at all still gets a real (colourless) bucket, not undefined', () => {
  assert.equal(LandsPile.sortValue({ id: 'x', colors: [], text: 'Sacrifice: draw a card.' }), 'C');
});

test('LandsPile: offers untapAll and NOT take/split (a set of distinct permanents, not a stack to scoop)', () => {
  const actions = new LandsPile({}).pileActions(shared);
  assert.ok(actions.includes('untapAll'));
  assert.ok(actions.includes('tighten'));
  assert.ok(actions.includes('loosen'));
  assert.ok(!actions.includes('take'));
  assert.ok(!actions.includes('split'));
});

test('LandsPile: a non-owner of a personal lands pile gets nothing', () => {
  assert.deepEqual(new LandsPile({}).pileActions(stranger), []);
});

test('LandsPile.groupBadge: counts untapped lands in the group, out of the total', () => {
  const cards = [
    { id: 'a', colors: [], text: '{T}: Add {W}.' },
    { id: 'b', colors: [], text: '{T}: Add {W}.', orientation: 'landscape' },
    { id: 'c', colors: [], text: '{T}: Add {W}.' },
  ];
  const badge = LandsPile.groupBadge(cards);
  assert.equal(badge.text, '2', '2 of 3 are still portrait (untapped)');
  assert.equal(badge.className, 'pip-w');
  assert.match(badge.title, /2 of 3/);
});

test('LandsPile: PILE_TYPES registers it, and it is eligible for changePileType', () => {
  assert.equal(PILE_TYPES.lands, LandsPile);
  assert.ok(CHANGE_PILE_TYPE_KINDS.includes('lands'));
});
