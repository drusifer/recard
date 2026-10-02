// US-146/D168: the remote cursor broadcasts which PILE the pointer is
// over, not raw coordinates - a receiver resolves that id against its
// OWN DOM, so this only proves anything real when checked across two
// genuinely separate browser pages (the host's and a guest's), each
// with its own independent rendering. No live human watches this - the
// user's own verification answer was a dedicated harness test player
// (`HarnessPeer.pointerDown`/`hoverPile`/`pointerUp`, real mouse events,
// not a synthetic dispatch) driving two real peers over the real
// protocol, same as every other `tests/harness/multiplayer.mjs` suite.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:remotecursor` / `bobp make test-remotecursor`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, createTable, closeLocalPeerServer } from './harness/multiplayer.mjs';

const PORT = 8232; // not 8211-8231 (every other browser test file)
const CARDS_PER_PLAYER = 5;
const DECK_PILE_ID = 'deck'; // src/state.js's own constant - stable across every preset

const fixture = { server: undefined, browser: undefined, table: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  fixture.table = await createTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl, players: 2, cardsPerPlayer: CARDS_PER_PLAYER,
  });
});

after(async () => {
  await fixture.table?.close();
  await fixture.browser?.close();
  await fixture.server?.close();
  await closeLocalPeerServer();
});

async function remoteCursorBox(viewerPeer, ownerId) {
  return viewerPeer.page.locator(`[data-cursor-id="${ownerId}"]`).boundingBox();
}

test('hovering a pile glides the OTHER peer\'s remote cursor onto that pile\'s own rendering, not a mirrored coordinate', async () => {
  const { host, guests } = fixture.table;
  const guest = guests[0];
  const hostId = await host.myId();

  await host.pointerDown();
  try {
    await host.hoverPile(DECK_PILE_ID);
    // The glide transition (D168: 0.2s) needs to settle before the
    // cursor's own boundingBox reflects its final position.
    await guest.page.waitForFunction((id) => document.querySelector(`[data-cursor-id="${CSS.escape(id)}"]`) !== null, hostId, { timeout: 5000 });
    await guest.page.waitForTimeout(300);

    const [cursorBox, pileBox] = await Promise.all([
      remoteCursorBox(guest, hostId),
      guest.page.locator(`[data-pile-id="${DECK_PILE_ID}"]`).boundingBox(),
    ]);
    // Real cross-client proof: the GUEST's own deck panel sits wherever
    // the GUEST's own layout puts it - not wherever the host's screen
    // happened to render it. The cursor must land there, on the guest's
    // own screen, not at some coordinate copied from the host's.
    assert.ok(Math.abs(cursorBox.x - pileBox.x) < pileBox.width, 'cursor x lands within the guest\'s own deck panel, not an arbitrary mirrored point');
    assert.ok(Math.abs(cursorBox.y - pileBox.y) < pileBox.height, 'cursor y lands within the guest\'s own deck panel');
  } finally {
    await host.pointerUp();
  }
});

test('moving off every pile removes the remote cursor - nothing correct to glide to', async () => {
  const { host, guests } = fixture.table;
  const guest = guests[0];
  const hostId = await host.myId();

  await host.pointerDown();
  try {
    await host.hoverPile(DECK_PILE_ID);
    await guest.page.waitForFunction((id) => document.querySelector(`[data-cursor-id="${CSS.escape(id)}"]`) !== null, hostId, { timeout: 5000 });

    // Move the real mouse to the corner of the viewport - empty table,
    // no pile underneath.
    await host.page.mouse.move(2, 2);
    await guest.page.waitForFunction((id) => document.querySelector(`[data-cursor-id="${CSS.escape(id)}"]`) === null, hostId, { timeout: 5000 });
    assert.equal(await guest.page.locator(`[data-cursor-id="${hostId}"]`).count(), 0);
  } finally {
    await host.pointerUp();
  }
});
