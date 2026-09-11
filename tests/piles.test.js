import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILE_TYPES, CHANGE_PILE_TYPE_KINDS, pileKindLabel } from '../src/piles/pileTypes.js';
import { VERTICAL, HORIZONTAL, FAN } from '../src/pileables/Stackable.js';
import { MAX_SPREAD } from '../src/piles/Pile.js';
import { stacksOf } from '../src/piles/Stack.js';
import { Pile } from '../src/piles/Pile.js';
import { DeckPile } from '../src/piles/DeckPile.js';
import { HandPile } from '../src/piles/HandPile.js';
import { PlayerHandPile } from '../src/piles/PlayerHandPile.js';
import { OpponentHandPile } from '../src/piles/OpponentHandPile.js';
import { DiscardPile } from '../src/piles/DiscardPile.js';
import { FoundationPile } from '../src/piles/FoundationPile.js';
import { CascadePile } from '../src/piles/CascadePile.js';
import { RankAdjacentPile } from '../src/piles/RankAdjacentPile.js';
import { ExilePile } from '../src/piles/ExilePile.js';
import { RunPile } from '../src/piles/RunPile.js';
import { SetPile } from '../src/piles/SetPile.js';
import { TokenPile } from '../src/piles/TokenPile.js';

// D42/D56: one CLASS per pile TYPE instead of a `kind` string switched
// on in state.js/pileActions.js. D93: piles are real instances now
// (`new SomeKind(data)`), not plain data passed into static methods -
// every test below constructs a real instance and calls its INSTANCE
// methods, matching how `state.js`/`pileActions.js`/`ui.js` actually
// call them now (`revivePile(pile).method(...)`).

// D79 (US-82) added battlefield/exile/stack; `lands` (direct user
// request, "organize my lands by color... stacked vertically") is the
// most recent addition. Kept as an EXACT list rather than relaxed to a
// subset check: knowing precisely which kinds ship is the guard's
// whole value, so a new kind should have to be added here on purpose.
test('the registry exposes exactly the fifteen pile kinds', () => {
  assert.deepEqual(Object.keys(PILE_TYPES).toSorted(),
    ['battlefield', 'cascade', 'chip', 'deck', 'discard', 'exile', 'foundation', 'hand', 'lands', 'plain', 'rankAdjacent', 'run', 'set', 'stack', 'token']);
  assert.equal(PILE_TYPES.deck, DeckPile);
  assert.equal(PILE_TYPES.hand, OpponentHandPile);
  assert.equal(PILE_TYPES.plain, Pile);
  assert.equal(PILE_TYPES.discard, DiscardPile);
  assert.equal(PILE_TYPES.run, RunPile);
  assert.equal(PILE_TYPES.set, SetPile);
});

test('every concrete pile class extends Pile', () => {
  for (const [kind, pileClass] of Object.entries(PILE_TYPES)) {
    if (pileClass === Pile) continue;
    assert.ok(pileClass.prototype instanceof Pile || pileClass === Pile,
      `${kind} should be a real subclass of Pile`);
  }
});

// Morpheus's refactor plan (agents/morpheus.docs/state.md), item D: a
// structural GUARANTEE, not scattered convention/folklore - iterates
// PILE_TYPES so a FUTURE kind that accidentally restricts drag-and-drop
// fails CI immediately, same "executable guarantee" instinct as
// assertCardsConserved. No named exceptions: Deck's own former [] override
// was struck (direct user correction), so this now covers every
// registered kind with zero carve-outs.
test('universal drag-and-drop guarantee: every concrete pile kind offers move on a visible card', () => {
  const card = { id: 'c1', faceUp: true };
  for (const [kind, PileClass] of Object.entries(PILE_TYPES)) {
    const pile = new PileClass({ kind, cards: [card], ownerId: 'someone-else' });
    const actions = pile.pileableActions(card, 'viewer-id');
    // D102: this used to accept `move` OR `play` - the hand was the
    // one kind that satisfied it with `play`. One verb now, so the
    // guarantee is strictly stronger: every kind, `move`, no
    // alternative spelling accepted.
    assert.ok(actions.includes('move'),
      `${kind} pile must offer move for drag-and-drop (Core invariant): got ${JSON.stringify(actions)}`);
  }
});

test('visibility matches state.js\'s existing PILE_VISIBILITY table exactly', () => {
  assert.equal(DeckPile.visibility, 'hidden');
  assert.equal(HandPile.visibility, 'in-hand');
  assert.equal(Pile.visibility, 'mixed');
  assert.equal(DiscardPile.visibility, 'mixed');
});

test('canAccept: every non-content-gated kind accepts unconditionally - only Foundation/Cascade/RankAdjacent add real rules', () => {
  const card = { id: 'c' };
  assert.equal(new DeckPile({ cards: [] }).canAccept(card), true);
  assert.equal(new HandPile({ cards: [] }).canAccept(card), true);
  assert.equal(new Pile({ cards: [] }).canAccept(card), true);
  assert.equal(new DiscardPile({ cards: [] }).canAccept(card), true);
});

test('resolveDropTarget: deck/hand/discard have no geometry to offer, the base Pile delegates to dropTarget.js\'s halo geometry', () => {
  const point = { x: 5, y: 5 };
  const boxes = [{ pileableId: 'a', left: 0, right: 10, top: 0, bottom: 10, width: 10 }];
  assert.deepEqual(new DeckPile({}).resolveDropTarget([], point), {});
  assert.deepEqual(new HandPile({}).resolveDropTarget([], point), {});
  assert.deepEqual(new DiscardPile({}).resolveDropTarget(boxes, point), {},
    'STACK behavior: every drop lands on top, no positional geometry computed');
  assert.deepEqual(new Pile({}).resolveDropTarget(boxes, point),
    { targetCardId: 'a', side: 'after', layout: 'stack' });
});

test('tableSide: zone, discard, deck AND hand are all table-side (hand renders at its seat via the same generic machinery; "never a generic drop destination" is targetsForAction\'s own separate rule, not this flag)', () => {
  assert.equal(Pile.tableSide, true);
  assert.equal(DiscardPile.tableSide, true);
  assert.equal(DeckPile.tableSide, true, 'a deck can live inside a zone');
  assert.equal(HandPile.tableSide, true);
});

test('component: deck/hand pick their own dedicated element, everything else falls back to the flat pile-panel', () => {
  assert.equal(DeckPile.component, 'deck-stack');
  assert.equal(HandPile.component, 'fan-pile');
  assert.equal(Pile.component, 'pile-panel');
  assert.equal(DiscardPile.component, 'pile-panel', 'inherited, not overridden - identical render shape to the base case');
  assert.equal(FoundationPile.component, 'pile-panel');
  assert.equal(CascadePile.component, 'pile-panel');
  assert.equal(RankAdjacentPile.component, 'pile-panel');
});


// UPDATED: hand's exclusion was lifted by direct user request ("remove
// block on moving hand piles"), the same way D64 lifted the deck's. Only
// the Meld family opts out now.
test('reparentable: only the Meld family opts out now - hand and deck were both freed by direct request', () => {
  assert.equal(DeckPile.reparentable, true, 'D64: reversed Sprint 23\'s deck exclusion, direct user request');
  assert.equal(HandPile.reparentable, true, '*fix: "remove block on moving hand piles"');
  assert.equal(Pile.reparentable, true);
  assert.equal(DiscardPile.reparentable, true, 'inherited, not overridden');
});

// *nit (direct user request, "don't enable X unless empty"): remove
// (D62) is empty-only at the reducer - disabled client-side too, so a
// click never reaches the reducer's block message on a non-empty pile
// (Nielsen #5). `changePileType` was disabled the same way under D62/
// D63, but a later direct user request (2026-08-27) reopened it on
// non-empty piles - it's no longer in this list.
test('disabledActions: remove is disabled on a non-empty pile, enabled on an empty one; changePileType is never disabled; split disabled below 2 cards (D91)', () => {
  assert.deepEqual(new Pile({}).disabledActions(0), ['split']);
  assert.deepEqual(new Pile({}).disabledActions(1), ['remove', 'split']);
  assert.deepEqual(new Pile({}).disabledActions(2), ['remove']);
  assert.deepEqual(new Pile({}).disabledActions(3), ['remove']);
  assert.deepEqual(new DiscardPile({}).disabledActions(0), ['split'], 'inherited, not overridden');
  assert.deepEqual(new DiscardPile({}).disabledActions(1), ['remove', 'split'], 'inherited, not overridden');
});

// --- pileableActions: characterized against pileActions.js's actionsForPileable ---

const deck = { id: 'deck', kind: 'deck', ownerId: null };
const myHand = { id: 'hand:me', kind: 'hand', ownerId: 'me' };
const theirHand = { id: 'hand:you', kind: 'hand', ownerId: 'you' };
const table = { id: 'table', kind: 'plain', ownerId: null };

// D34's "always []" override struck (direct user correction: cards can
// be put back on the deck and taken off, same as any pile). Draw/Deal/
// Shuffle stay pile-level actions (unaffected). `reveal` is unconditional
// here rather than the base rule's `faceUp === false` check - a real
// deck card never carries a `faceUp` field at all, so a deck needs its
// own override, not a plain inherit.
test('deck pileableActions: reveal/pickup/move/rotate, unconditionally - on/off the deck like any pile', () => {
  assert.deepEqual(new DeckPile(deck).pileableActions({ id: 'c' }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
});

// D92 (direct user request: "split should always fan the pile to allow
// the guided picker" - deck included). A real deck card carries no
// `faceUp` field at all (never passed through `toHandCard`/PLAY's
// transform) - the base `Pile.showsFace` (`card.faceUp !== false`)
// would read that as `true` and show the real face. `visibility:
// 'hidden'` already says nobody sees a deck's cards; `showsFace` has
// to actually agree, or the split picker (which reuses this same hook
// for every pile kind) would leak the deck's real order/identity.
test('deck showsFace: always false, regardless of faceUp - a deck is always hidden, not just by default', () => {
  assert.equal(new DeckPile(deck).showsFace({ id: 'c' }, 'me'), false);
  assert.equal(new DeckPile(deck).showsFace({ id: 'c', faceUp: true }, 'me'), false, 'even an explicit faceUp:true never shows a deck card');
});

// *nit (direct user request, D83: "fully permissive drag and drop for
// all cards and piles... remove the older restrictions from ALL pile
// and zone types", confirmed to include hand): a non-owner used to get
// `[]` on someone else's hand card - now gets `['move']`, so any player
// can drag a card straight out of anyone's hand. D102 (*nit, "get rid
// of the Play card action on the user hand"): the owner gets `['move']`
// too now - `['play']` was a naming necessity (PLAY's own authorization
// needed the literal string), and retiring the verb removed the last
// reason the two perspectives spelled the same capability differently.
//
// Direct user correction (later): "I don't like the special ownership
// property for hand... make PlayerHand and OpponentHand as separate
// classes to encapsulate the visibility differences" - one `HandPile`
// used to compute `this.ownerId === viewerId` itself; now
// `pileInstanceFor` picks the class, and each one's `pileableActions` is an
// unconditional fact about that class, not a runtime comparison.
test('hand pileableActions: both PlayerHandPile and OpponentHandPile offer move - one verb, D102', () => {
  assert.deepEqual(new PlayerHandPile(myHand).pileableActions({ id: 'c' }, 'me'), ['move']);
  assert.deepEqual(new OpponentHandPile(theirHand).pileableActions({ id: 'c' }, 'me'), ['move']);
});

// *nit (direct user request, "a hand is just a regular pile... behave
// exactly the same as all other piles"): `HandPile` no longer overrides
// `redactCard` at all - `state.js`'s `toHandCard` stamps a real
// `{owner, faceUp: false}` on every card entering a hand, so the
// inherited base `Pile.redactCard` already does the right thing with
// zero hand-specific code. Accepted trade (direct user request, "fully
// generic, accept the id leak"): the redacted shape now keeps `id`
// (this app's ids encode rank/suit) and the real `owner`, where the old
// override stripped both.
// *nit (direct user request, D84: "remove card redaction entirely...
// TOTAL PERMISSIVE"): `redactCard` is gone everywhere - every Pile
// subclass that ever had one (base `Pile`, `DeckPile`, the old
// `HandPile` override) no longer does. There is nothing left to test
// here; a card is a card, full stop, for every viewer.

test('zone (base Pile) pileableActions: a face-up card offers conceal (not reveal) - the *nit toggle\'s other direction', () => {
  assert.deepEqual(new Pile(table).pileableActions({ faceUp: true, owner: null }, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
});

test('zone pileableActions: face-down card offers reveal/pickup/move/rotate - all four, no ownership check left, D83/D84', () => {
  assert.deepEqual(new Pile(table).pileableActions({ faceUp: false, owner: null }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(new Pile(table).pileableActions({ faceUp: false, owner: 'you' }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(new Pile(table).pileableActions({ faceUp: false, owner: 'me' }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
});

test('cascade/rankAdjacent inherit the same pileableActions rule as the base Pile, unmodified', () => {
  const faceUp = { faceUp: true, owner: null };
  assert.deepEqual(new CascadePile(table).pileableActions(faceUp, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(new RankAdjacentPile(table).pileableActions(faceUp, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
});

// --- pileActions: characterized against pileActions.js's pileLevelActions ---

// *fix (queued 2026-09-10, "All players have access to all pile
// actions no matter what"): every deck action used to split on
// `isHost` - gone, along with the flag. Every player gets the full list.
test('deck pileActions: draw/deal/reshuffleDeal/reset/shuffle/split/changePileType, open to everyone (D91: split joins, instant/always-half at the ui.js/main.js layer; D114: reset joins, standalone from reshuffleDeal)', () => {
  assert.deepEqual(new DeckPile(deck).pileActions(), ['draw', 'deal', 'reshuffleDeal', 'reset', 'shuffle', 'split', 'changePileType']);
});

test('deck disabledActions: deal disabled at 0 cards, split disabled below 2', () => {
  assert.deepEqual(new DeckPile(deck).disabledActions(0), ['deal', 'split']);
  assert.deepEqual(new DeckPile(deck).disabledActions(1), ['split']);
  assert.deepEqual(new DeckPile(deck).disabledActions(2), []);
});

// US-104 (sprint pileObjects) changed this deliberately: the sorts are
// derived from the pile's CONTENTS now, so they appear for a hand of
// cards and not for an empty one. That is the story's point, not a
// regression - two sort buttons on an empty hand were always dead.
// *fix (queued 2026-09-10, "All players have access to all pile
// actions no matter what"): sort/changePileType used to be owner-only
// (`isOwner`) - gone, along with the flag. Any player gets them now.
test('hand pileActions: sort + changePileType, open to any viewer (pass removed, direct user request, not a requirement)', () => {
  const cards = [{ pileableType: 'card', rank: 'A' }];
  assert.deepEqual(new HandPile(myHand).pileActions({ cards }),
    ['sortRank', 'sortSuit', 'changePileType', 'tightenAll', 'loosenAll']);
  assert.deepEqual(new HandPile(myHand).pileActions({ cards: [] }),
    ['changePileType', 'tightenAll', 'loosenAll'], 'an empty hand has nothing to sort');
});

test('cascade/rankAdjacent pileActions: changePileType is the one pile-level action either offers - D71 (US-74)', () => {
  assert.deepEqual(new CascadePile(table).pileActions(), ['changePileType']);
  assert.deepEqual(new RankAdjacentPile(table).pileActions(), ['changePileType']);
});

// --- Write-side (D43): canRemove/removePileable/insertPileable ---

// *nit (direct user request, D83, "fully permissive drag and drop...
// remove the older restrictions from ALL pile and zone types"): every
// ownership check that used to gate pickup/move/rotate is gone. The
// only condition left is `reveal`'s own "already visible, nothing to
// reveal" no-op guard - not an authorization restriction.
test('zone canRemove: reuses pileableActions - fully permissive now, only reveal keeps a (non-authorization) condition', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  const hiddenUnowned = { id: 'c', faceUp: false, owner: null };
  const hiddenMine = { id: 'c', faceUp: false, owner: 'me' };
  const hiddenTheirs = { id: 'c', faceUp: false, owner: 'you' };
  assert.equal(new Pile(table).canRemove(faceUp, 'me', 'pickup'), true);
  assert.equal(new Pile(table).canRemove(faceUp, 'me', 'reveal'), false, 'already face-up, nothing to reveal');
  assert.equal(new Pile(table).canRemove(hiddenUnowned, 'me', 'reveal'), true, 'unowned face-down - anyone may reveal');
  assert.equal(new Pile(table).canRemove(hiddenMine, 'anyone-else', 'move'), true, 'a non-owner can now move someone else\'s still-hidden private card');
  assert.equal(new Pile(table).canRemove(hiddenMine, 'me', 'move'), true, 'the owner can move their own still-hidden card');
  assert.equal(new Pile(table).canRemove(hiddenTheirs, 'me', 'pickup'), true, 'a still-hidden card can now be picked up blind by anyone');
});

test('plain pile removePileable/insertPileable: pure, round-trips a card', () => {
  const pile = { id: 'z', kind: 'plain', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = new Pile(pile).removePileable('a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const reinserted = new Pile(removed).insertPileable({ id: 'a' });
  assert.deepEqual(reinserted.cards.map((c) => c.id), ['b', 'a'], 'no placement - appends');
});

// D129 replaces D21's "layout belongs to whichever card ends up
// SECOND" rule, and the rule is gone with the field. Which stack a card
// is in does not depend on which side of its target it landed - only
// where in the order it sits does - so both sides now place the card
// in the target's stack and nothing has to be moved between cards.
test('plain pile insertPileable: placement before/after a target puts BOTH in one stack', () => {
  const pile = { id: 'z', kind: 'plain', cards: [{ id: 'a' }, { id: 'b' }] };

  const before = new Pile(pile).insertPileable({ id: 'x' }, { targetCardId: 'b', side: 'before', layout: 'overlap' });
  assert.deepEqual(before.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(
    before.cards.find((c) => c.id === 'x').stackId,
    before.cards.find((c) => c.id === 'b').stackId,
    'a before-drop joins the target\'s stack, same as an after-drop',
  );

  const after = new Pile(pile).insertPileable({ id: 'x' }, { targetCardId: 'a', side: 'after', layout: 'stack' });
  assert.deepEqual(after.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(
    after.cards.find((c) => c.id === 'x').stackId,
    after.cards.find((c) => c.id === 'a').stackId,
  );
});

// *fix (real bug, direct user report): "cards and tokens get stuck over
// the left edge of their panel". Under the old per-card `layout` field
// ("overlap onto whoever precedes me") a removal could leave the new
// FIRST card stranded, still pulled toward a predecessor that had just
// left - so `removePileable` carried a dedicated strip for it.
//
// D129 removes the failure mode rather than the symptom: membership
// names the stack itself, so a card whose neighbours leave is just a
// shorter stack and needs no fixup. This test now guards that no fixup
// is REQUIRED, which is the stronger property.
test('removePileable needs no layout fixup - a shorter stack is still correct', () => {
  const pile = {
    id: 'z',
    kind: 'plain',
    cards: [{ id: 'a', stackId: 's' }, { id: 'b', stackId: 's' }, { id: 'c', stackId: 's' }],
    stacks: { s: { direction: 'vertical' } },
  };
  const removed = new Pile(pile).removePileable('a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b', 'c']);
  for (const card of removed.cards) {
    assert.equal(card.stackId, 's', 'the survivors are still the same stack, untouched');
  }
});

test('removePileable emptying a stack leaves no phantom behind', () => {
  const pile = {
    id: 'z',
    kind: 'plain',
    cards: [{ id: 'a' }, { id: 'b', stackId: 's' }],
    stacks: { s: { direction: 'vertical' } },
  };
  const removed = new Pile(pile).removePileable('b');
  // The metadata entry may survive; what matters is that no stack is
  // built from it, because stacks are built from the cards.
  assert.deepEqual(stacksOf(removed).map((stack) => stack.id), [undefined]);
});

// D102: was "PLAY authorized on PlayerHandPile, never on
// OpponentHandPile". `'move'` is the verb on both sides now, and
// OpponentHandPile authorizes it too - a non-owner has been able to
// drag a card out of someone else's hand since D83 ("fully permissive
// drag and drop... confirmed to include hand"), it just spelled that
// capability `'move'` while the owner's spelled it `'play'`. Removing
// the verb removed the asymmetry, not a restriction: nothing that was
// forbidden became allowed here.
test('hand canRemove: move authorized on BOTH hand perspectives - the owner\'s and anyone else\'s (D102, resolved via pileableActions)', () => {
  assert.equal(new PlayerHandPile(myHand).canRemove({ id: 'c' }, 'me', 'move'), true);
  assert.equal(new OpponentHandPile(theirHand).canRemove({ id: 'c' }, 'me', 'move'), true, 'permissive since D83');
  assert.equal(new PlayerHandPile(myHand).canRemove({ id: 'c' }, 'me', 'play'), false, 'the retired verb authorizes nothing');
});

test('hand removePileable/insertPileable: pure, appends on insert (both inherited from Pile, unmodified)', () => {
  const pile = { id: 'hand:me', kind: 'hand', ownerId: 'me', cards: [{ id: 'a' }] };
  const removed = new HandPile(pile).removePileable('a');
  assert.deepEqual(removed.cards, []);
  const inserted = new HandPile(removed).insertPileable({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b']);
});

test('deck canRemove: reveal/pickup/move all true via pileableActions; draw stays unconditionally true (not a per-card pileableActions entry)', () => {
  for (const action of ['reveal', 'pickup', 'move', 'draw']) {
    assert.equal(new DeckPile(deck).canRemove({ id: 'c' }, 'anyone', action), true, action);
  }
});

test('deck removePileable/insertPileable: pure (removePileable inherited from Pile, insertPileable overridden to prepend)', () => {
  const pile = { id: 'deck', kind: 'deck', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = new DeckPile(pile).removePileable('a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const inserted = new DeckPile(removed).insertPileable({ id: 'c' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['c', 'b'], 'a card put back on the deck lands on top, matching a physical deck');
});

// --- Discard (D45, reversed by direct user request: "discard pile is
// just a deck (face up or down)" - full per-card access now, same as
// the base Pile; "stack" (top-only insert) is the one thing left. ---

const discard = { id: 'discard', kind: 'discard', ownerId: null };

test('discard pileableActions: inherited from Pile, unmodified - same as any other zone (D45 reversed)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(new DiscardPile(discard).pileableActions(faceUp, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
});

test('discard pileActions: take/split/hide/show, inherited from Pile unmodified, open to everyone', () => {
  assert.deepEqual(new DiscardPile(discard).pileActions({}), ['take', 'split', 'changePileType', 'remove', 'tightenAll', 'loosenAll']);
});

test('discard canRemove: same per-card rule as the base Pile - not unconditionally false any more', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  for (const action of ['pickup', 'move']) {
    assert.equal(new DiscardPile(discard).canRemove(faceUp, 'me', action), true, action);
  }
});

// *nit (direct user request, reversed AGAIN): exile's own "one-way,
// pileableActions always []" override is gone too now - `docs/
// ARCHITECTURE.md`'s "Core invariant" ("drag and drop are always
// allowed in all pile types... no matter what") forbids ANY pile-kind
// override from blocking single-card move, exile included. Exile still
// offers no bulk `take` (a pile-level CONVENIENCE, unaffected).
test('exile pileableActions: inherited from Pile via DiscardPile, unmodified - drag-and-drop always works, even out of exile', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(
    new ExilePile({ id: 'exile', kind: 'exile', ownerId: null }).pileableActions(faceUp, 'me'),
    ['conceal', 'pickup', 'move', 'rotate'],
  );
});

test('discard insertPileable: always lands on top (index 0), no placement/halo splicing like the base Pile', () => {
  const pile = { id: 'discard', kind: 'discard', cards: [{ id: 'a' }] };
  const inserted = new DiscardPile(pile).insertPileable({ id: 'b' }, { targetCardId: 'a', side: 'before' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b', 'a'], 'placement is ignored entirely - STACK always wins');
});

// D56: foundation - `extends RunPile extends MeldPile` - same-suit,
// strictly ascending, append-only, starting at Ace. Only the empty-pile
// case differs from a general same-suit run.

test('foundation canAccept: empty accepts only an Ace, rejects any other rank', () => {
  const empty = { cards: [] };
  assert.equal(new FoundationPile(empty).canAccept({ rank: 'A', suit: 'hearts' }), true);
  assert.equal(new FoundationPile(empty).canAccept({ rank: '2', suit: 'hearts' }), false);
  assert.equal(new FoundationPile(empty).canAccept({ rank: 'K', suit: 'hearts' }), false);
});

test('foundation canAccept: same suit, exactly rank+1 (RunPile\'s rule, inherited via super) - rejects a different suit or a skipped rank', () => {
  const pile = { cards: [{ rank: '5', suit: 'clubs' }] };
  assert.equal(new FoundationPile(pile).canAccept({ rank: '6', suit: 'clubs' }), true, 'same suit, next rank');
  assert.equal(new FoundationPile(pile).canAccept({ rank: '6', suit: 'hearts' }), false, 'wrong suit');
  assert.equal(new FoundationPile(pile).canAccept({ rank: '7', suit: 'clubs' }), false, 'skipped a rank');
  assert.equal(new FoundationPile(pile).canAccept({ rank: '5', suit: 'clubs' }), false, 'same rank, not ascending');
});

// *nit (direct user request, reversed): "never removable, offers no CARD
// actions" (Smith Gate 2's silent-lock UX) is gone - `docs/
// ARCHITECTURE.md`'s "Core invariant" forbids any pile-type override
// from blocking single-card drag-and-drop, Foundation included.
// `pileableActions` is inherited straight from the base `Pile` now (via
// `MeldPile`, which no longer overrides it) - same reveal/pickup/move/
// rotate rule as any other pile's, privacy-filtered (D7) same as ever.
test('foundation: append-only insert; card actions are the SAME as any other pile\'s now (inherited from Pile, not locked by MeldPile)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  const pile = { cards: [{ id: 'a' }] };
  assert.deepEqual(new FoundationPile(pile).pileableActions(faceUp, 'me'), ['conceal', 'pickup', 'move', 'rotate']);
  assert.equal(new FoundationPile(pile).canRemove(faceUp, 'me', 'move'), true);
  const inserted = new FoundationPile(pile).insertPileable({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['a', 'b']);
});

test('foundation: split/changePileType are the pile-level actions offered, inherited from MeldPile (D71/US-74, D91)', () => {
  assert.deepEqual(new FoundationPile({}).pileActions(), ['split', 'changePileType', 'tightenAll', 'loosenAll']);
});

test('foundation: tableSide true (inherited from Pile), resolveDropTarget always empty (no halo geometry, from MeldPile)', () => {
  assert.equal(FoundationPile.tableSide, true);
  assert.deepEqual(new FoundationPile({}).resolveDropTarget([{ pileableId: 'a' }], { x: 0, y: 0 }), {});
});

// D56 finished (was a documented placeholder): `run`/`set` are now real,
// directly selectable `PILE_TYPES` kinds - a player can convert any pile
// to either via the existing changePileType menu, no preset wiring
// needed (same "manual, host-driven" convention every other kind uses).

test('run canAccept: empty accepts anything, non-empty requires same suit and rank+1 - unlike foundation, does not require starting at Ace', () => {
  const empty = { cards: [] };
  assert.equal(new RunPile(empty).canAccept({ rank: '7', suit: 'spades' }), true, 'a run can start anywhere');
  const pile = { cards: [{ rank: '5', suit: 'clubs' }] };
  assert.equal(new RunPile(pile).canAccept({ rank: '6', suit: 'clubs' }), true, 'same suit, next rank');
  assert.equal(new RunPile(pile).canAccept({ rank: '6', suit: 'hearts' }), false, 'wrong suit');
  assert.equal(new RunPile(pile).canAccept({ rank: '7', suit: 'clubs' }), false, 'skipped a rank');
});

test('set canAccept: empty accepts anything, non-empty requires the same rank as the pile\'s existing cards, any suit', () => {
  const empty = { cards: [] };
  assert.equal(new SetPile(empty).canAccept({ rank: '7', suit: 'spades' }), true, 'a set can start with any rank');
  const pile = { cards: [{ rank: 'K', suit: 'clubs' }] };
  assert.equal(new SetPile(pile).canAccept({ rank: 'K', suit: 'hearts' }), true, 'same rank, different suit - the whole point of a set');
  assert.equal(new SetPile(pile).canAccept({ rank: 'Q', suit: 'clubs' }), false, 'different rank rejected regardless of suit');
});

test('set: inherits MeldPile\'s append-only insert, single-slot drop target, and split/changePileType pile actions - nothing else overridden', () => {
  const pile = { cards: [{ id: 'a', rank: 'K', suit: 'clubs' }] };
  const inserted = new SetPile(pile).insertPileable({ id: 'b', rank: 'K', suit: 'hearts' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(new SetPile(pile).resolveDropTarget([{ pileableId: 'a' }], { x: 0, y: 0 }), {});
  assert.deepEqual(new SetPile(pile).pileActions(), ['split', 'changePileType', 'tightenAll', 'loosenAll']);
  assert.equal(SetPile.reparentable, false);
});

test('pileKindLabel: run/set read the same "capitalize the kind" rule as every other real kind', () => {
  assert.equal(pileKindLabel('run'), 'Run');
  assert.equal(pileKindLabel('set'), 'Set');
});

// D53/D56: cascade - alternating color, strictly descending, reuses
// D21's overlap rendering.

test('cascade canAccept: empty accepts anything (deal-time fill)', () => {
  assert.equal(new CascadePile({ cards: [] }).canAccept({ rank: '7', suit: 'clubs' }), true);
});

test('cascade canAccept: opposite color, exactly rank-1 - rejects same color or a skipped/ascending rank', () => {
  const pile = { cards: [{ rank: '8', suit: 'clubs' }] }; // black 8
  assert.equal(new CascadePile(pile).canAccept({ rank: '7', suit: 'hearts' }), true, 'red 7 on black 8');
  assert.equal(new CascadePile(pile).canAccept({ rank: '7', suit: 'spades' }), false, 'same color (black)');
  assert.equal(new CascadePile(pile).canAccept({ rank: '6', suit: 'hearts' }), false, 'skipped a rank');
  assert.equal(new CascadePile(pile).canAccept({ rank: '9', suit: 'hearts' }), false, 'ascending, not descending');
});

test('cascade insertPileable: first card renders flat, every card after carries layout: overlap (D21 reuse)', () => {
  const empty = { cards: [] };
  const first = new CascadePile(empty).insertPileable({ id: 'a' });
  assert.equal(first.cards[0].layout, undefined);
  const second = new CascadePile(first).insertPileable({ id: 'b' });
  assert.equal(second.cards[1].layout, 'overlap');
});

test('cascade: tableSide true (inherited), resolveDropTarget always empty (accept/reject only, no positional choice)', () => {
  assert.equal(CascadePile.tableSide, true);
  assert.deepEqual(new CascadePile({}).resolveDropTarget([{ pileableId: 'a' }], { x: 0, y: 0 }), {});
});

// D53/D56: rankAdjacent - Spit's shared center pile, either direction,
// any suit, wraps King<->Ace.

test('rankAdjacent canAccept: empty accepts anything', () => {
  assert.equal(new RankAdjacentPile({ cards: [] }).canAccept({ rank: '7', suit: 'clubs' }), true);
});

test('rankAdjacent canAccept: either direction, any suit - rejects a 2-rank gap', () => {
  const pile = { cards: [{ rank: '7', suit: 'clubs' }] };
  assert.equal(new RankAdjacentPile(pile).canAccept({ rank: '8', suit: 'hearts' }), true, 'one rank up, any suit');
  assert.equal(new RankAdjacentPile(pile).canAccept({ rank: '6', suit: 'spades' }), true, 'one rank down, any suit');
  assert.equal(new RankAdjacentPile(pile).canAccept({ rank: '9', suit: 'hearts' }), false, 'two ranks up');
  assert.equal(new RankAdjacentPile(pile).canAccept({ rank: '7', suit: 'hearts' }), false, 'same rank');
});

test('rankAdjacent canAccept: wraps King<->Ace in both directions', () => {
  const onKing = { cards: [{ rank: 'K', suit: 'clubs' }] };
  assert.equal(new RankAdjacentPile(onKing).canAccept({ rank: 'A', suit: 'hearts' }), true);
  const onAce = { cards: [{ rank: 'A', suit: 'clubs' }] };
  assert.equal(new RankAdjacentPile(onAce).canAccept({ rank: 'K', suit: 'hearts' }), true);
});

test('rankAdjacent: tableSide true (inherited), always shared (no ownerId concept enforced by the class itself - CREATE_ZONE never sets one)', () => {
  assert.equal(RankAdjacentPile.tableSide, true);
});

test('rankAdjacent insertPileable: STACK - lands on top (index 0), same convention as discard', () => {
  const pile = { cards: [{ id: 'a' }] };
  const inserted = new RankAdjacentPile(pile).insertPileable({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b', 'a']);
});

test('rankAdjacent: no turn-order/ownership restriction on move - matches Spit\'s simultaneous-play rule (inherited from Pile)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(new RankAdjacentPile({}).pileableActions(faceUp, 'anyone'), ['conceal', 'pickup', 'move', 'rotate']);
});

// --- pileKindLabel (direct user request: change-type menu labels) -----

test('pileKindLabel: plain reads "Pile" (D55 own-word rule), everything else just capitalizes', () => {
  assert.equal(pileKindLabel('plain'), 'Pile');
  assert.equal(pileKindLabel('discard'), 'Discard');
  assert.equal(pileKindLabel('foundation'), 'Foundation');
  assert.equal(pileKindLabel('cascade'), 'Cascade');
  assert.equal(pileKindLabel('rankAdjacent'), 'RankAdjacent');
  assert.equal(pileKindLabel('battlefield'), 'Battlefield');
  assert.equal(pileKindLabel('exile'), 'Exile');
  assert.equal(pileKindLabel('stack'), 'Stack');
});

test('pileKindLabel: every CHANGE_PILE_TYPE_KINDS kind has a real, non-empty label', () => {
  for (const kind of CHANGE_PILE_TYPE_KINDS) {
    assert.ok(pileKindLabel(kind).length > 0, kind);
  }
});

// ---------------------------------------------------------------------
// D129: which way a Stack inside this pile kind overlaps. The PILE
// decides - a cascade runs vertically, a run horizontally - so this
// stays polymorphic in the class hierarchy rather than becoming a flag
// anything branches on at render time.
// ---------------------------------------------------------------------

test('D129: every pile kind declares a real stack layout', () => {
  for (const [kind, PileClass] of Object.entries(PILE_TYPES)) {
    assert.ok(
      [VERTICAL, HORIZONTAL, FAN].includes(PileClass.stackDirection),
      `${kind} must declare one of the three real layouts, got ${PileClass.stackDirection}`,
    );
  }
});

test('D129: a grouped tray stacks VERTICALLY, a card row HORIZONTALLY', () => {
  // The two real cases the direction exists to separate: a chip/token/
  // land tray is columns of stacked pieces; an ordinary card pile is
  // one overlapping row.
  assert.equal(PILE_TYPES.chip.stackDirection, VERTICAL);
  assert.equal(PILE_TYPES.lands.stackDirection, VERTICAL);
  // NOT tokens: a token supply was deliberately reverted from a
  // grouped tray back to an ordinary pile by direct user correction
  // ("instead of a stack it can be just a pile", US-112), so it is a
  // plain `Pile` and stacks horizontally like any other card row.
  assert.equal(PILE_TYPES.token.stackDirection, HORIZONTAL);
  assert.equal(PILE_TYPES.plain.stackDirection, HORIZONTAL);
  // A hand is the third layout: a horizontal stack that arcs. It is a
  // real layout rather than a decoration over one, which is what let
  // `applyFanOffset` and the `fan: true` render flag be deleted.
  assert.equal(PILE_TYPES.hand.stackDirection, FAN);
});

test('D129: direction is INHERITED, not restated by every subclass', () => {
  // Guards the polymorphism: if a subclass had to name its own
  // direction we would be back to a per-kind table that drifts.
  assert.ok(!Object.hasOwn(PILE_TYPES.lands, 'stackDirection'), 'lands should inherit from GroupedPile');
  assert.ok(!Object.hasOwn(PILE_TYPES.discard, 'stackDirection'), 'discard should inherit from Pile');
});

// Smith usability defect (iteration 2 UX gate): a lands cascade was
// unreadable. `LandsPile` inherited `GroupedPile.defaultSpread` (0.963),
// a value derived for CHIPS - identical discs where only the top one
// carries meaning and the edges below are pure depth cue. Lands are
// CARDS: their identity is the name and cost strip, and at 0.963 each
// buried land showed a 2-3px sliver, so a 7-mana column told a player
// how many lands they had but not which.
test('a lands cascade stays readable - card spread, not chip spread', () => {
  const spread = PILE_TYPES.lands.defaultSpread;
  assert.ok(spread <= MAX_SPREAD,
    `a pile of CARDS must not default tighter than the card-legibility ceiling ` +
    `(${MAX_SPREAD}), got ${spread}`);
  assert.notEqual(spread, PILE_TYPES.chip.defaultSpread,
    'lands must not inherit the chip-calibrated default - that is the defect');
});

test('chips keep their own tight stacking - the fix is scoped to cards', () => {
  // Guards against "fixing" this by loosening GroupedPile itself, which
  // would make a chip tray read as a spread-out row instead of a stack.
  assert.equal(PILE_TYPES.chip.defaultSpread, 0.963);
  assert.ok(PILE_TYPES.chip.defaultSpread > MAX_SPREAD, 'a chip stack is deliberately tighter than any card pile');
});

// ---------------------------------------------------------------------
// D129 unification: a drop's `layout` intent is TRANSLATED into stack
// membership plus that stack's direction, and the per-card `layout`
// field stops existing. One mechanism, not two.
//
// The old field could only say "overlap onto whoever precedes me",
// which is why it needed a dedicated strip when a predecessor left
// (`removePileable`), a recompute on every grouped insert, and a
// separate CSS formula per value. Membership says which stack, the
// stack says which way it runs, and the one offset formula does the
// rest.
// ---------------------------------------------------------------------

const plainPile = (cards) => new PILE_TYPES.plain({ id: 'p', kind: 'plain', cards });

test('D129: a COLUMN drop joins the target\'s stack and makes it vertical', () => {
  const pile = plainPile([{ id: 'a', pileableType: 'card' }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'card' }, { targetCardId: 'a', layout: 'column' });

  const [a, b] = ['a', 'b'].map((id) => after.cards.find((card) => card.id === id));
  assert.equal(b.stackId, a.stackId, 'the dropped card joins the target\'s own stack');
  assert.ok(a.stackId !== undefined, 'and the target is given a real stack to be joined to');
  assert.equal(after.stacks[a.stackId].direction, VERTICAL, 'that stack now runs vertically');
  assert.ok(!('layout' in b), 'the per-card layout field is gone entirely');
});

test('D129: an OVERLAP drop joins the target\'s stack horizontally', () => {
  const pile = plainPile([{ id: 'a', pileableType: 'card' }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'card' }, { targetCardId: 'a', layout: 'overlap' });

  const [a, b] = ['a', 'b'].map((id) => after.cards.find((card) => card.id === id));
  assert.equal(b.stackId, a.stackId);
  assert.equal(after.stacks[a.stackId].direction, HORIZONTAL);
});

test('D129: a drop with NO layout leaves the pile in its one default stack', () => {
  // An ordinary row needs no placement data at all - that is what keeps
  // a plain pile plain.
  const pile = plainPile([{ id: 'a', pileableType: 'card' }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'card' }, {});
  assert.equal(after.cards.find((card) => card.id === 'b').stackId, undefined);
});

test('D129: a THIRD card dropped onto a column joins the SAME stack, not a new one', () => {
  // The original bug's shape, now at the model level: a third card must
  // extend the existing column rather than start a second one beside it.
  const pile = plainPile([{ id: 'a', pileableType: 'card' }]);
  const two = pile.insertPileable({ id: 'b', pileableType: 'card' }, { targetCardId: 'a', layout: 'column' });
  const three = new PILE_TYPES.plain(two).insertPileable(
    { id: 'c', pileableType: 'card' }, { targetCardId: 'b', layout: 'column' },
  );

  const ids = new Set(three.cards.map((card) => card.stackId));
  assert.equal(ids.size, 1, `all three must share one stack, got ${[...ids]}`);
  assert.equal(Object.keys(three.stacks).length, 1, 'and exactly one stack is recorded');
});

test('D129: one pile can hold a vertical column AND a horizontal run at once', () => {
  // The case a pile-wide direction could not express, and the last
  // thing forcing a second layout mechanism to exist.
  const pile = plainPile([{ id: 'a', pileableType: 'card' }, { id: 'x', pileableType: 'card' }]);
  const withColumn = pile.insertPileable({ id: 'b', pileableType: 'card' }, { targetCardId: 'a', layout: 'column' });
  const both = new PILE_TYPES.plain(withColumn).insertPileable(
    { id: 'y', pileableType: 'card' }, { targetCardId: 'x', layout: 'overlap' },
  );

  const directions = Object.values(both.stacks).map((stack) => stack.direction);
  assert.deepEqual(directions.toSorted(), [HORIZONTAL, VERTICAL]);
});


// The view shape is an EXPLICIT field list, so a new pile-level field
// is invisible to every client until it is named there. That has now
// bitten twice - `spread` (Tighten/Loosen did nothing on screen) and
// `stacks` (a battlefield column rendered flat) - both times with a
// fully green model suite. This guards the whole category rather than
// the two fields that happened to get caught.
test('every field the LAYOUT depends on crosses into the view', () => {
  const pile = new Pile({
    id: 'z',
    kind: 'plain',
    cards: [{ id: 'a', stackId: 's' }],
    spread: 0.4,
    stacks: { s: { direction: VERTICAL } },
  });
  const view = pile.getView();
  for (const field of ['cards', 'spread', 'stacks', 'kind']) {
    assert.ok(Object.hasOwn(view, field),
      `${field} must reach the client - the renderer lays out from the view, not the record`);
  }
  assert.deepEqual(view.stacks, { s: { direction: VERTICAL } });
});

// Model-level mirror of the browser cascade test - the cheapest level
// that can see the whole lands pipeline: insert -> membership ->
// stacks -> offsets. When the browser says "the cascade is flat", this
// says which step flattened it.
test('D129: a lands pile lays its colour columns out VERTICALLY', () => {
  const lands = new PILE_TYPES.lands({ id: 'l', kind: 'lands', cards: [] });
  const cards = [
    { id: 'w1', pileableType: 'card', face: 'rtg', cost: '{W}' },
    { id: 'w2', pileableType: 'card', face: 'rtg', cost: '{W}' },
    { id: 'w3', pileableType: 'card', face: 'rtg', cost: '{W}' },
  ];
  // Through a REAL drop placement (a target plus a direction hint),
  // which is what a player actually does - a bare append would not
  // exercise the metadata `Pile.insertPileable` records.
  let pile = new PILE_TYPES.lands(lands.insertPileable(cards[0]));
  for (const card of cards.slice(1)) {
    const target = pile.cards.at(-1).id;
    pile = new PILE_TYPES.lands(pile.insertPileable(card, { targetCardId: target, layout: 'overlap' }));
  }

  const stacks = stacksOf({
    cards: pile.cards,
    stacks: pile.stacks,
    direction: PILE_TYPES.lands.stackDirection,
    spread: PILE_TYPES.lands.defaultSpread,
  });

  const deepest = stacks.toSorted((a, b) => b.pileables.length - a.pileables.length)[0];
  assert.equal(deepest.pileables.length, 3, 'same-colour lands share one column');
  assert.equal(deepest.direction, VERTICAL,
    `a cascade must run vertically - pile default ${PILE_TYPES.lands.stackDirection}, ` +
    `recorded metadata ${JSON.stringify(pile.stacks)}`);

  const ys = deepest.layout().map((position) => position.y);
  for (const [index, y] of ys.slice(1).entries()) {
    assert.ok(y > ys[index], `each land must cascade further down, got ${ys.join(', ')}`);
  }
});

// Test-audit gap (2026-09-11): TokenPile.pileActions() had no direct
// test at all - only exercised incidentally through whatever a preset
// happened to declare. Confirms both halves of its own doc comment:
// no `break`/`changePileType` (token-specific "no false affordance"
// reasoning), but the universal pile actions are still offered.
test('TokenPile: offers take/split/remove/tighten/loosen but no break or changePileType', () => {
  const actions = new TokenPile({ id: 'tokens', kind: 'token', cards: [] }).pileActions({ cards: [] });
  for (const id of ['take', 'split', 'remove', 'tightenAll', 'loosenAll']) {
    assert.ok(actions.includes(id), `missing ${id}`);
  }
  assert.ok(!actions.includes('break'), 'break is a CHIP denomination concept, not a token one');
  assert.ok(!actions.includes('changePileType'), 'converting a token supply to another kind is not a real choice');
});
