import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduce, handsOf, zonesOf, deckOf } from '../src/state.js';
import { SNAPSHOT_VERSION, snapshot, save, load, clear, expectedReturners, STORAGE_KEY } from '../src/persistence.js';

/** A stand-in for localStorage: same three methods, no browser. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _raw: () => map.get(STORAGE_KEY),
  };
}

function playedGame() {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'h', name: 'Host' });
  state = reduce(state, { type: 'JOIN', playerId: 'g', name: 'Guest' });
  state = reduce(state, { type: 'DEAL', cardsPerPlayer: 5 });
  state = reduce(state, { type: 'CREATE_ZONE', name: 'Discard' });
  state = reduce(state, { type: 'ADJUST_SCORE', targetPlayerId: 'g', delta: 1 });
  state = reduce(state, { type: 'PLAY', playerId: 'h', cardId: state.piles.find((p) => p.kind === 'hand').cards[0].id });
  return state;
}

test('a snapshot keeps the table, scores and roster', () => {
  const state = playedGame();
  const snap = snapshot(state, 'ABC123');
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.equal(snap.code, 'ABC123');
  assert.equal(typeof snap.savedAt, 'number');
  assert.equal(snap.players.length, 2);
  assert.equal(snap.scores.g, 1);
  assert.equal(zonesOf(snap).length, zonesOf(state).length, 'every zone survives');
});

// SUPERSEDED BY D31 (Sprint 11). This test used to assert the exact
// opposite - that hand cards never appear in storage - and it was correct
// for D26, whose reason was that hands were keyed by an unstable guest id.
// D27 made the identity stable and client-held, so the premise expired and
// D26 was reversed on the record. Kept as an inversion rather than deleted,
// because a privacy property that changed direction should be visible in
// the suite, not silently absent from it.
test('hands ARE written to storage now, and come back to their owner (D31, reverses D26)', () => {
  const state = playedGame();
  const handCards = state.piles.filter((p) => p.kind === 'hand').flatMap((p) => p.cards);
  assert.ok(handCards.length > 0, 'the fixture actually has cards in hands');

  const storage = fakeStorage();
  save(storage, state, 'ABC123');
  const raw = storage._raw();

  // Asserted on the serialized text, exactly as the D26 version was: the
  // claim is about what lands on disk, so it is checked on the bytes.
  for (const card of handCards) {
    assert.ok(raw.includes(card.id),
      `hand card ${card.id} must now be persisted, or a restore returns an empty hand`);
  }
  const restoredHands = handsOf(load(storage).state);
  const ownerIds = state.piles.filter((p) => p.kind === 'hand').map((p) => p.ownerId);
  for (const owner of ownerIds) {
    assert.ok(restoredHands[owner]?.length > 0,
      `${owner}'s hand must come back keyed by their playerKey, not by name`);
  }
});

test('the deck IS saved in full order, which is secret but never leaves the host (D26)', () => {
  const state = playedGame();
  const storage = fakeStorage();
  save(storage, state, 'ABC123');
  const restored = load(storage).state;
  assert.deepEqual(deckOf(restored).map((c) => c.id), deckOf(state).map((c) => c.id),
    'deck order must round-trip, or a restored game deals differently than it would have');
});

test('load round-trips a saved game', () => {
  const state = playedGame();
  const storage = fakeStorage();
  save(storage, state, 'ABC123');
  const result = load(storage);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'ABC123');
  assert.equal(result.state.scores.g, 1);
  assert.ok(result.ageMs >= 0);
});

// --- D46: GameConfig round-trips ---

test('D46: gameConfig round-trips through save/load', () => {
  const state = createInitialState({}, () => 0.5, { allowsPlayerZones: false });
  const storage = fakeStorage();
  save(storage, state, 'ABC123');
  assert.deepEqual(load(storage).state.gameConfig, { allowsPlayerZones: false });
});

test('D46: a snapshot from before this field existed restores fine, with no gameConfig at all - not a version bump, additive only', () => {
  const preD46 = JSON.stringify({ version: SNAPSHOT_VERSION, piles: [], players: [] });
  const storage = fakeStorage({ [STORAGE_KEY]: preD46 });
  const result = load(storage);
  assert.equal(result.ok, true, 'must NOT be refused the way a real version bump would refuse it');
  assert.equal(result.state.gameConfig, undefined);
});

test('nothing saved yet is not an error, just nothing to offer', () => {
  const result = load(fakeStorage());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
});

test('a corrupt blob is discarded, never half-restored', () => {
  const result = load(fakeStorage({ [STORAGE_KEY]: '{not json' }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'corrupt');
});

test('a snapshot from a different version is discarded, not migrated blindly', () => {
  const stale = JSON.stringify({ version: SNAPSHOT_VERSION + 99, piles: [], players: [] });
  const result = load(fakeStorage({ [STORAGE_KEY]: stale }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'version');
});

test('a blob that parses but is missing piles is treated as corrupt', () => {
  const bad = JSON.stringify({ version: SNAPSHOT_VERSION, players: [] });
  assert.equal(load(fakeStorage({ [STORAGE_KEY]: bad })).reason, 'corrupt');
});

test('clear removes the save', () => {
  const storage = fakeStorage();
  save(storage, playedGame(), 'ABC123');
  assert.equal(load(storage).ok, true);
  clear(storage);
  assert.equal(load(storage).ok, false);
});

test('a storage that throws (private mode, quota) never breaks the game', () => {
  const hostile = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('denied'); },
  };
  assert.doesNotThrow(() => save(hostile, playedGame(), 'ABC123'));
  assert.equal(load(hostile).ok, false, 'and offers nothing rather than crashing on load');
  assert.doesNotThrow(() => clear(hostile));
});

// --- Sprint 11 (US-43/US-45, D31/D33) ---------------------------------

test('D31: hands ARE saved now - D26 stripped them because ids were unstable, and D27 fixed that', () => {
  const state = {
    deckConfig: { numDecks: 1, jokers: 0 },
    players: [{ id: 'key-a', name: 'Alice', connection: 'connected' }],
    piles: [
      { id: 'deck', kind: 'deck', cards: [{ id: 'c1' }] },
      { id: 'hand:key-a', kind: 'hand', ownerId: 'key-a', cards: [{ id: 'ace-spades-0' }] },
    ],
    scores: {}, passed: {},
  };
  const written = JSON.stringify(snapshot(state, 'CODE', 'Alice'));
  // Asserted on the serialized STRING, same as the Sprint 7 test that
  // asserted the opposite: the claim is about what lands on disk.
  assert.match(written, /ace-spades-0/, 'the hand must now be written');
  const hands = snapshot(state, 'CODE', 'Alice').piles.filter((p) => p.kind === 'hand');
  assert.equal(hands.length, 1);
  assert.equal(hands[0].ownerId, 'key-a', 'a restored hand is found by playerKey, never by name');
});

test('D31: the snapshot version is bumped, so pre-D31 blobs are discarded not half-restored', () => {
  // An old blob has no hands. Restoring it as if it did would silently
  // give everyone an empty hand and look like a successful restore.
  assert.ok(SNAPSHOT_VERSION >= 2, `expected a bumped version, got ${SNAPSHOT_VERSION}`);
  const storage = new Map();
  storage.setItem = storage.set; storage.getItem = (k) => storage.get(k) ?? null;
  storage.removeItem = storage.delete;
  storage.setItem('recard:host-state:v1', JSON.stringify({ version: 1, piles: [], players: [] }));
  assert.equal(load(storage).ok, false, 'a version-1 blob must be refused');
  assert.equal(load(storage).reason, 'version');
});

test('D33: the wait list is only players who were CONNECTED when the game was saved', () => {
  // Smith's Gate 1 blocker. Someone who quit an hour before the host
  // reloaded is still in `state.players`; waiting for them waits forever
  // and the auto-resume never fires.
  const snap = {
    players: [
      { id: 'host-key', name: 'Alice', connection: 'connected' },
      { id: 'key-b', name: 'Bob', connection: 'connected' },
      { id: 'key-c', name: 'Cara', connection: 'disconnected' },
    ],
  };
  assert.deepEqual(expectedReturners(snap, 'host-key').map((p) => p.name), ['Bob'],
    'Cara had already left, and the host is not waiting for itself');
});

test('D33: a snapshot with nobody else connected expects no returners, so resume is immediate', () => {
  const snap = { players: [{ id: 'host-key', name: 'Alice', connection: 'connected' }] };
  assert.deepEqual(expectedReturners(snap, 'host-key'), []);
});

test('D33: expectedReturners survives a malformed snapshot rather than throwing', () => {
  // `load` already fails safe on corrupt blobs; this must not become the
  // one path that crashes a restore.
  for (const bad of [null, {}, { players: null }, { players: 'nope' }]) {
    assert.deepEqual(expectedReturners(bad, 'host-key'), [], `${JSON.stringify(bad)} must yield []`);
  }
});
