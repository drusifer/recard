// US-123/D144: moved cards travel and touched cards glow, at a real
// table - including a move made by SOMEONE ELSE, which is the case the
// user asked for ("easy to see which cards have just been moved").
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:motion` / `bobp make test-motion`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, createTable } from './harness/multiplayer.mjs';

const PORT = 8224; // not 8211-8223 (every other browser test file)
const CARDS = 5;
const fixture = { server: undefined, browser: undefined, table: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  // This suite is ABOUT the motion, so it keeps it (every other browser
  // suite runs with reduced motion forced on - see `launchChromium`).
  fixture.browser = await launchChromium({ motion: true });
  fixture.table = await createTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, players: 2, cardsPerPlayer: CARDS });
});

after(async () => {
  await fixture.table?.close();
  await fixture.browser?.close();
  await fixture.server?.close();
});

const handOf = (view, ownerId) => view.piles.find((pile) => pile.kind === 'hand' && pile.ownerId === ownerId);
const glowing = (peer) => peer.page.$$eval('.just-touched', (nodes) => nodes.map((n) => n.dataset.pileableId));

test('a deal glows on every screen, all its cards as one touch', async () => {
  const { host, guests } = fixture.table;
  for (const peer of [host, ...guests]) {
    await peer.page.waitForFunction((count) => document.querySelectorAll('.just-touched').length >= count, CARDS);
  }
  const lit = await glowing(host);
  assert.ok(lit.length >= CARDS, `the deal lit ${lit.length} cards at once`);
});

test('the glow fades on its own, with nothing to click', async () => {
  const { host } = fixture.table;
  await host.page.waitForFunction(() => document.querySelectorAll('.just-touched').length === 0, undefined, { timeout: 5000 });
  assert.equal(await host.page.$$eval('.just-touched', (lit) => lit.length), 0);
});

test("someone else's move glows on my screen, in their colour, and the card travels", async () => {
  const { host, guests } = fixture.table;
  const [alice] = guests;
  const aliceId = await alice.myId();
  const [card] = handOf(await alice.view(), aliceId).cards;

  await alice.act({ type: 'MOVE', pileableId: card.id, toPileId: 'table' });

  // the HOST (who did not move it) sees it lit, in Alice's own colour
  await host.page.waitForFunction((id) => document.querySelector(`[data-pileable-id="${CSS.escape(id)}"]`)?.classList.contains('just-touched'), card.id);
  const color = await host.page.$eval(`[data-pileable-id="${card.id}"]`, (element) => element.style.getPropertyValue('--touch-color'));
  assert.match(color, /^#[0-9a-f]{6}$/i, 'tinted by who moved it');

  const hostColorForAlice = await host.page.evaluate(async (id) => {
    const { colorForPlayer } = await import('/src/playerColors.js');
    return colorForPlayer(globalThis.__recardHarness.view().players, id);
  }, aliceId);
  assert.equal(color, hostColorForAlice, "it is the mover's colour, not the viewer's");

  // and every peer agrees on the colour, because it comes off the roster
  const aliceSeesColor = await alice.page.$eval(`[data-pileable-id="${card.id}"]`, (element) => element.style.getPropertyValue('--touch-color'));
  assert.equal(aliceSeesColor, color);
});

test('a face-down card glows as a back - the animation never turns it over (AC6)', async () => {
  const { host, guests } = fixture.table;
  const [alice] = guests;
  const aliceId = await alice.myId();
  const [card] = handOf(await alice.view(), aliceId).cards;

  // Rearranging Alice's own hand is a touch; the host sees her cards as
  // backs and must keep seeing backs while they glow. (Card IDS already
  // travel in every view, D84 - what privacy means here is the FACE.)
  await alice.act({ type: 'SORT_PILE', pileId: `hand:${aliceId}`, by: 'rank' });
  await host.page.waitForFunction((id) => document.querySelector(`[data-pileable-id="${CSS.escape(id)}"]`), card.id);
  const asSeenByHost = await host.page.$eval(`[data-pileable-id="${card.id}"]`, (element) => ({
    back: element.classList.contains('card-back') || !!element.querySelector('.card-back'),
    text: element.textContent,
  }));
  assert.equal(asSeenByHost.back, true, 'still a back');
  // A back renders as the card-back glyph and nothing else - no rank,
  // no suit, glowing or not.
  assert.equal(asSeenByHost.text.trim(), '\u{1F0A0}', 'the back glyph, never a face');
});
