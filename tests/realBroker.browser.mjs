// D172: every other multiplayer-shaped suite runs over the LOCAL
// signaling server by default (`tools/localPeerServer.mjs`) - fast, and
// immune to the public broker's own occasional flakiness. This is the
// one suite that still proves the real public PeerJS broker itself
// isn't broken: `realBroker: true` opts this specific table back out of
// the local default. Deliberately the smallest real check (host + one
// guest, one card moved) - it exists to catch "the public broker is
// unreachable/down/protocol-mismatched", not to re-cover ground
// `multiplayer.browser.mjs` already covers over the local server.
//
// NOT part of `npm test` - needs a browser and the real internet-facing
// PeerJS broker. `npm run test:realbroker` / `bobp make test-realbroker`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, createTable, closeLocalPeerServer } from './harness/multiplayer.mjs';

const PORT = 8229; // not 8211-8228 (every other browser test file)
const CARDS_PER_PLAYER = 5;

const fixture = { server: undefined, browser: undefined, table: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  // Explicit preset, not the implicit (War) default - see
  // cardMotion.browser.mjs's own comment on this same fix (D172 finding).
  fixture.table = await createTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'Gin Rummy', players: 2, cardsPerPlayer: CARDS_PER_PLAYER, realBroker: true,
  });
});

after(async () => {
  await fixture.table?.close();
  await fixture.browser?.close();
  await fixture.server?.close();
  await closeLocalPeerServer();
});

test('real public PeerJS broker: host and guest converge on a dealt table and a moved card', async () => {
  const { host, guests } = fixture.table;
  const [guest] = guests;
  for (const peer of [host, guest]) {
    const view = await peer.waitForView((v, count) => v.myHand.length === count, CARDS_PER_PLAYER);
    assert.equal(view.players.length, 2, 'both players are seated');
  }

  const guestId = await guest.myId();
  const [card] = (await guest.view()).piles.find((pile) => pile.kind === 'hand' && pile.ownerId === guestId).cards;
  await guest.act({ type: 'MOVE', pileableId: card.id, toPileId: 'table' });

  await host.waitForView((v, cardId) => v.piles.find((pile) => pile.id === 'table')?.cards.some((c) => c.id === cardId), card.id);
  assert.equal((await host.view()).otherHandCounts[guestId], CARDS_PER_PLAYER - 1, 'the move crossed the real public broker\'s data channel');
});
