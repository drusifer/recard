// US-142/D164: the guest's real reconnect flow, live. The host's own
// peer is torn down for real (`__recardHarness.disconnect`, a real
// `session.close()`/`peer.destroy()` - the same "host really gone" a
// crashed tab produces; closing the host's whole browser CONTEXT instead
// was tried first and does not reliably surface as a WebRTC disconnect
// in this environment, found by watching a 30s window with nothing
// happening - see D164). `RECONNECT_DELAYS_MS`/`ATTEMPT_TIMEOUT_MS`
// (main.js) run UNCHANGED - production's real schedule, not a test-only
// substitute - compressed by overriding the CLOCK (`setReconnectClock`),
// so this runs in well under the real ~51s worst case.
// NOT part of `npm test` - needs a browser. `npm run test:reconnect`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable, closeLocalPeerServer } from './harness/multiplayer.mjs';

const PORT = 8230; // not 8211-8229 (every other browser test file)
const fixture = { server: undefined, browser: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
});

after(async () => {
  await fixture.browser?.close();
  await fixture.server?.close();
  await closeLocalPeerServer();
});

/**
 * Every real wait the reconnect flow makes (the inter-attempt delay,
 * the per-attempt timeout) capped at `capMs` - the real `setTimeout`,
 * just never asked to wait long. `RECONNECT_DELAYS_MS`/
 * `ATTEMPT_TIMEOUT_MS` themselves are untouched (main.js).
 */
async function useFastReconnectClock(page, capMs = 30) {
  await page.evaluate((cap) => {
    globalThis.__recardHarness.setReconnectClock({
      setTimeout: (function_, ms) => setTimeout(function_, Math.min(ms, cap)),
      clearTimeout: (id) => clearTimeout(id),
    });
  }, capMs);
}

const bannerText = (page) => page.locator('#banner').textContent();
const loseHost = (table) => table.host.page.evaluate(() => globalThis.__recardHarness.disconnect());

/**
 * Starts recording every distinct banner text from here on, in order -
 * not just the final one. What proves the retry budget is exactly 8, not
 * merely "eventually gives up" (an off-by-N bug in which attempt reads
 * which delay would still give up eventually, just at the wrong count -
 * caught by mutation-testing the delay-table index).
 */
async function watchBanner(page) {
  await page.evaluate(() => {
    const banner = document.querySelector('#banner');
    banner.dataset.history = '[]';
    const observer = new globalThis.MutationObserver(() => {
      banner.dataset.history = JSON.stringify([...JSON.parse(banner.dataset.history), banner.textContent]);
    });
    observer.observe(banner, { childList: true, characterData: true, subtree: true });
  });
  return () => page.evaluate(() => JSON.parse(document.querySelector('#banner').dataset.history));
}

async function seatedGuest() {
  const table = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl });
  const guest = await joinTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: table.code, name: 'Guest' });
  await guest.peer.waitForSeat();
  return { table, guest };
}

test('losing the host shows a reconnecting banner, first attempt counted', async () => {
  const { table, guest } = await seatedGuest();
  await useFastReconnectClock(guest.peer.page);

  await loseHost(table);

  await guest.peer.page.waitForFunction(
    () => document.querySelector('#banner')?.textContent.includes('reconnecting'),
    undefined, { timeout: 5000 },
  );
  assert.match(await bannerText(guest.peer.page), /Lost the host.*reconnecting.*attempt 1 of 8/u);

  await guest.close();
  await table.close();
});

test('exhausting the retry budget says so plainly, and stops trying - at exactly 8 attempts', async () => {
  const { table, guest } = await seatedGuest();
  await useFastReconnectClock(guest.peer.page, 15); // capped small on every wait - no host ever comes back
  const history = await watchBanner(guest.peer.page);

  await loseHost(table);

  await guest.peer.page.waitForFunction(
    () => document.querySelector('#banner')?.textContent.includes('Could not reconnect'),
    undefined, { timeout: 5000 },
  );
  assert.equal(await bannerText(guest.peer.page), 'Could not reconnect to the host. Reload to try again.');
  const attemptsShown = (await history()).filter((text) => text.startsWith('Lost the host'));
  assert.deepEqual(attemptsShown, Array.from({ length: 8 }, (_, index) => `Lost the host \u{2014} reconnecting\u{2026} (attempt ${index + 1} of 8)`));

  await guest.close();
  await table.close();
});
