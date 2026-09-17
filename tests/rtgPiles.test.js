import test from 'node:test';
import assert from 'node:assert/strict';

import { PILE_TYPES, CHANGE_PILE_TYPE_KINDS } from '../src/piles/pileTypes.js';
import { BattlefieldPile } from '../src/piles/BattlefieldPile.js';
import { ExilePile } from '../src/piles/ExilePile.js';
import { StackPile } from '../src/piles/StackPile.js';
import { LandsPile } from '../src/piles/LandsPile.js';
import { reduce } from '../src/state.js';

// *fix (queued 2026-09-10, "All players have access to all pile
// actions no matter what"): `pileActions` no longer reads isOwner/
// isShared at all - only `cards` still matters.
const context = { cards: [] };

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
  const actions = new BattlefieldPile({}).pileActions(context);
  assert.ok(actions.includes('untapAll'), 'the untap step is a real, frequent action');
  // You do not scoop up the battlefield the way you scoop a pile of
  // cards - every permanent on it belongs to a distinct game object.
  assert.ok(!actions.includes('split'));
  assert.ok(!actions.includes('take'));
});

// *nit (direct user request): "add tighter/looser actions to the
// battlefield pile" - offered by the base class for every ROW-laid-out
// pile kind; this pile just wasn't including them in its own override.
// Tighten/Loosen slider (2026-09-13): one `spread` action now, bounded
// by its own slider `min`/`max` rather than a disabled-at-the-limit
// button pair.
test('BattlefieldPile: offers spread', () => {
  const pile = new BattlefieldPile({});
  assert.ok(pile.pileActions(context).includes('spread'));
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
  const actions = new ExilePile({}).pileActions(context);
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

// Test-audit gap (2026-09-11): both real, never directly exercised.
test('StackPile: resolveDropTarget offers one landing spot - no before/after halo', () => {
  assert.deepEqual(new StackPile({ kind: 'stack' }).resolveDropTarget(), {});
});

test('StackPile: pileActions offers changePileType and remove, nothing else', () => {
  assert.deepEqual(new StackPile({ kind: 'stack' }).pileActions(), ['changePileType', 'remove']);
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

// --- SET_STACK_ORIENTATION reducer (direct user request: "add
// stackaction for tap/untap, keep pile level for all stacks") -------

test('SET_STACK_ORIENTATION: taps every card in ONE stack, leaves the other stack alone', () => {
  const state = stateWithBattlefield([
    { id: 'a', stackId: 's1', orientation: 'portrait' },
    { id: 'b', stackId: 's1' },
    { id: 'c', stackId: 's2', orientation: 'portrait' },
  ]);
  const after = reduce(state, {
    type: 'SET_STACK_ORIENTATION', pileId: 'bf-p1', playerId: 'p1', stackKey: 's1', orientation: 'landscape',
  });
  const byId = Object.fromEntries(after.piles[0].cards.map((c) => [c.id, c.orientation]));
  assert.equal(byId.a, 'landscape');
  assert.equal(byId.b, 'landscape');
  assert.equal(byId.c, 'portrait', 'a different stack must not be touched');
});

test('SET_STACK_ORIENTATION: untaps one stack back to portrait', () => {
  const state = stateWithBattlefield([
    { id: 'a', stackId: 's1', orientation: 'landscape' },
    { id: 'b', stackId: 's2', orientation: 'landscape' },
  ]);
  const after = reduce(state, {
    type: 'SET_STACK_ORIENTATION', pileId: 'bf-p1', playerId: 'p1', stackKey: 's1', orientation: 'portrait',
  });
  const byId = Object.fromEntries(after.piles[0].cards.map((c) => [c.id, c.orientation]));
  assert.equal(byId.a, 'portrait');
  assert.equal(byId.b, 'landscape', 'the untouched stack keeps its own orientation');
});

test('SET_STACK_ORIENTATION: the pile\'s DEFAULT stack is addressed by its real key, not undefined', () => {
  // Same hazard `stackKeyFor`/`DEFAULT_STACK_KEY` exist to prevent
  // elsewhere: a card with no `stackId` is in the pile's one default
  // stack, and that stack must still be reachable by a real key.
  const state = stateWithBattlefield([{ id: 'a' }]);
  const after = reduce(state, {
    type: 'SET_STACK_ORIENTATION', pileId: 'bf-p1', playerId: 'p1', stackKey: '_default', orientation: 'landscape',
  });
  assert.equal(after.piles[0].cards[0].orientation, 'landscape');
});

test('SET_STACK_ORIENTATION: does not mutate the input state', () => {
  const state = stateWithBattlefield([{ id: 'a', stackId: 's1', orientation: 'portrait' }]);
  reduce(state, {
    type: 'SET_STACK_ORIENTATION', pileId: 'bf-p1', playerId: 'p1', stackKey: 's1', orientation: 'landscape',
  });
  assert.equal(state.piles[0].cards[0].orientation, 'portrait');
});

test('SET_STACK_ORIENTATION: rejects an unknown pile', () => {
  const state = stateWithBattlefield([]);
  assert.throws(
    () => reduce(state, {
      type: 'SET_STACK_ORIENTATION', pileId: 'nope', playerId: 'p1', stackKey: 's1', orientation: 'landscape',
    }),
    /nope/,
  );
});

// *fix (queued 2026-09-10, "All players have access to all pile
// actions no matter what"): SET_STACK_ORIENTATION/UNTAP_ALL used to
// throw for anyone but the pile's owner - that gate is gone.
test('SET_STACK_ORIENTATION: any player may tap/untap a stack, not just the battlefield\'s owner', () => {
  const state = stateWithBattlefield([{ id: 'a', stackId: 's1' }]);
  const after = reduce(state, {
    type: 'SET_STACK_ORIENTATION', pileId: 'bf-p1', playerId: 'someone-else', stackKey: 's1', orientation: 'landscape',
  });
  assert.equal(after.piles[0].cards[0].orientation, 'landscape');
});

test('UNTAP_ALL: any player may untap someone else\'s battlefield', () => {
  const state = stateWithBattlefield([{ id: 'a', orientation: 'landscape' }]);
  const after = reduce(state, { type: 'UNTAP_ALL', pileId: 'bf-p1', playerId: 'p2' });
  assert.equal(after.piles[0].cards[0].orientation, 'portrait');
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
  const actions = new LandsPile({}).pileActions(context);
  assert.ok(actions.includes('untapAll'));
  assert.ok(actions.includes('spread'));
  assert.ok(!actions.includes('take'));
  assert.ok(!actions.includes('split'));
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

// *nit (direct user request): "align cascades to the top" - a cascade
// reads top-down (first card at the top), unlike a chip tray's own
// bottom-up physical-stack default (`GroupedPile.stacksDownward`).
test('LandsPile: cascades grow downward from the top, unlike a chip tray', () => {
  assert.equal(LandsPile.stacksDownward, true);
});
