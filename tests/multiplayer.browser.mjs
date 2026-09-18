// US-118: a real host plus two real guests, driven by protocol actions
// through `tests/harness/multiplayer.mjs` - no clicks after the table
// is stood up. Closes the two-peer gap D60 left open.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:multiplayer` / `bobp make test-multiplayer`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, createTable } from './harness/multiplayer.mjs';

const PORT = 8219; // not 8211-8218 (every other browser test file)
const CARDS_PER_PLAYER = 5;

const fixture = { server: undefined, browser: undefined, table: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  fixture.table = await createTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl, players: 3, cardsPerPlayer: CARDS_PER_PLAYER,
  });
});

after(async () => {
  await fixture.table?.close();
  await fixture.browser?.close();
  await fixture.server?.close();
});

function handPileOf(view, ownerId) {
  return view.piles.find((pile) => pile.kind === 'hand' && pile.ownerId === ownerId);
}

test('every peer converges on the dealt table, each seeing its own hand', async () => {
  const { host, guests } = fixture.table;
  for (const peer of [host, ...guests]) {
    const view = await peer.waitForView((v, count) => v.myHand.length === count, CARDS_PER_PLAYER);
    assert.equal(view.players.length, 3, 'all three players are seated');
  }
});

test('a guest\'s action crosses the real data channel and every peer converges on it', async () => {
  const { host, guests } = fixture.table;
  const [alice] = guests;
  const aliceId = await alice.myId();
  const [card] = handPileOf(await alice.view(), aliceId).cards;

  await alice.act({ type: 'MOVE', pileableId: card.id, toPileId: 'table' });

  for (const peer of [host, ...guests]) {
    await peer.waitForView((v, cardId) => v.piles.find((pile) => pile.id === 'table')?.cards.some((c) => c.id === cardId), card.id);
  }
  assert.equal((await host.view()).otherHandCounts[aliceId], CARDS_PER_PLAYER - 1, 'the host\'s authoritative state moved the card');
});

test('a host action reaches every guest', async () => {
  const { host, guests } = fixture.table;
  const hostId = await host.myId();
  const [card] = handPileOf(await host.view(), hostId).cards;

  await host.act({ type: 'MOVE', pileableId: card.id, toPileId: 'table' });

  for (const guest of guests) {
    const view = await guest.waitForView((v, cardId) => v.piles.find((pile) => pile.id === 'table')?.cards.some((c) => c.id === cardId), card.id);
    assert.equal(view.otherHandCounts[hostId], CARDS_PER_PLAYER - 1, 'the guest sees the host\'s hand shrink by the moved card');
  }
});

test('another player\'s hand renders face-down in a guest\'s DOM, their own face-up (D84 rendering split)', async () => {
  const [alice, bob] = fixture.table.guests;
  const aliceId = await alice.myId();
  const bobId = await bob.myId();
  const aliceHand = handPileOf(await bob.view(), aliceId).id;
  const bobHand = handPileOf(await bob.view(), bobId).id;

  const seen = await bob.query([`[data-pile-id="${aliceHand}"] .card`, `[data-pile-id="${bobHand}"] .card`]);
  const aliceCards = seen[`[data-pile-id="${aliceHand}"] .card`];
  const bobCards = seen[`[data-pile-id="${bobHand}"] .card`];

  assert.ok(aliceCards.length > 0, 'Alice\'s hand is on Bob\'s screen at all');
  assert.ok(aliceCards.every((card) => card.classes.includes('card-back')), 'Bob sees only the backs of Alice\'s cards');
  assert.equal(bobCards.length, CARDS_PER_PLAYER);
  assert.ok(bobCards.every((card) => !card.classes.includes('card-back')), 'Bob sees their own cards\' faces');
});
