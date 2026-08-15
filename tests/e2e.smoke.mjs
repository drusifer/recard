// End-to-end smoke test: drives two real browser contexts against a real
// PeerJS connection (the actual public broker, actual WebRTC) to verify
// the full host/join/deal/play/draw/middle-zone/score/disconnect flow.
// Not run as part of `npm test` (needs Playwright + a browser, slower) -
// run explicitly with `npm run test:e2e`. See ARCHITECTURE.md Testing
// Strategy. (Solo/1-player play is covered by tests/state.test.js instead
// - it's pure state-layer logic with no P2P surface, so a second e2e pass
// over it wouldn't add coverage, just runtime.)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

const errors = [];
function watchConsole(page, label) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// Falls back to a system Chromium/Chrome install if Playwright's own
// bundled browser build isn't downloaded/version-matched in this
// environment (run `npx playwright install chromium` to fix that instead).
const SYSTEM_CHROMIUM_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];
async function launchChromium() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (err) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: ['--no-sandbox'] });
      } catch {
        // try the next candidate
      }
    }
    throw err;
  }
}
const browser = await launchChromium();
try {
  const host = await (await browser.newContext()).newPage();
  const join = await (await browser.newContext()).newPage();
  watchConsole(host, 'HOST');
  watchConsole(join, 'JOIN');

  await host.goto(BASE);
  await host.click('#show-host');
  await host.fill('#host-name', 'Alice');
  await host.click('#create-table');
  await host.waitForSelector('#host-share:not([hidden])', { timeout: 15000 });
  const code = (await host.locator('.share-code').textContent()).trim();

  await join.goto(`${BASE}/?join=${encodeURIComponent(code)}`);
  await join.fill('#join-name', 'Bob');
  await join.click('#join-btn');
  await join.waitForFunction(
    () => document.getElementById('join-status').textContent.includes('Connected'),
    undefined,
    { timeout: 15000 },
  );

  await host.waitForFunction(
    () => document.querySelectorAll('#host-roster li.roster-player').length === 2,
    undefined,
    { timeout: 15000 },
  );

  await host.fill('#cards-per-player', '5');
  await host.click('#deal-btn');
  await host.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 5, undefined, {
    timeout: 10000,
  });
  await join.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 5, undefined, {
    timeout: 10000,
  });

  const hostCardId = await host.locator('#hand-area .card').first().getAttribute('data-card-id');
  await host.locator('#hand-area .card').first().click();
  await join.waitForFunction(
    (id) => document.querySelector(`#table-area .card[data-card-id="${id}"]`) !== null,
    hostCardId,
    { timeout: 10000 },
  );

  await join.click('#draw-btn');
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('6 cards')),
    undefined,
    { timeout: 10000 },
  );

  // --- Middle-zone visibility (US-12/13/14, D7/D8) ---

  // Host plays a card shared-face-down: hidden from both, "Turn over" for anyone.
  await host.locator('#hand-area .hand-card').first().locator('.fd-btn').nth(0).click();
  await join.waitForFunction(
    () => document.querySelectorAll('#table-area .reveal-btn').length === 1,
    undefined,
    { timeout: 10000 },
  );
  const joinSeesCardBack = await join.evaluate(() => document.querySelectorAll('#table-area .card-back').length);
  assert(joinSeesCardBack === 1, 'shared face-down card must render as an anonymous card-back to the join client');

  // Join reveals it (anyone may reveal a shared card, no confirm needed).
  // (Table already has 1 pickup-btn from the earlier public play.)
  await join.locator('#table-area .reveal-btn').first().click();
  await host.waitForFunction(
    () => document.querySelectorAll('#table-area .pickup-btn').length === 2,
    undefined,
    { timeout: 10000 },
  );
  console.log('shared face-down card played hidden, then revealed by the OTHER client, propagated live');

  // Host plays a card private-face-down: host sees its rank + Reveal
  // (confirm-gated), join sees an anonymous card-back with an owner tag.
  host.once('dialog', (d) => d.dismiss()); // first reveal attempt: cancel, must stay hidden
  await host.locator('#hand-area .hand-card').first().locator('.fd-btn').nth(1).click();
  await host.waitForFunction(
    () => [...document.querySelectorAll('#table-area .owner-tag')].some((el) => el.textContent.includes('hidden from others')),
    undefined,
    { timeout: 10000 },
  );
  await join.waitForFunction(
    () => [...document.querySelectorAll('#table-area .owner-tag')].some((el) => el.textContent === 'Alice'),
    undefined,
    { timeout: 10000 },
  );
  const joinReactCanReveal = await join.evaluate(() => document.querySelectorAll('#table-area .reveal-btn').length);
  assert(joinReactCanReveal === 0, "join must not be able to reveal another player's private card");

  await host.locator('#table-area .reveal-btn').click(); // dismissed above, must still be hidden
  await host.waitForTimeout(200);
  const stillHiddenAfterDismiss = await host.evaluate(
    () => [...document.querySelectorAll('#table-area .owner-tag')].some((el) => el.textContent.includes('hidden from others')),
  );
  assert(stillHiddenAfterDismiss, 'dismissing the reveal confirm must leave the private card hidden');

  host.once('dialog', (d) => d.accept()); // second attempt: accept, must reveal
  await host.locator('#table-area .reveal-btn').click();
  await join.waitForFunction(
    () => document.querySelectorAll('#table-area .pickup-btn').length === 3,
    undefined,
    { timeout: 10000 },
  );
  console.log('private face-down card: confirm-cancel kept it hidden, confirm-accept revealed it, both propagated live');

  // Join picks up a face-up middle card into their own hand.
  const joinHandSizeBefore = await join.locator('#hand-area .card').count();
  await join.locator('#table-area .pickup-btn').first().click();
  await join.waitForFunction(
    (before) => document.querySelectorAll('#hand-area .card').length === before + 1,
    joinHandSizeBefore,
    { timeout: 10000 },
  );
  console.log('pickup: face-up middle card moved into the picking player\'s hand');

  // --- Score (US-16): a GUEST adjusting the HOST's score must propagate to both ---
  const aliceRosterRow = join
    .locator('#game-roster li.roster-player')
    .filter({ hasText: 'Alice' });
  await aliceRosterRow.locator('.score-btn').nth(1).click(); // +1
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('Alice') && li.textContent.includes('Score: 1')),
    undefined,
    { timeout: 10000 },
  );
  await join.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('Alice') && li.textContent.includes('Score: 1')),
    undefined,
    { timeout: 10000 },
  );
  console.log('score: guest adjusting the host\'s own score propagated to both clients');

  host.once('dialog', (d) => d.accept()); // Reset Scores is confirm-gated (Smith Gate-close fix)
  await host.click('#reset-scores-btn');
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li.roster-player')].every((li) => li.textContent.includes('Score: 0')),
    undefined,
    { timeout: 10000 },
  );
  console.log('score: Reset Scores propagated');

  // US-11: dragging a card in your own hand broadcasts a best-effort
  // "organizing hand" cue to other clients - motion only, no card identity.
  const joinFirstCard = join.locator('#hand-area .card').first();
  const box = await joinFirstCard.boundingBox();
  await join.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await join.mouse.down();
  await join.mouse.move(box.x + 40, box.y, { steps: 5 });
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('organizing hand')),
    undefined,
    { timeout: 5000 },
  );
  await join.mouse.up();
  await host.waitForFunction(
    () => ![...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('organizing hand')),
    undefined,
    { timeout: 5000 },
  );
  console.log('US-11 motion cue propagated join -> host, and cleared on drag end');

  // A real closed tab fires page-unload lifecycle events (unlike an abrupt
  // process kill), which is what lets PeerJS signal a clean close.
  await host.goto('about:blank');
  await host.close();
  await join.waitForFunction(
    () => !document.getElementById('banner').hidden && document.getElementById('banner').textContent.includes('session ended'),
    undefined,
    { timeout: 15000 },
  );

  // Smith Gate-close finding #1: once the session is over, nothing on
  // screen should still act live.
  assert(await join.locator('#draw-btn').isDisabled(), 'draw button should be disabled after session ends');
  const anyHandCardEnabled = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].some((el) => !el.disabled),
  );
  assert(!anyHandCardEnabled, 'hand cards should be disabled after session ends');
  const rosterShowsConnected = await join.evaluate(() =>
    [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('- connected')),
  );
  assert(!rosterShowsConnected, 'roster must not still claim anyone is connected after session ends');

  await join.close();

  assert(
    errors.every((e) => e.includes('favicon') || e.includes('404')),
    `unexpected console/page errors: ${JSON.stringify(errors)}`,
  );

  console.log(
    'e2e smoke test PASSED (US-1, US-2, US-4, US-6, US-7, US-8, US-11, US-12, US-13, US-14, US-16; D6 disconnect message)',
  );
} finally {
  await browser.close();
  server.close();
}
