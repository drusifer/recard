import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor, deckOf, handOf, handsOf, pilesOf, pileVisibility, assertCardsConserved } from '../src/state.js';
import { PILE_TYPES } from '../src/piles/pileTypes.js';

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
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: true, tableZone: true, piles: [], zones: [] });
});

test('createInitialState: allowsPlayerZones can be set false via the third param', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: false, tableZone: true, piles: [], zones: [] });
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
    name: 'Alice',
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
  const cardId = handOf(state, 'p1')[0].id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  assert.equal(handOf(state, 'p1').length, 2);
  assert.equal(tableOf(state).cards.length, 1);
  assert.equal(tableOf(state).cards[0].id, cardId);
  assert.ok(handOf(state, 'p1').every((c) => c.id !== cardId));
});

test('PLAY: throws if the card is not in that player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  assert.throws(() => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'not-a-real-id' }));
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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });
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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, true);
});

// *nit (direct user request, D84: "remove card redaction entirely...
// TOTAL PERMISSIVE"): `faceUp`/`owner` are still real GAME-STATE fields
// (PLAY's own visibility choice still sets them correctly) - what's
// gone is `viewFor` ever withholding rank/suit based on them. Every
// viewer now sees the real card regardless.
test('PLAY: shared-facedown sets owner:null, faceUp:false as game state - but the card is still fully visible to every viewer now', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, false);
  const p1Table = tableViewOf(viewFor(state, 'p1'));
  const p2Table = tableViewOf(viewFor(state, 'p2'));
  assert.equal(p1Table.cards[0].id, cardId);
  assert.ok('rank' in p1Table.cards[0], 'no redaction left - everyone sees it, played-by included');
  assert.ok('rank' in p2Table.cards[0], 'and every other viewer too');
});

test('PLAY: private-facedown sets owner/faceUp as game state - but is fully visible to every viewer now, not just its owner', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.equal(tableOf(state).cards[0].owner, 'p1');
  assert.equal(tableOf(state).cards[0].faceUp, false);

  const ownerTable = tableViewOf(viewFor(state, 'p1'));
  const otherTable = tableViewOf(viewFor(state, 'p2'));
  assert.equal(ownerTable.cards[0].id, cardId);
  assert.ok('rank' in ownerTable.cards[0], 'owner sees their own private middle card, same as ever');
  assert.equal(otherTable.cards[0].id, cardId);
  assert.ok('rank' in otherTable.cards[0], 'a non-owner sees it too now - no redaction left');
});

test('REVEAL: any player can reveal a shared face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });

  assert.equal(tableOf(state).cards[0].faceUp, true);
  const anyTable = tableViewOf(viewFor(state, 'p2'));
  assert.ok('rank' in anyTable.cards[0]);
});

// *nit (direct user request, D83, "fully permissive drag and drop...
// remove the older restrictions from ALL pile and zone types"): anyone
// can now reveal a private face-down card, not just its owner.
test('REVEAL: anyone can reveal a private face-down card now, not just its owner', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(tableOf(revealed).cards[0].faceUp, true);
});

test('REVEAL: revealing an already-face-up card is a no-op, not an error', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const result = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(tableOf(result).cards[0].faceUp, true);
});

// --- D48/D40 (Sprint 18): Card.orientation as replicated state ---

test('ROTATE_CARD: toggles a face-up card between portrait (default/absent) and landscape', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });
  assert.equal(tableOf(state).cards[0].orientation, undefined, 'a newly played card has no orientation set - implies portrait');

  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(tableOf(state).cards[0].orientation, 'landscape');

  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(tableOf(state).cards[0].orientation, 'portrait');
});

test('ROTATE_CARD: follows move\'s authorization rule, not reveal\'s - a shared face-down card may be rotated by anyone', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape', 'unowned face-down cards are rotatable by anyone, per US-19');
});

// *nit (direct user request, D83): a non-owner can now rotate someone
// else's still-hidden private card too - no ownership gate is left.
test('ROTATE_CARD: a non-owner CAN rotate someone else\'s still-hidden private card now', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape');
});

// *nit (direct user request, D84): redaction is gone entirely now, so
// "orientation survives redaction" is moot - orientation, and
// everything else, is visible to every viewer.
test('ROTATE_CARD: orientation (and everything else - no redaction left) is visible to every viewer', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });
  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });

  const seenCard = tableViewOf(viewFor(state, 'p2')).cards[0];
  assert.equal(seenCard.id, cardId, 'no redaction left');
  assert.equal(seenCard.orientation, 'landscape');
});

test('PICKUP: moves a face-up middle card into the picking player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const p2HandSizeBefore = handOf(state, 'p2').length;
  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });

  assert.equal(tableOf(state).cards.length, 0);
  assert.equal(handOf(state, 'p2').length, p2HandSizeBefore + 1);
  assert.ok(handOf(state, 'p2').some((c) => c.id === cardId));
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
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  const picked = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.ok(handOf(picked, 'p2').some((c) => c.id === cardId));
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
test('Discard pile end-to-end: PLAY into it, then MOVE_CARD/PICKUP out both work - full access, for real, through the whole reducer', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const discardId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: discardId, visibility: 'public' });
  const discardPile = pilesOf(state).find((z) => z.id === discardId);
  assert.equal(discardPile.cards.length, 1);
  assert.equal(discardPile.cards[0].id, cardId);

  const moved = reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toPileId: 'table' });
  assert.equal(tableOf(moved).cards.some((c) => c.id === cardId), true);

  const picked = reduce(state, { type: 'PICKUP', playerId: 'p1', cardId });
  assert.ok(handOf(picked, 'p1').some((c) => c.id === cardId));
});

test('Discard pile: a SECOND card played onto it lands on TOP (index 0), matching a physical discard pile', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [firstCardId, secondCardId] = handOf(state, 'p1').map((c) => c.id);
  const discardId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: firstCardId, pileId: discardId });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: secondCardId, pileId: discardId });

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
  const cardId = handOf(state, 'p1')[0].id;
  const discardZoneId = pilesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: discardZoneId });

  assert.equal(tableOf(state).cards.length, 0, 'default zone untouched');
  const discardZone = pilesOf(state).find((z) => z.id === discardZoneId);
  assert.equal(discardZone.cards.length, 1);
  assert.equal(discardZone.cards[0].id, cardId);
});

test('PLAY: throws for a pileId that does not exist', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  assert.throws(() => reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: 'no-such-zone' }));
});

// UX follow-up (real bug, found live): dragging a hand card onto its OWN
// hand (a reorder) is the only way `main.js`'s `dropCardOnZone` can ever
// dispatch it - `HandPile.cardActions` (`HandPile.js`) never offers
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
    type: 'PLAY', playerId: 'p1', cardId: first.id, pileId: handZoneId, targetCardId: second.id, side: 'after',
  });

  const hand = handOf(state, 'p1');
  assert.equal(hand.length, 2, 'still in hand, not moved to the table');
  assert.deepEqual(hand.map((c) => c.id), [second.id, first.id], 'reordered after the target card');
  assert.deepEqual(hand.find((c) => c.id === first.id), first, 'no owner/faceUp stamped on - untouched');
});

test('REVEAL and PICKUP: find a card in any zone, not just the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const discardZoneId = pilesOf(state).find((z) => z.name === 'Discard').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    pileId: discardZoneId,
    visibility: 'shared-facedown',
  });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(pilesOf(state).find((z) => z.id === discardZoneId).cards[0].faceUp, true);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.equal(pilesOf(state).find((z) => z.id === discardZoneId).cards.length, 0);
  assert.ok(handOf(state, 'p2').some((c) => c.id === cardId));
});

test('MOVE_CARD: relocates a visible card between zones, preserving its owner/faceUp', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId }); // public, default zone

  state = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toPileId: meldsZoneId });

  assert.equal(tableOf(state).cards.length, 0);
  const meldsZone = pilesOf(state).find((z) => z.id === meldsZoneId);
  assert.equal(meldsZone.cards.length, 1);
  assert.equal(meldsZone.cards[0].id, cardId);
  assert.equal(meldsZone.cards[0].faceUp, true, 'moving does not reveal/hide - it was already public');
});

// *nit (direct user request, D83, "fully permissive drag and drop...
// no matter what"): a non-owner can now move someone else's still-
// hidden private card too - no ownership gate is left in canRemoveCard.
test('MOVE_CARD: a non-owner CAN move someone else\'s still-hidden private card now', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  const moved = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toPileId: meldsZoneId });
  assert.equal(pilesOf(moved).find((z) => z.id === meldsZoneId).cards[0].id, cardId);
});

// *nit (real bug, found live): a card grabbed straight out of another
// player's hand via plain MOVE_CARD used to keep its OLD owner/faceUp,
// landing in the new hand pile but redacted as if it still belonged to
// whoever it was taken from - invisible even to the player who just
// took it. `transferCard` now applies `toHandCard` generically to ANY
// transfer landing in a hand, not just the actions that remembered to.
test('MOVE_CARD: a card taken from another player\'s hand is correctly re-owned by its new hand, not left as a ghost of the old owner', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 5 });
  const cardId = handOf(state, 'p1')[0].id;

  const stolen = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toPileId: 'hand:p2' });

  const card = handOf(stolen, 'p2').find((c) => c.id === cardId);
  assert.equal(card.owner, 'p2', 'now owned by the player whose hand it landed in');
  assert.equal(card.faceUp, false);
  const view = viewFor(stolen, 'p2');
  const inView = view.piles.find((z) => z.id === 'hand:p2').cards.find((c) => c.id === cardId);
  assert.deepEqual(inView, card, 'the new owner can actually see the card they just took');
});

test('MOVE_CARD: throws for an unknown destination zone or an unknown card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toPileId: 'no-such-zone' }),
  );
  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'no-such-card', toPileId: tableOf(state).id }),
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
    piles: [{ kind: 'foundation', ownerId: null, count: 4 }, { kind: 'cascade', ownerId: null, count: 7 }],
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
    piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }],
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
    piles: [{ kind: 'rankAdjacent', ownerId: null, count: 2 }, { kind: 'cascade', ownerId: 'perPlayer', count: 1 }],
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
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = pilesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    pileId: meldsZoneId,
    visibility: 'private-facedown',
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
    name: 'Alice',
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

  const cardId = handOf(state, 'solo')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'solo', cardId });
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
    piles: state.piles.map((p) => (p.id === `hand:${playerId}` ? { ...p, cards: [...p.cards, card] } : p)),
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
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'six-hearts', pileId: foundationId, visibility: 'public' }),
    /cannot accept/,
  );

  state = withCardInHand(state, 'p1', { id: 'ace-hearts', rank: 'A', suit: 'hearts' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'ace-hearts', pileId: foundationId, visibility: 'public' });
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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'ace-hearts', pileId: foundationId, visibility: 'public' });

  const moved = reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'ace-hearts', toPileId: 'table' });
  assert.equal(tableOf(moved).cards.some((c) => c.id === 'ace-hearts'), true);
});

test('Cascade end-to-end: same-color/skipped-rank is rejected, opposite-color rank-1 is accepted and carries layout: overlap', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Tableau 1', kind: 'cascade' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 0 });
  const cascadeId = pilesOf(state).find((z) => z.name === 'Tableau 1').id;

  state = withCardInHand(state, 'p1', { id: 'eight-clubs', rank: '8', suit: 'clubs' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'eight-clubs', pileId: cascadeId, visibility: 'public' });

  state = withCardInHand(state, 'p1', { id: 'seven-spades', rank: '7', suit: 'spades' });
  assert.throws(
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-spades', pileId: cascadeId, visibility: 'public' }),
    /cannot accept/,
    'same color (both black) - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'seven-hearts', rank: '7', suit: 'hearts' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-hearts', pileId: cascadeId, visibility: 'public' });
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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-clubs', pileId: centerId, visibility: 'public' });

  state = withCardInHand(state, 'p1', { id: 'nine-hearts', rank: '9', suit: 'hearts' });
  assert.throws(
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'nine-hearts', pileId: centerId, visibility: 'public' }),
    /cannot accept/,
    'two ranks away - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'eight-spades', rank: '8', suit: 'spades' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'eight-spades', pileId: centerId, visibility: 'public' });
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
  for (const cardId of ids) state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });
  return { state, ids };
}

const tableCards = (state) => pilesOf(state).find((z) => z.id === 'table').cards;
const tableIds = (state) => tableCards(state).map((c) => c.id);
const layoutOf = (state, cardId) => tableCards(state).find((c) => c.id === cardId)?.layout;

test('PLAY/MOVE_CARD with no target still appends, with no layout (D21 back-compat)', () => {
  const { state, ids } = threeCardsOnTable();
  assert.deepEqual(tableIds(state), ids, 'plain PLAY appends in order, exactly as pre-D21');
  assert.equal(layoutOf(state, ids[0]), undefined, 'a plainly-played card carries no layout key');
});

test('MOVE_CARD side:after inserts directly after the target and stacks the DROPPED card', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  // Drop C onto A's body -> C stacks on A, landing between A and B.
  const next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack',
  });
  assert.deepEqual(tableIds(next), [a, c, b], 'C is reinserted immediately after A');
  assert.equal(layoutOf(next, c), 'stack', 'the dropped card carries the layout');
  assert.equal(layoutOf(next, a), undefined, 'the target keeps its own (unchanged) relationship');
});

test('MOVE_CARD side:before puts the layout on the TARGET, not the dropped card (Smith Gate 2)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  // Drop C in the halo BEFORE B -> order becomes A, C, B and the newly
  // adjacent pair is (C, B), so it is B that now sits second.
  const next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table',
    targetCardId: b, side: 'before', layout: 'overlap',
  });
  assert.deepEqual(tableIds(next), [a, c, b], 'C is reinserted immediately before B');
  assert.equal(
    layoutOf(next, b), 'overlap',
    'the TARGET carries the layout on a before-side drop - putting it on the dropped card would visually overlap the wrong pair',
  );
  assert.equal(layoutOf(next, c), undefined, 'the dropped card does not carry it');
});

test('MOVE_CARD: a same-zone move actually reorders (D21 removes the old no-op)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  const next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: a, toPileId: 'table',
    targetCardId: c, side: 'after',
  });
  assert.deepEqual(tableIds(next), [b, c, a], 'A moved to the end of its own zone');
  assert.notDeepEqual(tableIds(next), ids, 'pre-D21 this returned state unchanged');
});

test('MOVE_CARD to empty zone space clears a previously-set layout (US-32/33 un-stack)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, , c] = ids;
  let next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack',
  });
  assert.equal(layoutOf(next, c), 'stack');

  next = reduce(next, { type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table' });
  assert.equal(layoutOf(next, c), undefined, 'dragging back out to open space returns it to flat spacing');
});

test('PLAY straight from hand can stack onto a card already on the table', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [first, second] = handOf(state, 'p1').map((c) => c.id);
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: first });
  state = reduce(state, {
    type: 'PLAY', playerId: 'p1', cardId: second,
    targetCardId: first, side: 'after', layout: 'overlap',
  });
  assert.deepEqual(tableIds(state), [first, second]);
  assert.equal(layoutOf(state, second), 'overlap');
});

test('PICKUP strips layout, so a stacked card does not carry it back into a hand', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, , c] = ids;
  let next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table',
    targetCardId: a, side: 'after', layout: 'stack',
  });
  next = reduce(next, { type: 'PICKUP', playerId: 'p2', cardId: c });
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
test('MOVE_CARD: a non-owner moving someone else\'s still-hidden card still gets real placement applied (D21)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  const [hidden, visible] = handOf(state, 'p1').map((c) => c.id);
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: visible });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: hidden, visibility: 'private-facedown' });

  const moved = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p2', cardId: hidden, toPileId: 'table',
    targetCardId: visible, side: 'after', layout: 'stack',
  });
  assert.deepEqual(tableOf(moved).cards.map((c) => c.id), [visible, hidden]);
  assert.equal(tableOf(moved).cards[1].layout, 'stack');
});

test('MOVE_CARD: throws for a target card that is not in the destination zone', () => {
  const { state, ids } = threeCardsOnTable();
  assert.throws(() =>
    reduce(state, {
      type: 'MOVE_CARD', playerId: 'p1', cardId: ids[0], toPileId: 'table',
      targetCardId: 'no-such-card', side: 'after', layout: 'stack',
    }),
  );
});

test('removing a card from mid-stack leaves the rest stacked, it does not flatten them', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  let next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: b, toPileId: 'table', targetCardId: a, side: 'after', layout: 'stack',
  });
  next = reduce(next, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toPileId: 'table', targetCardId: b, side: 'after', layout: 'stack',
  });
  assert.deepEqual(tableIds(next), [a, b, c]);

  next = reduce(next, { type: 'PICKUP', playerId: 'p2', cardId: b });
  assert.equal(
    layoutOf(next, c), 'stack',
    'pulling one card out of a pile must not silently flatten the cards above it - C now stacks onto A',
  );
});

// --- Deck operations (D22, US-35/US-36) ---

test('SHUFFLE_DECK reorders the deck without touching anything else', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });
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
  const cardId = pile.cards[0].id;

  // Face-down but unowned == "put or take is open to all" (US-19), so any
  // player may reveal it, exactly as with any shared face-down card.
  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(pilesOf(revealed).find((z) => z.name === 'Deck 2').cards[0].faceUp, true);
  const picked = reduce(revealed, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.ok(handOf(picked, 'p2').some((c) => c.id === cardId), 'and can then be picked up');
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
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'table-zone' }],
  });
  const discard = pilesOf(state).find((z) => z.kind === 'discard');
  assert.equal(discard.zoneId, 'table-zone');
  assert.equal(state.zones.length, 1, 'no new zone record needed - table-zone already exists');
});

test('GameConfig.zones: a Zone is a real entity - {id, name, type} - declared alongside GameConfig.piles (D55)', () => {
  const state = createInitialState({}, () => 0.5, {
    zones: [{ id: 'discard-zone', name: 'Discard Area', type: 'shared' }],
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'discard-zone' }],
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
      piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'typo-zone' }],
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

test('MOVE_PILE: rejects hand/foundation/cascade/rankAdjacent - only zone/discard/deck piles are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  assert.throws(() => reduce(state, { type: 'MOVE_PILE', pileId: 'hand:p1', targetZoneId: 'table-zone' }), /Cannot move/);

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
    ],
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

test('CREATE_PILE: with a cardId, atomically moves that card out of its source pile into the new one', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;

  state = reduce(state, {
    type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: 'hand:p1', cardId, playerId: 'p1',
  });

  assert.equal(handOf(state, 'p1').length, 0, 'removed from the source pile');
  const created = pilesOf(state).find((z) => z.zoneId === 'table-zone' && z.cards.some((c) => c.id === cardId));
  assert.ok(created, 'landed in a real new pile grouped into the target zone');
  assert.equal(created.cards.length, 1);
});

// *nit (direct user request, D83, "fully permissive drag and drop"): a
// non-owner can now move someone else's still-hidden private card into
// a new pile too, same as MOVE_CARD - CREATE_PILE reuses the same
// authorization (`transferCard`), which no longer gates on ownership.
test('CREATE_PILE: the same authorization as MOVE_CARD - a non-owner CAN move someone else\'s still-hidden private card into a new pile now', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });
  const table = tableOf(state);

  const next = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: table.id, cardId, playerId: 'p2' });
  const newPile = next.piles.find((p) => p.cards.some((c) => c.id === cardId));
  assert.ok(newPile);
});

// --- REORDER_PILE (direct user request: "Panels can be moved from
// zone to zone [MOVE_PILE] and relocated within their zone
// [ordering]") - purely cosmetic (no game-state/privacy implication),
// open to any player like RENAME_PILE/RENAME_ZONE, not gated by
// `reparentable` (unlike a cross-zone move, staying inside the SAME
// zone is never a game-rule concern for any kind).

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
    const cardId = handOf(state, playerId)[0].id;
    state = reduce(state, { type: 'PLAY', playerId, cardId, pileId, visibility: 'public' });
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
// "cardActions are the more general case" - `splitPileAt` now reuses
// `canRemoveCard(pile, card, playerId, 'move')` directly, so eligibility
// falls out of the SAME rule drag-and-drop already uses everywhere. A
// hand is the one real structural exception left: `HandPile.cardActions`
// only ever offers `'play'`, never `'move'` - not a special split-only
// rule, the same reason a hand card is never a generic MOVE_CARD target
// either. A Foundation is NOT excluded any more (see the next test) -
// `MeldPile` no longer overrides `cardActions` at all, per
// `docs/ARCHITECTURE.md`'s "Core invariant".
test('SPLIT_PILE: a hand is still ineligible - its cards structurally never offer \'move\', the same reason as everywhere else', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 2 });
  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: 'hand:p1', index: 1, playerId: 'p1' }), /not authorized/);
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
      : p)),
  };
  const next = reduce(state, { type: 'SPLIT_PILE', pileId: cascade.id, index: 1, playerId: 'p1' });
  const created = pilesOf(next).find((z) => z.kind === 'cascade' && z.id !== cascade.id);
  assert.ok(created, 'a new cascade sibling exists - no kind allowlist blocked it');
  assert.deepEqual(created.cards.map((c) => c.id), ['b']);
});

test('SPLIT_PILE: fully permissive - a personal pile can be split by ANY player, not just its owner (Core invariant)', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }],
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
      : p)),
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
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: pool.id, visibility: 'private-facedown' });

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
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isShared: true }), ['take', 'split', 'changePileType', 'remove']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isOwner: true }), ['take', 'split', 'changePileType', 'remove']);
  assert.deepEqual(new PILE_TYPES.plain({}).pileActions({ isOwner: false, isShared: false }), []);
  assert.deepEqual(new PILE_TYPES.discard({}).pileActions({ isShared: true }), ['take', 'split', 'changePileType', 'remove']);
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
    piles: [{ kind: 'plain', ownerId: 'perPlayer', count: 1 }],
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
// no ownership/host check, matching MOVE_CARD's "open unless
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
  state = reduce(state, { type: 'PICKUP', playerId: 'p1', cardId: 'x' });
  assert.equal(handOf(state, 'p1').length, 2);

  // PLAY (leaving the hand) reads it as the source pile too.
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: table.id });
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
      piles: [{ kind, ownerId: null, count: 1 }],
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
  assert.doesNotThrow(() => assertCardsConserved(before, after, 'MOVE_CARD'));
});

test('assertCardsConserved: throws when a card vanishes', () => {
  const before = { piles: [pileOf([{ id: 'a' }, { id: 'b' }])] };
  const after = { piles: [pileOf([{ id: 'a' }])] };
  assert.throws(
    () => assertCardsConserved(before, after, 'MOVE_CARD'),
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
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, pileId: 'table' });
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
