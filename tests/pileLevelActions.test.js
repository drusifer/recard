import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_SPECS, pileLevelActions, actionsForCard, targetsForAction } from '../src/pileActions.js';

const deck = { id: 'deck', kind: 'deck', ownerId: null };

// UPDATED for D34 (Sprint 12): Draw generalized from a dead per-card
// action to a pile-level one offered to EVERYONE, not just the host -
// the deck's host-only set (deal/reshuffleDeal) is now a subset of a
// larger, open list rather than the whole list. Kept as an update
// rather than deleted so the widened surface stays visible in the
// suite, matching how Sprint 11 handled D26->D31.
test('the deck offers the host dealing actions, plus draw which is open to everyone', () => {
  const actions = pileLevelActions('deck', { isHost: true });
  assert.ok(actions.includes('deal') && actions.includes('reshuffleDeal'), 'host keeps dealing actions');
  assert.ok(actions.includes('draw'), 'draw is now also pile-level, D34');
});

// UPDATED for D34: a guest gets nothing DEAL-related (host-only,
// unchanged) but DOES now get Draw - drawing your own card was never
// something that needed host authorization in the first place.
test('a guest gets draw on the deck, but nothing deal-related - dealing stays host-only', () => {
  const actions = pileLevelActions('deck', { isHost: false });
  assert.deepEqual(actions, ['draw']);
});

test('hands and zones have no pile-level actions', () => {
  // Deliberately narrow: this table exists for dealing, and inventing
  // pile-level actions for zones "while we are here" would put controls
  // on screen that no story asked for.
  for (const kind of ['hand', 'zone', 'nonsense']) {
    assert.deepEqual(pileLevelActions(kind, { isHost: true }), [], `${kind} must offer nothing`);
  }
});

// UPDATED for D34: `draw` itself moved OFF the per-card table onto
// the pile-level one (this file's own later test covers the move) -
// the deck's per-card table is now empty, not `['draw']`. The
// underlying point of D29 this test protected - a pile-level action
// can never leak into the per-card hover row - still holds and is
// covered by the newer test below.
test('the per-card action table has nothing for the deck (D29/D34)', () => {
  // `deal`/`reshuffleDeal` never belonged here (D29); `draw` doesn't
  // either any more (D34) - the deck's per-card table is empty because
  // EVERY deck action is now pile-level, not card-level.
  assert.deepEqual(actionsForCard(deck, { id: 'c' }, 'me'), []);
});

test('every pile-level action declares a label and whether it destroys the round', () => {
  for (const id of ['deal', 'reshuffleDeal']) {
    const spec = ACTION_SPECS[id];
    assert.ok(spec, `${id} must be declared`);
    assert.ok(spec.label?.length > 0, `${id} needs a label`);
    assert.equal(typeof spec.destructive, 'boolean', `${id} must say whether it is destructive`);
  }
});

test('reshuffleDeal is marked destructive and deal is not', () => {
  // This flag is what drives the confirm and the danger styling (Smith
  // Gate 2 #1). Getting it backwards would put a confirm on the harmless
  // action and none on the one that wipes every hand.
  assert.equal(ACTION_SPECS.reshuffleDeal.destructive, true);
  assert.equal(ACTION_SPECS.deal.destructive, false);
});

// --- Sprint 12 (US-46, D34/D36) ---------------------------------------

test('D34: the hand offers pile-level actions to its own owner - sort and pass', () => {
  assert.deepEqual(pileLevelActions('hand', { isHost: false, isOwner: true }), ['sortRank', 'sortSuit', 'pass']);
});

test('D34: a hand pile offers nothing to a viewer who does not own it', () => {
  // The hand toolbar being removed doesn't mean sorting someone ELSE's
  // hand becomes possible - matches actionsForCard's existing rule that
  // only a hand's own owner gets anything from it.
  assert.deepEqual(pileLevelActions('hand', { isHost: false, isOwner: false }), []);
  assert.deepEqual(pileLevelActions('hand', { isHost: true, isOwner: false }), []);
});

test('D34: deck still offers its existing host-only actions, plus draw', () => {
  const actions = pileLevelActions('deck', { isHost: true });
  for (const id of ['deal', 'reshuffleDeal', 'draw']) {
    assert.ok(actions.includes(id), `expected "${id}" in ${JSON.stringify(actions)}`);
  }
});

test('D34: a guest gets draw from the deck, but not the host-only deal actions', () => {
  const actions = pileLevelActions('deck', { isHost: false });
  assert.ok(actions.includes('draw'), 'drawing is not host-only');
  assert.ok(!actions.includes('deal') && !actions.includes('reshuffleDeal'),
    'dealing stays host-only');
});

test('D36: draw is a STATIC single-target action, not computed from live pile counts', () => {
  // Smith Gate 2 #1: this must be a fact about the action's definition,
  // never something derived from how many piles currently exist - that
  // is exactly what would make `move` flip behaviour mid-game.
  assert.equal(ACTION_SPECS.draw.singleTarget, true);
  assert.equal(ACTION_SPECS.draw.target, 'hand');
  assert.equal(ACTION_SPECS.draw.from, 'deck');
});

test('D36 BLOCKER: move and pickup never carry singleTarget, under any circumstance', () => {
  // The regression Smith's Gate 2 correction exists to prevent: these two
  // must stay drag-first even when - especially when - a live count
  // would say "only one target right now".
  assert.equal(ACTION_SPECS.move.singleTarget, undefined);
  assert.equal(ACTION_SPECS.pickup.singleTarget, undefined);
});

test('D34: draw is no longer offered as a per-card action from the deck (moved to pile-level)', () => {
  // Confirmed dead in ui.js/main.js before removing it: the deck has
  // never rendered a per-card hover row (it renders via renderDeck, a
  // separate D29 path), so this is a real architecture correction, not
  // a behaviour change anything currently depends on.
  assert.deepEqual(actionsForCard(deck, { id: 'c' }, 'me'), []);
});

// --- Phase 56 (Sprint 12, T56.1): shuffle/split join the deck's
// pile-level table, moving off their standalone button row. ---------

test('Phase 56: the deck offers shuffle/split to the host, alongside deal/reshuffleDeal/draw', () => {
  const actions = pileLevelActions('deck', { isHost: true });
  for (const id of ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split']) {
    assert.ok(actions.includes(id), `expected "${id}" in ${JSON.stringify(actions)}`);
  }
});

test('Phase 56: shuffle/split stay host-only, exactly like deal/reshuffleDeal', () => {
  const actions = pileLevelActions('deck', { isHost: false });
  assert.deepEqual(actions, ['draw']);
  assert.ok(!actions.includes('shuffle') && !actions.includes('split'));
});

test('Phase 56: shuffle and split are declared with a label and hint, and neither is destructive', () => {
  for (const id of ['shuffle', 'split']) {
    const spec = ACTION_SPECS[id];
    assert.ok(spec, `${id} must be declared`);
    assert.ok(spec.label?.length > 0, `${id} needs a label`);
    assert.ok(spec.hint?.length > 0, `${id} needs a hint`);
    assert.equal(spec.destructive, false, `${id} must not be destructive - unlike reshuffleDeal, it never clears a hand`);
  }
});

test('Phase 56: shuffle/split are never draggable - they act on the deck itself, in place', () => {
  for (const id of ['shuffle', 'split']) {
    assert.equal(ACTION_SPECS[id].target, undefined);
    assert.equal(ACTION_SPECS[id].singleTarget, undefined);
  }
});

// --- Phase 57 (T57.1): confirm, don't reimplement - move/pickup stay
// drag-first (`beginTargeting`, ui.js's `actionMenuEl`) even in the
// EXACT early-game shape (2 zones total) that would have tempted a
// live-computed singleTarget to misfire (Smith Gate 2 #1). D36's own
// BLOCKER test already locks the static field; this locks the live
// geometry that made the risk concrete, not hypothetical. ---

test('Phase 57: a 2-zone early game gives move exactly ONE legal target - the exact shape Gate 2 warned about', () => {
  // Two zones total (the minimum any real game has - a shared zone plus
  // one player's own), moving a card OUT of one of them: only the other
  // zone can legally receive it, so `targetsForAction` genuinely returns
  // a single-element list here - this is not a contrived edge case.
  const piles = [
    { id: 'table', kind: 'zone', ownerId: null },
    { id: 'alice-personal', kind: 'zone', ownerId: 'alice' },
  ];
  const targets = targetsForAction('move', piles, { viewerId: 'alice', fromPileId: 'table' });
  assert.deepEqual(targets, ['alice-personal'],
    'exactly one target - the live shape that would tempt a computed shortcut');
});

test('Phase 57: move stays unmarked even in that exact one-target shape - no shortcut, drag/beginTargeting only', () => {
  // The point of D36: `singleTarget` is never computed from `targets`
  // above, or from `piles.length`, or from anything live - it is a
  // static fact about the ACTION's definition, and move's definition
  // has none. Nothing in this file (or `actionMenuEl`, ui.js - it never
  // reads `singleTarget` for card-level actions at all) can make move
  // skip `beginTargeting`, no matter how few zones exist right now.
  assert.equal(ACTION_SPECS.move.singleTarget, undefined);
  assert.equal(ACTION_SPECS.pickup.singleTarget, undefined);
});
