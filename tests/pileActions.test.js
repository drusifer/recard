import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_SPECS, actionsForCard, targetsForAction, resolveDropTargetFor } from '../src/pileActions.js';

const deck = { id: 'deck', kind: 'deck', ownerId: null };
const myHand = { id: 'hand:me', kind: 'hand', ownerId: 'me' };
const theirHand = { id: 'hand:you', kind: 'hand', ownerId: 'you' };
const table = { id: 'table', kind: 'plain', ownerId: null };
const myPlainPile = { id: 'z:me', kind: 'plain', ownerId: 'me' };
const discard = { id: 'discard', kind: 'discard', ownerId: null };
const ALL = [deck, myHand, theirHand, table, myPlainPile, discard];
const foundation = { id: 'f:hearts', kind: 'foundation', ownerId: null };
const cascade = { id: 'c:1', kind: 'cascade', ownerId: null };

// UPDATED for D42 (Sprint 13): `actionsForPileKind` (a kind-only,
// pre-ownership-filter list) is gone - each pile TYPE's `cardActions`
// now combines the kind check and the ownership/visibility filter in
// one call (src/piles/*.js, tests/piles.test.js). This test now checks
// the same three "what could this kind ever offer" facts through
// actionsForCard directly, plus that an unknown kind offers nothing
// rather than throwing.
test('each pile type declares its own actions (D25/D34/D42)', () => {
  assert.deepEqual(actionsForCard(deck, { id: 'c' }, 'me'), ['reveal', 'pickup', 'move', 'rotate'],
    'D34\'s blanket [] struck - cards can be put back on/taken off the deck like any pile');
  assert.deepEqual(actionsForCard(myHand, { id: 'c' }, 'me'), ['play']);
  assert.deepEqual(actionsForCard(table, { faceUp: true, owner: null }, 'me'), ['pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForCard({ id: 'x', kind: 'nonsense', ownerId: null }, { id: 'c' }, 'me'), [],
    'an unknown kind offers nothing, it does not throw');
});

test('every action (card-level and pile-level, ACTION_SPECS - D51) names a destination kind or explicitly none', () => {
  for (const [id, spec] of Object.entries(ACTION_SPECS)) {
    assert.ok(spec.label, `${id} needs a label`);
    assert.ok(spec.target === null || spec.target === undefined || ['hand', 'table'].includes(spec.target), `${id} target`);
  }
});

test('every action has an icon (UX follow-up: buttons are icon-only now, label/hint became tooltip text)', () => {
  for (const [id, spec] of Object.entries(ACTION_SPECS)) {
    assert.ok(spec.icon && spec.icon.length > 0, `${id} needs an icon`);
  }
});

// *nit (direct user request, D83, "fully permissive drag and drop...
// including hand"): a non-owner used to get nothing on someone else's
// hand card - now gets 'move' (MOVE_CARD finds a card in any pile by
// id, so this genuinely works). The owner still gets 'play', not
// 'move' - a naming necessity (PLAY's own authorization needs the
// literal string 'play'), not a remaining restriction.
test('a hand offers play to its own owner, move to anyone else', () => {
  assert.deepEqual(actionsForCard(myHand, { id: 'c' }, 'me'), ['play']);
  assert.deepEqual(actionsForCard(theirHand, { id: 'c' }, 'me'), ['move'],
    "another player's hand card can still be dragged away, just not 'played'");
});

test('a face-up zone card can be picked up or moved, but not turned over', () => {
  assert.deepEqual(actionsForCard(table, { faceUp: true, owner: null }, 'me'), ['pickup', 'move', 'rotate']);
});

test('a shared face-down card: anyone may turn it over, pick it up, or move it - no ownership to exclude anyone', () => {
  const card = { faceUp: false, owner: null };
  assert.deepEqual(actionsForCard(table, card, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForCard(table, card, 'someone-else'), ['reveal', 'pickup', 'move', 'rotate'],
    '"put or take is open to all" (US-19) applies to unowned face-down cards');
});

// *nit (direct user request, D83): someone else's still-hidden PRIVATE
// card used to offer nothing to a non-owner - no ownership check is
// left in cardActions at all now, so this is identical to the shared
// (unowned) case above.
test("someone else's still-hidden private card is fully actionable now, same as a shared one", () => {
  const card = { faceUp: false, owner: 'you' };
  assert.deepEqual(actionsForCard(table, card, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForCard(table, card, 'you'), ['reveal', 'pickup', 'move', 'rotate'],
    'and its owner, same as ever');
});

test('targets: play and move light up every table-side pile (zones, discard AND deck - D45/UX follow-up), pickup lights up your own hand', () => {
  assert.deepEqual(targetsForAction('play', ALL, { viewerId: 'me' }), ['deck', 'table', 'z:me', 'discard']);
  assert.deepEqual(targetsForAction('pickup', ALL, { viewerId: 'me' }), ['hand:me'],
    "never another player's hand");
});

// D35/D51: draw is a pile-level action (no card to hover) - this proves
// targetsForAction resolves it through the same ACTION_SPECS lookup a
// card-level action gets, rather than silently returning no targets
// (which would mean a dragged Draw could never light up anywhere to
// drop it).
test('targets: draw (pile-level, D34) still lights up your own hand via targetsForAction', () => {
  assert.deepEqual(targetsForAction('draw', ALL, { viewerId: 'me' }), ['hand:me']);
});

test('move excludes the pile the card already sits in', () => {
  assert.deepEqual(
    targetsForAction('move', ALL, { viewerId: 'me', fromPileId: 'table' }),
    ['deck', 'z:me', 'discard'],
    'lighting up the pile it is already in would offer a no-op',
  );
});

test('an in-place action has no targets to highlight', () => {
  assert.deepEqual(targetsForAction('reveal', ALL, { viewerId: 'me' }), []);
  assert.deepEqual(targetsForAction('not-an-action', ALL, { viewerId: 'me' }), []);
});

test('targets (D53): foundation and cascade generalize tableSide for free, same as discard did in D45', () => {
  assert.deepEqual(
    targetsForAction('move', [...ALL, foundation, cascade], { viewerId: 'me', fromPileId: 'table' }),
    ['deck', 'z:me', 'discard', 'f:hearts', 'c:1'],
  );
});

test('resolveDropTargetFor (D53): delegates to the pile module\'s own resolveDropTarget; an unknown kind resolves to no geometry, not a throw', () => {
  const point = { x: 5, y: 5 };
  const boxes = [{ cardId: 'a', left: 0, right: 10, top: 0, bottom: 10, width: 10 }];
  assert.deepEqual(resolveDropTargetFor('deck', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('discard', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('nonsense', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('plain', boxes, point),
    { targetCardId: 'a', side: 'after', layout: 'stack' });
});

