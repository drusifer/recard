import test from 'node:test';
import assert from 'node:assert/strict';

import { PILE_TYPES, CHANGE_PILE_TYPE_KINDS } from '../src/piles/pileTypes.js';
import { BattlefieldPile } from '../src/piles/BattlefieldPile.js';
import { ExilePile } from '../src/piles/ExilePile.js';
import { StackPile } from '../src/piles/StackPile.js';
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
  const actions = BattlefieldPile.cardActions({ kind: 'battlefield' }, card, 'p1');
  assert.ok(actions.includes('rotate'));
  assert.ok(actions.includes('move'));
  assert.ok(actions.includes('pickup'));
});

test('BattlefieldPile: offers untapAll, and never split or take', () => {
  const actions = BattlefieldPile.pileActions(shared);
  assert.ok(actions.includes('untapAll'), 'the untap step is a real, frequent action');
  // You do not scoop up the battlefield the way you scoop a pile of
  // cards - every permanent on it belongs to a distinct game object.
  assert.ok(!actions.includes('split'));
  assert.ok(!actions.includes('take'));
});

test('BattlefieldPile: a non-owner of a personal battlefield gets nothing', () => {
  assert.deepEqual(BattlefieldPile.pileActions(stranger), []);
});

// --- ExilePile ---------------------------------------------------------

// *nit (direct user request, reversed): "exile is one-way" used to mean
// no card action at all (`cardActions` always `[]`). `docs/
// ARCHITECTURE.md`'s "Core invariant" forbids that - drag-and-drop is
// always available, exile included. Exiled cards ARE face-up, and now
// get the same reveal/pickup/move/rotate as any other visible card.
test('ExilePile: exiled cards are face-up and get the same card actions as any other pile', () => {
  const faceUp = { id: 'c1', faceUp: true, owner: null };
  assert.deepEqual(ExilePile.cardActions({ kind: 'exile' }, faceUp, 'p1'), ['pickup', 'move', 'rotate']);
});

test('ExilePile: never offers take — exile cannot be scooped back', () => {
  const actions = ExilePile.pileActions(shared);
  assert.ok(!actions.includes('take'));
  assert.ok(!actions.includes('split'));
});

// --- StackPile ---------------------------------------------------------

test('StackPile: is last-in-first-out — a new spell goes on top', () => {
  const pile = { id: 's', kind: 'stack', cards: [{ id: 'first' }] };
  const after = StackPile.insertCard(pile, { id: 'second' });
  assert.equal(after.cards[0].id, 'second', 'most recent resolves first');
});

test('StackPile: the top item can be taken off to resolve it', () => {
  const actions = StackPile.cardActions({ kind: 'stack' }, { id: 'c', faceUp: true }, 'p1');
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
