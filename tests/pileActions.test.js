import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_SPECS, pileableMenuItems, actionsForPileable, targetsForAction, resolveDropTargetFor } from '../src/pileActions.js';

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
// pre-ownership-filter list) is gone - each pile TYPE's `pileableActions`
// now combines the kind check and the ownership/visibility filter in
// one call (src/piles/*.js, tests/piles.test.js). This test now checks
// the same three "what could this kind ever offer" facts through
// actionsForPileable directly, plus that an unknown kind offers nothing
// rather than throwing.
test('each pile type declares its own actions (D25/D34/D42)', () => {
  assert.deepEqual(actionsForPileable(deck, { id: 'c' }, 'me'), ['reveal', 'pickup', 'move', 'rotate'],
    'D34\'s blanket [] struck - cards can be put back on/taken off the deck like any pile');
  assert.deepEqual(actionsForPileable(myHand, { id: 'c' }, 'me'), ['move'], 'D102: was [\'play\']');
  assert.deepEqual(actionsForPileable(table, { faceUp: true, owner: null }, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForPileable({ id: 'x', kind: 'nonsense', ownerId: null }, { id: 'c' }, 'me'), [],
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
// hand card - now gets 'move' (MOVE finds a card in any pile by
// id, so this genuinely works). D102 (*nit): the owner's side says
// 'move' now too - it said 'play' only because that verb carried the
// leaving-a-hand transform, which `transferCard` applies generically
// now. Both perspectives, one verb.
test('a hand offers move on BOTH sides - its owner\'s cards and anyone else\'s (D102)', () => {
  assert.deepEqual(actionsForPileable(myHand, { id: 'c' }, 'me'), ['move']);
  assert.deepEqual(actionsForPileable(theirHand, { id: 'c' }, 'me'), ['move'],
    "another player's hand card can still be dragged away, same verb");
});

test('a face-up zone card offers conceal, never reveal - one direction each, the *nit show/hide toggle', () => {
  assert.deepEqual(actionsForPileable(table, { faceUp: true, owner: null }, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
});

test('a shared face-down card: anyone may turn it over, pick it up, or move it - no ownership to exclude anyone', () => {
  const card = { faceUp: false, owner: null };
  assert.deepEqual(actionsForPileable(table, card, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForPileable(table, card, 'someone-else'), ['reveal', 'pickup', 'move', 'rotate'],
    '"put or take is open to all" (US-19) applies to unowned face-down cards');
});

// *nit (direct user request, D83): someone else's still-hidden PRIVATE
// card used to offer nothing to a non-owner - no ownership check is
// left in pileableActions at all now, so this is identical to the shared
// (unowned) case above.
test("someone else's still-hidden private card is fully actionable now, same as a shared one", () => {
  const card = { faceUp: false, owner: 'you' };
  assert.deepEqual(actionsForPileable(table, card, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(actionsForPileable(table, card, 'you'), ['reveal', 'pickup', 'move', 'rotate'],
    'and its owner, same as ever');
});

test('targets: move lights up every table-side pile (zones, discard AND deck - D45/UX follow-up), pickup lights up your own hand', () => {
  assert.deepEqual(targetsForAction('move', ALL, { viewerId: 'me' }), ['deck', 'table', 'z:me', 'discard']);
  // D102: `play` is not a known action id any more - an unknown id
  // lights up nothing rather than throwing, same as it always did.
  assert.deepEqual(targetsForAction('play', ALL, { viewerId: 'me' }), []);
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
  const boxes = [{ pileableId: 'a', left: 0, right: 10, top: 0, bottom: 10, width: 10 }];
  assert.deepEqual(resolveDropTargetFor('deck', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('discard', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('nonsense', boxes, point), {});
  assert.deepEqual(resolveDropTargetFor('plain', boxes, point),
    { targetCardId: 'a', side: 'after', layout: 'stack' });
});



// --- pileableMenuItems (the card context menu's row model) ---
//
// *nit ("put the name of the action in the card action menu") landed as
// an untested edit to a DOM builder, which was the wrong shape for this
// codebase: every other pure decision behind `ui.js` has been extracted
// and unit-tested (`dropTarget`, `touchDrag`, `panelLayout`, `seating`,
// `layoutOverrides`, `clampMenuPosition`). This is that extraction -
// WHAT each row says and how it dispatches is pure data; only
// `document.createElement` stays in `ui.js`.
test('pileableMenuItems: every row shows the action\'s icon AND its name - the *nit, as an assertion', () => {
  const items = pileableMenuItems(['move', 'reveal']);
  assert.deepEqual(items.map((item) => item.text), ['⇄ Move', '👁 Turn over']);
});

test('pileableMenuItems: the name is also kept as tooltip/aria label, not only in the visible text', () => {
  const [item] = pileableMenuItems(['pickup']);
  assert.equal(item.label, 'Pick up');
  assert.equal(item.id, 'pickup');
});

test('pileableMenuItems: preserves the order it was given - the offer table decides ordering, not this function', () => {
  assert.deepEqual(pileableMenuItems(['rotate', 'conceal', 'move']).map((item) => item.id), ['rotate', 'conceal', 'move']);
});

// The dispatch split D101 introduced, as data: an in-place action fires
// the moment it is clicked; a targeted one needs a destination picked
// first. This was a `switch` buried inside a click handler.
test('pileableMenuItems: marks move/pickup as targeted, and the in-place actions as not', () => {
  const byId = Object.fromEntries(pileableMenuItems(['move', 'pickup', 'reveal', 'conceal', 'rotate'])
    .map((item) => [item.id, item.targeted]));
  assert.deepEqual(byId, { move: true, pickup: true, reveal: false, conceal: false, rotate: false });
});

test('pileableMenuItems: carries the destructive flag through, so the confirm gate and danger styling have one source', () => {
  assert.equal(pileableMenuItems(['move'])[0].destructive, false);
});

// A card offering an id with no spec must not put a blank row in the
// menu - `openCardContextMenu` used to index ACTION_SPECS directly and
// would have thrown on `spec.icon`.
test('pileableMenuItems: skips an unknown action id rather than rendering a blank row or throwing', () => {
  assert.deepEqual(pileableMenuItems(['move', 'no-such-action']).map((item) => item.id), ['move']);
});

test('pileableMenuItems: no actions in, no rows out', () => {
  assert.deepEqual(pileableMenuItems([]), []);
});
