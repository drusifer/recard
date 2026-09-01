import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILE_TYPES, CHANGE_PILE_TYPE_KINDS, pileKindLabel } from '../src/piles/pileTypes.js';
import { Pile } from '../src/piles/Pile.js';
import { DeckPile } from '../src/piles/DeckPile.js';
import { HandPile } from '../src/piles/HandPile.js';
import { DiscardPile } from '../src/piles/DiscardPile.js';
import { FoundationPile } from '../src/piles/FoundationPile.js';
import { CascadePile } from '../src/piles/CascadePile.js';
import { RankAdjacentPile } from '../src/piles/RankAdjacentPile.js';
import { ExilePile } from '../src/piles/ExilePile.js';
import { RunPile } from '../src/piles/RunPile.js';
import { SetPile } from '../src/piles/SetPile.js';

// D42/D56: one CLASS per pile TYPE instead of a `kind` string switched
// on in state.js/pileActions.js. D93: piles are real instances now
// (`new SomeKind(data)`), not plain data passed into static methods -
// every test below constructs a real instance and calls its INSTANCE
// methods, matching how `state.js`/`pileActions.js`/`ui.js` actually
// call them now (`revivePile(pile).method(...)`).

// D79 (US-82) added battlefield/exile/stack. Kept as an EXACT list
// rather than relaxed to a subset check: knowing precisely which kinds
// ship is the guard's whole value, so a new kind should have to be
// added here on purpose.
test('the registry exposes exactly the twelve pile kinds', () => {
  assert.deepEqual(Object.keys(PILE_TYPES).toSorted(),
    ['battlefield', 'cascade', 'deck', 'discard', 'exile', 'foundation', 'hand', 'plain', 'rankAdjacent', 'run', 'set', 'stack']);
  assert.equal(PILE_TYPES.deck, DeckPile);
  assert.equal(PILE_TYPES.hand, HandPile);
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
// structural GUARANTEE, not scattered
// convention/folklore - iterates PILE_TYPES so a FUTURE kind that
// accidentally restricts drag-and-drop fails CI immediately, same
// "executable guarantee" instinct as assertCardsConserved. DeckPile is
// the one documented, deliberate exception: it has never rendered a
// per-card hover row (D34, DeckPile.js's own `cardActions` comment) -
// Draw/Deal/Shuffle are pile-level actions instead, so it is named here
// rather than silently skipped by a broader rule that could hide a
// future, undocumented exception too.
test('universal drag-and-drop guarantee: every concrete pile kind (except Deck) offers move or play on a visible card', () => {
  const card = { id: 'c1', faceUp: true };
  for (const [kind, PileClass] of Object.entries(PILE_TYPES)) {
    if (PileClass === DeckPile) continue;
    const pile = new PileClass({ kind, cards: [card], ownerId: 'someone-else' });
    const actions = pile.cardActions(card, 'viewer-id');
    assert.ok(actions.includes('move') || actions.includes('play'),
      `${kind} pile must offer move or play for drag-and-drop (Core invariant): got ${JSON.stringify(actions)}`);
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
  const boxes = [{ cardId: 'a', left: 0, right: 10, top: 0, bottom: 10, width: 10 }];
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


test('reparentable: hand opts out (D55/US-63/D64), everything else - including deck now - stays eligible', () => {
  assert.equal(DeckPile.reparentable, true, 'D64: reversed Sprint 23\'s deck exclusion, direct user request');
  assert.equal(HandPile.reparentable, false);
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

// --- cardActions: characterized against pileActions.js's actionsForCard ---

const deck = { id: 'deck', kind: 'deck', ownerId: null };
const myHand = { id: 'hand:me', kind: 'hand', ownerId: 'me' };
const theirHand = { id: 'hand:you', kind: 'hand', ownerId: 'you' };
const table = { id: 'table', kind: 'plain', ownerId: null };

test('deck cardActions: always empty (D34 moved draw off the per-card table)', () => {
  assert.deepEqual(new DeckPile(deck).cardActions({ id: 'c' }, 'me'), []);
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
// can drag a card straight out of anyone's hand. The owner still gets
// `['play']`, not `['move']` - that's a naming necessity (PLAY's own
// authorization needs the literal string `'play'`), not a restriction.
test('hand cardActions: play for the owner, move for anyone else - never empty any more', () => {
  assert.deepEqual(new HandPile(myHand).cardActions({ id: 'c' }, 'me'), ['play']);
  assert.deepEqual(new HandPile(theirHand).cardActions({ id: 'c' }, 'me'), ['move']);
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

test('zone (base Pile) cardActions: face-up card offers pickup/move, not reveal', () => {
  assert.deepEqual(new Pile(table).cardActions({ faceUp: true, owner: null }, 'me'), ['pickup', 'move', 'rotate']);
});

test('zone cardActions: face-down card offers reveal/pickup/move/rotate - all four, no ownership check left, D83/D84', () => {
  assert.deepEqual(new Pile(table).cardActions({ faceUp: false, owner: null }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(new Pile(table).cardActions({ faceUp: false, owner: 'you' }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
  assert.deepEqual(new Pile(table).cardActions({ faceUp: false, owner: 'me' }, 'me'), ['reveal', 'pickup', 'move', 'rotate']);
});

test('cascade/rankAdjacent inherit the same cardActions rule as the base Pile, unmodified', () => {
  const faceUp = { faceUp: true, owner: null };
  assert.deepEqual(new CascadePile(table).cardActions(faceUp, 'me'), ['pickup', 'move', 'rotate']);
  assert.deepEqual(new RankAdjacentPile(table).cardActions(faceUp, 'me'), ['pickup', 'move', 'rotate']);
});

// --- pileActions: characterized against pileActions.js's pileLevelActions ---

test('deck pileActions: draw open to everyone, deal/reshuffleDeal/shuffle/split/changePileType host-only (D91: split joins, instant/always-half at the ui.js/main.js layer)', () => {
  assert.deepEqual(new DeckPile(deck).pileActions({ isHost: true }), ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split', 'changePileType']);
  assert.deepEqual(new DeckPile(deck).pileActions({ isHost: false }), ['draw']);
});

test('deck disabledActions: deal disabled at 0 cards, split disabled below 2', () => {
  assert.deepEqual(new DeckPile(deck).disabledActions(0), ['deal', 'split']);
  assert.deepEqual(new DeckPile(deck).disabledActions(1), ['split']);
  assert.deepEqual(new DeckPile(deck).disabledActions(2), []);
});

test('hand pileActions: sort + changePileType, owner only - pass removed (direct user request, not a requirement)', () => {
  assert.deepEqual(new HandPile(myHand).pileActions({ isOwner: true }), ['sortRank', 'sortSuit', 'changePileType']);
  assert.deepEqual(new HandPile(myHand).pileActions({ isOwner: false }), []);
});

test('cascade/rankAdjacent pileActions: none of the multi-card-sequence actions target either - D71 (US-74) adds changePileType as the one exception', () => {
  assert.deepEqual(new CascadePile(table).pileActions({}), []);
  assert.deepEqual(new RankAdjacentPile(table).pileActions({}), []);
  assert.deepEqual(new CascadePile(table).pileActions({ isShared: true }), ['changePileType']);
  assert.deepEqual(new RankAdjacentPile(table).pileActions({ isShared: true }), ['changePileType']);
});

// --- Write-side (D43): canRemoveCard/removeCard/insertCard ---

// *nit (direct user request, D83, "fully permissive drag and drop...
// remove the older restrictions from ALL pile and zone types"): every
// ownership check that used to gate pickup/move/rotate is gone. The
// only condition left is `reveal`'s own "already visible, nothing to
// reveal" no-op guard - not an authorization restriction.
test('zone canRemoveCard: reuses cardActions - fully permissive now, only reveal keeps a (non-authorization) condition', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  const hiddenUnowned = { id: 'c', faceUp: false, owner: null };
  const hiddenMine = { id: 'c', faceUp: false, owner: 'me' };
  const hiddenTheirs = { id: 'c', faceUp: false, owner: 'you' };
  assert.equal(new Pile(table).canRemoveCard(faceUp, 'me', 'pickup'), true);
  assert.equal(new Pile(table).canRemoveCard(faceUp, 'me', 'reveal'), false, 'already face-up, nothing to reveal');
  assert.equal(new Pile(table).canRemoveCard(hiddenUnowned, 'me', 'reveal'), true, 'unowned face-down - anyone may reveal');
  assert.equal(new Pile(table).canRemoveCard(hiddenMine, 'anyone-else', 'move'), true, 'a non-owner can now move someone else\'s still-hidden private card');
  assert.equal(new Pile(table).canRemoveCard(hiddenMine, 'me', 'move'), true, 'the owner can move their own still-hidden card');
  assert.equal(new Pile(table).canRemoveCard(hiddenTheirs, 'me', 'pickup'), true, 'a still-hidden card can now be picked up blind by anyone');
});

test('plain pile removeCard/insertCard: pure, round-trips a card', () => {
  const pile = { id: 'z', kind: 'plain', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = new Pile(pile).removeCard('a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const reinserted = new Pile(removed).insertCard({ id: 'a' });
  assert.deepEqual(reinserted.cards.map((c) => c.id), ['b', 'a'], 'no placement - appends');
});

test('plain pile insertCard: placement before/after a target, layout on the correct card (Smith Gate 2 direction rule)', () => {
  const pile = { id: 'z', kind: 'plain', cards: [{ id: 'a' }, { id: 'b' }] };
  const before = new Pile(pile).insertCard({ id: 'x' }, { targetCardId: 'b', side: 'before', layout: 'overlap' });
  assert.deepEqual(before.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(before.cards.find((c) => c.id === 'b').layout, 'overlap', 'before-drop: layout lands on the TARGET, not the dropped card');
  assert.equal(before.cards.find((c) => c.id === 'x').layout, undefined);

  const after = new Pile(pile).insertCard({ id: 'x' }, { targetCardId: 'a', side: 'after', layout: 'stack' });
  assert.deepEqual(after.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(after.cards.find((c) => c.id === 'x').layout, 'stack');
});

test('hand canRemoveCard: true - PLAY has never been authorized per-card, only per-hand-ownership (inherited from Pile, resolved via `this`)', () => {
  assert.equal(new HandPile(myHand).canRemoveCard({ id: 'c' }, 'me', 'play'), true);
  assert.equal(new HandPile(theirHand).canRemoveCard({ id: 'c' }, 'me', 'play'), false, 'not your hand');
});

test('hand removeCard/insertCard: pure, appends on insert (both inherited from Pile, unmodified)', () => {
  const pile = { id: 'hand:me', kind: 'hand', ownerId: 'me', cards: [{ id: 'a' }] };
  const removed = new HandPile(pile).removeCard('a');
  assert.deepEqual(removed.cards, []);
  const inserted = new HandPile(removed).insertCard({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b']);
});

test('deck canRemoveCard: always true - DRAW has never been per-card authorized (deck cards have no owner)', () => {
  assert.equal(new DeckPile(deck).canRemoveCard({ id: 'c' }, 'anyone', 'draw'), true);
});

test('deck removeCard/insertCard: pure (removeCard inherited from Pile, insertCard overridden to prepend)', () => {
  const pile = { id: 'deck', kind: 'deck', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = new DeckPile(pile).removeCard('a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const inserted = new DeckPile(removed).insertCard({ id: 'c' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['c', 'b'], 'unexercised by any current action - DRAW only ever removes, never inserts, into a deck');
});

// --- Discard (D45, reversed by direct user request: "discard pile is
// just a deck (face up or down)" - full per-card access now, same as
// the base Pile; "stack" (top-only insert) is the one thing left. ---

const discard = { id: 'discard', kind: 'discard', ownerId: null };

test('discard cardActions: inherited from Pile, unmodified - same as any other zone (D45 reversed)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(new DiscardPile(discard).cardActions(faceUp, 'me'), ['pickup', 'move', 'rotate']);
});

test('discard pileActions: take/split/hide/show, inherited from Pile unmodified - same shared/owner-open rule', () => {
  assert.deepEqual(new DiscardPile(discard).pileActions({ isShared: true }), ['take', 'split', 'changePileType', 'remove']);
  assert.deepEqual(new DiscardPile(discard).pileActions({}), []);
});

test('discard canRemoveCard: same per-card rule as the base Pile - not unconditionally false any more', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  for (const action of ['pickup', 'move']) {
    assert.equal(new DiscardPile(discard).canRemoveCard(faceUp, 'me', action), true, action);
  }
});

// *nit (direct user request, reversed AGAIN): exile's own "one-way,
// cardActions always []" override is gone too now - `docs/
// ARCHITECTURE.md`'s "Core invariant" ("drag and drop are always
// allowed in all pile types... no matter what") forbids ANY pile-kind
// override from blocking single-card move, exile included. Exile still
// offers no bulk `take` (a pile-level CONVENIENCE, unaffected).
test('exile cardActions: inherited from Pile via DiscardPile, unmodified - drag-and-drop always works, even out of exile', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(
    new ExilePile({ id: 'exile', kind: 'exile', ownerId: null }).cardActions(faceUp, 'me'),
    ['pickup', 'move', 'rotate'],
  );
});

test('discard insertCard: always lands on top (index 0), no placement/halo splicing like the base Pile', () => {
  const pile = { id: 'discard', kind: 'discard', cards: [{ id: 'a' }] };
  const inserted = new DiscardPile(pile).insertCard({ id: 'b' }, { targetCardId: 'a', side: 'before' });
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
// `cardActions` is inherited straight from the base `Pile` now (via
// `MeldPile`, which no longer overrides it) - same reveal/pickup/move/
// rotate rule as any other pile's, privacy-filtered (D7) same as ever.
test('foundation: append-only insert; card actions are the SAME as any other pile\'s now (inherited from Pile, not locked by MeldPile)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  const pile = { cards: [{ id: 'a' }] };
  assert.deepEqual(new FoundationPile(pile).cardActions(faceUp, 'me'), ['pickup', 'move', 'rotate']);
  assert.equal(new FoundationPile(pile).canRemoveCard(faceUp, 'me', 'move'), true);
  const inserted = new FoundationPile(pile).insertCard({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['a', 'b']);
});

test('foundation: split/changePileType are the pile-level actions offered, inherited from MeldPile (D71/US-74, D91)', () => {
  assert.deepEqual(new FoundationPile({}).pileActions({}), []);
  assert.deepEqual(new FoundationPile({}).pileActions({ isShared: true }), ['split', 'changePileType']);
});

test('foundation: tableSide true (inherited from Pile), resolveDropTarget always empty (no halo geometry, from MeldPile)', () => {
  assert.equal(FoundationPile.tableSide, true);
  assert.deepEqual(new FoundationPile({}).resolveDropTarget([{ cardId: 'a' }], { x: 0, y: 0 }), {});
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
  const inserted = new SetPile(pile).insertCard({ id: 'b', rank: 'K', suit: 'hearts' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['a', 'b']);
  assert.deepEqual(new SetPile(pile).resolveDropTarget([{ cardId: 'a' }], { x: 0, y: 0 }), {});
  assert.deepEqual(new SetPile(pile).pileActions({ isShared: true }), ['split', 'changePileType']);
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

test('cascade insertCard: first card renders flat, every card after carries layout: overlap (D21 reuse)', () => {
  const empty = { cards: [] };
  const first = new CascadePile(empty).insertCard({ id: 'a' });
  assert.equal(first.cards[0].layout, undefined);
  const second = new CascadePile(first).insertCard({ id: 'b' });
  assert.equal(second.cards[1].layout, 'overlap');
});

test('cascade: tableSide true (inherited), resolveDropTarget always empty (accept/reject only, no positional choice)', () => {
  assert.equal(CascadePile.tableSide, true);
  assert.deepEqual(new CascadePile({}).resolveDropTarget([{ cardId: 'a' }], { x: 0, y: 0 }), {});
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

test('rankAdjacent insertCard: STACK - lands on top (index 0), same convention as discard', () => {
  const pile = { cards: [{ id: 'a' }] };
  const inserted = new RankAdjacentPile(pile).insertCard({ id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b', 'a']);
});

test('rankAdjacent: no turn-order/ownership restriction on move - matches Spit\'s simultaneous-play rule (inherited from Pile)', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  assert.deepEqual(new RankAdjacentPile({}).cardActions(faceUp, 'anyone'), ['pickup', 'move', 'rotate']);
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
