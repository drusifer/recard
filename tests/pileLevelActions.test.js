import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_SPECS, pileLevelActions, actionsForPileable, targetsForAction } from '../src/pileActions.js';
import { PILE_TYPES } from '../src/piles/pileTypes.js';
import { PlayerHandPile } from '../src/piles/PlayerHandPile.js';
import { sortActionsFor } from '../src/pileables/pileableTypes.js';
import { MIN_SPREAD, MAX_SPREAD } from '../src/piles/Pile.js';

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

test('hands and plain piles have no pile-level actions', () => {
  // Deliberately narrow: this table exists for dealing, and inventing
  // pile-level actions for plain piles "while we are here" would put
  // controls on screen that no story asked for.
  for (const kind of ['hand', 'plain', 'nonsense']) {
    assert.deepEqual(pileLevelActions(kind, { isHost: true }), [], `${kind} must offer nothing`);
  }
});

// D34's own premise (deck's per-card table is empty, draw is the only
// deck-shaped card action and it's pile-level) is struck by the later
// "put cards back on/take cards off the deck" correction - `deal`/
// `reshuffleDeal`/`draw` still never belong to the per-card table
// (D29's own point, still true), but the table is no longer empty: see
// `tests/piles.test.js`'s `deck pileableActions` test for the real list.

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

test('D34/D87: the hand offers pile-level actions to its own owner - sort + changePileType (pass removed, direct user request)', () => {
  // US-104: `cards` now decides whether the sorts appear at all.
  assert.deepEqual(pileLevelActions('hand', { isHost: false, isOwner: true, cards: [{ pileableType: 'card' }] }),
    ['sortRank', 'sortSuit', 'changePileType', 'tighten', 'loosen']);
});

test('D34: a hand pile offers nothing to a viewer who does not own it', () => {
  // The hand toolbar being removed doesn't mean sorting someone ELSE's
  // hand becomes possible - matches actionsForPileable's existing rule that
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

test('D34: draw is never offered as a per-card action from the deck - it stays pile-level, even now the deck has real per-card actions', () => {
  assert.ok(!actionsForPileable(deck, { id: 'c' }, 'me').includes('draw'));
});

// --- Phase 56 (Sprint 12, T56.1): shuffle joins the deck's pile-level
// table, moving off its standalone button row. `split` joined it too at
// the time, was retired pending a real picker UI, and rejoined again at
// D91 (direct user request, "add the split pile action to the Deck
// Pile type") - instant/always-half for a deck specifically (`main.js`'s
// `handlePileAction`), never the interactive picker a pile with real
// visible cards gets. ---

test('Phase 56/D91: the deck offers shuffle and split to the host, alongside deal/reshuffleDeal/draw', () => {
  const actions = pileLevelActions('deck', { isHost: true });
  for (const id of ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split']) {
    assert.ok(actions.includes(id), `expected "${id}" in ${JSON.stringify(actions)}`);
  }
});

test('Phase 56: shuffle stays host-only, exactly like deal/reshuffleDeal', () => {
  const actions = pileLevelActions('deck', { isHost: false });
  assert.deepEqual(actions, ['draw']);
  assert.ok(!actions.includes('shuffle'));
});

test('Phase 56: shuffle is declared with a label and hint, and is not destructive', () => {
  const spec = ACTION_SPECS.shuffle;
  assert.ok(spec, 'shuffle must be declared');
  assert.ok(spec.label?.length > 0, 'shuffle needs a label');
  assert.ok(spec.hint?.length > 0, 'shuffle needs a hint');
  assert.equal(spec.destructive, false, 'shuffle must not be destructive - unlike reshuffleDeal, it never clears a hand');
});

test('Phase 56: shuffle is never draggable - it acts on the deck itself, in place', () => {
  assert.equal(ACTION_SPECS.shuffle.target, undefined);
  assert.equal(ACTION_SPECS.shuffle.singleTarget, undefined);
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
    { id: 'table', kind: 'plain', ownerId: null },
    { id: 'alice-personal', kind: 'plain', ownerId: 'alice' },
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


// *nit (direct user request): "pile actions for tighten/loosen to adjust
// the overlap on fan and meld piles or runs or whatever." Which piles
// OFFER it is a per-class fact, not a kind list kept somewhere central.
test('tighten/loosen are offered by a hand - the fan the *nit was actually about', () => {
  const actions = new PlayerHandPile({ id: 'hand:me', kind: 'hand', ownerId: 'me' })
    .pileActions({ isOwner: true, isShared: false, cards: [] });
  assert.ok(actions.includes('tighten'), `got ${JSON.stringify(actions)}`);
  assert.ok(actions.includes('loosen'), `got ${JSON.stringify(actions)}`);
});

test('tighten/loosen are offered by melds and runs too - any pile that lays its cards out in a row', () => {
  for (const kind of ['run', 'set', 'foundation', 'plain', 'discard']) {
    const actions = new PILE_TYPES[kind]({ id: `p:${kind}`, kind, ownerId: null })
      .pileActions({ isOwner: true, isShared: true, cards: [] });
    assert.ok(actions.includes('tighten'), `${kind} should offer tighten, got ${JSON.stringify(actions)}`);
    assert.ok(actions.includes('loosen'), `${kind} should offer loosen, got ${JSON.stringify(actions)}`);
  }
});

// A deck is a STACK - its cards sit on top of each other by definition,
// so there is no overlap to adjust. The exclusion is the class's own
// (DeckPile fully overrides pileActions), not a check anywhere else.
test('a deck offers neither - a stack has no spread to adjust', () => {
  const actions = new PILE_TYPES.deck({ id: 'deck', kind: 'deck', ownerId: null })
    .pileActions({ isHost: true, isOwner: true, isShared: true, cards: [] });
  assert.ok(!actions.includes('tighten'), `got ${JSON.stringify(actions)}`);
  assert.ok(!actions.includes('loosen'), `got ${JSON.stringify(actions)}`);
});

// Clicking an action that cannot move anything is a dead control - the
// same reason `split` is disabled below 2 cards.
test('tighten is disabled at maximum spread, loosen at minimum - no dead clicks at the limits', () => {
  const pile = new PILE_TYPES.plain({ id: 'p', kind: 'plain', ownerId: null });
  assert.ok(pile.disabledActions(3, { spread: MAX_SPREAD }).includes('tighten'));
  assert.ok(!pile.disabledActions(3, { spread: MAX_SPREAD }).includes('loosen'));
  assert.ok(pile.disabledActions(3, { spread: MIN_SPREAD }).includes('loosen'));
  assert.ok(!pile.disabledActions(3, { spread: MIN_SPREAD }).includes('tighten'));
});

test('neither is disabled in the middle of the range', () => {
  const disabled = new PILE_TYPES.plain({ id: 'p', kind: 'plain', ownerId: null })
    .disabledActions(3, { spread: (MIN_SPREAD + MAX_SPREAD) / 2 });
  assert.ok(!disabled.includes('tighten'));
  assert.ok(!disabled.includes('loosen'));
});


// --- Sorting derives from contents (Phase 101, US-104, Gate 1 cond. B)
//
// `HandPile` hardcoded sortRank + sortSuit, which was only ever correct
// because a hand could only hold cards. Now that a pile can hold a chip,
// what sorting it offers has to come from what is IN it.

test('sortActionsFor: a pile of cards offers rank and suit', () => {
  assert.deepEqual(sortActionsFor([{ pileableType: 'card' }, { pileableType: 'card' }]),
    ['sortRank', 'sortSuit']);
});

test('sortActionsFor: a pile of chips or tokens offers nothing to sort by', () => {
  assert.deepEqual(sortActionsFor([{ pileableType: 'chip' }, { pileableType: 'chip' }]), []);
  assert.deepEqual(sortActionsFor([{ pileableType: 'token' }]), []);
});

// The intersection, not the union: an action offered on a mixed pile
// must be meaningful for EVERYTHING in it, or it reorders something by
// an attribute it hasn't got.
test('sortActionsFor: a mixed pile offers the intersection - nothing, not the card half', () => {
  assert.deepEqual(sortActionsFor([{ pileableType: 'card' }, { pileableType: 'chip' }]), []);
});

test('sortActionsFor: an empty pile offers nothing, and neither case throws', () => {
  assert.deepEqual(sortActionsFor([]), []);
  assert.doesNotThrow(() => sortActionsFor());
  assert.doesNotThrow(() => sortActionsFor([{}, null]));
});

// A card record with no explicit pileableType still sorts as a card -
// the same default `pileableFor` makes.
test('sortActionsFor: records with no pileableType are treated as cards', () => {
  assert.deepEqual(sortActionsFor([{ rank: 'A' }]), ['sortRank', 'sortSuit']);
});

// The end-to-end version: the hand's own offer list must come from its
// contents, with no hardcoded pair left in HandPile.
test('a hand of cards still offers both sorts - unchanged for every existing game', () => {
  const actions = new PlayerHandPile({ id: 'hand:me', kind: 'hand', ownerId: 'me' })
    .pileActions({ isOwner: true, cards: [{ pileableType: 'card' }] });
  assert.ok(actions.includes('sortRank'));
  assert.ok(actions.includes('sortSuit'));
});

test('a hand holding chips offers NO sort, and no kind check produced that', () => {
  const actions = new PlayerHandPile({ id: 'hand:me', kind: 'hand', ownerId: 'me' })
    .pileActions({ isOwner: true, cards: [{ pileableType: 'chip' }] });
  assert.ok(!actions.includes('sortRank'), `got ${JSON.stringify(actions)}`);
  assert.ok(!actions.includes('sortSuit'), `got ${JSON.stringify(actions)}`);
  assert.ok(actions.includes('changePileType'), 'its other actions are untouched');
});

test('an empty hand offers no sort rather than two dead buttons', () => {
  const actions = new PlayerHandPile({ id: 'hand:me', kind: 'hand', ownerId: 'me' })
    .pileActions({ isOwner: true, cards: [] });
  assert.ok(!actions.includes('sortRank'));
  assert.ok(!actions.includes('sortSuit'));
});
