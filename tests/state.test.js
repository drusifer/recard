import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor } from '../src/state.js';

function withPlayers(state, ids) {
  return ids.reduce(
    (s, id) => reduce(s, { type: 'JOIN', playerId: id, name: id }),
    state,
  );
}

test('createInitialState: empty roster, full shuffled deck, one empty default zone', () => {
  const state = createInitialState({ numDecks: 1, jokers: 0 }, () => 0.5);
  assert.equal(state.deck.length, 52);
  assert.deepEqual(state.players, []);
  assert.equal(state.zones.length, 1);
  assert.deepEqual(state.zones[0].cards, []);
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

  assert.equal(state.hands.p1.length, 5);
  assert.equal(state.hands.p2.length, 5);
  assert.equal(state.hands.p3.length, 5);
  assert.equal(state.deck.length, 52 - 15);
});

test('PLAY: moves a card from a hand to the table', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 3 });
  const cardId = state.hands.p1[0].id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.zones[0].cards.length, 1);
  assert.equal(state.zones[0].cards[0].id, cardId);
  assert.ok(!state.hands.p1.some((c) => c.id === cardId));
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
  const deckSizeBefore = state.deck.length;
  const topCard = state.deck[0];

  state = reduce(state, { type: 'DRAW', playerId: 'p1' });

  assert.equal(state.deck.length, deckSizeBefore - 1);
  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.hands.p1[0].id, topCard.id);
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
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  const zoneCountBeforeReset = state.zones.length; // default + 2 personal (D17) + Discard

  state = reduce(state, { type: 'RESET' });

  assert.equal(state.deck.length, 52);
  assert.deepEqual(state.hands, {});
  assert.equal(
    state.zones.length,
    zoneCountBeforeReset,
    'zone structure (incl. personal and player-created zones) survives a reset',
  );
  assert.ok(state.zones.every((z) => z.cards.length === 0), 'every zone\'s cards clear on reset');
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
    !JSON.stringify(otherView).includes(state.hands.p1[0].rank),
    'a player\'s view must never contain another player\'s card data',
  );
});

test('viewFor: deck is exposed only as a count, table is fully public', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 2 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id });

  const view = viewFor(state, 'p1');
  assert.equal(typeof view.deckCount, 'number');
  assert.equal(view.deckCount, state.deck.length);
  assert.equal(view.zones[0].cards.length, 1);
  assert.equal(view.zones[0].cards[0].id, state.zones[0].cards[0].id);
});

// --- Middle-zone visibility (D7/D8, US-12/13/14) ---

test('PLAY: defaults to public visibility (owner null, faceUp true) — regression', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id });

  assert.equal(state.zones[0].cards[0].owner, null);
  assert.equal(state.zones[0].cards[0].faceUp, true);
});

test('PLAY: shared-facedown has no owner and is hidden from everyone, including the player', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.equal(state.zones[0].cards[0].owner, null);
  assert.equal(state.zones[0].cards[0].faceUp, false);
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
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.equal(state.zones[0].cards[0].owner, 'p1');
  assert.equal(state.zones[0].cards[0].faceUp, false);

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
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });

  assert.equal(state.zones[0].cards[0].faceUp, true);
  const anyView = viewFor(state, 'p2');
  assert.ok('rank' in anyView.zones[0].cards[0]);
});

test('REVEAL: only the owner can reveal a private face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }));

  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(revealed.zones[0].cards[0].faceUp, true);
});

test('REVEAL: revealing an already-face-up card is a no-op, not an error', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const result = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(result.zones[0].cards[0].faceUp, true);
});

test('PICKUP: moves a face-up middle card into the picking player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const p2HandSizeBefore = state.hands.p2.length;
  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });

  assert.equal(state.zones[0].cards.length, 0);
  assert.equal(state.hands.p2.length, p2HandSizeBefore + 1);
  assert.ok(state.hands.p2.some((c) => c.id === cardId));
});

test('PICKUP: throws when the card is face-down', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.throws(() => reduce(state, { type: 'PICKUP', playerId: 'p2', cardId }));
});

// --- Named zones (D12, US-19) ---

test('CREATE_ZONE: adds a new empty zone by name, alongside the default', () => {
  const state = reduce(createInitialState({}, () => 0.5), { type: 'CREATE_ZONE', name: 'Discard' });
  assert.equal(state.zones.length, 2);
  assert.equal(state.zones[1].name, 'Discard');
  assert.deepEqual(state.zones[1].cards, []);
  assert.notEqual(state.zones[1].id, state.zones[0].id);
});

test('PLAY: with zoneId targets that zone instead of the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  const discardZoneId = state.zones.find((z) => z.name === 'Discard').id;

  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: discardZoneId });

  assert.equal(state.zones[0].cards.length, 0, 'default zone untouched');
  const discardZone = state.zones.find((z) => z.id === discardZoneId);
  assert.equal(discardZone.cards.length, 1);
  assert.equal(discardZone.cards[0].id, cardId);
});

test('PLAY: throws for a zoneId that does not exist', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  assert.throws(() => reduce(state, { type: 'PLAY', playerId: 'p1', cardId, zoneId: 'no-such-zone' }));
});

test('REVEAL and PICKUP: find a card in any zone, not just the default', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  const discardZoneId = state.zones.find((z) => z.name === 'Discard').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: discardZoneId,
    visibility: 'shared-facedown',
  });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });
  assert.equal(state.zones.find((z) => z.id === discardZoneId).cards[0].faceUp, true);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.equal(state.zones.find((z) => z.id === discardZoneId).cards.length, 0);
  assert.ok(state.hands.p2.some((c) => c.id === cardId));
});

test('MOVE_CARD: relocates a visible card between zones, preserving its owner/faceUp', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  const meldsZoneId = state.zones.find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId }); // public, default zone

  state = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: meldsZoneId });

  assert.equal(state.zones[0].cards.length, 0);
  const meldsZone = state.zones.find((z) => z.id === meldsZoneId);
  assert.equal(meldsZone.cards.length, 1);
  assert.equal(meldsZone.cards[0].id, cardId);
  assert.equal(meldsZone.cards[0].faceUp, true, 'moving does not reveal/hide - it was already public');
});

test('MOVE_CARD: only the owner can move their own still-hidden private card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Melds' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  const meldsZoneId = state.zones.find((z) => z.name === 'Melds').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: meldsZoneId }));

  const moved = reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toZoneId: meldsZoneId });
  assert.equal(moved.zones.find((z) => z.id === meldsZoneId).cards[0].id, cardId);
});

test('MOVE_CARD: throws for an unknown destination zone or an unknown card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId, toZoneId: 'no-such-zone' }),
  );
  assert.throws(() =>
    reduce(state, { type: 'MOVE_CARD', playerId: 'p1', cardId: 'no-such-card', toZoneId: state.zones[0].id }),
  );
});

// --- Personal per-seat zones (D17, US-27) ---

test('JOIN: auto-creates a personal zone owned by the joining player', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(state.zones.length, 2, 'default zone + Alice\'s personal zone');
  const personalZone = state.zones.find((z) => z.ownerId === 'p1');
  assert.ok(personalZone, 'a zone owned by p1 exists');
  assert.equal(personalZone.name, 'Alice');
  assert.deepEqual(personalZone.cards, []);
});

test('JOIN: each new player gets their own personal zone, existing ones untouched', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2', 'p3']);

  assert.equal(state.zones.length, 4, 'default + 3 personal zones');
  for (const id of ['p1', 'p2', 'p3']) {
    assert.equal(state.zones.filter((z) => z.ownerId === id).length, 1, `exactly one zone owned by ${id}`);
  }
  const defaultZone = state.zones.find((z) => z.id === 'table');
  assert.equal(defaultZone.ownerId, null, 'the original default zone stays unowned');
});

test('JOIN: re-joining with the same playerId does not create a second personal zone', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const zoneCountAfterFirstJoin = state.zones.length;

  // SET_CONNECTION then JOIN again is exactly what a reconnect looks like.
  state = reduce(state, { type: 'SET_CONNECTION', playerId: 'p1', connection: 'connecting' });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });

  assert.equal(state.zones.length, zoneCountAfterFirstJoin, 'no duplicate personal zone on re-join');
  assert.equal(state.zones.filter((z) => z.ownerId === 'p1').length, 1);
});

test('personal zones behave exactly like any other zone for PLAY/MOVE_CARD/REVEAL/PICKUP', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  const p1ZoneId = state.zones.find((z) => z.ownerId === 'p1').id;
  const p2ZoneId = state.zones.find((z) => z.ownerId === 'p2').id;

  // Play into your own personal zone, privately-owned face-down (D17: no
  // special-casing - same authorization/visibility rules as any zone).
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: p1ZoneId,
    visibility: 'private-facedown',
  });
  assert.equal(state.zones.find((z) => z.id === p1ZoneId).cards[0].owner, 'p1');
  assert.throws(
    () => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }),
    'a non-owner cannot reveal a private card even sitting in the owner\'s own personal zone',
  );

  // "Put or take is open to all" (US-19) applies to personal zones too -
  // p2 can move p1's now-face-up card into p1's personal zone.
  state = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  state = reduce(state, { type: 'MOVE_CARD', playerId: 'p2', cardId, toZoneId: p2ZoneId });
  assert.equal(state.zones.find((z) => z.id === p2ZoneId).cards[0].id, cardId);

  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });
  assert.equal(state.zones.find((z) => z.id === p2ZoneId).cards.length, 0);
  assert.ok(state.hands.p2.some((c) => c.id === cardId));
});

test('RESET: personal zones keep their ownerId, only cards clear', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const p1ZoneId = state.zones.find((z) => z.ownerId === 'p1').id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id, zoneId: p1ZoneId });

  state = reduce(state, { type: 'RESET' });

  const p1Zone = state.zones.find((z) => z.id === p1ZoneId);
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
  const cardId = state.hands.p1[0].id;
  const meldsZoneId = state.zones.find((z) => z.name === 'Melds').id;
  state = reduce(state, {
    type: 'PLAY',
    playerId: 'p1',
    cardId,
    zoneId: meldsZoneId,
    visibility: 'private-facedown',
  });

  const otherView = viewFor(state, 'p2');
  assert.equal(otherView.zones.length, state.zones.length, 'zone count matches (default + 2 personal + Melds)');
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
  const deckSizeAfterDeal = state.deck.length;

  state = reduce(state, { type: 'DEAL_MORE', cardsPerPlayer: 2 });

  assert.equal(state.hands.p1.length, 5);
  assert.equal(state.hands.p2.length, 5);
  assert.equal(state.deck.length, deckSizeAfterDeal - 4);
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
  assert.equal(state.hands.solo.length, 7);
  assert.equal(state.deck.length, 45);

  const cardId = state.hands.solo[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'solo', cardId });
  assert.equal(state.hands.solo.length, 6);
  assert.equal(state.zones[0].cards.length, 1);

  state = reduce(state, { type: 'DRAW', playerId: 'solo' });
  assert.equal(state.hands.solo.length, 7);

  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'solo', delta: 1 });
  assert.equal(state.scores.solo, 1);

  state = reduce(state, { type: 'RESET' });
  assert.equal(Object.keys(state.hands).length, 0);
  assert.equal(state.deck.length, 52);
  assert.equal(state.scores.solo, 1, 'score survives a deck reset, per US-16');

  const view = viewFor(state, 'solo');
  assert.equal(view.players.length, 1);
});
