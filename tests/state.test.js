import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor, deckOf, handOf, handsOf, pilesOf, pileVisibility, assertCardsConserved, reseatOwner } from '../src/state.js';
import { PILE_TYPES } from '../src/piles/pileTypes.js';
import { SPREAD_STEP, MIN_SPREAD, MAX_SPREAD } from '../src/piles/Pile.js';

const HAND_DEFAULT_SPREAD = PILE_TYPES.hand.defaultSpread;
// The reducer rounds to the step for a real reason (0.7 + 0.1 is
// 0.7999999999999999 in binary floating point, which would never
// compare equal to MAX_SPREAD and so would never disable the button).
// Expectations have to round the same way or they test the drift.
const spreadAfter = (steps) => Math.round((HAND_DEFAULT_SPREAD + steps * SPREAD_STEP) * 1000) / 1000;
import { PlayerHandPile } from '../src/piles/PlayerHandPile.js';

function withPlayers(state, ids) {
  let s = state;
  for (const id of ids) s = reduce(s, { type: 'JOIN', playerId: id, name: id });
  return s;
}

// UX follow-up: deckPile.tableSide is true now, so pilesOf() (every
// table-side pile) includes the original deck pile too, ahead of
// 'table' in creation order. These two helpers keep the below tests
// reading "the default Table zone" / "every zone a viewer actually
// sees a card list for", matching pre-follow-up behavior, rather than
// silently drifting to mean "whatever's first in the array".
function tableOf(state) {
  return pilesOf(state).find((z) => z.id === 'table');
}
function visibleZonesOf(state) {
  return pilesOf(state).filter((z) => z.id !== 'deck');
}
// UX follow-up (direct user request): "a Deck is a specific kind of
// Pile" - the deck is a real pile in `view.piles` now (D94: single-
// routed, like any other pile - the old `deckCount` top-level field it
// used to ALSO populate is retired), so `view.piles[0]` is no longer
// reliably the Table zone. Same "look it up by id" fix as `tableOf
// (state)` above, for view-shaped zones.
function tableViewOf(view) {
  return view.piles.find((z) => z.id === 'table');
}

test('createInitialState: empty roster, full shuffled deck, one empty default zone', () => {
  const state = createInitialState({ numDecks: 1, jokers: 0 }, () => 0.5);
  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(state.players, []);
  assert.equal(pilesOf(state).length, 2, 'the deck (UX follow-up: now tableSide too) + the default Table zone');
  assert.deepEqual(tableOf(state).cards, []);
});

// --- D46: GameConfig's first real field ---

test('createInitialState: gameConfig.allowsPlayerZones defaults true - matches every prior sprint\'s behavior exactly', () => {
  const state = createInitialState({}, () => 0.5);
  // `cardsPerPlayer` joined the shape when a restored table needed to
  // recover its own deal size; `undefined` when no preset set one.
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: true, tableZone: true, piles: [], zones: [], cardsPerPlayer: undefined });
});

test('createInitialState: allowsPlayerZones can be set false via the third param', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: false, tableZone: true, piles: [], zones: [], cardsPerPlayer: undefined });
});

test('CREATE_ZONE: rejected when the game disallows player zones', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x' }), /does not allow/);
});

test('CREATE_ZONE: allowsPlayerZones does not affect JOIN or SPLIT_PILE\'s piles - only this action is gated', () => {
  // UX follow-up (direct user request): JOIN no longer auto-creates a
  // personal zone - a player's seat is their hand pile now, created
  // lazily on first deal/draw/pickup, not eagerly at JOIN.
  let state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'p1' });
  assert.equal(pilesOf(state).length, 2, 'deck + default table only, JOIN added nothing that went through CREATE_ZONE');
  state = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });
  assert.equal(pilesOf(state).length, 3, 'deck + default + 1 split pile - also unaffected');
});

test('CREATE_ZONE: a snapshot with no gameConfig at all (pre-D46) defaults to allowed, not a crash', () => {
  const state = createInitialState({}, () => 0.5);
  const { gameConfig, ...preD46State } = state;
  assert.doesNotThrow(() => reduce(preD46State, { type: 'CREATE_ZONE', name: 'x' }));
});

// --- D50: allowsPlayerZones reaches the view, so ui.js can hide the
// control instead of only rejecting the click ---

test('viewFor: carries gameConfig.allowsPlayerZones through, both true and false', () => {
  const allowed = createInitialState({}, () => 0.5);
  assert.equal(viewFor(allowed, 'anyone').gameConfig.allowsPlayerZones, true);
  const disallowed = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.equal(viewFor(disallowed, 'anyone').gameConfig.allowsPlayerZones, false);
});

test('viewFor: a pre-D46 snapshot with no gameConfig still produces a view that defaults to allowed', () => {
  const state = createInitialState({}, () => 0.5);
  const { gameConfig, ...preD46State } = state;
  const view = viewFor(preD46State, 'anyone');
  assert.equal(view.gameConfig.allowsPlayerZones, true);
});

test('JOIN: adds a player to the roster with connecting state', () => {
  const state = reduce(createInitialState({}, () => 0.5), {
    type: 'JOIN',
    playerId: 'p1',
    name: 'Alice'
  });
  assert.equal(state.players.length, 1);
  assert.equal(state.players[0].id, 'p1');
  assert.equal(state.players[0].connection, 'connected');
});

test('DEAL: distributes evenly to all joined players and shrinks the deck', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2', 'p3']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });

  assert.equal(handOf(state, 'p1').length, 5);
  assert.equal(handOf(state, 'p2').length, 5);
  assert.equal(handOf(state, 'p3').length, 5);
  assert.equal(deckOf(state).length, 52 - 15);
});

test('PLAY: moves a card from a hand to the table', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  const pileableId = handOf(state, 'p1')[0].id;

  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  assert.equal(handOf(state, 'p1').length, 2);
  assert.equal(tableOf(state).cards.length, 1);
  assert.equal(tableOf(state).cards[0].id, pileableId);
  assert.ok(handOf(state, 'p1').every((c) => c.id !== pileableId));
});

test('PLAY: throws if the card is not in that player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  assert.throws(() => reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'not-a-real-id' , toPileId: 'table'}));
});

test('DRAW: moves the top of the deck into the drawing player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  const deckSizeBefore = deckOf(state).length;
  const topCard = deckOf(state)[0];

  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p1' });

  assert.equal(deckOf(state).length, deckSizeBefore - 1);
  assert.equal(handOf(state, 'p1').length, 1);
  assert.equal(handOf(state, 'p1')[0].id, topCard.id);
});

test('DRAW: throws when the deck is empty', () => {
  let state = createInitialState({ numDecks: 1 }, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 52 });
  assert.throws(() => reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p1' }));
});

test('RESET: reshuffles the deck and clears hands/zone cards, keeps zone structure, drops hand piles', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: handOf(state, 'p1')[0].id , toPileId: 'table'});
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  // UX follow-up (direct user request): `pilesOf` now ALSO matches hand
  // piles (`handPile.tableSide: true`) - excluded here since a hand
  // pile is exactly what RESET is supposed to drop, not preserve; the
  // structure that's actually meant to survive is deck + default +
  // player-created zones only.
  const structuralZoneCountBeforeReset = pilesOf(state).filter((z) => z.kind !== 'hand').length; // deck + default + Discard

  state = reduce(state, { type: 'RESET' });

  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(handsOf(state), {}, 'hand piles are dropped outright, not just emptied');
  assert.equal(
    pilesOf(state).length,
    structuralZoneCountBeforeReset,
    'table-side zone structure survives a reset; hand piles do not',
  );
  assert.ok(visibleZonesOf(state).every((z) => z.cards.length === 0), 'every zone\'s cards clear on reset');
  assert.equal(state.players.length, 2);
});

// UX follow-up (real bug, found live): the deck pile RESET rebuilds
// didn't pass a `zoneId`, so it fell back to `makePile`'s own default
// (a standalone zone equal to its own id, `'deck'`) instead of landing
// back in `TABLE_ZONE_ID` - invisible to `pilesOf`'s panel grouping.
test('RESET: the rebuilt deck lands back in the Table Zone, not a standalone zone of its own', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });

  state = reduce(state, { type: 'RESET' });

  const deckPile = state.piles.find((p) => p.id === 'deck');
  assert.equal(deckPile.zoneId, 'table-zone');
});

// Direct user request: "no more unconditional presets, everything must
// be in the preset config" - RESET used to always rebuild a Deck pile
// (`makeDeckPile`) whether or not the game ever had one. A preset that
// opted out via `gameConfig.tableZone: false` (RTG) has no DECK_PILE_ID
// at game start; RESET must honor that instead of silently reintroducing
// one.
test('RESET: a game with gameConfig.tableZone: false stays deckless - no deck pile is reintroduced', () => {
  let state = createInitialState({}, () => 0.5, { tableZone: false });
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });

  state = reduce(state, { type: 'RESET' });

  assert.ok(state.piles.every((p) => p.id !== 'deck'), 'no deck pile should exist');
});

// US-109 ("spit and polish", found by actually playing RtG): a
// `tableZone: false` preset's own DECLARED decks are the only starting-
// deck piles in the game - before this fix, RESET emptied them like any
// ordinary pile (cards never survive a reset) with nothing to rebuild
// them from. Restart Game permanently destroyed RtG's entire card pool.
test('RESET: a declared card deck (tableZone: false, e.g. RtG) is REBUILT, not just emptied', () => {
  let state = createInitialState({}, () => 0.5, {
    tableZone: false,
    zones: [{ id: 'decks-zone', name: 'Decks' }],
    piles: [
      { kind: 'deck', id: 'deckA', zoneId: 'decks-zone', deckType: 'rtg', deckList: 'rtg-guild-wu' },
      { kind: 'deck', id: 'deckB', zoneId: 'decks-zone', deckType: 'rtg', deckList: 'rtg-guild-wu' },
    ],
  });
  state = withPlayers(state, ['p1']);
  // Simulate real play: draw from deckA, so it's not just sitting untouched.
  state = reduce(state, { type: 'DRAW', playerId: 'p1', pileId: 'deckA' });

  const next = reduce(state, { type: 'RESET' });

  assert.equal(next.piles.find((p) => p.id === 'deckA').cards.length, 60, 'deckA is rebuilt to its full declared size, not left at 59 or emptied to 0');
  assert.equal(next.piles.find((p) => p.id === 'deckB').cards.length, 60, 'deckB (never touched) is still a real, full deck after RESET');
  assert.deepEqual(handOf(next, 'p1'), [], 'the drawn card is gone - RESET is a real restart, not a no-op');
});

// A chip/token supply must NOT be rebuilt the same way: it already
// survives RESET via `survivorsOfReset` (D111), and rebuilding it fresh
// would spawn a brand-new set ALONGSIDE whatever already wandered onto
// a battlefield mid-game, duplicating them.
test('RESET: a declared chip/token supply keeps its EXISTING pieces (D111), not a freshly rebuilt duplicate set', () => {
  let state = createInitialState({}, () => 0.5, {
    tableZone: false,
    zones: [{ id: 'decks-zone', name: 'Decks' }],
    piles: [{ kind: 'plain', id: 'tokens', zoneId: 'decks-zone', deckType: 'chips', deckList: 'standard-tokens' }],
  });
  state = withPlayers(state, ['p1']);
  const before = state.piles.find((p) => p.id === 'tokens').cards.map((c) => c.id).toSorted();

  const next = reduce(state, { type: 'RESET' });

  assert.deepEqual(next.piles.find((p) => p.id === 'tokens').cards.map((c) => c.id).toSorted(), before,
    'the exact same tokens, not a second freshly-built set');
});

// *nit (direct user request, D84: "remove card redaction entirely...
// TOTAL PERMISSIVE"): another player's hand used to be identity-
// redacted in `zones[]` (rank/suit stripped) - it's the real, full hand
// now, same data `myHand` carries for its own owner. `otherHandCounts`
// stays as a convenience tally, not a privacy limit.
test('viewFor: every player\'s hand is fully visible to every viewer now, owner and non-owner alike', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 4 });

  const ownerView = viewFor(state, 'p1');
  const otherView = viewFor(state, 'p2');

  assert.equal(ownerView.myHand.length, 4);
  assert.equal(otherView.otherHandCounts.p1, 4);
  assert.equal(otherView.myHand.length, 4);
  assert.ok(
    !JSON.stringify(otherView.myHand).includes(handOf(state, 'p1')[0].rank),
    'a player\'s OWN hand field must never contain another player\'s card data',
  );
  const p1HandView = otherView.piles.find((z) => z.kind === 'hand' && z.ownerId === 'p1');
  assert.ok(p1HandView, 'p1\'s hand pile must still appear in p2\'s view.piles (rendered at their seat)');
  assert.deepEqual(p1HandView.cards, handOf(state, 'p1'), 'the real cards, same as the host itself sees - no redaction left');
  const myHandView = ownerView.piles.find((z) => z.kind === 'hand' && z.ownerId === 'p1');
  assert.deepEqual(myHandView.cards, ownerView.myHand, 'the owner\'s own hand-in-zones view matches myHand');
});

// D94: `view.deckCount` (a bespoke top-level field) is gone - the
// deck's own `view.piles` entry carries `count` directly now (D93's
// `DeckPile.getView` override), same place every other pile's size
// lives. D84 ("TOTAL PERMISSIVE"): the deck's full contents are in that
// same entry's `cards` too, not just a count - this test only ever
// checked the count + an unrelated table-zone card, so its own
// assertions (updated to the new field location) are otherwise
// untouched.
test('viewFor: deck exposes a count (D93: on its own view.piles entry), table is fully public', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: handOf(state, 'p1')[0].id , toPileId: 'table'});

  const view = viewFor(state, 'p1');
  const deckView = view.piles.find((p) => p.id === 'deck');
  assert.equal(typeof deckView.count, 'number');
  assert.equal(deckView.count, deckOf(state).length);
  const tableView = tableViewOf(view);
  assert.equal(tableView.cards.length, 1);
  assert.equal(tableView.cards[0].id, tableOf(state).cards[0].id);
});

// --- Middle-zone visibility (D7/D8, US-12/13/14) ---

test('PLAY: defaults to public visibility (owner null, faceUp true) — regression', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: handOf(state, 'p1')[0].id , toPileId: 'table'});

  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, true);
});

// *nit (direct user request, D84: "remove card redaction entirely...
// TOTAL PERMISSIVE"): `faceUp`/`owner` are still real GAME-STATE fields
// - what's gone is `viewFor` ever withholding rank/suit based on them.
// Every viewer now sees the real card regardless.
//
// D102: these two used to be a pair of PLAY tests that reached the
// face-down states through `visibility: 'shared-facedown'` /
// `'private-facedown'`. That parameter is gone with the verb, and was
// already dead in the product before it - the UI has passed nothing
// but `'public'` since "Hide as"/Play Hidden was removed, so the two
// branches existed only for these tests. The states themselves are
// still perfectly reachable (any face-down card the reducer moves
// between table piles keeps its fields), so they're seeded directly
// here: what's being asserted is `viewFor`'s non-redaction, never how
// the card got face-down.
test('a face-down table card is fully visible to every viewer - shared (owner:null) and private (owner:p1) alike, no redaction left', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  const shared = { id: 'shared-c', rank: '7', suit: 'clubs', owner: null, faceUp: false };
  const priv = { id: 'private-c', rank: 'K', suit: 'hearts', owner: 'p1', faceUp: false };
  state = { ...state, piles: state.piles.map((p) => (p.id === 'table' ? { ...p, cards: [shared, priv] } : p)) };

  const table = tableOf(state);
  assert.equal(table.cards[0].owner, null, 'shared-facedown: unowned, face-down, real game state');
  assert.equal(table.cards[0].faceUp, false);
  assert.equal(table.cards[1].owner, 'p1', 'private-facedown: owned, face-down, real game state');
  assert.equal(table.cards[1].faceUp, false);

  for (const viewerId of ['p1', 'p2']) {
    const view = tableViewOf(viewFor(state, viewerId));
    assert.deepEqual(view.cards.map((c) => c.id), ['shared-c', 'private-c'], `${viewerId} sees both`);
    assert.ok('rank' in view.cards[0], `${viewerId} sees the shared face-down card's rank`);
    assert.ok('rank' in view.cards[1], `${viewerId} sees the PRIVATE face-down card's rank too - owner and non-owner alike`);
  }
});

// D102: a card leaving a hand for a table pile is public and face-up,
// unconditionally - the rule PLAY's `transform` used to own, now
// `transferCard`'s, applied to every action rather than one verb.
test('MOVE out of a hand stamps public/face-up (owner null, faceUp true) - the retired PLAY transform, now generic', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const card = handOf(state, 'p1')[0];
  assert.equal(card.owner, 'p1', 'in hand: owned');
  assert.equal(card.faceUp, false, 'in hand: face-down');

  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: card.id, toPileId: 'table' });
  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, true);
});

// The mirror's ordering guarantee: a hand DESTINATION wins over the
// leaving-a-hand rule, so a same-hand reorder never picks up
// owner:null/faceUp:true. This was PLAY's explicit `isReorder` special
// case; it's structural now, which is why it gets its own test.
test('MOVE within one hand is a reorder - it does NOT stamp the leaving-a-hand transform (D102, was PLAY isReorder)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [first, second] = handOf(state, 'p1');
  state = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: first.id, toPileId: 'hand:p1', targetCardId: second.id, side: 'after',
  });

  const hand = handOf(state, 'p1');
  assert.equal(hand.length, 2, 'still in hand');
  assert.deepEqual(hand.map((c) => c.id), [second.id, first.id], 'really reordered');
  const moved = hand.find((c) => c.id === first.id);
  assert.equal(moved.owner, 'p1', 'still owned by its holder, not stamped public');
  assert.equal(moved.faceUp, false, 'still face-down, not stamped face-up');
});

// D102: a hand-to-hand transfer takes the same destination branch - the
// card is re-stamped for its NEW hand, never made public in passing.
test('MOVE from one hand into another re-stamps for the destination hand, never public (D102)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const card = handOf(state, 'p1')[0];
  state = reduce(state, { type: 'MOVE', playerId: 'p2', pileableId: card.id, toPileId: 'hand:p2' });

  assert.equal(handOf(state, 'p1').length, 0);
  // p2 was dealt a card of their own too, so the taken card is the
  // second one in that hand - find it by id rather than by position.
  const taken = handOf(state, 'p2').find((c) => c.id === card.id);
  assert.ok(taken, 'the card really landed in p2\'s hand');
  assert.equal(taken.owner, 'p2', 're-stamped for its new hand');
  assert.equal(taken.faceUp, false, 'never flashed public on the way');
});

// *nit (direct user request): "add a show/hide cardAction to toggle an
// individual card's show/hide status." REVEAL was one-way (face-down ->
// face-up, a no-op on an already-face-up card) and is now `FLIP`,
// a real toggle - one reducer case in both directions, not a REVEAL
// plus a mirror-image HIDE. The two OFFER ids (`reveal`/`hide`) exist
// only so the menu can label the direction the card is actually going.
test('FLIP: any player can turn a shared face-down card face-up', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  const pileableId = 'shared-c';
  state = { ...state, piles: state.piles.map((p) => (p.id === 'table'
    ? { ...p, cards: [{ id: pileableId, rank: '7', suit: 'clubs', owner: null, faceUp: false }] } : p)) };

  state = reduce(state, { type: 'FLIP', playerId: 'p2', pileableId });

  assert.equal(tableOf(state).cards[0].faceUp, true);
  const anyTable = tableViewOf(viewFor(state, 'p2'));
  assert.ok('rank' in anyTable.cards[0]);
});

// THE *nit ITSELF: the direction that did not exist before. A card
// played from a hand arrives face-up (D102), so this is the only way to
// put a card on the table face-down at all.
test('FLIP: turns a face-up card back face-down - the show/hide toggle, the direction REVEAL never had', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  assert.equal(tableOf(state).cards[0].faceUp, true, 'face-up on arrival from hand');

  state = reduce(state, { type: 'FLIP', playerId: 'p1', pileableId });
  assert.equal(tableOf(state).cards[0].faceUp, false, 'hidden');

  state = reduce(state, { type: 'FLIP', playerId: 'p1', pileableId });
  assert.equal(tableOf(state).cards[0].faceUp, true, 'and back again - a real toggle, not one-way');
});

// Hiding is not redaction (D84 stands): `faceUp: false` is plain game
// state that changes how the card RENDERS, never what a viewer is
// allowed to know.
test('FLIP: a hidden card is still fully visible in every viewer\'s view - hiding is not redaction', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  state = reduce(state, { type: 'FLIP', playerId: 'p1', pileableId });

  for (const viewerId of ['p1', 'p2']) {
    const card = tableViewOf(viewFor(state, viewerId)).cards[0];
    assert.equal(card.faceUp, false, `${viewerId} sees it as face-down`);
    assert.ok('rank' in card, `${viewerId} still sees its real rank`);
  }
});

// *nit (direct user request, D83, "fully permissive drag and drop...
// remove the older restrictions from ALL pile and zone types"): anyone
// can flip a private face-down card, not just its owner.
test('FLIP: anyone can flip a private face-down card, not just its owner', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  const pileableId = 'private-c';
  state = { ...state, piles: state.piles.map((p) => (p.id === 'table'
    ? { ...p, cards: [{ id: pileableId, rank: 'K', suit: 'hearts', owner: 'p1', faceUp: false }] } : p)) };

  const flipped = reduce(state, { type: 'FLIP', playerId: 'p2', pileableId });
  assert.equal(tableOf(flipped).cards[0].faceUp, true);
});

// A deck card carries no `faceUp` field at all (`DeckPile.showsFace` is
// what hides it, not the field) - `undefined` must read as face-down so
// the first flip SHOWS it rather than trying to hide something already
// hidden.
test('FLIP: a card with no faceUp field at all flips to face-up, not to false', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = { ...state, piles: state.piles.map((p) => (p.id === 'table'
    ? { ...p, cards: [{ id: 'bare-c', rank: '2', suit: 'spades', owner: null }] } : p)) };

  const flipped = reduce(state, { type: 'FLIP', playerId: 'p1', pileableId: 'bare-c' });
  assert.equal(tableOf(flipped).cards[0].faceUp, true);
});

test('FLIP: throws for a card that is not in any pile', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'FLIP', playerId: 'p1', pileableId: 'no-such-card' }), /not in any pile/);
});

test('ROTATE: toggles a face-up card between portrait (default/absent) and landscape', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  assert.equal(tableOf(state).cards[0].orientation, undefined, 'a newly played card has no orientation set - implies portrait');

  state = reduce(state, { type: 'ROTATE', playerId: 'p1', pileableId });
  assert.equal(tableOf(state).cards[0].orientation, 'landscape');

  state = reduce(state, { type: 'ROTATE', playerId: 'p1', pileableId });
  assert.equal(tableOf(state).cards[0].orientation, 'portrait');
});

test('ROTATE: follows move\'s authorization rule, not reveal\'s - a shared face-down card may be rotated by anyone', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  const rotated = reduce(state, { type: 'ROTATE', playerId: 'p2', pileableId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape', 'unowned face-down cards are rotatable by anyone, per US-19');
});

// *nit (direct user request, D83): a non-owner can now rotate someone
// else's still-hidden private card too - no ownership gate is left.
test('ROTATE: a non-owner CAN rotate someone else\'s still-hidden private card now', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  const rotated = reduce(state, { type: 'ROTATE', playerId: 'p2', pileableId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape');
});

// *nit (direct user request, D84): redaction is gone entirely now, so
// "orientation survives redaction" is moot - orientation, and
// everything else, is visible to every viewer.
test('ROTATE: orientation (and everything else - no redaction left) is visible to every viewer', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  state = reduce(state, { type: 'ROTATE', playerId: 'p1', pileableId });

  const seenCard = tableViewOf(viewFor(state, 'p2')).cards[0];
  assert.equal(seenCard.id, pileableId, 'no redaction left');
  assert.equal(seenCard.orientation, 'landscape');
});

test('PICKUP: moves a face-up middle card into the picking player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  const p2HandSizeBefore = handOf(state, 'p2').length;
  state = reduce(state, { type: 'PICKUP', playerId: 'p2', pileableId });

  assert.equal(tableOf(state).cards.length, 0);
  assert.equal(handOf(state, 'p2').length, p2HandSizeBefore + 1);
  assert.ok(handOf(state, 'p2').some((c) => c.id === pileableId));
});

// *nit (direct user request, D83, "fully permissive drag and drop"):
// picking up a still-hidden card - a blind grab - is allowed now,
// instead of throwing. The card keeps its face-down identity hidden
// from the picker too (redaction is untouched, only authorization
// changed) - PICKUP's own reducer just relocates whatever fields the
// card already had into the picker's hand.
test('PICKUP: a still face-down card can be picked up blind now, instead of throwing', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  const picked = reduce(state, { type: 'PICKUP', playerId: 'p2', pileableId });
  assert.ok(handOf(picked, 'p2').some((c) => c.id === pileableId));
});

// --- Named zones (D12, US-19) ---

test('CREATE_ZONE: adds a new empty zone by name, alongside the default', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard' });
  assert.equal(pilesOf(state).length, 3, 'deck + default table + the new zone');
  const created = pilesOf(state).find((z) => z.name === 'Discard');
  assert.deepEqual(created.cards, []);
  assert.notEqual(created.id, tableOf(state).id);
});

// *nit (direct user request, "new Zones and Piles need default
// names"): the "Add Zone" form (a name text field) was hidden per
// US-54 - every zone/pile a player creates now comes from the
// permissive drag-to-create-pile gesture instead, which has no name to
// give at all. A nameless pile's own heading previously rendered
// blank until manually renamed. Reuses `configuredZoneName`'s existing
// "Kind"/"Kind N" numbering (already proven for preset-declared
// piles), keyed off how many piles of the same kind already exist.

// *nit (direct user request): "default pile name should be 'Pile' not
// 'Zone'" - "Zone" is already this app's own word for the CONTAINING
// entity (D55's Zone/Pile split); naming a `kind: 'plain'` PILE "Zone"
// collided with that. Every other kind still just capitalizes.

test('CREATE_ZONE: no name given, kind "zone" - defaults to "Pile" (not "Zone"), unnumbered for the first one', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE' });
  const created = pilesOf(state).find((z) => z.id !== 'table' && z.id !== 'deck');
  assert.equal(created.name, 'Pile');
});

test('CREATE_ZONE: no name given, a second unnamed zone-kind pile - numbered "Pile 2"', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE' });
  state = reduce(state, { type: 'CREATE_ZONE' });
  const created = pilesOf(state).filter((z) => z.id !== 'table' && z.id !== 'deck');
  assert.deepEqual(created.map((z) => z.name).toSorted(), ['Pile', 'Pile 2']);
});

// *nit (direct user request): "add the default 'Zone' name to the
// zone that the panel is in" - the ZONE record itself (distinct from
// its pile) also gets a real default now, not `null` - so if a SECOND
// pile later joins it, the Zone's own heading (which only renders for
// multi-pile zones, `ui.js`'s `renderZones`) isn't blank.

test('CREATE_ZONE: the ZONE record itself also gets a default name ("Zone"), distinct from its pile\'s own name', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE' });
  const pile = pilesOf(state).find((z) => z.id !== 'table' && z.id !== 'deck');
  const zoneRecord = state.zones.find((z) => z.id === pile.zoneId);
  assert.equal(zoneRecord.name, 'Zone');
  assert.equal(pile.name, 'Pile', 'the pile\'s own name is independent, still the kind-based default');
});

test('CREATE_ZONE: no name given, kind: "discard" - defaults to "Discard"', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', kind: 'discard' });
  assert.equal(pilesOf(state).find((z) => z.kind === 'discard').name, 'Discard');
});

test('CREATE_ZONE: an explicit name is never overridden by the default', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Melds' });
  assert.equal(pilesOf(state).some((z) => z.name === 'Melds'), true);
});

// --- D45 (Sprint 15): CREATE_ZONE's `kind` param, and a real Discard
// pile exercised end-to-end through the reducer (not just its own
// module's unit tests in tests/piles.test.js).

test('CREATE_ZONE: kind defaults to "zone" - every pre-D45 caller (and every test above/below) is unaffected', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Table 2' });
  assert.equal(state.piles.find((p) => p.name === 'Table 2').kind, 'plain');
});

test('CREATE_ZONE: kind: "discard" creates a real Discard pile, findable via pilesOf', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const pile = pilesOf(state).find((p) => p.name === 'Discard');
  assert.equal(pile.kind, 'discard');
  assert.deepEqual(pile.cards, []);
});

test('CREATE_ZONE: rejects a kind that is not table-side (hand) rather than creating an unreachable pile', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x', kind: 'hand' }));
});

test('CREATE_ZONE: kind "deck" is accepted now (UX follow-up: deckPile.tableSide is true)', () => {
  const state = createInitialState({}, () => 0.5);
  const next = reduce(state, { type: 'CREATE_ZONE', name: 'Second Deck', kind: 'deck' });
  const created = pilesOf(next).find((z) => z.name === 'Second Deck');
  assert.equal(created.kind, 'deck');
});

test('CREATE_ZONE: rejects an unknown kind', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x', kind: 'nonsense' }));
});

// *nit (direct user request, reversing D45): "discard pile is just a
// deck (face up or down)" - a card played into a discard pile can now
// be moved/picked back out, same as any other zone, through the whole
// reducer, not just DiscardPile's own unit tests.
test('Discard pile end-to-end: PLAY into it, then MOVE/PICKUP out both work - full access, for real, through the whole reducer', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const discardId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: discardId });
  const discardPile = pilesOf(state).find((z) => z.id === discardId);
  assert.equal(discardPile.cards.length, 1);
  assert.equal(discardPile.cards[0].id, pileableId);

  const moved = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  assert.equal(tableOf(moved).cards.some((c) => c.id === pileableId), true);

  const picked = reduce(state, { type: 'PICKUP', playerId: 'p1', pileableId });
  assert.ok(handOf(picked, 'p1').some((c) => c.id === pileableId));
});

test('Discard pile: a SECOND card played onto it lands on TOP (index 0), matching a physical discard pile', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [firstCardId, secondCardId] = handOf(state, 'p1').map((c) => c.id);
  const discardId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: firstCardId, toPileId: discardId });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: secondCardId, toPileId: discardId });

  const cards = pilesOf(state).find((z) => z.id === discardId).cards;
  assert.deepEqual(cards.map((c) => c.id), [secondCardId, firstCardId]);
});

test('viewFor: a "mixed"-visibility zone entry now carries its kind (D45), so ui.js can pick FAN vs. STACK drop behavior', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const view = viewFor(state, 'anyone');
  assert.equal(view.piles.find((z) => z.name === 'Table').kind, 'plain');
  assert.equal(view.piles.find((z) => z.name === 'Discard').kind, 'discard');
});

test('PLAY: with pileId targets that pile instead of the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const discardZoneId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: discardZoneId });

  assert.equal(tableOf(state).cards.length, 0, 'default zone untouched');
  const discardZone = pilesOf(state).find((z) => z.id === discardZoneId);
  assert.equal(discardZone.cards.length, 1);
  assert.equal(discardZone.cards[0].id, pileableId);
});

test('PLAY: throws for a pileId that does not exist', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  assert.throws(() => reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'no-such-zone' }));
});

// UX follow-up (real bug, found live): dragging a hand card onto its OWN
// hand (a reorder) is the only way `main.js`'s `dropCardOnZone` can ever
// dispatch it - `HandPile.pileableActions` (`HandPile.js`) never offers
// `'move'`/`'pickup'` for a card still in hand, only `'play'`, so PLAY is
// the sole authorized action for ANY hand-sourced drag, reorder included.
// PLAY used to always stamp its public-visibility transform regardless,
// silently giving a reordered hand card `{owner: null, faceUp: true}` -
// fields a hand card is never supposed to carry (`HandPile.redactCard`'s
// own comment on that invariant).
test('PLAY: targeting the SAME hand it came from is a reorder, not a real play - no visibility stamp', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [first, second] = handOf(state, 'p1');
  const handZoneId = pilesOf(state).find((z) => z.kind === 'hand' && z.ownerId === 'p1').id;

  state = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: first.id, toPileId: handZoneId, targetCardId: second.id, side: 'after'
  });

  const hand = handOf(state, 'p1');
  assert.equal(hand.length, 2, 'still in hand, not moved to the table');
  assert.deepEqual(hand.map((c) => c.id), [second.id, first.id], 'reordered after the target card');
  assert.deepEqual(hand.find((c) => c.id === first.id), first, 'no owner/faceUp stamped on - untouched');
});

test('FLIP and PICKUP: find a card in any zone, not just the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const discardZoneId = pilesOf(state).find((z) => z.name === 'Discard').id;
  state = reduce(state, {
    type: 'MOVE',
    playerId: 'p1',
    pileableId,
    toPileId: discardZoneId
  });

  // The point here is that both actions RESOLVE a card outside the
  // default pile, not which way the flip goes: the card arrived from a
  // hand, so it is face-up (D102) and one flip hides it.
  state = reduce(state, { type: 'FLIP', playerId: 'p2', pileableId });
  assert.equal(pilesOf(state).find((z) => z.id === discardZoneId).cards[0].faceUp, false);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', pileableId });
  assert.equal(pilesOf(state).find((z) => z.id === discardZoneId).cards.length, 0);
  assert.ok(handOf(state, 'p2').some((c) => c.id === pileableId));
});

test('MOVE: relocates a visible card between zones, preserving its owner/faceUp', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' }); // public, default zone

  state = reduce(state, { type: 'MOVE', playerId: 'p2', pileableId, toPileId: meldsZoneId });

  assert.equal(tableOf(state).cards.length, 0);
  const meldsZone = pilesOf(state).find((z) => z.id === meldsZoneId);
  assert.equal(meldsZone.cards.length, 1);
  assert.equal(meldsZone.cards[0].id, pileableId);
  assert.equal(meldsZone.cards[0].faceUp, true, 'moving does not reveal/hide - it was already public');
});

// *nit (direct user request, D83, "fully permissive drag and drop...
// no matter what"): a non-owner can now move someone else's still-
// hidden private card too - no ownership gate is left in canRemove.
test('MOVE: a non-owner CAN move someone else\'s still-hidden private card now', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  const moved = reduce(state, { type: 'MOVE', playerId: 'p2', pileableId, toPileId: meldsZoneId });
  assert.equal(pilesOf(moved).find((z) => z.id === meldsZoneId).cards[0].id, pileableId);
});

// *nit (real bug, found live): a card grabbed straight out of another
// player's hand via plain MOVE used to keep its OLD owner/faceUp,
// landing in the new hand pile but redacted as if it still belonged to
// whoever it was taken from - invisible even to the player who just
// took it. `transferCard` now applies `toHandCard` generically to ANY
// transfer landing in a hand, not just the actions that remembered to.
test('MOVE: a card taken from another player\'s hand is correctly re-owned by its new hand, not left as a ghost of the old owner', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  const pileableId = handOf(state, 'p1')[0].id;

  const stolen = reduce(state, { type: 'MOVE', playerId: 'p2', pileableId, toPileId: 'hand:p2' });

  const card = handOf(stolen, 'p2').find((c) => c.id === pileableId);
  assert.equal(card.owner, 'p2', 'now owned by the player whose hand it landed in');
  assert.equal(card.faceUp, false);
  const view = viewFor(stolen, 'p2');
  const inView = view.piles.find((z) => z.id === 'hand:p2').cards.find((c) => c.id === pileableId);
  assert.deepEqual(inView, card, 'the new owner can actually see the card they just took');
});

test('MOVE: throws for an unknown destination zone or an unknown card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });

  assert.throws(() =>
    reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'no-such-zone' }),
  );
  assert.throws(() =>
    reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'no-such-card', toPileId: tableOf(state).id }),
  );
});

// --- Personal per-seat zones (D17, US-27) ---

// UX follow-up (direct user request): the D17 auto-created personal zone
// is retired - "get rid of seat panel and replace with a reg zone with a
// handpile." JOIN adds nothing to `pilesOf` by itself any more; a
// player's seat is their hand pile, created lazily on first deal/draw/
// pickup (`ensureHandPile`), covered by the DEAL/DRAW/PICKUP tests
// elsewhere in this file.
test('JOIN: adds nothing to pilesOf by itself - no personal zone any more', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  assert.equal(pilesOf(state).length, 2, 'just deck + default table');
});

test('JOIN: re-joining with the same playerId does not duplicate the player entry or reset scores', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });

  // SET_CONNECTION then JOIN again is exactly what a reconnect looks like.
  state = reduce(state, { type: 'SET_CONNECTION', playerId: 'p1', connection: 'connecting' });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(state.players.filter((p) => p.id === 'p1').length, 1);
  assert.equal(state.scores.p1, 1, 'score preserved across a reconnect, not re-zeroed');
});

// --- D53 (Sprint 22): GameConfig.zones - a declared starting table
// layout (Solitaire's 4 foundations + 7 cascades, Spit's 2 shared
// rank-adjacent piles + a per-player stock).

test('createInitialState: gameConfig.zones defaults to [] - zero behavior change for every preset before Solitaire/Spit', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(state.gameConfig.piles, []);
  assert.equal(pilesOf(state).length, 2, 'just the deck + the default table, nothing extra built');
});

test('createInitialState: shared (ownerId: null) configured zones build immediately, before any player joins', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'foundation', ownerId: null, count: 4 }, { kind: 'cascade', ownerId: null, count: 7 }]
  });
  assert.equal(pilesOf(state).filter((z) => z.kind === 'foundation').length, 4);
  assert.equal(pilesOf(state).filter((z) => z.kind === 'cascade').length, 7);
  assert.equal(pilesOf(state).length, 1 + 1 + 4 + 7, 'deck + default table + 4 foundations + 7 cascades');
});

test('createInitialState: a configured zone is capitalized and only numbered when there is more than one', () => {
  const single = createInitialState({}, () => 0.5, { piles: [{ kind: 'discard', ownerId: null, count: 1 }] });
  assert.equal(pilesOf(single).find((z) => z.kind === 'discard').name, 'Discard', 'not "Discard 1"');

  const many = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: null, count: 3 }] });
  assert.deepEqual(
    pilesOf(many).filter((z) => z.kind === 'cascade').map((z) => z.name),
    ['Cascade 1', 'Cascade 2', 'Cascade 3'],
  );
});

// UX follow-up (direct user request - *nit): "adjust the presets for
// the new layout settings." Panel position/size is a local, per-browser
// preference now (`panelLayout.js`), keyed by pile id - a shared
// configured zone (a preset's own declared foundations/cascades/etc.,
// `GameConfig.zones`) used to get a random `crypto.randomUUID()` id
// like every other zone, so a player's carefully-arranged Solitaire
// table (11 zones) reset to the default arrangement on every new game,
// even of the exact same preset. These ids are deterministic now -
// derived from `kind`+index, matching `configuredZoneName`'s own
// numbering rule (unnumbered when there's only one).
test('createInitialState: a configured zone\'s id is deterministic (kind alone when there\'s only one), not a random UUID', () => {
  const state = createInitialState({}, () => 0.5, { piles: [{ kind: 'discard', ownerId: null, count: 1 }] });
  assert.equal(pilesOf(state).find((z) => z.kind === 'discard').id, 'discard');
});

test('createInitialState: a configured zone\'s id is deterministic AND stable across separate calls with the same preset', () => {
  const pileDeclarations = [{ kind: 'foundation', ownerId: null, count: 4 }, { kind: 'cascade', ownerId: null, count: 7 }];
  const first = createInitialState({}, () => 0.5, { piles: pileDeclarations });
  const second = createInitialState({}, () => 0.5, { piles: pileDeclarations });
  const idsOf = (state) => pilesOf(state).filter((z) => z.kind === 'foundation' || z.kind === 'cascade')
    .map((z) => z.id).toSorted();
  assert.deepEqual(idsOf(first), idsOf(second), 'the same preset must produce the same zone ids every game, so a saved panel layout still applies');
  assert.deepEqual(
    idsOf(first),
    ['cascade-1', 'cascade-2', 'cascade-3', 'cascade-4', 'cascade-5', 'cascade-6', 'cascade-7',
      'foundation-1', 'foundation-2', 'foundation-3', 'foundation-4'],
  );
});

test('createInitialState: a \'perPlayer\' configured zone builds NO piles yet - count isn\'t knowable before a player exists', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }]
  });
  assert.equal(pilesOf(state).filter((z) => z.kind === 'cascade').length, 0);
});

test('JOIN: a \'perPlayer\' configured zone also gets a deterministic id (kind + playerId), not a random UUID', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const ownPile = pilesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === 'p1');
  assert.equal(ownPile.id, 'cascade-p1', 'same playerId, same preset -> same zone id every game, so a saved panel layout still applies');
});

test('JOIN: a \'perPlayer\' configured zone builds one pile per player, alongside their personal zone', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'rankAdjacent', ownerId: null, count: 2 }, { kind: 'cascade', ownerId: 'perPlayer', count: 1 }]
  });
  state = withPlayers(state, ['p1', 'p2']);

  for (const id of ['p1', 'p2']) {
    const ownPile = pilesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === id);
    assert.ok(ownPile, `${id} has their own configured cascade pile`);
  }
  assert.equal(pilesOf(state).filter((z) => z.kind === 'rankAdjacent').length, 2, 'shared piles are not duplicated per player');
});

test('JOIN: a per-player configured zone name reads "<player>\'s <Kind>", singular, no index for count 1', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const ownPile = pilesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === 'p1');
  assert.equal(ownPile.name, "Alice's Cascade");
});

test('JOIN: re-joining does not duplicate a \'perPlayer\' configured zone either', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'SET_CONNECTION', playerId: 'p1', connection: 'connecting' });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(pilesOf(state).filter((z) => z.kind === 'cascade' && z.ownerId === 'p1').length, 1);
});

// UX follow-up (direct user request): "personal zones" (D17) are
// retired - the three tests that used to live here characterized that
// concept specifically (auto-created ownerId zone, survives RESET,
// ownerId visible to every viewer) and no longer apply. The equivalent
// ownership/authorization/visibility behavior for a hand pile is
// covered by the DEAL/DRAW/PLAY/PICKUP and viewFor tests elsewhere in
// this file; a player-CREATED zone's ownerId behavior (still fully
// supported - CREATE_ZONE never stopped accepting one) has its own
// coverage under the D53 GameConfig.zones tests below.

// *nit (direct user request, D84): "redacted per-card" is no longer
// true - renamed/rewritten to assert the real replacement guarantee
// (zone name/count/contents are ALL visible now, nothing hidden).
test('viewFor: every zone is fully visible now - name, count, and contents', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, {
    type: 'MOVE',
    playerId: 'p1',
    pileableId,
    toPileId: meldsZoneId
  });

  const otherView = viewFor(state, 'p2');
  // UX follow-up (direct user request): "a Deck is a specific kind of
  // Pile" - the deck surfaces in `view.piles` (D94: single-routed, the
  // old `deckCount` dual-route is retired), so the count matches EVERY
  // tableSide pile now, not `visibleZonesOf`'s deck-excluded count.
  assert.equal(otherView.piles.length, pilesOf(state).length, 'pile count matches every tableSide pile (deck + default + Melds), the deck now included');
  const meldsView = otherView.piles.find((z) => z.id === meldsZoneId);
  assert.equal(meldsView.name, 'Melds');
  assert.equal(meldsView.cards.length, 1);
  assert.ok('rank' in meldsView.cards[0], 'no redaction left - contents are visible too now');
});

// --- Score tracking (D9, US-16) ---

test('JOIN: initializes a new player\'s score to 0', () => {
  const state = reduce(createInitialState({}, () => 0.5), {
    type: 'JOIN',
    playerId: 'p1',
    name: 'Alice'
  });
  assert.equal(state.scores.p1, 0);
});

test('JOIN: does not reset an existing player\'s score on re-join', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice-reconnected' });
  assert.equal(state.scores.p1, 1);
});

test('ADJUST_SCORE: +1 and -1 move the target player\'s score', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p2', delta: -1 });

  assert.equal(state.scores.p1, 2);
  assert.equal(state.scores.p2, -1);
});

test('ADJUST_SCORE: +10 and -10 also move the target player\'s score', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 10 });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p2', delta: -10 });

  assert.equal(state.scores.p1, 10);
  assert.equal(state.scores.p2, -10);
});

test('ADJUST_SCORE: rejects any delta other than +/-1 or +/-10', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 5 }));
  assert.throws(() => reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 100 }));
});

test('SET_SCORE: sets the target player\'s score to an exact typed-in value', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p2', delta: 1 });

  state = reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: 42 });

  assert.equal(state.scores.p1, 42);
  assert.equal(state.scores.p2, 1); // untouched
});

test('SET_SCORE: accepts negative and zero values', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: -7 });
  assert.equal(state.scores.p1, -7);
  state = reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: 0 });
  assert.equal(state.scores.p1, 0);
});

test('SET_SCORE: rejects a non-finite or non-integer value', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: NaN }));
  assert.throws(() => reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: Infinity }));
  assert.throws(() => reduce(state, { type: 'SET_SCORE', targetPlayerId: 'p1', value: 3.5 }));
});

test('RESET_SCORES: zeros every player\'s score', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p2', delta: 1 });

  state = reduce(state, { type: 'RESET_SCORES' });

  assert.equal(state.scores.p1, 0);
  assert.equal(state.scores.p2, 0);
});

test('RESET (deck reshuffle) does not touch scores', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });

  state = reduce(state, { type: 'RESET' });

  assert.equal(state.scores.p1, 1);
});

test('viewFor: scores are public to every viewer', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });

  const view = viewFor(state, 'p2');
  assert.equal(view.scores.p1, 1);
});

// --- Solo play (D11, US-17) — regression guarantee, no gate exists ---

// --- Incremental dealing (D15, US-24) ---

test('DEAL_MORE: adds cards to existing hands without clearing them', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  const deckSizeAfterDeal = deckOf(state).length;

  state = reduce(state, { type: 'DEAL_MORE', pileId: 'deck', cardsPerPlayer: 2 });

  assert.equal(handOf(state, 'p1').length, 5);
  assert.equal(handOf(state, 'p2').length, 5);
  assert.equal(deckOf(state).length, deckSizeAfterDeal - 4);
});

test('DEAL_MORE: throws if there are not enough cards left', () => {
  let state = createInitialState({ numDecks: 1 }, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 50 });
  assert.throws(() => reduce(state, { type: 'DEAL_MORE', pileId: 'deck', cardsPerPlayer: 5 }));
});

// Pass marker (D16, US-25) removed outright (direct user request, "not
// a requirement") - TOGGLE_PASS, `state.passed`, and the roster's
// Passed tag are all gone, not deprecated. `RESET` regression coverage
// for scores surviving a reset is kept below, minus the pass-marker
// half of what it used to also check.

test('RESET leaves scores untouched (regression)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });

  state = reduce(state, { type: 'RESET' });

  assert.equal(state.scores.p1, 1);
});

test('solo play: a single player can deal, play, draw, and reset a full round alone', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['solo']);
  assert.equal(state.players.length, 1);

  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 7 });
  assert.equal(handOf(state, 'solo').length, 7);
  assert.equal(deckOf(state).length, 45);

  const pileableId = handOf(state, 'solo')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'solo', pileableId, toPileId: 'table' });
  assert.equal(handOf(state, 'solo').length, 6);
  assert.equal(tableOf(state).cards.length, 1);

  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'solo' });
  assert.equal(handOf(state, 'solo').length, 7);

  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'solo', delta: 1 });
  assert.equal(state.scores.solo, 1);

  state = reduce(state, { type: 'RESET' });
  assert.equal(Object.keys(handsOf(state)).length, 0);
  assert.equal(deckOf(state).length, 52);
  assert.equal(state.scores.solo, 1, 'score survives a deck reset, per US-16');

  const view = viewFor(state, 'solo');
  assert.equal(view.players.length, 1);
});

// --- Pile unification (D23) ---
// These target failure modes the unified `state.piles` array newly makes
// possible: every pile now lives in one list and is routed by `kind`, so
// a mis-routed pile could leak a hidden pile's contents or silently drop
// a pile from the view entirely. Neither was possible when deck/hands/
// zones were three separately-shaped slices.

// D84 (direct user request, reverses D67's own "every card below the
// top one still never leaves this function" half-guarantee too):
// "remove card redaction entirely... TOTAL PERMISSIVE" - the deck's
// FULL stock goes out to every viewer now, not just its top card.
test('viewFor: a deck pile\'s FULL stock is visible to every viewer now, not just the top card', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });

  const view = viewFor(state, 'p1');
  const deckView = view.piles.find((z) => z.id === 'deck');
  assert.deepEqual(deckView.cards, deckOf(state), 'the real, full deck - same as the host itself sees');
  assert.equal(deckView.count, deckOf(state).length);
});

// *nit (direct user request, D84): another player's hand used to keep
// `id` but redact rank/suit (an earlier, narrower trade) - there is no
// redaction left at all now, the real cards go out, same data `myHand`
// carries for their own owner.
test('viewFor: another player\'s hand cards are fully visible now, not just their ids', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });

  const view = viewFor(state, 'p2');
  const p1Zone = view.piles.find((z) => z.kind === 'hand' && z.ownerId === 'p1');
  assert.deepEqual(p1Zone.cards, handOf(state, 'p1'));
  assert.equal(view.otherHandCounts.p1, 3, 'count is still carried too, as a convenience field');
});

test('viewFor: every pile is accounted for - none silently dropped (D23/D94 routing)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });

  const view = viewFor(state, 'p1');
  // D94 (`Pile.contributeToView`): every pile - deck included - routes
  // into `view.piles` exactly once now, no separate `deckCount` field
  // to double-route into any more (that was retired alongside the old
  // `viewFor` switch). A hand pile is the one kind that ALSO
  // double-routes, into `myHand` (the viewer's own) or
  // `otherHandCounts` (anyone else's) - `HandPile.contributeToView`'s
  // own override, so it still renders at its owner's seat too.
  assert.equal(view.piles.length, state.piles.length, 'every pile surfaces in view.piles exactly once - none vanish silently');

  const ownHands = state.piles.filter((p) => p.kind === 'hand' && p.ownerId === 'p1').length;
  const otherHands = state.piles.filter((p) => p.kind === 'hand' && p.ownerId !== 'p1').length;
  assert.equal(ownHands, 1, 'p1 has exactly one hand pile - this test\'s own precondition');
  assert.equal(Object.keys(view.otherHandCounts).length, otherHands, 'every non-viewer hand also reaches otherHandCounts');
});

test('pileVisibility: every pile kind in use has a defined visibility rule (D23)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });

  const kinds = new Set(state.piles.map((p) => p.kind));
  assert.deepEqual([...kinds].toSorted(), ['deck', 'hand', 'plain'], 'all three pile types are exercised');
  for (const pile of state.piles) {
    assert.ok(
      ['hidden', 'in-hand', 'mixed'].includes(pileVisibility(pile)),
      `pile kind "${pile.kind}" has no visibility rule - viewFor would drop it`,
    );
  }
});

test('DEAL after DEAL re-deals from scratch; DEAL_MORE appends (D23 shared-case regression)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'DEAL_MORE', pileId: 'deck', cardsPerPlayer: 1 });
  assert.equal(handOf(state, 'p1').length, 4, 'DEAL_MORE appends');

  // DEAL and DEAL_MORE now share one reducer case separated only by a
  // `fresh` flag - so a second DEAL must still fully reset, not append.
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  assert.equal(handOf(state, 'p1').length, 2, 'a second DEAL clears hands first, it does not append');
  assert.equal(handOf(state, 'p2').length, 2);
});

// D88: a second DEAL clears hands, but the cards that were cleared out
// must not be destroyed - they go back into the pool DEAL itself deals
// from, so re-dealing is a real redistribution, never a card loss.
test('DEAL after DEAL: cards cleared from hands are reclaimed into the deck, not destroyed', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  const totalCards = deckOf(state).length;
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const total = deckOf(state).length + handOf(state, 'p1').length + handOf(state, 'p2').length;
  assert.equal(total, totalCards, 'every card is still accounted for somewhere');
  // The 6 cards from the first deal (3+3) minus the 4 just redealt
  // (2+2) must be sitting back in the deck, not gone.
  assert.equal(deckOf(state).length, totalCards - 4);
});

// D89: an orphaned (ownerless) hand-kind pile is no longer constructible
// at all (`CHANGE_PILE_TYPE`'s reinstated ownerId-required guard) - so
// DEAL's `index === -1` branch (a hand pile with no matching player)
// really is unreachable through any live action again, matching
// Morpheus's original D23 assessment. Nothing further to reclaim-test
// here; every hand-kind pile DEAL ever clears is guaranteed to belong
// to a real, current player (proven by the reclaim test above, which
// already covers every hand pile uniformly regardless of how it got
// its `kind: 'hand'`).
test('CHANGE_PILE_TYPE: still rejects an ownerless target for "hand" - D89, prevents an orphaned hand pile from ever existing again', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'plain', ownerId: null, count: 1 }] });
  state = withPlayers(state, ['p1']);
  const pool = pilesOf(state).find((z) => z.kind === 'plain');
  assert.throws(
    () => reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pool.id, kind: 'hand', playerId: 'p1' }),
    /no owner/,
  );
});

// --- D53 (Sprint 22, US-56/57): foundation/cascade exercised end-to-end
// through the whole reducer, not just their own modules' unit tests
// (tests/piles.test.js) - proves canAccept's transferCard wiring (D53)
// against real content-based rejection, the first since Phase 62 made
// it real infrastructure.

function withCardInHand(state, playerId, card) {
  return {
    ...state,
    piles: state.piles.map((p) => (p.id === `hand:${playerId}` ? { ...p, cards: [...p.cards, card] } : p))
  };
}

test('Foundation end-to-end: a non-Ace is rejected on an empty foundation, an Ace is accepted', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Hearts', kind: 'foundation' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });
  const foundationId = pilesOf(state).find((z) => z.name === 'Hearts').id;

  state = withCardInHand(state, 'p1', { id: 'six-hearts', rank: '6', suit: 'hearts' });
  assert.throws(
    () => reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'six-hearts', toPileId: foundationId }),
    /cannot accept/,
  );

  state = withCardInHand(state, 'p1', { id: 'ace-hearts', rank: 'A', suit: 'hearts' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'ace-hearts', toPileId: foundationId });
  const foundation = pilesOf(state).find((z) => z.id === foundationId);
  assert.deepEqual(foundation.cards.map((c) => c.id), ['ace-hearts']);
});

// *nit (direct user request, reversed): "once placed, never moves back
// out" was Smith Gate 2's silent-lock UX for a Foundation. `docs/
// ARCHITECTURE.md`'s "Core invariant" ("drag and drop are always
// allowed in all pile types... no matter what") forbids that - a
// Foundation's cards can be dragged back off, same as any other pile's,
// through the whole reducer, not just MeldPile's own unit tests.
test('Foundation end-to-end: a placed card CAN move back out - drag-and-drop is never blocked by pile kind', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Hearts', kind: 'foundation' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });
  const foundationId = pilesOf(state).find((z) => z.name === 'Hearts').id;
  state = withCardInHand(state, 'p1', { id: 'ace-hearts', rank: 'A', suit: 'hearts' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'ace-hearts', toPileId: foundationId });

  const moved = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'ace-hearts', toPileId: 'table' });
  assert.equal(tableOf(moved).cards.some((c) => c.id === 'ace-hearts'), true);
});

test('Cascade end-to-end: same-color/skipped-rank is rejected, opposite-color rank-1 is accepted and carries layout: overlap', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Tableau 1', kind: 'cascade' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });
  const cascadeId = pilesOf(state).find((z) => z.name === 'Tableau 1').id;

  state = withCardInHand(state, 'p1', { id: 'eight-clubs', rank: '8', suit: 'clubs' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'eight-clubs', toPileId: cascadeId });

  state = withCardInHand(state, 'p1', { id: 'seven-spades', rank: '7', suit: 'spades' });
  assert.throws(
    () => reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'seven-spades', toPileId: cascadeId }),
    /cannot accept/,
    'same color (both black) - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'seven-hearts', rank: '7', suit: 'hearts' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'seven-hearts', toPileId: cascadeId });
  const cascade = pilesOf(state).find((z) => z.id === cascadeId);
  assert.deepEqual(cascade.cards.map((c) => c.id), ['eight-clubs', 'seven-hearts']);
  assert.equal(cascade.cards[1].layout, 'overlap');
});

test('RankAdjacent end-to-end: accepts +/-1 either direction and the King<->Ace wrap, rejects a 2-rank gap', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Center', kind: 'rankAdjacent' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });
  const centerId = pilesOf(state).find((z) => z.name === 'Center').id;

  state = withCardInHand(state, 'p1', { id: 'seven-clubs', rank: '7', suit: 'clubs' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'seven-clubs', toPileId: centerId });

  state = withCardInHand(state, 'p1', { id: 'nine-hearts', rank: '9', suit: 'hearts' });
  assert.throws(
    () => reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'nine-hearts', toPileId: centerId }),
    /cannot accept/,
    'two ranks away - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'eight-spades', rank: '8', suit: 'spades' });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: 'eight-spades', toPileId: centerId });
  assert.deepEqual(pilesOf(state).find((z) => z.id === centerId).cards.map((c) => c.id),
    ['eight-spades', 'seven-clubs'], 'STACK: lands on top');
});

// --- Card stack/overlap layout (D21, US-32/US-33) ---

/**
Deals p1 three cards and plays them all public into the default zone.
*/
function threeCardsOnTable(rng = () => 0.5) {
  let state = withPlayers(createInitialState({}, rng), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  const ids = handOf(state, 'p1').map((c) => c.id);
  for (const pileableId of ids) state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  return { state, ids };
}

const tableCards = (state) => pilesOf(state).find((z) => z.id === 'table').cards;
const tableIds = (state) => tableCards(state).map((c) => c.id);
const layoutOf = (state, pileableId) => tableCards(state).find((c) => c.id === pileableId)?.layout;

test('PLAY/MOVE with no target still appends, with no layout (D21 back-compat)', () => {
  const { state, ids } = threeCardsOnTable();
  assert.deepEqual(tableIds(state), ids, 'plain PLAY appends in order, exactly as pre-D21');
  assert.equal(layoutOf(state, ids[0]), undefined, 'a plainly-played card carries no layout key');
});

test('MOVE side:after inserts directly after the target and stacks the DROPPED card', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  // Drop C onto A's body -> C stacks on A, landing between A and B.
  const next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack'
  });
  assert.deepEqual(tableIds(next), [a, c, b], 'C is reinserted immediately after A');
  assert.equal(layoutOf(next, c), 'stack', 'the dropped card carries the layout');
  assert.equal(layoutOf(next, a), undefined, 'the target keeps its own (unchanged) relationship');
});

test('MOVE side:before puts the layout on the TARGET, not the dropped card (Smith Gate 2)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  // Drop C in the halo BEFORE B -> order becomes A, C, B and the newly
  // adjacent pair is (C, B), so it is B that now sits second.
  const next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table',
    targetCardId: b, side: 'before', layout: 'overlap'
  });
  assert.deepEqual(tableIds(next), [a, c, b], 'C is reinserted immediately before B');
  assert.equal(
    layoutOf(next, b), 'overlap',
    'the TARGET carries the layout on a before-side drop - putting it on the dropped card would visually overlap the wrong pair',
  );
  assert.equal(layoutOf(next, c), undefined, 'the dropped card does not carry it');
});

test('MOVE: a same-zone move actually reorders (D21 removes the old no-op)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  const next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: a, toPileId: 'table',
    targetCardId: c, side: 'after'
  });
  assert.deepEqual(tableIds(next), [b, c, a], 'A moved to the end of its own zone');
  assert.notDeepEqual(tableIds(next), ids, 'pre-D21 this returned state unchanged');
});

test('MOVE to empty zone space clears a previously-set layout (US-32/33 un-stack)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, , c] = ids;
  let next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack'
  });
  assert.equal(layoutOf(next, c), 'stack');

  next = reduce(next, { type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table' });
  assert.equal(layoutOf(next, c), undefined, 'dragging back out to open space returns it to flat spacing');
});

test('PLAY straight from hand can stack onto a card already on the table', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [first, second] = handOf(state, 'p1').map((c) => c.id);
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: first , toPileId: 'table'});
  state = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: second, toPileId: 'table',
    targetCardId: first, side: 'after', layout: 'overlap'
  });
  assert.deepEqual(tableIds(state), [first, second]);
  assert.equal(layoutOf(state, second), 'overlap');
});

test('PICKUP strips layout, so a stacked card does not carry it back into a hand', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, , c] = ids;
  let next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack'
  });
  next = reduce(next, { type: 'PICKUP', playerId: 'p2', pileableId: c });
  const picked = handOf(next, 'p2').find((card) => card.id === c);
  assert.ok(picked, 'card reached the hand');
  assert.ok(!('layout' in picked), 'layout is a zone-only concern and must not follow a card into a hand');
  // *nit (direct user request, "a hand is just a regular pile"): owner/
  // faceUp are no longer stripped - `toHandCard` SETS them instead
  // (owner: the picking player, faceUp: false), the same real per-card
  // fields any pile's cards carry now.
  assert.equal(picked.owner, 'p2');
  assert.equal(picked.faceUp, false);
});

// *nit (direct user request, D83): this test used to prove layout
// params don't open a NEW privacy bypass beyond the existing ownership
// gate - that gate is gone entirely now (fully permissive), so the
// premise is moot. Repurposed to confirm placement still applies
// correctly for a move that authorization now allows outright.
test('MOVE: a non-owner moving someone else\'s still-hidden card still gets real placement applied (D21)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [hidden, visible] = handOf(state, 'p1').map((c) => c.id);
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: visible , toPileId: 'table'});
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: hidden , toPileId: 'table'});

  const moved = reduce(state, {
    type: 'MOVE', playerId: 'p2', pileableId: hidden, toPileId: 'table',
    targetCardId: visible, side: 'after', layout: 'stack'
  });
  assert.deepEqual(tableOf(moved).cards.map((c) => c.id), [visible, hidden]);
  assert.equal(tableOf(moved).cards[1].layout, 'stack');
});

test('MOVE: throws for a target card that is not in the destination zone', () => {
  const { state, ids } = threeCardsOnTable();
  assert.throws(() =>
    reduce(state, {
      type: 'MOVE', playerId: 'p1', pileableId: ids[0], toPileId: 'table',
      targetCardId: 'no-such-card', side: 'after', layout: 'stack'
    }),
  );
});

test('removing a card from mid-stack leaves the rest stacked, it does not flatten them', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  let next = reduce(state, {
    type: 'MOVE', playerId: 'p1', pileableId: b, toPileId: 'table', targetCardId: a, side: 'after', layout: 'stack'
  });
  next = reduce(next, {
    type: 'MOVE', playerId: 'p1', pileableId: c, toPileId: 'table', targetCardId: b, side: 'after', layout: 'stack'
  });
  assert.deepEqual(tableIds(next), [a, b, c]);

  next = reduce(next, { type: 'PICKUP', playerId: 'p2', pileableId: b });
  assert.equal(
    layoutOf(next, c), 'stack',
    'pulling one card out of a pile must not silently flatten the cards above it - C now stacks onto A',
  );
});

// --- Deck operations (D22, US-35/US-36) ---

test('SHUFFLE_DECK reorders the deck without touching anything else', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: handOf(state, 'p1')[0].id , toPileId: 'table'});
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });

  const deckBefore = deckOf(state).map((c) => c.id);
  const handBefore = handOf(state, 'p1').map((c) => c.id);
  const tableBefore = tableOf(state).cards.map((c) => c.id);

  // A seeded rng that actually permutes, so "did it reorder" is testable.
  let n = 0;
  const next = reduce(state, { type: 'SHUFFLE_DECK', pileId: 'deck', rng: () => ((n = (n * 9301 + 49_297) % 233_280), n / 233_280) });

  assert.deepEqual([...deckOf(next)].map((c) => c.id).toSorted(), [...deckBefore].toSorted(),
    'same cards, no additions or losses');
  assert.notDeepEqual(deckOf(next).map((c) => c.id), deckBefore, 'order actually changed');
  assert.deepEqual(handOf(next, 'p1').map((c) => c.id), handBefore, 'hands untouched');
  assert.deepEqual(tableOf(next).cards.map((c) => c.id), tableBefore, 'zone cards untouched');
  assert.equal(next.scores.p1, 1, 'scores untouched');
});

// --- RESHUFFLE_DEAL (D114, US-106): decoupled from RESET ---------------

test('RESHUFFLE_DEAL: gathers only the named deck\'s cards, shuffles, deals - zones/layout/scores untouched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'CREATE_ZONE', playerId: 'p1', name: 'My Zone' });
  const zoneBefore = pilesOf(state).find((p) => p.name === 'My Zone');

  let n = 0;
  const next = reduce(state, {
    type: 'RESHUFFLE_DEAL', pileId: 'deck', cardsPerPlayer: 3,
    rng: () => ((n = (n * 9301 + 49_297) % 233_280), n / 233_280),
  });

  assert.equal(handOf(next, 'p1').length, 3, 'p1 dealt a fresh hand');
  assert.equal(handOf(next, 'p2').length, 3, 'p2 dealt a fresh hand');
  assert.equal(deckOf(next).length, 52 - 6, 'remainder stays in the deck pile');
  assert.equal(next.scores.p1, 1, 'scores untouched - this is not a RESET');
  assert.ok(pilesOf(next).some((p) => p.name === 'My Zone'), 'player-created zones survive');
  assert.deepEqual(pilesOf(next).find((p) => p.id === zoneBefore.id).cards, [], 'zone had no cards to begin with, still none');
});

test('RESHUFFLE_DEAL: a card returns to its ORIGIN deck, not whichever deck was clicked (multi-deck preset)', () => {
  let state = withPlayers(
    createInitialState({}, () => 0.5, {
      tableZone: false,
      zones: [{ id: 'decks-zone', name: 'Decks' }],
      piles: [
        { kind: 'deck', id: 'deckA', zoneId: 'decks-zone', deckType: 'rtg', deckList: 'rtg-guild-wu' },
        { kind: 'deck', id: 'deckB', zoneId: 'decks-zone', deckType: 'rtg', deckList: 'rtg-guild-wu' },
      ],
    }),
    ['p1'],
  );
  const deckACountBefore = state.piles.find((p) => p.id === 'deckA').cards.length;
  const deckBBefore = state.piles.find((p) => p.id === 'deckB').cards;

  // Draw a card out of deckA into p1's hand, as if the player picked it up.
  state = reduce(state, { type: 'DRAW', playerId: 'p1', pileId: 'deckA' });

  const next = reduce(state, { type: 'RESHUFFLE_DEAL', pileId: 'deckA', cardsPerPlayer: 0 });

  assert.equal(next.piles.find((p) => p.id === 'deckA').cards.length, deckACountBefore,
    'deckA gets its own card back, including the one that had wandered into a hand');
  assert.deepEqual(next.piles.find((p) => p.id === 'deckB').cards, deckBBefore,
    'deckB - a completely different origin deck - is untouched');
  assert.deepEqual(handOf(next, 'p1'), [], 'the wandered card left the hand, and cardsPerPlayer: 0 dealt nothing back');
});

// *nit (direct user request): "replaces deck specific split with this
// more natural one" - `SPLIT_DECK` (round-robin into N piles) is gone;
// a deck is just another `SPLIT_PILE`-eligible pile now, split at a
// real `index` into exactly one new sibling, same as any other kind.

test('SPLIT_PILE on the deck: a contiguous cut at index, not a round-robin deal', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const deckBefore = deckOf(state).map((c) => c.id);

  const next = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 20, playerId: 'p1' });

  assert.equal(pilesOf(next).length, pilesOf(state).length + 1, 'one new pile, not several');
  assert.deepEqual(deckOf(next).map((c) => c.id), deckBefore.slice(0, 20), 'original keeps the first 20, in order');
  const newPile = pilesOf(next).find((z) => z.name === 'Deck 2');
  assert.deepEqual(newPile.cards.map((c) => c.id), deckBefore.slice(20), 'new pile gets the rest, in order');
  // UX follow-up (direct user request): "one split should result in 2
  // decks (not piles)." A split pile is deck-kind, not zone-kind -
  // hidden visibility is a property of the WHOLE pile (pileTypes.js).
  assert.equal(newPile.kind, 'deck', 'the split pile is a real deck-kind pile, hidden like the original');
});

test('SPLIT_PILE on the deck: the new pile lands in the SAME zone as the original, right after it', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const original = state.piles.find((p) => p.id === 'deck');

  const next = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });

  const newPile = next.piles.find((p) => p.name === 'Deck 2');
  assert.equal(newPile.zoneId, original.zoneId);
});

test('SPLIT_PILE on the deck: the new pile is drawable/movable by the existing rules', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });
  const pile = pilesOf(state).find((z) => z.name === 'Deck 2');
  const pileableId = pile.cards[0].id;

  // Face-down but unowned == "put or take is open to all" (US-19), so any
  // player may reveal it, exactly as with any shared face-down card.
  const revealed = reduce(state, { type: 'FLIP', playerId: 'p2', pileableId });
  assert.equal(pilesOf(revealed).find((z) => z.name === 'Deck 2').cards[0].faceUp, true);
  const picked = reduce(revealed, { type: 'PICKUP', playerId: 'p2', pileableId });
  assert.ok(handOf(picked, 'p2').some((c) => c.id === pileableId), 'and can then be picked up');
});

test('SPLIT_PILE: rejects an index that would leave one side empty, with a clear message', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 50 });
  assert.equal(deckOf(state).length, 2);
  assert.throws(
    () => reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 0, playerId: 'p1' }),
    /between 1 and 1/,
  );
  assert.throws(
    () => reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 2, playerId: 'p1' }),
    /between 1 and 1/,
  );
  assert.doesNotThrow(() => reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 1, playerId: 'p1' }));
});

test('SPLIT_PILE on the deck: leaves the ORIGINAL deck pile in place (D24 invariant), so DRAW/DEAL still work', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });
  assert.equal(state.piles.filter((p) => p.id === 'deck').length, 1,
    // UX follow-up: split piles are deck-KIND too now (more than one
    // deck-kind pile can exist), so this must match by id, the one
    // thing that still uniquely names THE deck (see deckOf()'s comment).
    'exactly one pile with the original deck id must always exist - deckOf() is deliberately unguarded');
});

// UX follow-up: a split pile is deck-kind now (direct user request -
// "one split should result in 2 decks, not piles"), not a zone-kind
// pile faking hidden via per-card owner/faceUp/layout. D21's per-card
// stack layout was only ever needed to make a zone LOOK like a deck;
// a real deck-kind pile already renders as one back + a count, no
// per-card annotation required - so it carries none.
test('SPLIT_PILE on the deck: the new pile carries plain cards - no per-card owner/faceUp/layout', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });
  const pile = pilesOf(state).find((z) => z.name === 'Deck 2');
  assert.ok(pile.cards.length > 2);
  assert.ok(pile.cards.every((c) => !('layout' in c) && !('owner' in c) && !('faceUp' in c)),
    'a deck-kind pile needs none of the fields a zone pile uses to fake hiddenness');
});

// *nit (direct user request, D84): a split deck-kind pile gets the same
// full-visibility treatment as the main deck now - no more top-card-only
// exposure.
test('viewFor: a split (deck-kind) pile is fully visible to every viewer, same as the original deck', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', index: 26, playerId: 'p1' });
  const pile = pilesOf(state).find((z) => z.name === 'Deck 2');

  const view = viewFor(state, 'p2');
  const viewPile = view.piles.find((z) => z.name === 'Deck 2');
  assert.deepEqual(viewPile.cards, pile.cards);
  assert.equal(viewPile.count, pile.cards.length);
});

// --- D55 (Sprint 23): Zone is a real, independent entity - `state.zones`
// - and every table-side pile's own `zoneId` names which one it belongs
// to. These characterize the DEFAULT assignment (reproducing every rule
// `ui.js` used to hardcode) and the new `MOVE_PILE` reducer case that
// makes `zoneId` real, mutable data.

test('createInitialState: seeds a real Table Zone record, and the deck/table piles both point at it', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(state.zones, [{ id: 'table-zone', name: 'Table Zone', ownerId: null, type: 'shared' }]);
  assert.equal(pilesOf(state).find((z) => z.id === 'deck').zoneId, 'table-zone');
  assert.equal(tableOf(state).zoneId, 'table-zone');
});

test('CREATE_ZONE: a live user action, not a declaration - every kind (including discard) is standalone by default, never guessed from kind', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const discard = pilesOf(state).find((z) => z.name === 'Discard');
  assert.equal(discard.zoneId, discard.id, 'no kind-based Table Zone inference for a live CREATE_ZONE - only a declared GameConfig.zones entry can request that');
  assert.equal(state.zones.length, 2, 'table-zone (seeded at startup) + the new standalone zone');

  state = reduce(state, { type: 'CREATE_ZONE', name: 'Solo Zone' });
  const solo = pilesOf(state).find((z) => z.name === 'Solo Zone');
  assert.equal(solo.zoneId, solo.id, 'a plain zone is alone in its own Zone, keyed by its own pile id');
  // *nit (direct user request): the Zone record now gets a real
  // default name ("Zone") too, not `null` - see the dedicated D70/D71
  // tests above for the full reasoning (a later-joining second pile
  // shouldn't inherit a blank heading).
  assert.ok(state.zones.some((z) => z.id === solo.id && z.name === 'Zone' && z.ownerId === null));
});

test('GameConfig.piles: an entry\'s own zoneId groups it into an existing Zone, declared - not inferred from kind (D55)', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'table-zone' }]
  });
  const discard = pilesOf(state).find((z) => z.kind === 'discard');
  assert.equal(discard.zoneId, 'table-zone');
  assert.equal(state.zones.length, 1, 'no new zone record needed - table-zone already exists');
});

test('GameConfig.zones: a Zone is a real entity - {id, name, type} - declared alongside GameConfig.piles (D55)', () => {
  const state = createInitialState({}, () => 0.5, {
    zones: [{ id: 'discard-zone', name: 'Discard Area', type: 'shared' }],
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'discard-zone' }]
  });
  assert.ok(state.zones.some((z) => z.id === 'discard-zone' && z.name === 'Discard Area' && z.type === 'shared'));
  assert.equal(pilesOf(state).find((z) => z.kind === 'discard').zoneId, 'discard-zone');
});

test('GameConfig.zones: type defaults to "shared" when a declared entity omits it', () => {
  const state = createInitialState({}, () => 0.5, { zones: [{ id: 'extra', name: 'Extra' }] });
  assert.ok(state.zones.some((z) => z.id === 'extra' && z.type === 'shared'));
});

test('GameConfig.piles: a zoneId referencing an UNDECLARED Zone throws - real config errors are not silently accepted (D55)', () => {
  assert.throws(
    () => createInitialState({}, () => 0.5, {
      piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'typo-zone' }]
    }),
    /no such Zone is declared/,
  );
});

test('JOIN: seeds a player Zone record before the hand pile even exists; the hand pile lands in it once created', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'JOIN', playerId: 'p1', name: 'P1' });
  assert.ok(state.zones.some((z) => z.id === 'player-p1' && z.ownerId === 'p1' && z.type === 'perPlayer'));

  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').zoneId, 'player-p1');
});

test("JOIN: a 'perPlayer' configured zone shares the same player Zone as that player's hand", () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'P1' });
  const stock = pilesOf(state).find((z) => z.ownerId === 'p1' && z.id !== 'hand:p1');
  assert.equal(stock.zoneId, 'player-p1');
});

test('MOVE_PILE: reparents an eligible pile into an existing Zone, as a sibling', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Solo Zone' });
  const solo = pilesOf(state).find((z) => z.name === 'Solo Zone');
  state = reduce(state, { type: 'MOVE_PILE', pileId: solo.id, targetZoneId: 'table-zone' });
  assert.equal(pilesOf(state).find((z) => z.id === solo.id).zoneId, 'table-zone');
  // Sibling, not a merge - the Table pile's own cards/identity untouched.
  assert.equal(tableOf(state).id, 'table');
});

// *nit (direct user request): "drag and drop on all piles including
// Deck and Discard" - reverses Sprint 23's Gate 1 exclusion of the
// deck (D55/D64). Discard was already eligible (`DiscardPile`
// inherits `reparentable` unchanged) - this test only covers the
// deck's own new eligibility.
test('MOVE_PILE: the deck can now be reparented into a different Zone', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Deck Corner' });
  const zone = pilesOf(state).find((z) => z.name === 'Deck Corner');
  state = reduce(state, { type: 'MOVE_PILE', pileId: 'deck', targetZoneId: zone.zoneId });
  assert.equal(state.piles.find((p) => p.id === 'deck').zoneId, zone.zoneId);
  // Moving it doesn't change how it's found for real gameplay - DEAL/
  // DRAW/etc. all locate it by fixed id, never by zoneId.
  assert.equal(deckOf(state).length, 52);
});

// UPDATED: `hand` was removed from this list by direct user request
// ("remove block on moving hand piles"); it is covered by its own test
// above, which asserts a hand DOES move now.
test('MOVE_PILE: rejects foundation/cascade/rankAdjacent - the Meld family is what stays fixed', () => {
  // *nit fix (Trin, 2026-08-26): the test name promised
  // foundation/cascade/rankAdjacent coverage but never actually
  // exercised any of the three through a real reducer call - caught
  // by mutation-testing `MeldPile.reparentable` (deleting it, which
  // should make `FoundationPile` movable again, passed this test
  // clean). Added for real, via `GameConfig.piles` the same way every
  // other Meld-family test in this file already builds one.
  const meldState = withPlayers(createInitialState({}, () => 0.5, {
    piles: [
      { kind: 'foundation', ownerId: null, count: 1 },
      { kind: 'cascade', ownerId: null, count: 1 },
      { kind: 'rankAdjacent', ownerId: null, count: 1 },
    ]
  }), ['p2']);
  for (const kind of ['foundation', 'cascade', 'rankAdjacent']) {
    const pile = pilesOf(meldState).find((z) => z.kind === kind);
    assert.throws(
      () => reduce(meldState, { type: 'MOVE_PILE', pileId: pile.id, targetZoneId: 'table-zone' }),
      /Cannot move/,
      `${kind} must be rejected`,
    );
  }
});

test('MOVE_PILE: rejects an unknown target Zone', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'MOVE_PILE', pileId: 'table', targetZoneId: 'nope' }), /does not exist/);
});

test('MOVE_PILE: no target ungroups - a fresh standalone Zone of the pile\'s own', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const discard = pilesOf(state).find((z) => z.name === 'Discard');
  // Join the Table Zone first (MOVE_PILE, not CREATE_ZONE - a live
  // CREATE_ZONE never auto-groups, per D55) so there's something real
  // to ungroup out of.
  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: 'table-zone' });
  assert.equal(pilesOf(state).find((z) => z.id === discard.id).zoneId, 'table-zone');

  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: null });
  const moved = pilesOf(state).find((z) => z.id === discard.id);
  assert.equal(moved.zoneId, discard.id, 'standalone now - its own zoneId, not table-zone');
  assert.ok(state.zones.some((z) => z.id === discard.id));
});

// `MOVE`'s own `findPileAndCard` deliberately never searches deck/
// hand piles (this file's own header comment on that helper) - so
// seeding a real card into a plain test pile has to go DEAL -> PLAY ->
// MOVE, same path a real player's card actually takes onto the
// table, rather than moving straight out of the deck.
function seedPlainPileWithCards(state, playerId, pileId, count) {
  let s = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: count });
  const cards = handOf(s, playerId).slice(0, count);
  for (const card of cards) {
    s = reduce(s, { type: 'MOVE', playerId, pileableId: card.id , toPileId: 'table'});
    s = reduce(s, { type: 'MOVE', playerId, pileableId: card.id, toPileId: pileId });
  }
  return { state: s, cards };
}

// (direct user request) - "all piles can be dropped into any other
// pile... cards added to the target, dropped pile removed once empty,
// target keeps its type." A different drop target than MOVE_PILE
// (dropped directly ON a pile, not a zone's own empty space).
test('MERGE_PILE: appends the source\'s cards after the target\'s own, in their original relative order, removes the now-empty source, target kind unchanged', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Source', kind: 'discard' });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Target', kind: 'plain' });
  const source = pilesOf(state).find((z) => z.name === 'Source');
  const target = pilesOf(state).find((z) => z.name === 'Target');
  // Target already has one card of its own, so "appended after" is a
  // real, checkable claim, not vacuously true for an empty target.
  state = seedPlainPileWithCards(state, 'p1', target.id, 1).state;
  state = seedPlainPileWithCards(state, 'p1', source.id, 2).state;
  // Capture each pile's actual order right before the merge, rather
  // than trusting the seeding helper's own returned list - the real
  // claim under test is "target's pre-merge order + source's pre-merge
  // order, concatenated", not any particular dealing sequence.
  const targetBefore = pilesOf(state).find((z) => z.id === target.id).cards;
  const sourceBefore = pilesOf(state).find((z) => z.id === source.id).cards;

  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: source.id, targetPileId: target.id });

  assert.equal(pilesOf(state).find((z) => z.id === source.id), undefined, 'source pile is gone');
  const merged = pilesOf(state).find((z) => z.id === target.id);
  assert.deepEqual(merged.cards.map((c) => c.id),
    [...targetBefore, ...sourceBefore].map((c) => c.id),
    'target\'s own cards first, then the source\'s cards in their original order - direct user correction, not reversed');
  assert.equal(merged.kind, 'plain', 'target keeps its own kind, not the source\'s');
});

// UPDATED: a `hand` source is allowed now (direct user request) - see
// the hand-merge tests above. A `deck` source still is not.
test('MERGE_PILE: rejects merging a pile into itself, an unknown target, a deck source, or the default Table pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Solo', kind: 'plain' });
  const solo = pilesOf(state).find((z) => z.name === 'Solo');
  // `hand:p1` is lazily created on first DEAL/DRAW, not by JOIN alone -
  // deal one card so a real hand pile exists to reject.
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });

  assert.throws(
    () => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: solo.id, targetPileId: solo.id }),
    /itself/,
  );
  assert.throws(
    () => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: solo.id, targetPileId: 'nope' }),
    /does not exist/,
  );
  assert.throws(
    () => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'deck', targetPileId: solo.id }),
    /Cannot merge/,
  );
  // A hand USED to be rejected here and is allowed now (direct user
  // request) - asserted positively rather than deleted, so the change is
  // visible at the place that used to forbid it.
  assert.doesNotThrow(
    () => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'hand:p1', targetPileId: solo.id }),
  );
  assert.throws(
    () => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'table', targetPileId: solo.id }),
    /Cannot merge/,
    'the built-in default Table pile is exempt, same as REMOVE_PILE',
  );
});

// Direct user correction: "I prefer... the cards are added in the same
// order" - merging into a deck used to prepend per-card (reversing the
// source's order); now it's the same plain append-after rule every
// other kind gets, no per-kind special case.
test('MERGE_PILE: merging INTO a deck appends after the existing cards, same order, same rule as any other target kind', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Source', kind: 'plain' });
  const source = pilesOf(state).find((z) => z.name === 'Source');
  state = seedPlainPileWithCards(state, 'p1', source.id, 2).state;
  const deckBefore = deckOf(state);
  const sourceBefore = pilesOf(state).find((z) => z.id === source.id).cards;

  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: source.id, targetPileId: 'deck' });
  assert.deepEqual(deckOf(state).map((c) => c.id), [...deckBefore, ...sourceBefore].map((c) => c.id));
  assert.equal(deckOf(state).length, 52);
});

// D73 follow-up (direct user request, "fix separate code paths for
// make zone - there can be only 1"): CREATE_ZONE and MOVE_PILE's own
// ungroup case now share ONE "spawn a fresh standalone Zone"
// implementation (`makeStandaloneZone`) - both must give the same
// default name, not just the pile itself.
test('MOVE_PILE: an ungrouped Zone gets the same default name ("Zone") as one created via CREATE_ZONE', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const discard = pilesOf(state).find((z) => z.name === 'Discard');
  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: 'table-zone' });
  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: null });
  const zoneRecord = state.zones.find((z) => z.id === discard.id);
  assert.equal(zoneRecord.name, 'Zone');
});

test('MOVE_PILE: throws for an unknown pile id', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'MOVE_PILE', pileId: 'nope', targetZoneId: 'table-zone' }), /does not exist/);
});

// --- CREATE_PILE (bloop: piles/zones/cards are all Movable) - a card
// dropped on a Zone's own empty space (not onto any existing pile
// inside it) spawns a brand-new pile there, seeded with that card, in
// one atomic dispatch (no create-then-move race between host and a
// guest). Distinct from CREATE_ZONE: that always mints a NEW standalone
// Zone; this always joins an EXISTING one (validated) - the same
// "genuinely different, don't conflate" split D55 drew between Zone
// and Pile in the first place.

test('CREATE_PILE: joins an EXISTING zone - never mints a new one, unlike CREATE_ZONE', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_PILE', zoneId: 'table-zone' });
  const zoneCountBefore = state.zones.length;
  const created = pilesOf(state).find((z) => z.zoneId === 'table-zone' && z.id !== 'deck' && z.id !== 'table' && z.id !== 'discard');
  assert.ok(created, 'a new pile exists, grouped into the Table Zone');
  assert.equal(state.zones.length, zoneCountBefore, 'no new Zone record was created');
});

// *nit (direct user request, "new Zones and Piles need default
// names"): same reasoning/numbering as CREATE_ZONE's own default-name
// tests above.
test('CREATE_PILE: no name given, kind "zone" - defaults to "Pile" (not "Zone")', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_PILE', zoneId: 'table-zone' });
  const created = pilesOf(state).find((z) => z.zoneId === 'table-zone' && z.id !== 'deck' && z.id !== 'table');
  assert.equal(created.name, 'Pile');
});

test('CREATE_PILE: an explicit name is never overridden by the default', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_PILE', zoneId: 'table-zone', name: 'Loot' });
  assert.equal(pilesOf(state).some((z) => z.name === 'Loot'), true);
});

test('CREATE_PILE: rejects an unknown zone id', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_PILE', zoneId: 'nope' }), /does not exist/);
});

test('CREATE_PILE: rejects hand/deck kinds - same eligibility as CREATE_ZONE', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'hand' }), /Cannot create/);
});

test('CREATE_PILE: with a pileableId, atomically moves that card out of its source pile into the new one', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;

  state = reduce(state, {
    type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: 'hand:p1', pileableId, playerId: 'p1'
  });

  assert.equal(handOf(state, 'p1').length, 0, 'removed from the source pile');
  const created = pilesOf(state).find((z) => z.zoneId === 'table-zone' && z.cards.some((c) => c.id === pileableId));
  assert.ok(created, 'landed in a real new pile grouped into the target zone');
  assert.equal(created.cards.length, 1);
});

// *nit (direct user request, D83, "fully permissive drag and drop"): a
// non-owner can now move someone else's still-hidden private card into
// a new pile too, same as MOVE - CREATE_PILE reuses the same
// authorization (`transferCard`), which no longer gates on ownership.
test('CREATE_PILE: the same authorization as MOVE - a non-owner CAN move someone else\'s still-hidden private card into a new pile now', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  const table = tableOf(state);

  const next = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: table.id, pileableId, playerId: 'p2' });
  const newPile = next.piles.find((p) => p.cards.some((c) => c.id === pileableId));
  assert.ok(newPile);
});

// --- REORDER_PILE (direct user request: "Panels can be moved from
// zone to zone [MOVE_PILE] and relocated within their zone
// [ordering]") - purely cosmetic (no game-state/privacy implication),
// open to any player like RENAME_PILE/RENAME_ZONE, not gated by
// `reparentable` (unlike a cross-zone move, staying inside the SAME
// zone is never a game-rule concern for any kind).
//
// UI trigger removed (direct user correction, MERGE_PILE: "remove the
// weird zone distinction, KISS" - a pile dropped on another pile always
// merges now, no more same-zone-reorders exception). The reducer action
// itself is untouched and still real/correct - kept, not deleted, in
// case a future gesture wants it; these tests protect that it still
// works if dispatched directly.

test('REORDER_PILE: moves a pile to sit immediately before another pile in the SAME zone', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'plain', name: 'A' });
  state = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'plain', name: 'B' });
  const [a, b] = pilesOf(state).filter((z) => z.name === 'A' || z.name === 'B');

  // Currently in creation order: ..., A, B. Move B before A.
  state = reduce(state, { type: 'REORDER_PILE', pileId: b.id, beforePileId: a.id });
  const order = state.piles.map((p) => p.id);
  assert.ok(order.indexOf(b.id) < order.indexOf(a.id), 'B now sits before A');
});

test('REORDER_PILE: rejects reordering across two different zones - use MOVE_PILE for that', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Elsewhere' });
  const elsewhere = pilesOf(state).find((z) => z.name === 'Elsewhere');
  assert.throws(
    () => reduce(state, { type: 'REORDER_PILE', pileId: elsewhere.id, beforePileId: 'table' }),
    /same Zone/,
  );
});

test('REORDER_PILE: rejects an unknown pile id on either side', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'REORDER_PILE', pileId: 'nope', beforePileId: 'table' }), /does not exist/);
  assert.throws(() => reduce(state, { type: 'REORDER_PILE', pileId: 'table', beforePileId: 'nope' }), /does not exist/);
});

test('REORDER_PILE: any player may reorder, not just the host/owner - purely cosmetic', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'plain', name: 'A' });
  const a = pilesOf(state).find((z) => z.name === 'A');
  assert.doesNotThrow(() => reduce(state, { type: 'REORDER_PILE', playerId: 'p2', pileId: a.id, beforePileId: 'table' }));
});

test('viewFor: carries zoneRecords (the real Zone registry) and each pile-view its own zoneId', () => {
  const state = createInitialState({}, () => 0.5);
  const view = viewFor(state, 'p1');
  assert.deepEqual(view.zones, [{ id: 'table-zone', name: 'Table Zone', ownerId: null, type: 'shared' }]);
  assert.equal(view.piles.find((z) => z.id === 'table').zoneId, 'table-zone');
  assert.equal(view.piles.find((z) => z.id === 'deck').zoneId, 'table-zone');
});

// --- Sprint 23, Phase 68: SPLIT_PILE + TAKE_PILE (US-60/61) ---

function dealPublicCardsTo(state, playerId, pileId, count) {
  for (let index = 0; index < count; index++) {
    const pileableId = handOf(state, playerId)[0].id;
    state = reduce(state, { type: 'MOVE', playerId, pileableId, toPileId: pileId });
  }
  return state;
}

// *nit (direct user request): "Split(index): creates a second pile
// (same pile type) after the current one in the same zone and moves
// cards after the split into the new pile (replaces old split
// semantics - now for all pile types)." No more "roughly in half" -
// `index` says exactly where the cut falls.
test('SPLIT_PILE: cuts at a real index - kept/moved sizes are exact, not roughly-half', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 5);
  const before = pilesOf(state).find((z) => z.id === pool.id).cards.map((c) => c.id);

  state = reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, index: 1, playerId: 'p1' });
  const original = pilesOf(state).find((z) => z.id === pool.id);
  const created = pilesOf(state).find((z) => z.kind === 'discard' && z.id !== pool.id);
  assert.ok(created, 'a new sibling pile exists');
  assert.deepEqual(original.cards.map((c) => c.id), before.slice(0, 1), 'original keeps everything before the cut');
  assert.deepEqual(created.cards.map((c) => c.id), before.slice(1), 'new pile gets everything from the cut onward');
  assert.equal(created.zoneId, pool.zoneId, 'lands in the same Zone as the source, a sibling');
});

test('SPLIT_PILE: rejects a pile with fewer than 2 cards, with a clear message', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 1);

  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, index: 1, playerId: 'p1' }), /only 1 card/);
});

test('SPLIT_PILE: rejects an index that would leave one side empty', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);

  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, index: 0, playerId: 'p1' }), /between 1 and 2/);
  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, index: 3, playerId: 'p1' }), /between 1 and 2/);
});

// *nit (direct user request, simplified): no more `bulkRemovable` flag -
// "pileableActions are the more general case" - `splitPileAt` now reuses
// `canRemove(pile, card, playerId, 'move')` directly, so eligibility
// falls out of the SAME rule drag-and-drop already uses everywhere. A
// hand used to be the one structural exception, incidentally: its
// owner's cards offered `'play'` rather than `'move'`. D102 retired
// that verb, so no kind is excluded at the reducer level any more (see
// the hand test below). A Foundation is NOT excluded either -
// `MeldPile` no longer overrides `pileableActions` at all, per
// `docs/ARCHITECTURE.md`'s "Core invariant".
// D102, DISCLOSED BEHAVIOR CHANGE: this test used to assert the exact
// opposite - "a hand is still ineligible" - and it passed for an
// INCIDENTAL reason, not a designed one. `splitPileAt` authorizes with
// `canRemove(pile, card, playerId, 'move')`, and a hand happened to
// be the one kind whose owner's cards never offered the literal string
// `'move'` (they offered `'play'`). Retiring the verb removes that
// accident, so a hand splits like any other pile at the reducer level.
//
// Kept deliberately, not patched back: adding an explicit hand check to
// `splitPileAt` would be a new special case, and D92 already settled
// which layer owns this - "which pile kinds actually OFFER an action is
// a presentation choice, not a reducer restriction". The offer layer is
// unchanged and still does not offer Split on a hand
// (`HandPile.pileActions` returns sort/convert only), so nothing in the
// UI changes; only a directly-dispatched SPLIT_PILE now succeeds.
test('SPLIT_PILE: a hand is eligible at the reducer level now (D102) - the old exclusion was an artifact of the retired \'play\' verb', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const before = handOf(state, 'p1').map((c) => c.id);

  const next = reduce(state, { type: 'SPLIT_PILE', pileId: 'hand:p1', index: 1, playerId: 'p1' });
  assert.deepEqual(handOf(next, 'p1').map((c) => c.id), before.slice(0, 1));
  const created = pilesOf(next).find((z) => z.kind === 'hand' && z.id !== 'hand:p1');
  assert.ok(created, 'a sibling hand pile exists');
  assert.deepEqual(created.cards.map((c) => c.id), before.slice(1));
});

// The offer layer, which is what a player actually sees, is unchanged
// by the above - the guard that keeps this a reducer-only capability.
test('SPLIT_PILE: a hand still never OFFERS split in the UI - the presentation layer is what excludes it (D102)', () => {
  const actions = new PlayerHandPile({ id: 'hand:me', kind: 'hand', ownerId: 'me', cards: [{ id: 'a' }, { id: 'b' }] })
    .pileActions({ isOwner: true, isShared: false, cards: [{ id: 'a' }, { id: 'b' }] });
  assert.ok(!actions.includes('split'), `a hand offers no split: got ${JSON.stringify(actions)}`);
});

test('SPLIT_PILE: a Foundation IS eligible now - no pile-kind lockout left, matching the Core invariant', () => {
  let state = withPlayers(createInitialState({}, () => 0.5, { piles: [{ kind: 'foundation', ownerId: null, count: 1 }] }), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const foundation = pilesOf(state).find((z) => z.kind === 'foundation');
  state = { ...state, piles: state.piles.map((p) => (p.id === foundation.id ? { ...p, cards: [{ id: 'a', rank: 'A', suit: 'clubs', faceUp: true, owner: null }, { id: 'b', rank: '2', suit: 'clubs', faceUp: true, owner: null }] } : p)) };

  const next = reduce(state, { type: 'SPLIT_PILE', pileId: foundation.id, index: 1, playerId: 'p1' });
  const created = pilesOf(next).find((z) => z.kind === 'foundation' && z.id !== foundation.id);
  assert.ok(created, 'a new foundation sibling exists');
  assert.deepEqual(created.cards.map((c) => c.id), ['b']);
});

test('SPLIT_PILE: eligible on kinds that never offered it before (e.g. a Cascade) - eligibility is per-card, not a kind allowlist', () => {
  let state = withPlayers(createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: null, count: 1 }] }), ['p1']);
  const cascade = pilesOf(state).find((z) => z.kind === 'cascade');
  state = {
    ...state,
    piles: state.piles.map((p) => (p.id === cascade.id
      ? { ...p, cards: [{ id: 'a', rank: 'K', suit: 'clubs', faceUp: true }, { id: 'b', rank: 'Q', suit: 'hearts', faceUp: true }] }
      : p))
  };
  const next = reduce(state, { type: 'SPLIT_PILE', pileId: cascade.id, index: 1, playerId: 'p1' });
  const created = pilesOf(next).find((z) => z.kind === 'cascade' && z.id !== cascade.id);
  assert.ok(created, 'a new cascade sibling exists - no kind allowlist blocked it');
  assert.deepEqual(created.cards.map((c) => c.id), ['b']);
});

test('SPLIT_PILE: fully permissive - a personal pile can be split by ANY player, not just its owner (Core invariant)', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }]
  });
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const stock = pilesOf(state).find((z) => z.kind === 'plain' && z.ownerId === 'p1');
  state = dealPublicCardsTo(state, 'p1', stock.id, 2);

  assert.doesNotThrow(() => reduce(state, { type: 'SPLIT_PILE', pileId: stock.id, index: 1, playerId: 'p2' }));
  assert.doesNotThrow(() => reduce(state, { type: 'SPLIT_PILE', pileId: stock.id, index: 1, playerId: 'p1' }));
});

// --- PICKUP_SPLIT (US: "Pickup(index): shortcut for split(index) &
// move to (or create and populate) player handpile") ---

test('PICKUP_SPLIT: splits at index and drains the split-off cards straight into the acting player\'s hand, no transient pile left behind', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 5);
  const before = pilesOf(state).find((z) => z.id === pool.id).cards.map((c) => c.id);
  const zonesBefore = pilesOf(state).length;

  state = reduce(state, { type: 'PICKUP_SPLIT', pileId: pool.id, index: 2, playerId: 'p2' });

  assert.equal(pilesOf(state).length, zonesBefore, 'no new pile - the split-off cards went straight to hand');
  const original = pilesOf(state).find((z) => z.id === pool.id);
  assert.deepEqual(original.cards.map((c) => c.id), before.slice(0, 2), 'original keeps everything before the cut');
  assert.deepEqual(
    handOf(state, 'p2').map((c) => c.id).slice(-3),
    before.slice(2),
    'the split-off cards landed in the ACTING player\'s hand, appended in order, after whatever they already held',
  );
});

// *nit (direct user request, "a hand is just a regular pile"): owner/
// faceUp are set now (`toHandCard`), not stripped - only `layout`
// (zone-only adjacency) still comes off.
test('PICKUP_SPLIT: stamps owner/faceUp on the way into hand (toHandCard), strips layout - same as TAKE_PILE', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);

  state = reduce(state, { type: 'PICKUP_SPLIT', pileId: pool.id, index: 1, playerId: 'p1' });

  const hand = handOf(state, 'p1');
  assert.ok(hand.every((c) => !('layout' in c)));
  assert.ok(hand.every((c) => c.owner === 'p1' && c.faceUp === false));
});

test('PICKUP_SPLIT: creates the hand pile lazily if the acting player has never drawn/picked up before', () => {
  // Seeded directly rather than via DEAL/PLAY: DEAL itself calls
  // `ensureHandPile` for every joined player (even at cardsPerPlayer 0),
  // which would create p1's hand pile before this test could observe
  // PICKUP_SPLIT doing it lazily - JOIN alone never does (D42).
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = {
    ...state,
    piles: state.piles.map((p) => (p.id === pool.id
      ? { ...p, cards: [{ id: 'a', rank: 'A', suit: 'clubs', faceUp: true, owner: null }, { id: 'b', rank: '2', suit: 'clubs', faceUp: true, owner: null }] }
      : p))
  };
  assert.equal(state.piles.some((p) => p.kind === 'hand'), false, 'no hand pile exists yet');

  state = reduce(state, { type: 'PICKUP_SPLIT', pileId: pool.id, index: 1, playerId: 'p1' });

  assert.equal(handOf(state, 'p1').length, 1);
});

test('TAKE_PILE: transfers every card into the acting player\'s hand, in order, stripped of zone-only fields', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);
  const order = pilesOf(state).find((z) => z.id === pool.id).cards.map((c) => c.id);

  state = reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p1' });
  assert.deepEqual(pilesOf(state).find((z) => z.id === pool.id).cards, [], 'pile is empty now');
  const hand = handOf(state, 'p1');
  assert.deepEqual(hand.map((c) => c.id), order, 'landed in the hand in the pile\'s own order');
  // *nit (direct user request, "a hand is just a regular pile"): owner/
  // faceUp are set now (toHandCard), not stripped - only layout still
  // comes off (zone-only adjacency), same as PICKUP.
  assert.ok(hand.every((c) => !('layout' in c)));
  assert.ok(hand.every((c) => c.owner === 'p1' && c.faceUp === false));
});

test('TAKE_PILE: fully permissive - a hidden card no longer blocks the take (Core invariant, D84 redaction removed)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 1);
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: pool.id });

  assert.doesNotThrow(() => reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p2' }));
});

test('TAKE_PILE: works on a discard pile specifically - a bulk operation, unaffected by whether per-card access is on or off', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 2);

  assert.doesNotThrow(() => reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p1' }));
});

test('TAKE_PILE: fully permissive - deck/hand are eligible too now, no kind allowlist left (Core invariant)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });

  assert.doesNotThrow(() => reduce(state, { type: 'TAKE_PILE', pileId: 'deck', playerId: 'p1' }));
  // p2 can take p1's whole hand - same philosophy as D83's per-card move.
  assert.doesNotThrow(() => reduce(state, { type: 'TAKE_PILE', pileId: 'hand:p1', playerId: 'p2' }));
});

// D91: `split` joins this offer list now that a real UI exists behind
// it (`ui.js`'s `renderSplitPicker`) - `Pile.pileActions`'s own comment
// used to explain why it was withheld; that's resolved now. (A separate
// `pickupSplit` briefly existed too and was a direct user correction -
// "there is not supposed to be a pickupSplit" - `take`, already in this
// list, already covers "everything into my hand".)
test('zonePile/discardPile pileActions: take open to any player on a shared pile, owner-only on a personal one', () => {
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isShared: true }), ['take', 'split', 'changePileType', 'remove', 'tighten', 'loosen']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isOwner: true }), ['take', 'split', 'changePileType', 'remove', 'tighten', 'loosen']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isOwner: false, isShared: false }), []);
  assert.deepEqual(new PILE_TYPES.discard({}).pileActions({ isShared: true }), ['take', 'split', 'changePileType', 'remove', 'tighten', 'loosen']);
  assert.deepEqual(new PILE_TYPES.discard({}).pileActions({}), []);
});

// --- Sprint 23, Phase 69: SET_PILE_ORIENTATION (US-62, hide/show) ---

test('SET_PILE_ORIENTATION: sets every card in the pile face-up or face-down uniformly', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);

  state = reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p1', faceUp: false });
  assert.ok(pilesOf(state).find((z) => z.id === pool.id).cards.every((c) => c.faceUp === false), 'every card face-down');

  state = reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p1', faceUp: true });
  assert.ok(pilesOf(state).find((z) => z.id === pool.id).cards.every((c) => c.faceUp === true), 'every card face-up again');
});

test('SET_PILE_ORIENTATION: rejects deck/hand kinds - only zone/discard are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: 'deck', playerId: 'p1', faceUp: false }),
    /Cannot set orientation/,
  );
  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: 'hand:p1', playerId: 'p1', faceUp: false }),
    /Cannot set orientation/,
  );
});

test('SET_PILE_ORIENTATION: fully permissive - a personal pile can be set by ANY player, not just its owner (Core invariant)', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }]
  });
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const stock = pilesOf(state).find((z) => z.kind === 'plain' && z.ownerId === 'p1');
  state = dealPublicCardsTo(state, 'p1', stock.id, 2);

  assert.doesNotThrow(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: stock.id, playerId: 'p2', faceUp: false }),
  );
});

test('SET_PILE_ORIENTATION: fully permissive - a shared pile can be set by ANY player, not just the host (Core invariant)', () => {
  // p1 joins first - the host, by construction (D3: only the host ever
  // runs `reduce`, and it always joins its own table before anyone else
  // can reach it via the share code).
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = pilesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 2);

  assert.doesNotThrow(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p2', faceUp: false }),
  );
});

test('zonePile/discardPile pileActions: hide/show are mutually exclusive, keyed off the pile\'s own current orientation', () => {
  const faceUp = (n) => Array.from({ length: n }, (_, index) => ({ id: `c${index}`, faceUp: true }));
  const faceDown = (n) => Array.from({ length: n }, (_, index) => ({ id: `c${index}`, faceUp: false }));
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isShared: true, cards: faceUp(2) }).filter((a) => a === 'hide' || a === 'show'), ['hide']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isShared: true, cards: faceDown(2) }).filter((a) => a === 'hide' || a === 'show'), ['show']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isShared: true, cards: [] }).filter((a) => a === 'hide' || a === 'show'), [], 'an empty pile offers neither');
});

// --- RENAME_PILE / RENAME_ZONE (*nit): any player may rename either -
// no ownership/host check, matching MOVE's "open unless
// hidden-and-owned" precedent rather than inventing a new authorization
// axis for a purely cosmetic label. Persistence is free: both `piles`
// and `zones` are already written wholesale by `persistence.js`.

test('RENAME_PILE: any player can rename any pile, including a shared one', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  const table = tableOf(state);
  state = reduce(state, { type: 'RENAME_PILE', pileId: table.id, playerId: 'p2', name: 'Discard Pile' });
  assert.equal(tableOf(state).name, 'Discard Pile');
});

test('RENAME_PILE: rejects an unknown pile id', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'RENAME_PILE', pileId: 'nope', playerId: 'p1', name: 'X' }),
    /does not exist/,
  );
});

test('RENAME_PILE: rejects a blank name (whitespace-only counts as blank)', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const table = tableOf(state);
  assert.throws(
    () => reduce(state, { type: 'RENAME_PILE', pileId: table.id, playerId: 'p1', name: ' '.repeat(3) }),
    /blank/,
  );
});

test('RENAME_PILE: trims surrounding whitespace', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const table = tableOf(state);
  state = reduce(state, { type: 'RENAME_PILE', pileId: table.id, playerId: 'p1', name: '  Loot  ' });
  assert.equal(tableOf(state).name, 'Loot');
});

test('RENAME_PILE: only the named pile changes, every other field/pile is untouched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const before = deckOf(state);
  const table = tableOf(state);
  state = reduce(state, { type: 'RENAME_PILE', pileId: table.id, playerId: 'p1', name: 'Loot' });
  assert.deepEqual(deckOf(state), before, 'an unrelated pile must be byte-identical');
});

test('RENAME_ZONE: any player can rename a Zone record', () => {
  // CREATE_ZONE's `name` names the PILE it creates, not the Zone record
  // it also ensures (`ensureZoneRecord` leaves a fresh Zone's `name`
  // `null` - D55's Zone/Pile split, the two are genuinely separate
  // labels) - so the Zone under test is looked up via the pile's own
  // `zoneId`, not by a name match against the Zone record.
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'RENAME_ZONE', zoneId: pile.zoneId, playerId: 'p2', name: 'Sets' });
  assert.equal(state.zones.find((z) => z.id === pile.zoneId).name, 'Sets');
});

test('RENAME_ZONE: rejects an unknown zone id', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'RENAME_ZONE', zoneId: 'nope', playerId: 'p1', name: 'X' }),
    /does not exist/,
  );
});

test('RENAME_ZONE: rejects a blank name', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  assert.throws(
    () => reduce(state, { type: 'RENAME_ZONE', zoneId: pile.zoneId, playerId: 'p1', name: '' }),
    /blank/,
  );
});

// --- REMOVE_PILE / REMOVE_ZONE (US-71/72, D62): empty-only, no
// cascade-delete, no silent card loss. deck/hand exempt from removal
// like MOVE_PILE; the Table Zone and any preset-declared zone are
// exempt from zone removal like CREATE_ZONE's own gating.

test('REMOVE_PILE: removes an empty zone-kind pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'REMOVE_PILE', pileId: pile.id, playerId: 'p1' });
  assert.equal(state.piles.some((p) => p.id === pile.id), false);
});

test('REMOVE_PILE: rejects an unknown pile id', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'REMOVE_PILE', pileId: 'nope', playerId: 'p1' }),
    /does not exist/,
  );
});

test('REMOVE_PILE: rejects the deck pile', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'REMOVE_PILE', pileId: 'deck', playerId: 'p1' }),
    /Cannot remove/,
  );
});

test('REMOVE_PILE: rejects a hand pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', playerId: 'p1', cardsPerPlayer: 0 });
  const hand = state.piles.find((p) => p.id === 'hand:p1');
  assert.throws(
    () => reduce(state, { type: 'REMOVE_PILE', pileId: hand.id, playerId: 'p1' }),
    /Cannot remove/,
  );
});

test('REMOVE_PILE: rejects the default Table pile even when empty', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const table = tableOf(state);
  assert.throws(
    () => reduce(state, { type: 'REMOVE_PILE', pileId: table.id, playerId: 'p1' }),
    /Cannot remove/,
  );
});

test('REMOVE_PILE: rejects a non-empty pile with a specific message, no cards lost', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  const card = { id: 'c1', rank: 'A', suit: 'S', faceUp: true };
  state = { ...state, piles: state.piles.map((p) => (p.id === pile.id ? { ...p, cards: [card] } : p)) };
  assert.throws(
    () => reduce(state, { type: 'REMOVE_PILE', pileId: pile.id, playerId: 'p1' }),
    /must be empty/,
  );
  assert.equal(state.piles.find((p) => p.id === pile.id).cards.length, 1, 'card must survive the rejected attempt');
});

test('REMOVE_ZONE: removes an empty player-created zone', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  const zoneId = pile.zoneId;
  state = reduce(state, { type: 'REMOVE_PILE', pileId: pile.id, playerId: 'p1' });
  state = reduce(state, { type: 'REMOVE_ZONE', zoneId, playerId: 'p1' });
  assert.equal(state.zones.some((z) => z.id === zoneId), false);
});

test('REMOVE_ZONE: rejects an unknown zone id', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'REMOVE_ZONE', zoneId: 'nope', playerId: 'p1' }),
    /does not exist/,
  );
});

test('REMOVE_ZONE: rejects the Table Zone', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'REMOVE_ZONE', zoneId: 'table-zone', playerId: 'p1' }),
    /Cannot remove/,
  );
});

test('REMOVE_ZONE: rejects a zone still containing a pile, no cascade-delete', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  assert.throws(
    () => reduce(state, { type: 'REMOVE_ZONE', zoneId: pile.zoneId, playerId: 'p1' }),
    /must be empty/,
  );
  assert.equal(state.piles.some((p) => p.id === pile.id), true, 'the pile must survive the rejected attempt');
});

test('REMOVE_ZONE: rejects a preset-declared zone even when empty', () => {
  const state = withPlayers(
    createInitialState({}, () => 0.5, { zones: [{ id: 'foundations-zone', name: 'Foundations' }] }),
    ['p1'],
  );
  assert.throws(
    () => reduce(state, { type: 'REMOVE_ZONE', zoneId: 'foundations-zone', playerId: 'p1' }),
    /Cannot remove/,
  );
});

// --- CHANGE_PILE_TYPE (US-73, D63): zone<->discard only, empty-only -
// no per-card canAccept re-validation exists to safely allow non-empty
// swaps.

test('CHANGE_PILE_TYPE: flips an empty zone-kind pile to discard', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).kind, 'discard');
});

test('CHANGE_PILE_TYPE: flips discard back to zone', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'plain', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).kind, 'plain');
});

test('CHANGE_PILE_TYPE: rejects an unknown pile id', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(
    () => reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'nope', kind: 'discard', playerId: 'p1' }),
    /does not exist/,
  );
});

// D71 (US-74): widened from zone/discard to the full 5-kind cycle
// (zone/discard/foundation/cascade/rankAdjacent) - D63's "no per-card
// re-validation" exclusion reasoning is moot once the pile is
// guaranteed empty, for every kind, not just the original two.

test('CHANGE_PILE_TYPE: rejects a genuinely unknown target kind', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  assert.throws(
    () => reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'notAKind', playerId: 'p1' }),
    /Cannot change/,
  );
});

// D86 (direct user request: "pile type determines the look and feel...
// if it's a hand pile it's in a fan, if it's a deck pile they are
// stacked on top") - deck/hand join the TARGET list, so a pile can get
// their real look, not just a relabeled row.

test('CHANGE_PILE_TYPE: a personal (owned) pile can become a real hand', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }] });
  state = withPlayers(state, ['p1']);
  const pile = pilesOf(state).find((z) => z.kind === 'plain' && z.ownerId === 'p1');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'hand', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).kind, 'hand');
});

// D89 (direct user request: "no need to support orphaned piles since
// that should now never happen") - D87's own "shared pile CAN become a
// hand" widening is reverted specifically: that was the ONE path that
// could ever produce an orphaned (`ownerId: null`) hand-kind pile,
// which D88 then had to grow special reclaim-handling for. Simpler to
// make the state impossible than to keep correctly handling it -
// reinstates the ownerId-required guard D86 originally had, D87 had
// dropped.
test('CHANGE_PILE_TYPE: a shared (unowned) pile still cannot become a hand - prevents an orphaned hand pile from ever existing', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  assert.throws(
    () => reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'hand', playerId: 'p1' }),
    /no owner/,
  );
});

test('CHANGE_PILE_TYPE: any eligible pile (owned or shared) can become a real deck', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'deck', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).kind, 'deck');
});

// D87 supersedes D86's source/target asymmetry: deck/hand are now valid
// SOURCES too - "all pile types must be convertible to any other pile
// type... deck -> hand -> discard -> all are allowed."
test('CHANGE_PILE_TYPE: deck/hand ARE valid sources now - full symmetry, any kind to any kind', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'deck', kind: 'plain', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === 'deck').kind, 'plain');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'hand:p1', kind: 'discard', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').kind, 'discard');
});

// D89: `hand` requires a real owner, so an owned pile (`hand:p1`
// itself, already owned by construction) is the chain's starting
// point rather than the ownerless canonical deck.
test('CHANGE_PILE_TYPE: exact card preservation through a chain of conversions - hand -> deck -> discard -> zone -> hand, same ids, same count, every step', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  const originalIds = handOf(state, 'p1').map((c) => c.id);
  assert.equal(originalIds.length, 5);

  for (const kind of ['deck', 'discard', 'plain', 'hand']) {
    state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'hand:p1', kind, playerId: 'p1' });
    const pile = state.piles.find((p) => p.id === 'hand:p1');
    assert.equal(pile.kind, kind);
    assert.equal(pile.cards.length, 5, `still 5 cards after converting to ${kind}`);
    assert.deepEqual(pile.cards.map((c) => c.id), originalIds, `same card ids, same order, after converting to ${kind}`);
  }
});

// D87's real hazard: converting the CANONICAL hand away and then
// drawing/picking up again must not corrupt anything - `ensureHandPile`
// must mint a fresh id rather than reuse one a converted pile still
// holds, or two piles would silently share `hand:p1`.
test('CHANGE_PILE_TYPE: converting the canonical hand away, then drawing again, creates a genuinely separate NEW hand - the old pile keeps its original 5 cards untouched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  const originalCardIds = handOf(state, 'p1').map((c) => c.id);
  assert.equal(originalCardIds.length, 5);

  // The user's own example: "I had 5 cards in my hand and turned it into a deck."
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'hand:p1', kind: 'deck', playerId: 'p1' });
  const convertedPile = state.piles.find((p) => p.id === 'hand:p1');
  assert.equal(convertedPile.kind, 'deck');
  assert.equal(convertedPile.cards.length, 5, 'exactly 5 cards - the same 5, not the real 52-card deck');
  assert.deepEqual(convertedPile.cards.map((c) => c.id), originalCardIds);

  // Now draw again - a fresh hand must be created, NOT reusing "hand:p1"
  // (that id now belongs to the converted deck-look pile).
  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p1' });

  const idSet = new Set(state.piles.map((p) => p.id));
  assert.equal(idSet.size, state.piles.length, 'no two piles ever share an id');

  const oldConverted = state.piles.find((p) => p.id === 'hand:p1');
  assert.equal(oldConverted.kind, 'deck', 'the old converted pile is untouched by the new DRAW');
  assert.equal(oldConverted.cards.length, 5, 'still exactly its original 5 cards, unchanged');
  assert.deepEqual(oldConverted.cards.map((c) => c.id), originalCardIds);

  const newHand = state.piles.find((p) => p.kind === 'hand' && p.ownerId === 'p1');
  assert.ok(newHand, 'a genuinely new hand pile exists');
  assert.notEqual(newHand.id, 'hand:p1', 'the new hand did NOT reuse the occupied canonical id');
  assert.equal(newHand.cards.length, 1, 'the freshly drawn card landed in the NEW hand, not the old converted one');
  assert.equal(handOf(state, 'p1').length, 1, 'handOf resolves to the new hand by kind+owner, unambiguous');
});

test('CHANGE_PILE_TYPE: a converted hand pile (non-canonical id) is really usable as a hand - PICKUP/DRAW/PLAY/TAKE_PILE all resolve it by kind+owner, not by id', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }] });
  state = withPlayers(state, ['p1']);
  const stock = pilesOf(state).find((z) => z.kind === 'plain' && z.ownerId === 'p1');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: stock.id, kind: 'hand', playerId: 'p1' });
  assert.notEqual(stock.id, 'hand:p1', 'sanity: this pile does NOT carry the canonical hand id');

  // DRAW should land the card in THIS pile, not spawn a second "hand:p1".
  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p1' });
  const handPiles = state.piles.filter((p) => p.kind === 'hand' && p.ownerId === 'p1');
  assert.equal(handPiles.length, 1, 'no duplicate canonical hand pile got created alongside the converted one');
  assert.equal(handPiles[0].id, stock.id);
  assert.equal(handOf(state, 'p1').length, 1);

  // PICKUP also targets it correctly.
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Table2' });
  const table = state.piles.find((p) => p.name === 'Table2');
  state = { ...state, piles: state.piles.map((p) => (p.id === table.id ? { ...p, cards: [{ id: 'x', rank: 'A', suit: 'clubs', faceUp: true }] } : p)) };
  state = reduce(state, { type: 'PICKUP', playerId: 'p1', pileableId: 'x' });
  assert.equal(handOf(state, 'p1').length, 2);

  // PLAY (leaving the hand) reads it as the source pile too.
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: table.id });
  assert.equal(handOf(state, 'p1').length, 1);
});

test('CHANGE_PILE_TYPE: an empty zone pile can convert to foundation/cascade/rankAdjacent', () => {
  for (const kind of ['foundation', 'cascade', 'rankAdjacent']) {
    let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
    state = reduce(state, { type: 'CREATE_ZONE', name: `Test-${kind}` });
    const pile = state.piles.find((p) => p.name === `Test-${kind}`);
    state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind, playerId: 'p1' });
    assert.equal(state.piles.find((p) => p.id === pile.id).kind, kind, `${kind} must be a legal target`);
  }
});

test('CHANGE_PILE_TYPE: an empty foundation/cascade/rankAdjacent pile can itself convert away (source-side eligibility)', () => {
  for (const kind of ['foundation', 'cascade', 'rankAdjacent']) {
    let state = withPlayers(createInitialState({}, () => 0.5, {
      piles: [{ kind, ownerId: null, count: 1 }]
    }), ['p1']);
    const pile = pilesOf(state).find((z) => z.kind === kind);
    state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'plain', playerId: 'p1' });
    assert.equal(state.piles.find((p) => p.id === pile.id).kind, 'plain', `${kind} must be a legal source`);
  }
});

// Gate 1's auto-rename condition: converting a pile whose name is
// still its OLD kind's own D70 default renames it to the NEW kind's
// default too - a manually-chosen name is left untouched.

test('CHANGE_PILE_TYPE: auto-renames when the pile still has its old kind\'s default name', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE' }); // default name "Pile"
  const pile = pilesOf(state).find((z) => z.id !== 'table' && z.id !== 'deck');
  assert.equal(pile.name, 'Pile');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).name, 'Discard');
});

test('CHANGE_PILE_TYPE: auto-renames a NUMBERED default too (e.g. "Pile 2" -> "Discard")', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE' });
  state = reduce(state, { type: 'CREATE_ZONE' }); // "Pile 2"
  const pile = pilesOf(state).find((z) => z.name === 'Pile 2');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).name, 'Discard', 'unnumbered - not chasing exact dedup count on conversion');
});

test('CHANGE_PILE_TYPE: a manually-chosen name is never touched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  assert.equal(state.piles.find((p) => p.id === pile.id).name, 'Melds');
});

// Superseded by D87 - see "deck/hand ARE valid sources now" above. The
// deck is no longer exempt as a CHANGE_PILE_TYPE source; REMOVE_PILE
// still rejects deleting it outright (a separate action, separate guard).

// Direct user request (2026-08-27): allow changePileType on a non-empty
// pile too - see state.js's CHANGE_PILE_TYPE doc comment for the risk
// that reopens for foundation/cascade/rankAdjacent targets.
test('CHANGE_PILE_TYPE: allowed on a non-empty pile, cards carried over unchanged', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  const pile = state.piles.find((p) => p.name === 'Melds');
  const card = { id: 'c1', rank: 'A', suit: 'S', faceUp: true };
  state = { ...state, piles: state.piles.map((p) => (p.id === pile.id ? { ...p, cards: [card] } : p)) };
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: pile.id, kind: 'discard', playerId: 'p1' });
  const changed = state.piles.find((p) => p.id === pile.id);
  assert.equal(changed.kind, 'discard');
  assert.deepEqual(changed.cards, [card], 'cards untouched by the kind change');
});

// --- D88: card conservation invariant (direct user request: "no cards
// can be created or destroyed during play... there shouldn't be any
// situation where cards go missing") - `reduce()` itself verifies this
// after every dispatch except RESET. These tests exercise
// `assertCardsConserved` directly (exported for exactly this) since
// every real action is now correct and can't be used to trigger a
// violation through the public API any more - that's the point.

function pileOf(cards) {
  return { id: 'p', kind: 'plain', name: 'P', ownerId: null, cards, zoneId: 'z' };
}

test('assertCardsConserved: passes when the exact same ids exist before and after, any rearrangement', () => {
  const before = { piles: [pileOf([{ id: 'a' }, { id: 'b' }]), { ...pileOf([{ id: 'c' }]), id: 'p2' }] };
  const after = { piles: [pileOf([{ id: 'a' }]), { ...pileOf([{ id: 'b' }, { id: 'c' }]), id: 'p2' }] };
  assert.doesNotThrow(() => assertCardsConserved(before, after, 'MOVE'));
});

test('assertCardsConserved: throws when a card vanishes', () => {
  const before = { piles: [pileOf([{ id: 'a' }, { id: 'b' }])] };
  const after = { piles: [pileOf([{ id: 'a' }])] };
  assert.throws(
    () => assertCardsConserved(before, after, 'MOVE'),
    /missing: b/,
  );
});

test('assertCardsConserved: throws when a card is duplicated across piles', () => {
  const before = { piles: [pileOf([{ id: 'a' }])] };
  const after = { piles: [pileOf([{ id: 'a' }]), { ...pileOf([{ id: 'a' }]), id: 'p2' }] };
  assert.throws(
    () => assertCardsConserved(before, after, 'DRAW'),
    /duplicated: a/,
  );
});

test('assertCardsConserved: throws when an id appears that was never there before', () => {
  const before = { piles: [pileOf([{ id: 'a' }])] };
  const after = { piles: [pileOf([{ id: 'a' }, { id: 'ghost' }])] };
  assert.throws(
    () => assertCardsConserved(before, after, 'PICKUP'),
    /appeared from nowhere: ghost/,
  );
});

test('reduce(): RESET is exempt - a full deck rebuild with brand new ids is a legitimate new epoch, not a violation', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  assert.doesNotThrow(() => reduce(state, { type: 'RESET' }));
});

test('reduce(): every real action stays conserved through a realistic sequence - if the invariant were wrong, this whole suite would fail, not just this test', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p1' });
  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  state = reduce(state, { type: 'CHANGE_PILE_TYPE', pileId: 'hand:p2', kind: 'deck', playerId: 'p2' });
  state = reduce(state, { type: 'DRAW', pileId: 'deck', playerId: 'p2' });
  // No assertion needed beyond "did not throw" - reduce() itself already
  // checked conservation after every one of the calls above.
  assert.ok(state);
});

// --- SORT_PILE (D91) ---------------------------------------------------
// `HandPile.pileActions` has offered `sortRank`/`sortSuit` since D14's
// hand redesign, but they never dispatched anywhere (D14's own
// client-only `handOrder.js` overlay was retired once a hand became a
// real state-level pile, and nothing replaced it) - `ui.js` filtered the
// buttons out rather than ship a false affordance. This is that reducer
// action, direct user request ("we're missing a bunch of pile actions,
// like sort by rank, sort by suit").

function handStateWith(cards) {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  return { ...state, piles: [...state.piles, { id: 'hand:p1', kind: 'hand', name: 'Hand', ownerId: 'p1', cards, zoneId: 'player:p1' }] };
}

test('SORT_PILE by rank: ascending rank, suit breaks a tie', () => {
  const state = handStateWith([
    { id: 'a', rank: 'K', suit: 'clubs' },
    { id: 'b', rank: '2', suit: 'hearts' },
    { id: 'c', rank: '2', suit: 'clubs' },
  ]);
  const after = reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'p1', by: 'rank' });
  assert.deepEqual(handOf(after, 'p1').map((c) => c.id), ['c', 'b', 'a'], 'rank ascending; clubs before hearts breaks the 2/2 tie');
});

test('SORT_PILE by suit: clubs/diamonds/hearts/spades order, rank breaks a tie', () => {
  const state = handStateWith([
    { id: 'a', rank: '5', suit: 'spades' },
    { id: 'b', rank: '2', suit: 'clubs' },
    { id: 'c', rank: 'A', suit: 'clubs' },
  ]);
  const after = reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'p1', by: 'suit' });
  assert.deepEqual(handOf(after, 'p1').map((c) => c.id), ['c', 'b', 'a'], 'clubs before spades; A before 2 breaks the clubs/clubs tie');
});

test('SORT_PILE: does not mutate the input state', () => {
  const state = handStateWith([{ id: 'a', rank: 'K', suit: 'clubs' }, { id: 'b', rank: 'A', suit: 'clubs' }]);
  const before = handOf(state, 'p1').map((c) => c.id);
  reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'p1', by: 'rank' });
  assert.deepEqual(handOf(state, 'p1').map((c) => c.id), before);
});

test('SORT_PILE: rejects an unknown pile', () => {
  const state = handStateWith([]);
  assert.throws(() => reduce(state, { type: 'SORT_PILE', pileId: 'nope', playerId: 'p1', by: 'rank' }), /nope/);
});

test('SORT_PILE: only the owner may sort their own hand', () => {
  const state = handStateWith([{ id: 'a', rank: 'K', suit: 'clubs' }]);
  assert.throws(
    () => reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'someone-else', by: 'rank' }),
    /authoriz/i,
  );
});

// US-113 (direct user request: "rtg hand sorting should be by color and
// card type not suite and rank") - RtG cards have no rank/suit at all,
// so those two sorts did nothing for them. `colors` is an array (a card
// can be multicolour or, for a land, colourless), so the sort key is
// the FIRST colour in WUBRG order, colourless last.
test('SORT_PILE by color: WUBRG order, card type breaks a tie', () => {
  const state = handStateWith([
    { id: 'a', colors: ['R'], type: 'Creature' },
    { id: 'b', colors: ['W'], type: 'Instant' },
    { id: 'c', colors: ['W'], type: 'Creature' },
    { id: 'd', colors: [] }, // a land - colourless, sorts last
  ]);
  const after = reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'p1', by: 'color' });
  assert.deepEqual(handOf(after, 'p1').map((c) => c.id), ['c', 'b', 'a', 'd'],
    'white before red; Creature before Instant breaks the white/white tie; colourless last');
});

test('SORT_PILE by cardType: Creature/Instant/Sorcery/Enchantment/Land order, color breaks a tie', () => {
  const state = handStateWith([
    { id: 'a', colors: ['R'], type: 'Land' },
    { id: 'b', colors: ['R'], type: 'Creature' },
    { id: 'c', colors: ['G'], type: 'Creature' },
  ]);
  const after = reduce(state, { type: 'SORT_PILE', pileId: 'hand:p1', playerId: 'p1', by: 'cardType' });
  assert.deepEqual(handOf(after, 'p1').map((c) => c.id), ['b', 'c', 'a'],
    'Creature before Land; red before green breaks the Creature/Creature tie');
});


// --- Pile spread: Tighten / Loosen (*nit) ---------------------------
//
// *nit (direct user request): "pile actions for tighten/loosen to adjust
// the overlap on fan and meld piles or runs or whatever." How far a
// pile's cards overlap was a hardcoded CSS constant (`.fan-row
// .middle-card + .middle-card`'s 0.65), identical for every pile and
// unadjustable. It's replicated state now, so everyone at the table
// sees the same spread.
//
// ONE reducer action taking a signed delta, not a TIGHTEN plus a
// LOOSEN - the same "there can be only 1" rule D75/D103 applied, and
// the same shape `ADJUST_SCORE` already uses for +/- steps.

test('ADJUST_PILE_SPREAD: loosening lowers the overlap factor from the pile type\'s own default', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  const hand = state.piles.find((p) => p.id === 'hand:p1');
  assert.equal(hand.spread, spreadAfter(-1));
});

test('ADJUST_PILE_SPREAD: tightening raises it, and repeated steps accumulate', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: SPREAD_STEP });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, spreadAfter(1));

  // Accumulation checked downward: a hand starts near the tight end of
  // the range, so two steps UP would hit MAX_SPREAD and prove clamping
  // rather than accumulation (which the clamp tests below cover).
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, spreadAfter(-1));
});

// Each pile TYPE brings its own starting spread - a hand fans by
// default, a flat pile doesn't overlap at all - so the first adjustment
// has to move from that type's own default, not from a single global
// number. `static defaultSpread` on the class, same shape as
// `visibility`/`tableSide`/`component`.
test('ADJUST_PILE_SPREAD: a flat pile starts from ITS default (no overlap), not the hand\'s', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Meld', kind: 'run' });
  const meld = pilesOf(state).find((z) => z.name === 'Meld');
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: meld.id, delta: SPREAD_STEP });
  assert.equal(pilesOf(state).find((z) => z.id === meld.id).spread, SPREAD_STEP);
});

test('ADJUST_PILE_SPREAD: clamps at fully tightened - further tightening is a no-op, never past the max', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  for (let index = 0; index < 50; index++) {
    state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: SPREAD_STEP });
  }
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, MAX_SPREAD);
});

test('ADJUST_PILE_SPREAD: clamps at fully loosened - never negative, which would push cards apart', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  for (let index = 0; index < 50; index++) {
    state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  }
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, MIN_SPREAD);
});

test('ADJUST_PILE_SPREAD: throws for a pile that does not exist', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'nope', delta: SPREAD_STEP }), /does not exist/);
});

// Spread is presentation, not content: adjusting it must never disturb
// the cards themselves. Worth an explicit assertion because the reducer
// rebuilds the pile record to write the field.
test('ADJUST_PILE_SPREAD: leaves the pile\'s cards completely untouched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  const before = handOf(state, 'p1');
  const beforeState = state;
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  assert.deepEqual(handOf(state, 'p1'), before);
  assertCardsConserved(beforeState, state, 'ADJUST_PILE_SPREAD');
});

// The three explicit field lists a pile's data passes through
// (`constructor`, `toJSON`, `getView`) each had to name `spread`
// independently, and missing any one of them wipes it silently:
// `insertPileable`/`removePileable` rebuild the pile from `toJSON()`, and
// `viewFor` sends `getView()`. The reducer tests above all passed while
// the feature did nothing on screen because only `getView` was missing.
test('ADJUST_PILE_SPREAD: the spread survives cards moving in and out of the pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });
  const adjusted = state.piles.find((p) => p.id === 'hand:p1').spread;

  const pileableId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId, toPileId: 'table' });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, adjusted, 'survives a card leaving');

  state = reduce(state, { type: 'PICKUP', playerId: 'p1', pileableId });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').spread, adjusted, 'and a card arriving');
});

test('ADJUST_PILE_SPREAD: the spread reaches the VIEW, not just the state - the wiring the reducer tests cannot see', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'hand:p1', delta: -SPREAD_STEP });

  const pileView = viewFor(state, 'p1').piles.find((p) => p.id === 'hand:p1');
  assert.equal(pileView.spread, spreadAfter(-1));
});

test('an unadjusted pile carries spread: undefined in its view, so the type default applies', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  assert.equal(viewFor(state, 'p1').piles.find((p) => p.id === 'hand:p1').spread, undefined);
});

// D88's conservation guard, narrowed rather than switched off for JOIN
// (sprint pileObjects follow-up). A player joining a poker table brings
// their own chip stack, so ids legitimately APPEAR at JOIN - the same
// way a deck appears at RESET. The two failure modes that actually
// matter, losing a card and duplicating one, still throw.
test('conservation: JOIN may introduce a declared per-player stock - ids appearing is legal there', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1, deckType: 'chips', deckList: 'poker-stack' }],
  });
  assert.doesNotThrow(() => reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' }));
});

test('conservation: JOIN still catches a LOST card, which is never legitimate', () => {
  const before = createInitialState({}, () => 0.5);
  const after = { ...before, piles: before.piles.map((p) => (p.kind === 'deck' ? { ...p, cards: p.cards.slice(1) } : p)) };
  assert.throws(() => assertCardsConserved(before, after, 'JOIN'), /missing/);
});

test('conservation: JOIN still catches a DUPLICATED card', () => {
  const before = createInitialState({}, () => 0.5);
  const deck = before.piles.find((p) => p.kind === 'deck');
  const after = { ...before, piles: before.piles.map((p) => (p.kind === 'deck' ? { ...p, cards: [...p.cards, deck.cards[0]] } : p)) };
  assert.throws(() => assertCardsConserved(before, after, 'JOIN'), /duplicated/);
});


// --- Resuming a table must not duplicate per-player piles ------------
//
// *fix (direct user report): "chip tray dups again when resuming an
// existing game". A host's id is a PEER id, not a playerKey, so it is
// different every session - `resumeHostedTable` re-seats them under the
// new one. JOIN then sees an unknown player and builds their declared
// `perPlayer` piles again, while the saved originals stay behind under
// the dead id. The visible symptom is two chip trays; the worse one is
// that the host's own chips are in the orphaned tray.
//
// Pre-existing for every perPlayer declaration (Spit's stock, RtG's
// battlefield/discard/exile) - chips only made it obvious, because a
// stocked tray is impossible to miss.

test('reseatOwner: moves a player, their piles, their zones and their score to a new id', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: 'perPlayer', count: 1, deckType: 'chips', deckList: 'poker-stack' }],
  });
  state = reduce(state, { type: 'JOIN', playerId: 'old-host', name: 'Alice' });
  const before = pilesOf(state).filter((p) => p.ownerId === 'old-host');
  assert.equal(before.length, 1);

  const moved = reseatOwner(state, 'old-host', 'new-host');
  assert.equal(moved.players.filter((p) => p.id === 'new-host').length, 1);
  assert.equal(moved.players.some((p) => p.id === 'old-host'), false, 'the old id is gone entirely');

  const after = pilesOf(moved).filter((p) => p.ownerId === 'new-host');
  assert.equal(after.length, 1, 'their pile came with them');
  assert.equal(after[0].cards.length, before[0].cards.length, 'and kept its chips');
  assert.ok(!after[0].id.includes('old-host'), `a derived id must not keep the dead one: ${after[0].id}`);
  assert.ok(moved.zones.every((z) => !z.id.includes('old-host')), 'zones move too');
});

test('reseatOwner: a table with no such player is returned untouched', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(reseatOwner(state, 'nobody', 'someone'), state);
});

// The regression itself, end to end: resume re-seats, then JOINs.
test('resuming a table re-seats the host WITHOUT duplicating their per-player piles', () => {
  let saved = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: 'perPlayer', count: 1, deckType: 'chips', deckList: 'poker-stack' }],
  });
  saved = reduce(saved, { type: 'JOIN', playerId: 'peer-1', name: 'Alice' });
  const chipsBefore = pilesOf(saved).find((p) => p.kind === 'chip').cards.length;

  // Exactly what `resumeHostedTable` does: re-seat the old host id onto
  // this session's new peer id, then JOIN as that id.
  const reseated = reseatOwner(saved, 'peer-1', 'peer-2');
  const resumed = reduce(reseated, { type: 'JOIN', playerId: 'peer-2', name: 'Alice' });

  const trays = pilesOf(resumed).filter((p) => p.kind === 'chip');
  assert.equal(trays.length, 1, `one tray, not ${trays.length}`);
  assert.equal(trays[0].ownerId, 'peer-2', 'and it belongs to the resumed host');
  assert.equal(trays[0].cards.length, chipsBefore, 'with their chips still in it');
});

test('resuming twice still leaves exactly one tray', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: 'perPlayer', count: 1, deckType: 'chips', deckList: 'poker-stack' }],
  });
  state = reduce(state, { type: 'JOIN', playerId: 'peer-1', name: 'Alice' });
  for (const [from, to] of [['peer-1', 'peer-2'], ['peer-2', 'peer-3']]) {
    state = reduce(reseatOwner(state, from, to), { type: 'JOIN', playerId: to, name: 'Alice' });
  }
  assert.equal(pilesOf(state).filter((p) => p.kind === 'chip').length, 1);
});


// *fix (direct user report): "reshuffle and redeal is still busted -
// deals whole deck". `lastDealCount` (main.js) is seeded from the
// preset on the share screen - which a RESUMED table never shows, so it
// kept its module-load default: the FIRST preset's hand size, War's 26.
// Two players x 26 is the entire deck. `gameConfig` had no record of the
// preset's hand size at all, so resume had nothing to restore it from.
test('gameConfig carries cardsPerPlayer, so a restored table can recover its deal size', () => {
  const state = createInitialState({}, () => 0.5, { cardsPerPlayer: 7 });
  assert.equal(state.gameConfig.cardsPerPlayer, 7);
});

test('gameConfig.cardsPerPlayer is undefined when a preset does not set one - no invented default', () => {
  assert.equal(createInitialState({}, () => 0.5).gameConfig.cardsPerPlayer, undefined);
});

// It has to SURVIVE a reset, or the same bug returns the moment someone
// reshuffles on a restored table.
test('gameConfig.cardsPerPlayer survives a RESET', () => {
  let state = createInitialState({}, () => 0.5, { cardsPerPlayer: 7 });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  assert.equal(reduce(state, { type: 'RESET' }).gameConfig.cardsPerPlayer, 7);
});


// --- Dropping a hand pile onto another pile --------------------------
//
// *fix (direct user report): "Dropping a hand pile move all the cards to
// the target but does not remove the empty HandPile - remove block on
// moving hand piles". `MERGE_PILE` threw for a `hand` source, so the
// pile-level merge (which is what removes the emptied source) never ran.

// CORRECTED by the user after the first attempt removed it: "I said
// DONT delete the hand pile when dropped we need to keep it around for
// the next draw." A hand is the player's permanent seat fixture, not a
// transient pile that exists only while it holds something - dropping
// your hand onto the table empties it, it does not remove your seat.
test('MERGE_PILE: a hand merges its cards away but the hand itself STAYS, empty, for the next draw', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  const before = tableOf(state).cards.length;

  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'hand:p1', targetPileId: 'table' });

  assert.equal(tableOf(state).cards.length, before + 3, 'every card moved');
  const hand = state.piles.find((p) => p.id === 'hand:p1');
  assert.ok(hand, 'the hand pile is still there');
  assert.deepEqual(hand.cards, [], 'and it is empty');
});

test('MERGE_PILE: the kept hand really is usable for the next draw', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'hand:p1', targetPileId: 'table' });

  state = reduce(state, { type: 'DRAW', playerId: 'p1', pileId: 'deck' });
  assert.equal(handOf(state, 'p1').length, 1, 'drawing lands in the hand that was kept');
  assert.equal(state.piles.filter((p) => p.id === 'hand:p1').length, 1, 'and no second hand was created');
});

// Every other kind is still removed once merged away - an ordinary pile
// exists because it has cards in it.
test('MERGE_PILE: an ordinary pile IS removed once merged away', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Spare' });
  const spare = pilesOf(state).find((z) => z.name === 'Spare');
  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: spare.id, targetPileId: 'table' });
  assert.equal(state.piles.some((p) => p.id === spare.id), false);
});

// D102's rule, which `MERGE_PILE` bypassed because it concatenates raw
// cards instead of going through `transferCard`: a card leaving a hand
// for the table is public and face-up. Without this the merged cards
// arrived owned and face-down, looking like a bug.
test('MERGE_PILE: cards leaving a hand land public and face-up, same as any other way out', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'hand:p1', targetPileId: 'table' });

  for (const card of tableOf(state).cards) {
    assert.equal(card.owner, null, 'not still owned by the hand it left');
    assert.equal(card.faceUp, true, 'and not still face-down');
  }
});

test('MERGE_PILE: merging INTO a hand keeps the cards as hand cards', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Spare' });
  const spare = pilesOf(state).find((z) => z.name === 'Spare');
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'MOVE', playerId: 'p1', pileableId: cardId, toPileId: spare.id });

  state = reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: spare.id, targetPileId: 'hand:p1' });
  const card = handOf(state, 'p1').find((c) => c.id === cardId);
  assert.equal(card.owner, 'p1', 'restamped for the hand it landed in');
  assert.equal(card.faceUp, false);
});

test('MERGE_PILE: a deck still cannot be merged - only the hand block was lifted', () => {
  const state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'MERGE_PILE', playerId: 'p1', pileId: 'deck', targetPileId: 'table' }),
    /deck/);
});

// "remove block on moving hand piles": a hand may be reparented into a
// different Zone like any other pile.
test('MOVE_PILE: a hand pile can be moved between zones now', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'MOVE_PILE', pileId: 'hand:p1', targetZoneId: 'table-zone' });
  assert.equal(pilesOf(state).find((p) => p.id === 'hand:p1').zoneId, 'table-zone');
});
