import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor, deckOf, handOf, handsOf, zonesOf, pileVisibility } from '../src/state.js';

function withPlayers(state, ids) {
  return ids.reduce(
    (s, id) => reduce(s, { type: 'JOIN', playerId: id, name: id }),
    state,
  );
}

test('createInitialState: empty roster, full shuffled deck, one empty default zone', () => {
  const state = createInitialState({ numDecks: 1, jokers: 0 }, () => 0.5);
  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(state.players, []);
  assert.equal(zonesOf(state).length, 1);
  assert.deepEqual(zonesOf(state)[0].cards, []);
});

// --- D46: GameConfig's first real field ---

test('createInitialState: gameConfig.allowsPlayerZones defaults true - matches every prior sprint\'s behavior exactly', () => {
  const state = createInitialState({}, () => 0.5);
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: true });
});

test('createInitialState: allowsPlayerZones can be set false via the third param', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.deepEqual(state.gameConfig, { allowsPlayerZones: false });
});

test('CREATE_ZONE: rejected when the game disallows player zones', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x' }), /does not allow/);
});

test('CREATE_ZONE: allowsPlayerZones does not affect JOIN\'s personal zone or SPLIT_DECK\'s piles - only this action is gated', () => {
  let state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'p1' });
  assert.equal(zonesOf(state).length, 2, 'default table + p1\'s personal zone, neither went through CREATE_ZONE');
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 2 });
  assert.equal(zonesOf(state).length, 4, 'default + personal + 2 split piles - also unaffected');
});

test('CREATE_ZONE: a snapshot with no gameConfig at all (pre-D46) defaults to allowed, not a crash', () => {
  const state = createInitialState({}, () => 0.5);
  const { gameConfig, ...preD46State } = state;
  assert.doesNotThrow(() => reduce(preD46State, { type: 'CREATE_ZONE', name: 'x' }));
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
  assert.equal(zonesOf(state)[0].cards.length, 1);
  assert.equal(zonesOf(state)[0].cards[0].id, cardId);
  assert.ok(!handOf(state, 'p1').some((c) => c.id === cardId));
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

test('RESET: reshuffles the deck and clears hands/zone cards, keeps roster + zone structure', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  const zoneCountBeforeReset = zonesOf(state).length; // default + 2 personal (D17) + Discard

  state = reduce(state, { type: 'RESET' });

  assert.equal(deckOf(state).length, 52);
  assert.deepEqual(handsOf(state), {});
  assert.equal(
    zonesOf(state).length,
    zoneCountBeforeReset,
    'zone structure (incl. personal and player-created zones) survives a reset',
  );
  assert.ok(zonesOf(state).every((z) => z.cards.length === 0), 'every zone\'s cards clear on reset');
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
    !JSON.stringify(otherView).includes(handOf(state, 'p1')[0].rank),
    'a player\'s view must never contain another player\'s card data',
  );
});

test('viewFor: deck is exposed only as a count, table is fully public', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

  const view = viewFor(state, 'p1');
  assert.equal(typeof view.deckCount, 'number');
  assert.equal(view.deckCount, deckOf(state).length);
  assert.equal(view.zones[0].cards.length, 1);
  assert.equal(view.zones[0].cards[0].id, zonesOf(state)[0].cards[0].id);
});

// --- Middle-zone visibility (D7/D8, US-12/13/14) ---

test('PLAY: defaults to public visibility (owner null, faceUp true) — regression', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id });

  assert.equal(zonesOf(state)[0].cards[0].owner, null);
  assert.equal(zonesOf(state)[0].cards[0].faceUp, true);
});

test('PLAY: shared-facedown has no owner and is hidden from everyone, including the player', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.equal(zonesOf(state)[0].cards[0].owner, null);
  assert.equal(zonesOf(state)[0].cards[0].faceUp, false);
  const p1View = viewFor(state, 'p1');
  const p2View = viewFor(state, 'p2');
  assert.equal(p1View.zones[0].cards[0].faceDown, true);
  assert.equal(p1View.zones[0].cards[0].owner, null);
  assert.ok(!('rank' in p1View.zones[0].cards[0]), 'even the player who played it cannot see a shared face-down card');
  assert.ok(!('rank' in p2View.zones[0].cards[0]));
});

test('PLAY: private-facedown is owned by the player and visible only to them', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.equal(zonesOf(state)[0].cards[0].owner, 'p1');
  assert.equal(zonesOf(state)[0].cards[0].faceUp, false);

  const ownerView = viewFor(state, 'p1');
  const otherView = viewFor(state, 'p2');
  assert.equal(ownerView.zones[0].cards[0].id, cardId);
  assert.ok('rank' in ownerView.zones[0].cards[0], 'owner can see their own private middle card');
  assert.equal(otherView.zones[0].cards[0].faceDown, true);
  assert.equal(otherView.zones[0].cards[0].owner, 'p1', 'ownership stays visible even when face-down');
  assert.ok(!('rank' in otherView.zones[0].cards[0]), 'non-owner cannot see a private middle card');
});

test('REVEAL: any player can reveal a shared face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });

  assert.equal(zonesOf(state)[0].cards[0].faceUp, true);
  const anyView = viewFor(state, 'p2');
  assert.ok('rank' in anyView.zones[0].cards[0]);
});

test('REVEAL: only the owner can reveal a private face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }));

  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(zonesOf(revealed)[0].cards[0].faceUp, true);
});

test('REVEAL: revealing an already-face-up card is a no-op, not an error', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const result = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(zonesOf(result)[0].cards[0].faceUp, true);
});

// --- D48/D40 (Sprint 18): Card.orientation as replicated state ---

test('ROTATE_CARD: toggles a face-up card between portrait (default/absent) and landscape', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });
  assert.equal(zonesOf(state)[0].cards[0].orientation, undefined, 'a newly played card has no orientation set - implies portrait');

  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(zonesOf(state)[0].cards[0].orientation, 'landscape');

  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(zonesOf(state)[0].cards[0].orientation, 'portrait');
});

test('ROTATE_CARD: follows move\'s authorization rule, not reveal\'s - a shared face-down card may be rotated by anyone', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId });
  assert.equal(zonesOf(rotated)[0].cards[0].orientation, 'landscape', 'unowned face-down cards are rotatable by anyone, per US-19');
});

test('ROTATE_CARD: a non-owner cannot rotate someone else\'s still-hidden private card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'ROTATE_CARD', playerId: 'p2', cardId }), /not authorized/);
  const rotated = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });
  assert.equal(zonesOf(rotated)[0].cards[0].orientation, 'landscape', 'but the owner can rotate their own');
});

test('ROTATE_CARD: orientation survives redaction, exactly like layout - arrangement, not identity', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });
  state = reduce(state, { type: 'ROTATE_CARD', playerId: 'p1', cardId });

  const otherView = viewFor(state, 'p2');
  const redactedCard = otherView.zones[0].cards[0];
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

  assert.equal(zonesOf(state)[0].cards.length, 0);
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
  assert.equal(zonesOf(state).length, 2);
  assert.equal(zonesOf(state)[1].name, 'Discard');
  assert.deepEqual(zonesOf(state)[1].cards, []);
  assert.notEqual(zonesOf(state)[1].id, zonesOf(state)[0].id);
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

test('CREATE_ZONE: rejects a kind that is not table-side (deck/hand) rather than creating an unreachable pile', () => {
  const state = createInitialState({}, () => 0.5);
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x', kind: 'deck' }));
  assert.throws(() => reduce(state, { type: 'CREATE_ZONE', name: 'x', kind: 'hand' }));
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

  assert.equal(zonesOf(state)[0].cards.length, 0, 'default zone untouched');
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

  assert.equal(zonesOf(state)[0].cards.length, 0);
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
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'no-such-card', toZoneId: zonesOf(state)[0].id }),
  );
});

// --- Personal per-seat zones (D17, US-27) ---

test('JOIN: auto-creates a personal zone owned by the joining player', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(zonesOf(state).length, 2, 'default zone + Alice\'s personal zone');
  const personalZone = zonesOf(state).find((z) => z.ownerId === 'p1');
  assert.ok(personalZone, 'a zone owned by p1 exists');
  assert.equal(personalZone.name, 'Alice');
  assert.deepEqual(personalZone.cards, []);
});

test('JOIN: each new player gets their own personal zone, existing ones untouched', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2', 'p3']);

  assert.equal(zonesOf(state).length, 4, 'default + 3 personal zones');
  for (const id of ['p1', 'p2', 'p3']) {
    assert.equal(zonesOf(state).filter((z) => z.ownerId === id).length, 1, `exactly one zone owned by ${id}`);
  }
  const defaultZone = zonesOf(state).find((z) => z.id === 'table');
  assert.equal(defaultZone.ownerId, null, 'the original default zone stays unowned');
});

test('JOIN: re-joining with the same playerId does not create a second personal zone', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const zoneCountAfterFirstJoin = zonesOf(state).length;

  // SET_CONNECTION then JOIN again is exactly what a reconnect looks like.
  state = reduce(state, { type: 'SET_CONNECTION', playerId: 'p1', connection: 'connecting' });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(zonesOf(state).length, zoneCountAfterFirstJoin, 'no duplicate personal zone on re-join');
  assert.equal(zonesOf(state).filter((z) => z.ownerId === 'p1').length, 1);
});

test('personal zones behave exactly like any other zone for PLAY/MOVE_CARD/REVEAL/PICKUP', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = handOf(state, 'p1')[0].id;
  const p1ZoneId = zonesOf(state).find((z) => z.ownerId === 'p1').id;
  const p2ZoneId = zonesOf(state).find((z) => z.ownerId === 'p2').id;

  // Play into your own personal zone, privately-owned face-down (D17: no
  // special-casing - same authorization/visibility rules as any zone).
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: p1ZoneId,
    visibility: 'private-facedown',
  });
  assert.equal(zonesOf(state).find((z) => z.id === p1ZoneId).cards[0].owner, 'p1');
  assert.throws(
    () => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }),
    'a non-owner cannot reveal a private card even sitting in the owner\'s own personal zone',
  );

  // "Put or take is open to all" (US-19) applies to personal zones too -
  // p2 can move p1's now-face-up card into p1's personal zone.
  state = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  state = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: p2ZoneId });
  assert.equal(zonesOf(state).find((z) => z.id === p2ZoneId).cards[0].id, cardId);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.equal(zonesOf(state).find((z) => z.id === p2ZoneId).cards.length, 0);
  assert.ok(handOf(state, 'p2').some((c) => c.id === cardId));
});

test('RESET: personal zones keep their ownerId, only cards clear', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const p1ZoneId = zonesOf(state).find((z) => z.ownerId === 'p1').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: handOf(state, 'p1')[0].id, zoneId: p1ZoneId });

  state = reduce(state, { type: 'RESET' });

  const p1Zone = zonesOf(state).find((z) => z.id === p1ZoneId);
  assert.equal(p1Zone.ownerId, 'p1', 'ownerId survives a reset, not just zone count/cards');
  assert.deepEqual(p1Zone.cards, []);
});

test('viewFor: personal zone ownerId is visible to every viewer', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'JOIN', playerId: 'p2', name: 'Bob' });

  const view = viewFor(state, 'p2');
  const aliceZone = view.zones.find((z) => z.name === 'Alice');
  assert.equal(aliceZone.ownerId, 'p1', 'ownerId is public info, needed to place the zone at the right seat');
});

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
  assert.equal(otherView.zones.length, zonesOf(state).length, 'zone count matches (default + 2 personal + Melds)');
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
  assert.equal(zonesOf(state)[0].cards.length, 1);

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
  const accountedFor =
    view.zones.length + Object.keys(view.otherHandCounts).length + 1 /* myHand */ + 1 /* deck */;
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
  assert.deepEqual([...kinds].sort(), ['deck', 'hand', 'zone'], 'all three pile types are exercised');
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

// --- Card stack/overlap layout (D21, US-32/US-33) ---

/** Deals p1 three cards and plays them all public into the default zone. */
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
  const tableBefore = zonesOf(state)[0].cards.map((c) => c.id);

  // A seeded rng that actually permutes, so "did it reorder" is testable.
  let n = 0;
  const next = reduce(state, { type: 'SHUFFLE_DECK', rng: () => ((n = (n * 9301 + 49297) % 233280), n / 233280) });

  assert.deepEqual([...deckOf(next)].map((c) => c.id).sort(), [...deckBefore].sort(),
    'same cards, no additions or losses');
  assert.notDeepEqual(deckOf(next).map((c) => c.id), deckBefore, 'order actually changed');
  assert.deepEqual(handOf(next, 'p1').map((c) => c.id), handBefore, 'hands untouched');
  assert.deepEqual(zonesOf(next)[0].cards.map((c) => c.id), tableBefore, 'zone cards untouched');
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
  assert.ok(piles.every((z) => z.cards.every((c) => c.faceUp === false && c.owner === null)),
    'split piles are face-down and unowned - a draw pile, hidden from everyone like the deck was');
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
  assert.equal(state.piles.filter((p) => p.kind === 'deck').length, 1,
    'exactly one deck pile must always exist - deckOf() is deliberately unguarded');
  assert.throws(() => reduce(state, { type: 'DRAW', playerId: 'p1' }), /deck is empty/,
    'an emptied deck must fail with its own clear message, not a TypeError from a missing pile');
});

test('SPLIT_DECK piles render as piles - every card after the first is stacked (D21 reuse)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 3 });
  const pile = zonesOf(state).find((z) => z.name === 'Pile 1');
  assert.ok(pile.cards.length > 2);
  assert.equal(pile.cards[0].layout, undefined, 'the bottom card has nothing to stack onto');
  assert.ok(pile.cards.slice(1).every((c) => c.layout === 'stack'),
    'the rest stack, so a 12-card pile draws as one pile rather than 12 loose backs');
});

test('viewFor: layout survives redaction - a face-down pile still reads as a pile (D21/D7)', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['p1', 'p2']);
  state = reduce(state, { type: 'SPLIT_DECK', pileCount: 2 });
  const pile = zonesOf(state).find((z) => z.name === 'Pile 1');

  const view = viewFor(state, 'p2');
  const viewPile = view.zones.find((z) => z.name === 'Pile 1');
  assert.ok(viewPile.cards.every((c) => c.faceDown), 'still fully redacted - no identity leaks');
  assert.ok(!viewPile.cards.some((c) => 'rank' in c), 'no rank/suit reaches a viewer');
  assert.deepEqual(
    viewPile.cards.map((c) => c.layout),
    pile.cards.map((c) => c.layout),
    'but arrangement is preserved, or every face-down pile renders un-stacked',
  );
});
