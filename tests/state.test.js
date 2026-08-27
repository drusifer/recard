import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor, deckOf, handOf, handsOf, zonesOf, pileVisibility } from '../src/state.js';
import { PILE_TYPES } from '../src/piles/pileTypes.js';

function withPlayers(state, ids) {
  return ids.reduce(
    (s, id) => reduce(s, { type: 'JOIN', playerId: id, name: id }),
    state,
  );
}

// UX follow-up: deckPile.tableSide is true now, so zonesOf() (every
// table-side pile) includes the original deck pile too, ahead of
// 'table' in creation order. These two helpers keep the below tests
// reading "the default Table zone" / "every zone a viewer actually
// sees a card list for", matching pre-follow-up behavior, rather than
// silently drifting to mean "whatever's first in the array".
function tableOf(state) {
  return zonesOf(state).find((z) => z.id === 'table');
}
function visibleZonesOf(state) {
  return zonesOf(state).filter((z) => z.id !== 'deck');
}
// UX follow-up (direct user request): "a Deck is a specific kind of
// Pile" - the deck is ALSO a real pile in `view.zones` now (dual-routed
// the same way the hand pile already was, alongside `deckCount`), so
// `view.zones[0]` is no longer reliably the Table zone. Same "look it
// up by id" fix as `tableOf(state)` above, for view-shaped zones.
function tableViewOf(view) {
  return view.zones.find((z) => z.id === 'table');
}

test('createInitialState: empty roster, full shuffled deck, one empty default zone', () => {
  const state = createInitialState({ numDecks: 1, jokers: 0 }, () => 0.5);
  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(state.players, []);
  assert.equal(zonesOf(state).length, 2, 'the deck (UX follow-up: now tableSide too) + the default Table zone');
  assert.deepEqual(tableOf(state).cards, []);
});

// --- D46: GameConfig's first real field ---

test('createInitialState: gameConfig.allowsPlayerZones defaults true - matches every prior sprint\'s behavior exactly', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: true, piles: [], zones: [] });
});

test('createInitialState: allowsPlayerZones can be set false via the third param', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: false, piles: [], zones: [] });
});

test('CREATE_ZONE: rejected when the game disallows player zones', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x' }), /does not allow/);
});

test('CREATE_ZONE: allowsPlayerZones does not affect JOIN or SPLIT_DECK\'s piles - only this action is gated', () => {
  // UX follow-up (direct user request): JOIN no longer auto-creates a
  // personal zone - a player's seat is their hand pile now, created
  // lazily on first deal/draw/pickup, not eagerly at JOIN.
  let state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'p1' });
  assert.equal(zonesOf(state).length, 2, 'deck + default table only, JOIN added nothing that went through CREATE_ZONE');
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 2 });
  assert.equal(zonesOf(state).length, 4, 'deck + default + 2 split piles - also unaffected');
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });

  assert.equal(handOf(state, 'p1').length, 5);
  assert.equal(handOf(state, 'p2').length, 5);
  assert.equal(handOf(state, 'p3').length, 5);
  assert.equal(deckOf(state).length, 52 - 15);
});

test('PLAY: moves a card from a hand to the table', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  assert.throws(() => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'not-a-real-id' }));
});

test('DRAW: moves the top of the deck into the drawing player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  const deckSizeBefore = deckOf(state).length;
  const topCard = deckOf(state)[0];

  state = reduce(state, { type: 'DRAW', playerId: 'p1' });

  assert.equal(deckOf(state).length, deckSizeBefore - 1);
  assert.equal(handOf(state, 'p1').length, 1);
  assert.equal(handOf(state, 'p1')[0].id, topCard.id);
});

test('DRAW: throws when the deck is empty', () => {
  let state = createInitialState({ numDecks: 1 }, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 52 });
  assert.throws(() => reduce(state, { type: 'DRAW', playerId: 'p1' }));
});

test('RESET: reshuffles the deck and clears hands/zone cards, keeps zone structure, drops hand piles', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  // UX follow-up (direct user request): `zonesOf` now ALSO matches hand
  // piles (`handPile.tableSide: true`) - excluded here since a hand
  // pile is exactly what RESET is supposed to drop, not preserve; the
  // structure that's actually meant to survive is deck + default +
  // player-created zones only.
  const structuralZoneCountBeforeReset = zonesOf(state).filter((z) => z.kind !== 'hand').length; // deck + default + Discard

  state = reduce(state, { type: 'RESET' });

  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(handsOf(state), {}, 'hand piles are dropped outright, not just emptied');
  assert.equal(
    zonesOf(state).length,
    structuralZoneCountBeforeReset,
    'table-side zone structure survives a reset; hand piles do not',
  );
  assert.ok(visibleZonesOf(state).every((z) => z.cards.length === 0), 'every zone\'s cards clear on reset');
  assert.equal(state.players.length, 2);
});

test('viewFor: owner sees full hand, other players see only a count', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 4 });

  const ownerView = viewFor(state, 'p1');
  const otherView = viewFor(state, 'p2');

  assert.equal(ownerView.myHand.length, 4);
  assert.equal(otherView.otherHandCounts.p1, 4);
  assert.equal(otherView.myHand.length, 4);
  assert.ok(
    !JSON.stringify(otherView.myHand).includes(handOf(state, 'p1')[0].rank),
    'a player\'s OWN hand field must never contain another player\'s card data',
  );
  // *nit (2026-08-26), real privacy fix: `otherView.zones` also carries
  // every OTHER player's hand pile now (so it can render at their seat)
  // - `HandPile.redactCard` must actually strip rank/suit there too,
  // not just in the older `myHand`/`otherHandCounts` fields above.
  const p1HandView = otherView.zones.find((z) => z.kind === 'hand' && z.ownerId === 'p1');
  assert.ok(p1HandView, 'p1\'s hand pile must still appear in p2\'s view.zones (rendered, just redacted)');
  assert.equal(p1HandView.cards.length, 4, 'card COUNT stays visible - only identity is hidden');
  assert.ok(
    p1HandView.cards.every((c) => !('rank' in c) && !('suit' in c)),
    'every card in another player\'s hand-in-zones view must be identity-redacted',
  );
  const myHandView = ownerView.zones.find((z) => z.kind === 'hand' && z.ownerId === 'p1');
  assert.deepEqual(myHandView.cards, ownerView.myHand, 'the owner\'s own hand-in-zones view is unredacted, same cards as myHand');
});

test('viewFor: deck is exposed only as a count, table is fully public', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

  const view = viewFor(state, 'p1');
  assert.equal(typeof view.deckCount, 'number');
  assert.equal(view.deckCount, deckOf(state).length);
  const tableView = tableViewOf(view);
  assert.equal(tableView.cards.length, 1);
  assert.equal(tableView.cards[0].id, tableOf(state).cards[0].id);
});

// --- Middle-zone visibility (D7/D8, US-12/13/14) ---

test('PLAY: defaults to public visibility (owner null, faceUp true) — regression', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, true);
});

test('PLAY: shared-facedown has no owner and is hidden from everyone, including the player', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.equal(tableOf(state).cards[0].owner, null);
  assert.equal(tableOf(state).cards[0].faceUp, false);
  const p1View = viewFor(state, 'p1');
  const p2View = viewFor(state, 'p2');
  const p1Table = tableViewOf(p1View);
  const p2Table = tableViewOf(p2View);
  assert.equal(p1Table.cards[0].faceDown, true);
  assert.equal(p1Table.cards[0].owner, null);
  assert.ok(!('rank' in p1Table.cards[0]), 'even the player who played it cannot see a shared face-down card');
  assert.ok(!('rank' in p2Table.cards[0]));
});

test('PLAY: private-facedown is owned by the player and visible only to them', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.equal(tableOf(state).cards[0].owner, 'p1');
  assert.equal(tableOf(state).cards[0].faceUp, false);

  const ownerTable = tableViewOf(viewFor(state, 'p1'));
  const otherTable = tableViewOf(viewFor(state, 'p2'));
  assert.equal(ownerTable.cards[0].id, cardId);
  assert.ok('rank' in ownerTable.cards[0], 'owner can see their own private middle card');
  assert.equal(otherTable.cards[0].faceDown, true);
  assert.equal(otherTable.cards[0].owner, 'p1', 'ownership stays visible even when face-down');
  assert.ok(!('rank' in otherTable.cards[0]), 'non-owner cannot see a private middle card');
});

test('REVEAL: any player can reveal a shared face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });

  assert.equal(tableOf(state).cards[0].faceUp, true);
  const anyTable = tableViewOf(viewFor(state, 'p2'));
  assert.ok('rank' in anyTable.cards[0]);
});

test('REVEAL: only the owner can reveal a private face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }));

  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(tableOf(revealed).cards[0].faceUp, true);
});

test('REVEAL: revealing an already-face-up card is a no-op, not an error', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const result = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(tableOf(result).cards[0].faceUp, true);
});

// --- D48/D40 (Sprint 18): Card.orientation as replicated state ---

test('ROTATE_CARD: toggles a face-up card between portrait (default/absent) and landscape', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape', 'unowned face-down cards are rotatable by anyone, per US-19');
});

test('ROTATE_CARD: a non-owner cannot rotate someone else\'s still-hidden private card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId }), /not authorized/);
  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(tableOf(rotated).cards[0].orientation, 'landscape', 'but the owner can rotate their own');
});

test('ROTATE_CARD: orientation survives redaction, exactly like layout - arrangement, not identity', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });
  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });

  const redactedCard = tableViewOf(viewFor(state, 'p2')).cards[0];
  assert.equal(redactedCard.faceDown, true, 'still redacted - identity is not leaked');
  assert.equal(redactedCard.orientation, 'landscape', 'but orientation is visible to everyone, same as layout');
});

test('PICKUP: moves a face-up middle card into the picking player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const p2HandSizeBefore = handOf(state, 'p2').length;
  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });

  assert.equal(tableOf(state).cards.length, 0);
  assert.equal(handOf(state, 'p2').length, p2HandSizeBefore + 1);
  assert.ok(handOf(state, 'p2').some((c) => c.id === cardId));
});

test('PICKUP: throws when the card is face-down', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.throws(() => reduce(state, { type: 'PICKUP', playerId: 'p2', cardId }));
});

// --- Named zones (D12, US-19) ---

test('CREATE_ZONE: adds a new empty zone by name, alongside the default', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard' });
  assert.equal(zonesOf(state).length, 3, 'deck + default table + the new zone');
  const created = zonesOf(state).find((z) => z.name === 'Discard');
  assert.deepEqual(created.cards, []);
  assert.notEqual(created.id, tableOf(state).id);
});

// --- D45 (Sprint 15): CREATE_ZONE's `kind` param, and a real Discard
// pile exercised end-to-end through the reducer (not just its own
// module's unit tests in tests/piles.test.js).

test('CREATE_ZONE: kind defaults to "zone" - every pre-D45 caller (and every test above/below) is unaffected', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Table 2' });
  assert.equal(state.piles.find((p) => p.name === 'Table 2').kind, 'zone');
});

test('CREATE_ZONE: kind: "discard" creates a real Discard pile, findable via zonesOf', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const pile = zonesOf(state).find((p) => p.name === 'Discard');
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
  const created = zonesOf(next).find((z) => z.name === 'Second Deck');
  assert.equal(created.kind, 'deck');
});

test('CREATE_ZONE: rejects an unknown kind', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x', kind: 'nonsense' }));
});

test('Discard pile end-to-end: PLAY into it, then MOVE_CARD out is rejected - drop-only, for real, through the whole reducer', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const discardId = zonesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: discardId, visibility: 'public' });
  const discardPile = zonesOf(state).find((z) => z.id === discardId);
  assert.equal(discardPile.cards.length, 1);
  assert.equal(discardPile.cards[0].id, cardId);

  // Drop-only: nothing may move a card back out of a discard pile.
  assert.throws(
    () => reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toZoneId: 'table' }),
    /not authorized/,
  );
  assert.throws(
    () => reduce(state, { type: 'PICKUP', playerId: 'p1', cardId }),
    /not authorized/,
  );
});

test('Discard pile: a SECOND card played onto it lands on TOP (index 0), matching a physical discard pile', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  const [firstCardId, secondCardId] = handOf(state, 'p1').map((c) => c.id);
  const discardId = zonesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: firstCardId, zoneId: discardId });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: secondCardId, zoneId: discardId });

  const cards = zonesOf(state).find((z) => z.id === discardId).cards;
  assert.deepEqual(cards.map((c) => c.id), [secondCardId, firstCardId]);
});

test('viewFor: a "mixed"-visibility zone entry now carries its kind (D45), so ui.js can pick FAN vs. STACK drop behavior', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const view = viewFor(state, 'anyone');
  assert.equal(view.zones.find((z) => z.name === 'Table').kind, 'zone');
  assert.equal(view.zones.find((z) => z.name === 'Discard').kind, 'discard');
});

test('PLAY: with zoneId targets that zone instead of the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const discardZoneId = zonesOf(state).find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: discardZoneId });

  assert.equal(tableOf(state).cards.length, 0, 'default zone untouched');
  const discardZone = zonesOf(state).find((z) => z.id === discardZoneId);
  assert.equal(discardZone.cards.length, 1);
  assert.equal(discardZone.cards[0].id, cardId);
});

test('PLAY: throws for a zoneId that does not exist', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  assert.throws(() => reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: 'no-such-zone' }));
});

test('REVEAL and PICKUP: find a card in any zone, not just the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const discardZoneId = zonesOf(state).find((z) => z.name === 'Discard').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: discardZoneId,
    visibility: 'shared-facedown',
  });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(zonesOf(state).find((z) => z.id === discardZoneId).cards[0].faceUp, true);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.equal(zonesOf(state).find((z) => z.id === discardZoneId).cards.length, 0);
  assert.ok(handOf(state, 'p2').some((c) => c.id === cardId));
});

test('MOVE_CARD: relocates a visible card between zones, preserving its owner/faceUp', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = zonesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId }); // public, default zone

  state = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: meldsZoneId });

  assert.equal(tableOf(state).cards.length, 0);
  const meldsZone = zonesOf(state).find((z) => z.id === meldsZoneId);
  assert.equal(meldsZone.cards.length, 1);
  assert.equal(meldsZone.cards[0].id, cardId);
  assert.equal(meldsZone.cards[0].faceUp, true, 'moving does not reveal/hide - it was already public');
});

test('MOVE_CARD: only the owner can move their own still-hidden private card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = zonesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: meldsZoneId }));

  const moved = reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toZoneId: meldsZoneId });
  assert.equal(zonesOf(moved).find((z) => z.id === meldsZoneId).cards[0].id, cardId);
});

test('MOVE_CARD: throws for an unknown destination zone or an unknown card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toZoneId: 'no-such-zone' }),
  );
  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'no-such-card', toZoneId: tableOf(state).id }),
  );
});

// --- Personal per-seat zones (D17, US-27) ---

// UX follow-up (direct user request): the D17 auto-created personal zone
// is retired - "get rid of seat panel and replace with a reg zone with a
// handpile." JOIN adds nothing to `zonesOf` by itself any more; a
// player's seat is their hand pile, created lazily on first deal/draw/
// pickup (`ensureHandPile`), covered by the DEAL/DRAW/PICKUP tests
// elsewhere in this file.
test('JOIN: adds nothing to zonesOf by itself - no personal zone any more', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  assert.equal(zonesOf(state).length, 2, 'just deck + default table');
});

test('JOIN: re-joining with the same playerId does not duplicate the player entry or reset scores/passed', () => {
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
  assert.equal(zonesOf(state).length, 2, 'just the deck + the default table, nothing extra built');
});

test('createInitialState: shared (ownerId: null) configured zones build immediately, before any player joins', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'foundation', ownerId: null, count: 4 }, { kind: 'cascade', ownerId: null, count: 7 }],
  });
  assert.equal(zonesOf(state).filter((z) => z.kind === 'foundation').length, 4);
  assert.equal(zonesOf(state).filter((z) => z.kind === 'cascade').length, 7);
  assert.equal(zonesOf(state).length, 1 + 1 + 4 + 7, 'deck + default table + 4 foundations + 7 cascades');
});

test('createInitialState: a configured zone is capitalized and only numbered when there is more than one', () => {
  const single = createInitialState({}, () => 0.5, { piles: [{ kind: 'discard', ownerId: null, count: 1 }] });
  assert.equal(zonesOf(single).find((z) => z.kind === 'discard').name, 'Discard', 'not "Discard 1"');

  const many = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: null, count: 3 }] });
  assert.deepEqual(
    zonesOf(many).filter((z) => z.kind === 'cascade').map((z) => z.name),
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
  assert.equal(zonesOf(state).find((z) => z.kind === 'discard').id, 'discard');
});

test('createInitialState: a configured zone\'s id is deterministic AND stable across separate calls with the same preset', () => {
  const pileDeclarations = [{ kind: 'foundation', ownerId: null, count: 4 }, { kind: 'cascade', ownerId: null, count: 7 }];
  const first = createInitialState({}, () => 0.5, { piles: pileDeclarations });
  const second = createInitialState({}, () => 0.5, { piles: pileDeclarations });
  const idsOf = (state) => zonesOf(state).filter((z) => z.kind === 'foundation' || z.kind === 'cascade')
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
  assert.equal(zonesOf(state).filter((z) => z.kind === 'cascade').length, 0);
});

test('JOIN: a \'perPlayer\' configured zone also gets a deterministic id (kind + playerId), not a random UUID', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const ownPile = zonesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === 'p1');
  assert.equal(ownPile.id, 'cascade-p1', 'same playerId, same preset -> same zone id every game, so a saved panel layout still applies');
});

test('JOIN: a \'perPlayer\' configured zone builds one pile per player, alongside their personal zone', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'rankAdjacent', ownerId: null, count: 2 }, { kind: 'cascade', ownerId: 'perPlayer', count: 1 }],
  });
  state = withPlayers(state, ['p1', 'p2']);

  for (const id of ['p1', 'p2']) {
    const ownPile = zonesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === id);
    assert.ok(ownPile, `${id} has their own configured cascade pile`);
  }
  assert.equal(zonesOf(state).filter((z) => z.kind === 'rankAdjacent').length, 2, 'shared piles are not duplicated per player');
});

test('JOIN: a per-player configured zone name reads "<player>\'s <Kind>", singular, no index for count 1', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const ownPile = zonesOf(state).find((z) => z.kind === 'cascade' && z.ownerId === 'p1');
  assert.equal(ownPile.name, "Alice's Cascade");
});

test('JOIN: re-joining does not duplicate a \'perPlayer\' configured zone either', () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'cascade', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'SET_CONNECTION', playerId: 'p1', connection: 'connecting' });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(zonesOf(state).filter((z) => z.kind === 'cascade' && z.ownerId === 'p1').length, 1);
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

test('viewFor: every zone is redacted per-card, zone name/count always visible', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const meldsZoneId = zonesOf(state).find((z) => z.name === 'Melds').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: meldsZoneId,
    visibility: 'private-facedown',
  });

  const otherView = viewFor(state, 'p2');
  // UX follow-up (direct user request): "a Deck is a specific kind of
  // Pile" - the deck now ALSO surfaces in `view.zones` (dual-routed,
  // same as `deckCount`), so the count matches EVERY tableSide pile now,
  // not `visibleZonesOf`'s deck-excluded count.
  assert.equal(otherView.zones.length, zonesOf(state).length, 'zone count matches every tableSide pile (deck + default + Melds), the deck now included');
  const meldsView = otherView.zones.find((z) => z.id === meldsZoneId);
  assert.equal(meldsView.name, 'Melds');
  assert.equal(meldsView.cards.length, 1, 'card count visible even though contents are hidden');
  assert.ok(!('rank' in meldsView.cards[0]));
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

test('ADJUST_SCORE: rejects any delta other than +1/-1', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  assert.throws(() => reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 5 }));
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });

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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  const deckSizeAfterDeal = deckOf(state).length;

  state = reduce(state, { type: 'DEAL_MORE', cardsPerPlayer: 2 });

  assert.equal(handOf(state, 'p1').length, 5);
  assert.equal(handOf(state, 'p2').length, 5);
  assert.equal(deckOf(state).length, deckSizeAfterDeal - 4);
});

test('DEAL_MORE: throws if there are not enough cards left', () => {
  let state = createInitialState({ numDecks: 1 }, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 50 });
  assert.throws(() => reduce(state, { type: 'DEAL_MORE', cardsPerPlayer: 5 }));
});

// --- Pass marker (D16, US-25) ---

test('JOIN: initializes a new player as not passed', () => {
  const state = reduce(createInitialState({}, () => 0.5), {
    type: 'JOIN',
    playerId: 'p1',
    name: 'Alice',
  });
  assert.equal(state.passed.p1, false);
});

test('TOGGLE_PASS: flips the acting player\'s own passed flag', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'TOGGLE_PASS', playerId: 'p1' });
  assert.equal(state.passed.p1, true);
  assert.equal(state.passed.p2, false);

  state = reduce(state, { type: 'TOGGLE_PASS', playerId: 'p1' });
  assert.equal(state.passed.p1, false);
});

test('RESET clears pass markers but (regression) leaves scores untouched', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'TOGGLE_PASS', playerId: 'p1' });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });

  state = reduce(state, { type: 'RESET' });

  assert.equal(state.passed.p1, false);
  assert.equal(state.scores.p1, 1);
});

test('viewFor: passed markers are public to every viewer', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'TOGGLE_PASS', playerId: 'p1' });

  const view = viewFor(state, 'p2');
  assert.equal(view.passed.p1, true);
});

test('solo play: a single player can deal, play, draw, and reset a full round alone', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['solo']);
  assert.equal(state.players.length, 1);

  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 7 });
  assert.equal(handOf(state, 'solo').length, 7);
  assert.equal(deckOf(state).length, 45);

  const cardId = handOf(state, 'solo')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'solo', cardId });
  assert.equal(handOf(state, 'solo').length, 6);
  assert.equal(tableOf(state).cards.length, 1);

  state = reduce(state, { type: 'DRAW', playerId: 'solo' });
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

test('viewFor: no deck card ever reaches any viewer, not even its id (D23 routing)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });

  const serialized = JSON.stringify(viewFor(state, 'p1'));
  for (const card of deckOf(state)) {
    assert.ok(
      !serialized.includes(card.id),
      `deck card ${card.id} leaked into a player view - the deck must only ever be a count`,
    );
  }
});

test('viewFor: another player\'s hand leaks neither contents nor card ids (D23 routing)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });

  // *nit (2026-08-26), real privacy fix: `HandPile.redactCard` now
  // actually redacts, so this asserts against the WHOLE serialized view
  // again (card ids included - identity, not just rank/suit, must not
  // leak) rather than being narrowed to the fields that happened to
  // already be safe.
  const serialized = JSON.stringify(viewFor(state, 'p2'));
  for (const card of handOf(state, 'p1')) {
    assert.ok(!serialized.includes(card.id), `p1's hand card ${card.id} leaked into p2's view`);
  }
  assert.equal(viewFor(state, 'p2').otherHandCounts.p1, 3, 'but the count is still public');
});

test('viewFor: every pile is accounted for - none silently dropped (D23 routing)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });

  const view = viewFor(state, 'p1');
  // UX follow-up (direct user request): both a hand pile AND the deck
  // pile are now DELIBERATELY double-routed - a hand into `myHand`/
  // `otherHandCounts` AND `zones` (so it renders at its owner's seat);
  // the deck into `deckCount` AND `zones` (so it renders as a real
  // `<pile-panel>`/`<deck-stack>` grouped into the Table Zone, "a Deck
  // is a specific kind of Pile"). `hand`/`deck` correct for that instead
  // of assuming one pile surfaces in exactly one place.
  const hand = state.piles.filter((p) => p.kind === 'hand').length;
  const deck = state.piles.filter((p) => p.kind === 'deck').length;
  const accountedFor =
    view.zones.length + Object.keys(view.otherHandCounts).length + 1 /* myHand */ + 1 /* deckCount */ - hand - deck;
  assert.equal(
    accountedFor,
    state.piles.length,
    'every pile must surface in the view as a zone, a hand, or the deck count - a pile whose kind is not routed would vanish silently',
  );
});

test('pileVisibility: every pile kind in use has a defined visibility rule (D23)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });

  const kinds = new Set(state.piles.map((p) => p.kind));
  assert.deepEqual([...kinds].toSorted(), ['deck', 'hand', 'zone'], 'all three pile types are exercised');
  for (const pile of state.piles) {
    assert.ok(
      ['hidden', 'in-hand', 'mixed'].includes(pileVisibility(pile)),
      `pile kind "${pile.kind}" has no visibility rule - viewFor would drop it`,
    );
  }
});

test('DEAL after DEAL re-deals from scratch; DEAL_MORE appends (D23 shared-case regression)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'DEAL_MORE', cardsPerPlayer: 1 });
  assert.equal(handOf(state, 'p1').length, 4, 'DEAL_MORE appends');

  // DEAL and DEAL_MORE now share one reducer case separated only by a
  // `fresh` flag - so a second DEAL must still fully reset, not append.
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  assert.equal(handOf(state, 'p1').length, 2, 'a second DEAL clears hands first, it does not append');
  assert.equal(handOf(state, 'p2').length, 2);
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 0 });
  const foundationId = zonesOf(state).find((z) => z.name === 'Hearts').id;

  state = withCardInHand(state, 'p1', { id: 'six-hearts', rank: '6', suit: 'hearts' });
  assert.throws(
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'six-hearts', zoneId: foundationId, visibility: 'public' }),
    /cannot accept/,
  );

  state = withCardInHand(state, 'p1', { id: 'ace-hearts', rank: 'A', suit: 'hearts' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'ace-hearts', zoneId: foundationId, visibility: 'public' });
  const foundation = zonesOf(state).find((z) => z.id === foundationId);
  assert.deepEqual(foundation.cards.map((c) => c.id), ['ace-hearts']);
});

test('Foundation end-to-end: once placed, a card can never move back out', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Hearts', kind: 'foundation' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 0 });
  const foundationId = zonesOf(state).find((z) => z.name === 'Hearts').id;
  state = withCardInHand(state, 'p1', { id: 'ace-hearts', rank: 'A', suit: 'hearts' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'ace-hearts', zoneId: foundationId, visibility: 'public' });

  assert.throws(
    () => reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'ace-hearts', toZoneId: 'table' }),
    /not authorized/,
  );
});

test('Cascade end-to-end: same-color/skipped-rank is rejected, opposite-color rank-1 is accepted and carries layout: overlap', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Tableau 1', kind: 'cascade' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 0 });
  const cascadeId = zonesOf(state).find((z) => z.name === 'Tableau 1').id;

  state = withCardInHand(state, 'p1', { id: 'eight-clubs', rank: '8', suit: 'clubs' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'eight-clubs', zoneId: cascadeId, visibility: 'public' });

  state = withCardInHand(state, 'p1', { id: 'seven-spades', rank: '7', suit: 'spades' });
  assert.throws(
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-spades', zoneId: cascadeId, visibility: 'public' }),
    /cannot accept/,
    'same color (both black) - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'seven-hearts', rank: '7', suit: 'hearts' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-hearts', zoneId: cascadeId, visibility: 'public' });
  const cascade = zonesOf(state).find((z) => z.id === cascadeId);
  assert.deepEqual(cascade.cards.map((c) => c.id), ['eight-clubs', 'seven-hearts']);
  assert.equal(cascade.cards[1].layout, 'overlap');
});

test('RankAdjacent end-to-end: accepts +/-1 either direction and the King<->Ace wrap, rejects a 2-rank gap', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Center', kind: 'rankAdjacent' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 0 });
  const centerId = zonesOf(state).find((z) => z.name === 'Center').id;

  state = withCardInHand(state, 'p1', { id: 'seven-clubs', rank: '7', suit: 'clubs' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'seven-clubs', zoneId: centerId, visibility: 'public' });

  state = withCardInHand(state, 'p1', { id: 'nine-hearts', rank: '9', suit: 'hearts' });
  assert.throws(
    () => reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'nine-hearts', zoneId: centerId, visibility: 'public' }),
    /cannot accept/,
    'two ranks away - rejected',
  );

  state = withCardInHand(state, 'p1', { id: 'eight-spades', rank: '8', suit: 'spades' });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: 'eight-spades', zoneId: centerId, visibility: 'public' });
  assert.deepEqual(zonesOf(state).find((z) => z.id === centerId).cards.map((c) => c.id),
    ['eight-spades', 'seven-clubs'], 'STACK: lands on top');
});

// --- Card stack/overlap layout (D21, US-32/US-33) ---

/**
Deals p1 three cards and plays them all public into the default zone.
*/
function threeCardsOnTable(rng = () => 0.5) {
  let state = withPlayers(createInitialState({}, rng), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  const ids = handOf(state, 'p1').map((c) => c.id);
  for (const cardId of ids) state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });
  return { state, ids };
}

const tableCards = (state) => zonesOf(state).find((z) => z.id === 'table').cards;
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
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table',
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
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table',
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
    type: 'MOVE_CARD', playerId: 'p1', cardId: a, toZoneId: 'table',
    targetCardId: c, side: 'after',
  });
  assert.deepEqual(tableIds(next), [b, c, a], 'A moved to the end of its own zone');
  assert.notDeepEqual(tableIds(next), ids, 'pre-D21 this returned state unchanged');
});

test('MOVE_CARD to empty zone space clears a previously-set layout (US-32/33 un-stack)', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, , c] = ids;
  let next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table',
    targetCardId: a, side: 'after', layout: 'stack',
  });
  assert.equal(layoutOf(next, c), 'stack');

  next = reduce(next, { type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table' });
  assert.equal(layoutOf(next, c), undefined, 'dragging back out to open space returns it to flat spacing');
});

test('PLAY straight from hand can stack onto a card already on the table', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
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
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table',
    targetCardId: a, side: 'after', layout: 'stack',
  });
  next = reduce(next, { type: 'PICKUP', playerId: 'p2', cardId: c });
  const picked = handOf(next, 'p2').find((card) => card.id === c);
  assert.ok(picked, 'card reached the hand');
  assert.ok(!('layout' in picked), 'layout is a zone-only concern and must not follow a card into a hand');
  assert.ok(!('faceUp' in picked) && !('owner' in picked), 'existing strip behavior still holds');
});

test('MOVE_CARD: authorization is unchanged by layout params (D21 - no new privacy surface)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  const [hidden, visible] = handOf(state, 'p1').map((c) => c.id);
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: visible });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: hidden, visibility: 'private-facedown' });

  assert.throws(
    () => reduce(state, {
      type: 'MOVE_CARD', playerId: 'p2', cardId: hidden, toZoneId: 'table',
      targetCardId: visible, side: 'after', layout: 'stack',
    }),
    'a non-owner still cannot move a still-hidden card, layout params or not',
  );
});

test('MOVE_CARD: throws for a target card that is not in the destination zone', () => {
  const { state, ids } = threeCardsOnTable();
  assert.throws(() =>
    reduce(state, {
      type: 'MOVE_CARD', playerId: 'p1', cardId: ids[0], toZoneId: 'table',
      targetCardId: 'no-such-card', side: 'after', layout: 'stack',
    }),
  );
});

test('removing a card from mid-stack leaves the rest stacked, it does not flatten them', () => {
  const { state, ids } = threeCardsOnTable();
  const [a, b, c] = ids;
  let next = reduce(state, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: b, toZoneId: 'table', targetCardId: a, side: 'after', layout: 'stack',
  });
  next = reduce(next, {
    type: 'MOVE_CARD', playerId: 'p1', cardId: c, toZoneId: 'table', targetCardId: b, side: 'after', layout: 'stack',
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'p1', delta: 1 });
  state = reduce(state, { type: 'TOGGLE_PASS', playerId: 'p1' });

  const deckBefore = deckOf(state).map((c) => c.id);
  const handBefore = handOf(state, 'p1').map((c) => c.id);
  const tableBefore = tableOf(state).cards.map((c) => c.id);

  // A seeded rng that actually permutes, so "did it reorder" is testable.
  let n = 0;
  const next = reduce(state, { type: 'SHUFFLE_DECK', rng: () => ((n = (n * 9301 + 49_297) % 233_280), n / 233_280) });

  assert.deepEqual([...deckOf(next)].map((c) => c.id).toSorted(), [...deckBefore].toSorted(),
    'same cards, no additions or losses');
  assert.notDeepEqual(deckOf(next).map((c) => c.id), deckBefore, 'order actually changed');
  assert.deepEqual(handOf(next, 'p1').map((c) => c.id), handBefore, 'hands untouched');
  assert.deepEqual(tableOf(next).cards.map((c) => c.id), tableBefore, 'zone cards untouched');
  assert.equal(next.scores.p1, 1, 'scores untouched');
  assert.equal(next.passed.p1, true, 'pass markers untouched - unlike RESET');
});

test('SPLIT_DECK deals the whole deck round-robin into N new face-down piles', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  const deckSize = deckOf(state).length;
  const zonesBefore = zonesOf(state).length;

  const next = reduce(state, { type: 'SPLIT_DECK', pileCount: 4 });

  assert.equal(zonesOf(next).length, zonesBefore + 4, 'four new piles exist as ordinary zones');
  assert.equal(deckOf(next).length, 0, 'the stock is exhausted, not partially dealt');
  const piles = zonesOf(next).slice(zonesBefore);
  assert.deepEqual(piles.map((z) => z.name), ['Pile 1', 'Pile 2', 'Pile 3', 'Pile 4']);
  assert.equal(piles.reduce((n, z) => n + z.cards.length, 0), deckSize, 'every card landed somewhere');
  const sizes = piles.map((z) => z.cards.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `piles are even to within one card, got ${sizes}`);
  // UX follow-up (direct user request): "one split should result in 2
  // decks (not piles)." A split pile is deck-kind now, not zone-kind -
  // hidden visibility is a property of the WHOLE pile (pileTypes.js),
  // not per-card owner/faceUp flags the way a zone pile fakes hidden.
  assert.ok(piles.every((z) => z.kind === 'deck'), 'split piles are real deck-kind piles, hidden like the deck was');
});

test('SPLIT_DECK piles are ordinary zones - drawable/movable by the existing rules', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 2 });
  const pile = zonesOf(state).find((z) => z.name === 'Pile 1');
  const cardId = pile.cards[0].id;

  // Face-down but unowned == "put or take is open to all" (US-19), so any
  // player may reveal it, exactly as with any shared face-down card.
  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(zonesOf(revealed).find((z) => z.name === 'Pile 1').cards[0].faceUp, true);
  const picked = reduce(revealed, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.ok(handOf(picked, 'p2').some((c) => c.id === cardId), 'and can then be picked up');
});

test('SPLIT_DECK rejects a pile count it cannot fill, with a clear message', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 50 });
  assert.equal(deckOf(state).length, 2);
  assert.throws(
    () => reduce(state, { type: 'SPLIT_DECK', pileCount: 5 }),
    /only 2 cards left/,
    'must say how many are actually left, not just fail',
  );
  assert.doesNotThrow(() => reduce(state, { type: 'SPLIT_DECK', pileCount: 2 }), 'exactly enough is allowed');
});

test('SPLIT_DECK leaves the deck pile in place (D24 invariant), so DRAW/DEAL still work', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 3 });
  assert.equal(state.piles.filter((p) => p.id === 'deck').length, 1,
    // UX follow-up: split piles are deck-KIND too now (more than one
    // deck-kind pile can exist), so this must match by id, the one
    // thing that still uniquely names THE deck (see deckOf()'s comment).
    'exactly one pile with the original deck id must always exist - deckOf() is deliberately unguarded');
  assert.throws(() => reduce(state, { type: 'DRAW', playerId: 'p1' }), /deck is empty/,
    'an emptied deck must fail with its own clear message, not a TypeError from a missing pile');
});

// UX follow-up: a split pile is deck-kind now (direct user request -
// "one split should result in 2 decks, not piles"), not a zone-kind
// pile faking hidden via per-card owner/faceUp/layout. D21's per-card
// stack layout was only ever needed to make a zone LOOK like a deck;
// a real deck-kind pile already renders as one back + a count, no
// per-card annotation required - so it carries none.
test('SPLIT_DECK piles carry plain cards - no per-card owner/faceUp/layout, unlike a zone-kind hidden pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 3 });
  const pile = zonesOf(state).find((z) => z.name === 'Pile 1');
  assert.ok(pile.cards.length > 2);
  assert.ok(pile.cards.every((c) => !('layout' in c) && !('owner' in c) && !('faceUp' in c)),
    'a deck-kind pile needs none of the fields a zone pile uses to fake hiddenness');
});

test('viewFor: a split (deck-kind) pile surfaces to a viewer as count-only, same as the original deck (D7/D24)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 2 });
  const pile = zonesOf(state).find((z) => z.name === 'Pile 1');

  const view = viewFor(state, 'p2');
  const viewPile = view.zones.find((z) => z.name === 'Pile 1');
  assert.deepEqual(viewPile.cards, [], 'no per-card data at all - stronger than per-card redaction');
  assert.equal(viewPile.count, pile.cards.length, 'the size is still public, same badge as the deck itself');
});

// --- D55 (Sprint 23): Zone is a real, independent entity - `state.zones`
// - and every table-side pile's own `zoneId` names which one it belongs
// to. These characterize the DEFAULT assignment (reproducing every rule
// `ui.js` used to hardcode) and the new `MOVE_PILE` reducer case that
// makes `zoneId` real, mutable data.

test('createInitialState: seeds a real Table Zone record, and the deck/table piles both point at it', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(state.zones, [{ id: 'table-zone', name: 'Table Zone', ownerId: null, type: 'shared' }]);
  assert.equal(zonesOf(state).find((z) => z.id === 'deck').zoneId, 'table-zone');
  assert.equal(tableOf(state).zoneId, 'table-zone');
});

test('CREATE_ZONE: a live user action, not a declaration - every kind (including discard) is standalone by default, never guessed from kind', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard', kind: 'discard' });
  const discard = zonesOf(state).find((z) => z.name === 'Discard');
  assert.equal(discard.zoneId, discard.id, 'no kind-based Table Zone inference for a live CREATE_ZONE - only a declared GameConfig.zones entry can request that');
  assert.equal(state.zones.length, 2, 'table-zone (seeded at startup) + the new standalone zone');

  state = reduce(state, { type: 'CREATE_ZONE', name: 'Solo Zone' });
  const solo = zonesOf(state).find((z) => z.name === 'Solo Zone');
  assert.equal(solo.zoneId, solo.id, 'a plain zone is alone in its own Zone, keyed by its own pile id');
  assert.ok(state.zones.some((z) => z.id === solo.id && z.name === null && z.ownerId === null));
});

test('GameConfig.piles: an entry\'s own zoneId groups it into an existing Zone, declared - not inferred from kind (D55)', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'table-zone' }],
  });
  const discard = zonesOf(state).find((z) => z.kind === 'discard');
  assert.equal(discard.zoneId, 'table-zone');
  assert.equal(state.zones.length, 1, 'no new zone record needed - table-zone already exists');
});

test('GameConfig.zones: a Zone is a real entity - {id, name, type} - declared alongside GameConfig.piles (D55)', () => {
  const state = createInitialState({}, () => 0.5, {
    zones: [{ id: 'discard-zone', name: 'Discard Area', type: 'shared' }],
    piles: [{ kind: 'discard', ownerId: null, count: 1, zoneId: 'discard-zone' }],
  });
  assert.ok(state.zones.some((z) => z.id === 'discard-zone' && z.name === 'Discard Area' && z.type === 'shared'));
  assert.equal(zonesOf(state).find((z) => z.kind === 'discard').zoneId, 'discard-zone');
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

  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  assert.equal(state.piles.find((p) => p.id === 'hand:p1').zoneId, 'player-p1');
});

test("JOIN: a 'perPlayer' configured zone shares the same player Zone as that player's hand", () => {
  let state = createInitialState({}, () => 0.5, { piles: [{ kind: 'zone', ownerId: 'perPlayer', count: 1 }] });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'P1' });
  const stock = zonesOf(state).find((z) => z.ownerId === 'p1' && z.id !== 'hand:p1');
  assert.equal(stock.zoneId, 'player-p1');
});

test('MOVE_PILE: reparents an eligible pile into an existing Zone, as a sibling', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Solo Zone' });
  const solo = zonesOf(state).find((z) => z.name === 'Solo Zone');
  state = reduce(state, { type: 'MOVE_PILE', pileId: solo.id, targetZoneId: 'table-zone' });
  assert.equal(zonesOf(state).find((z) => z.id === solo.id).zoneId, 'table-zone');
  // Sibling, not a merge - the Table pile's own cards/identity untouched.
  assert.equal(tableOf(state).id, 'table');
});

test('MOVE_PILE: rejects deck/hand/foundation/cascade/rankAdjacent - only zone/discard piles are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  assert.throws(() => reduce(state, { type: 'MOVE_PILE', pileId: 'deck', targetZoneId: 'table-zone' }), /Cannot move/);
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
    const pile = zonesOf(meldState).find((z) => z.kind === kind);
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
  const discard = zonesOf(state).find((z) => z.name === 'Discard');
  // Join the Table Zone first (MOVE_PILE, not CREATE_ZONE - a live
  // CREATE_ZONE never auto-groups, per D55) so there's something real
  // to ungroup out of.
  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: 'table-zone' });
  assert.equal(zonesOf(state).find((z) => z.id === discard.id).zoneId, 'table-zone');

  state = reduce(state, { type: 'MOVE_PILE', pileId: discard.id, targetZoneId: null });
  const moved = zonesOf(state).find((z) => z.id === discard.id);
  assert.equal(moved.zoneId, discard.id, 'standalone now - its own zoneId, not table-zone');
  assert.ok(state.zones.some((z) => z.id === discard.id));
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
  const created = zonesOf(state).find((z) => z.zoneId === 'table-zone' && z.id !== 'deck' && z.id !== 'table' && z.id !== 'discard');
  assert.ok(created, 'a new pile exists, grouped into the Table Zone');
  assert.equal(state.zones.length, zoneCountBefore, 'no new Zone record was created');
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
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;

  state = reduce(state, {
    type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: 'hand:p1', cardId, playerId: 'p1',
  });

  assert.equal(handOf(state, 'p1').length, 0, 'removed from the source pile');
  const created = zonesOf(state).find((z) => z.zoneId === 'table-zone' && z.cards.some((c) => c.id === cardId));
  assert.ok(created, 'landed in a real new pile grouped into the target zone');
  assert.equal(created.cards.length, 1);
});

test('CREATE_PILE: the same authorization as MOVE_CARD - a non-owner cannot move someone else\'s still-hidden private card into a new pile', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });
  const table = tableOf(state);

  assert.throws(
    () => reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', fromPileId: table.id, cardId, playerId: 'p2' }),
    /not authorized/,
  );
});

// --- REORDER_PILE (direct user request: "Panels can be moved from
// zone to zone [MOVE_PILE] and relocated within their zone
// [ordering]") - purely cosmetic (no game-state/privacy implication),
// open to any player like RENAME_PILE/RENAME_ZONE, not gated by
// `reparentable` (unlike a cross-zone move, staying inside the SAME
// zone is never a game-rule concern for any kind).

test('REORDER_PILE: moves a pile to sit immediately before another pile in the SAME zone', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'zone', name: 'A' });
  state = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'zone', name: 'B' });
  const [a, b] = zonesOf(state).filter((z) => z.name === 'A' || z.name === 'B');

  // Currently in creation order: ..., A, B. Move B before A.
  state = reduce(state, { type: 'REORDER_PILE', pileId: b.id, beforePileId: a.id });
  const order = state.piles.map((p) => p.id);
  assert.ok(order.indexOf(b.id) < order.indexOf(a.id), 'B now sits before A');
});

test('REORDER_PILE: rejects reordering across two different zones - use MOVE_PILE for that', () => {
  let state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Elsewhere' });
  const elsewhere = zonesOf(state).find((z) => z.name === 'Elsewhere');
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
  state = reduce(state, { type: 'CREATE_PILE', zoneId: 'table-zone', kind: 'zone', name: 'A' });
  const a = zonesOf(state).find((z) => z.name === 'A');
  assert.doesNotThrow(() => reduce(state, { type: 'REORDER_PILE', playerId: 'p2', pileId: a.id, beforePileId: 'table' }));
});

test('viewFor: carries zoneRecords (the real Zone registry) and each pile-view its own zoneId', () => {
  const state = createInitialState({}, () => 0.5);
  const view = viewFor(state, 'p1');
  assert.deepEqual(view.zoneRecords, [{ id: 'table-zone', name: 'Table Zone', ownerId: null, type: 'shared' }]);
  assert.equal(view.zones.find((z) => z.id === 'table').zoneId, 'table-zone');
  assert.equal(view.zones.find((z) => z.id === 'deck').zoneId, 'table-zone');
});

// --- Sprint 23, Phase 68: SPLIT_PILE + TAKE_PILE (US-60/61) ---

function dealPublicCardsTo(state, playerId, zoneId, count) {
  for (let index = 0; index < count; index++) {
    const cardId = handOf(state, playerId)[0].id;
    state = reduce(state, { type: 'PLAY', playerId, cardId, zoneId, visibility: 'public' });
  }
  return state;
}

test('SPLIT_PILE: splits roughly in half, original keeps the extra card on an odd count', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 5);

  state = reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, playerId: 'p1' });
  const original = zonesOf(state).find((z) => z.id === pool.id);
  const created = zonesOf(state).find((z) => z.kind === 'discard' && z.id !== pool.id);
  assert.ok(created, 'a new sibling pile exists');
  assert.equal(original.cards.length, 3, 'original keeps the extra card (ceil)');
  assert.equal(created.cards.length, 2, 'new pile gets the smaller half (floor)');
  assert.equal(created.zoneId, pool.zoneId, 'lands in the same Zone as the source, a sibling');
  assert.equal(original.cards.length + created.cards.length, 5, 'no card lost');
});

test('SPLIT_PILE: rejects a pile with fewer than 2 cards, with a clear message', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 1);

  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: pool.id, playerId: 'p1' }), /only 1 card/);
});

test('SPLIT_PILE: rejects deck/hand/foundation kinds - only zone/discard are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: 'deck', playerId: 'p1' }), /Cannot split/);
  assert.throws(() => reduce(state, { type: 'SPLIT_PILE', pileId: 'hand:p1', playerId: 'p1' }), /Cannot split/);
});

test('SPLIT_PILE: a personal pile can only be split by its own owner', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'zone', ownerId: 'perPlayer', count: 1 }],
  });
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  const stock = zonesOf(state).find((z) => z.kind === 'zone' && z.ownerId === 'p1');
  state = dealPublicCardsTo(state, 'p1', stock.id, 2);

  assert.throws(
    () => reduce(state, { type: 'SPLIT_PILE', pileId: stock.id, playerId: 'p2' }),
    /not authorized/,
  );
  assert.doesNotThrow(() => reduce(state, { type: 'SPLIT_PILE', pileId: stock.id, playerId: 'p1' }));
});

test('TAKE_PILE: transfers every card into the acting player\'s hand, in order, stripped of zone-only fields', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);
  const order = zonesOf(state).find((z) => z.id === pool.id).cards.map((c) => c.id);

  state = reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p1' });
  assert.deepEqual(zonesOf(state).find((z) => z.id === pool.id).cards, [], 'pile is empty now');
  const hand = handOf(state, 'p1');
  assert.deepEqual(hand.map((c) => c.id), order, 'landed in the hand in the pile\'s own order');
  assert.ok(hand.every((c) => !('owner' in c) && !('faceUp' in c) && !('layout' in c)), 'zone-only fields stripped, same as PICKUP');
});

test('TAKE_PILE: a pile containing a card the viewer cannot see blocks the WHOLE take - no partial-take', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 1);
  // A private-facedown card, owned by p1, is hidden from p2 - and per
  // zonePile's own `pickup` rule, hidden even from p1 (identity must be
  // visible to be taken, matching a single-card pickup's own rule).
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: pool.id, visibility: 'private-facedown' });

  assert.throws(
    () => reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p2' }),
    /cannot see/,
  );
  // No mutation happened - the guard runs before any card moves.
  assert.equal(zonesOf(state).find((z) => z.id === pool.id).cards.length, 2);
});

test('TAKE_PILE: works on a discard pile specifically - its own cardActions is always empty, a different question from bulk take', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 2);

  assert.doesNotThrow(() => reduce(state, { type: 'TAKE_PILE', pileId: pool.id, playerId: 'p1' }));
});

test('TAKE_PILE: rejects deck/hand kinds - only zone/discard are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  assert.throws(() => reduce(state, { type: 'TAKE_PILE', pileId: 'deck', playerId: 'p1' }), /Cannot take/);
  assert.throws(() => reduce(state, { type: 'TAKE_PILE', pileId: 'hand:p1', playerId: 'p1' }), /Cannot take/);
});

test('zonePile/discardPile pileActions: split/take open to any player on a shared pile, owner-only on a personal one', () => {
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isShared: true }), ['split', 'take']);
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isOwner: true }), ['split', 'take']);
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isOwner: false, isShared: false }), []);
  assert.deepEqual(PILE_TYPES.discard.pileActions({ isShared: true }), ['split', 'take']);
  assert.deepEqual(PILE_TYPES.discard.pileActions({}), []);
});

// --- Sprint 23, Phase 69: SET_PILE_ORIENTATION (US-62, hide/show) ---

test('SET_PILE_ORIENTATION: sets every card in the pile face-up or face-down uniformly', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 3);

  state = reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p1', faceUp: false });
  assert.ok(zonesOf(state).find((z) => z.id === pool.id).cards.every((c) => c.faceUp === false), 'every card face-down');

  state = reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p1', faceUp: true });
  assert.ok(zonesOf(state).find((z) => z.id === pool.id).cards.every((c) => c.faceUp === true), 'every card face-up again');
});

test('SET_PILE_ORIENTATION: rejects deck/hand kinds - only zone/discard are eligible', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: 'deck', playerId: 'p1', faceUp: false }),
    /Cannot set orientation/,
  );
  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: 'hand:p1', playerId: 'p1', faceUp: false }),
    /Cannot set orientation/,
  );
});

test('SET_PILE_ORIENTATION: a personal pile can only be set by its own owner - reducer re-checks, not just the offer layer', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'zone', ownerId: 'perPlayer', count: 1 }],
  });
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  const stock = zonesOf(state).find((z) => z.kind === 'zone' && z.ownerId === 'p1');
  state = dealPublicCardsTo(state, 'p1', stock.id, 2);

  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: stock.id, playerId: 'p2', faceUp: false }),
    /not authorized/,
  );
  assert.doesNotThrow(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: stock.id, playerId: 'p1', faceUp: false }),
  );
});

test('SET_PILE_ORIENTATION: a shared pile can only be set by the host - reducer re-checks, not just the offer layer', () => {
  // p1 joins first - the host, by construction (D3: only the host ever
  // runs `reduce`, and it always joins its own table before anyone else
  // can reach it via the share code).
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Pool', kind: 'discard' });
  const pool = zonesOf(state).find((z) => z.name === 'Pool');
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = dealPublicCardsTo(state, 'p1', pool.id, 2);

  assert.throws(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p2', faceUp: false }),
    /not authorized/,
  );
  assert.doesNotThrow(
    () => reduce(state, { type: 'SET_PILE_ORIENTATION', pileId: pool.id, playerId: 'p1', faceUp: false }),
  );
});

test('zonePile/discardPile pileActions: hide/show are mutually exclusive, keyed off the pile\'s own current orientation', () => {
  const faceUp = (n) => Array.from({ length: n }, (_, index) => ({ id: `c${index}`, faceUp: true }));
  const faceDown = (n) => Array.from({ length: n }, (_, index) => ({ id: `c${index}`, faceUp: false }));
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isShared: true, cards: faceUp(2) }).filter((a) => a === 'hide' || a === 'show'), ['hide']);
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isShared: true, cards: faceDown(2) }).filter((a) => a === 'hide' || a === 'show'), ['show']);
  assert.deepEqual(PILE_TYPES.zone.pileActions({ isShared: true, cards: [] }).filter((a) => a === 'hide' || a === 'show'), [], 'an empty pile offers neither');
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
