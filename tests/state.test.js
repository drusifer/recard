import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, viewFor } from '../src/state.js';

function withPlayers(state, ids) {
  return ids.reduce(
    (s, id) => reduce(s, { type: 'JOIN', playerId: id, name: id }),
    state,
  );
}

test('createInitialState: empty roster, full shuffled deck, no hands/table', () => {
  const state = createInitialState({ numDecks: 1, jokers: 0 }, () => 0.5);
  assert.equal(state.deck.length, 52);
  assert.deepEqual(state.players, []);
  assert.deepEqual(state.table, []);
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
  assert.equal(state.table.length, 1);
  assert.equal(state.table[0].id, cardId);
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

test('RESET: reshuffles the deck and clears hands/table, keeps roster', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id });

  state = reduce(state, { type: 'RESET' });

  assert.equal(state.deck.length, 52);
  assert.deepEqual(state.hands, {});
  assert.deepEqual(state.table, []);
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
  assert.equal(view.table.length, 1);
  assert.equal(view.table[0].id, state.table[0].id);
});

// --- Middle-zone visibility (D7/D8, US-12/13/14) ---

test('PLAY: defaults to public visibility (owner null, faceUp true) — regression', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId: state.hands.p1[0].id });

  assert.equal(state.table[0].owner, null);
  assert.equal(state.table[0].faceUp, true);
});

test('PLAY: shared-facedown has no owner and is hidden from everyone, including the player', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  assert.equal(state.table[0].owner, null);
  assert.equal(state.table[0].faceUp, false);
  const p1View = viewFor(state, 'p1');
  const p2View = viewFor(state, 'p2');
  assert.equal(p1View.table[0].faceDown, true);
  assert.equal(p1View.table[0].owner, null);
  assert.ok(!('rank' in p1View.table[0]), 'even the player who played it cannot see a shared face-down card');
  assert.ok(!('rank' in p2View.table[0]));
});

test('PLAY: private-facedown is owned by the player and visible only to them', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.equal(state.table[0].owner, 'p1');
  assert.equal(state.table[0].faceUp, false);

  const ownerView = viewFor(state, 'p1');
  const otherView = viewFor(state, 'p2');
  assert.equal(ownerView.table[0].id, cardId);
  assert.ok('rank' in ownerView.table[0], 'owner can see their own private middle card');
  assert.equal(otherView.table[0].faceDown, true);
  assert.equal(otherView.table[0].owner, 'p1', 'ownership stays visible even when face-down');
  assert.ok(!('rank' in otherView.table[0]), 'non-owner cannot see a private middle card');
});

test('REVEAL: any player can reveal a shared face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'shared-facedown' });

  state = reduce(state, { type: 'REVEAL', playerId: 'p2', cardId });

  assert.equal(state.table[0].faceUp, true);
  const anyView = viewFor(state, 'p2');
  assert.ok('rank' in anyView.table[0]);
});

test('REVEAL: only the owner can reveal a private face-down card', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId, visibility: 'private-facedown' });

  assert.throws(() => reduce(state, { type: 'REVEAL', playerId: 'p2', cardId }));

  const revealed = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(revealed.table[0].faceUp, true);
});

test('REVEAL: revealing an already-face-up card is a no-op, not an error', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const result = reduce(state, { type: 'REVEAL', playerId: 'p1', cardId });
  assert.equal(result.table[0].faceUp, true);
});

test('PICKUP: moves a face-up middle card into the picking player\'s hand', () => {
  let state = createInitialState({}, () => 0.5);
  state = withPlayers(state, ['p1', 'p2']);
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 1 });
  const cardId = state.hands.p1[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'p1', cardId });

  const p2HandSizeBefore = state.hands.p2.length;
  state = reduce(state, { type: 'PICKUP', playerId: 'p2', cardId });

  assert.equal(state.table.length, 0);
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

test('solo play: a single player can deal, play, draw, and reset a full round alone', () => {
  let state = withPlayers(createInitialState({}, () => 0.5), ['solo']);
  assert.equal(state.players.length, 1);

  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 7 });
  assert.equal(state.hands.solo.length, 7);
  assert.equal(state.deck.length, 45);

  const cardId = state.hands.solo[0].id;
  state = reduce(state, { type: 'PLAY', playerId: 'solo', cardId });
  assert.equal(state.hands.solo.length, 6);
  assert.equal(state.table.length, 1);

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
