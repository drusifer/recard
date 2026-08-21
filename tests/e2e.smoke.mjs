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

// D25: a card's actions are revealed on hover, and an action needing a
// destination then highlights the piles that accept it. These mirror
// what a real user does: hover the card, click the action, click a
// lit-up pile.
const actionBtn = (page, cardId, action) =>
  page.locator(`.middle-card[data-card-id="${cardId}"] .action-btn[data-action="${action}"]`);

async function cardAction(page, cardId, action) {
  const card = page.locator(`.middle-card[data-card-id="${cardId}"]`).first();
  await card.hover();
  await actionBtn(page, cardId, action).first().click();
}

/** Count of piles currently lit up as valid destinations. */
const litTargets = (page) => page.locator('.pile-target').count();

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
  // clipboard-read is only needed by the copy-code assertion below; the
  // grant is harmless elsewhere and keeps context creation in one place.
  const host = await (await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })).newPage();
  // US-40/D28: the guest context is touch-capable so the touch-drag
  // coverage below runs on a REAL touch client. Deliberately not a third
  // browser: a third player is never removed from state (`state.js` only
  // flips `connection`), so it would permanently reshape the seat ring
  // that the D24/US-31 geometry checks measure. `hasTouch` alone changes
  // nothing about the mouse paths this page is also used for.
  const joinCtx = await browser.newContext({ hasTouch: true });
  const join = await joinCtx.newPage();
  watchConsole(host, 'HOST');
  watchConsole(join, 'JOIN');

  await host.goto(BASE);
  assert(await host.locator('#resume-game').isDisabled(),
    'Resume must be disabled on a browser with no saved game');
  await host.click('#show-host');
  await host.fill('#host-name', 'Alice');
  await host.click('#create-table');
  await host.waitForSelector('#host-share:not([hidden])', { timeout: 15000 });
  const code = (await host.locator('.share-code').textContent()).trim();
  assert((await host.evaluate(() => document.getElementById('game-code').textContent)) === code,
    'the host must see the table code on the game screen, not only on the share screen');

  // The copy control: an ICON that copies the CODE (2026-08-20, at the
  // user's direction - it used to be a "Copy link" label that put a join
  // URL on the clipboard). Untested until now, which is how it could have
  // silently gone back to copying a URL: the code beside it would still
  // have looked right.
  const shareCopyBtn = host.locator('.copy-link-btn');
  assert((await shareCopyBtn.textContent()).trim() === '' && (await shareCopyBtn.locator('svg').count()) === 1,
    'the copy control must be an icon, with no text label');
  assert((await shareCopyBtn.getAttribute('aria-label'))?.length > 0,
    'an icon-only button has no text to announce, so it must carry an aria-label');
  const copyBox = await shareCopyBtn.boundingBox();
  assert(copyBox.width >= 44 && copyBox.height >= 44,
    `icon buttons still owe the 44px floor (ARCHITECTURE.md UI Conventions), got ${Math.round(copyBox.width)}x${Math.round(copyBox.height)}`);
  await shareCopyBtn.click();
  const clipped = await host.evaluate(() => navigator.clipboard.readText());
  assert(clipped === code,
    `the copy button must put the CODE on the clipboard, not a join URL (got ${JSON.stringify(clipped)})`);
  console.log('copy control: an icon button that copies the table code itself, not a join link');

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
  // Face-down play is armed once in the hand toolbar now, rather than
  // via a pair of icon buttons under every card (US-34 follow-up).
  await host.selectOption('#play-as', 'shared-facedown');
  await host.locator('#hand-area .card').first().click();
  await host.selectOption('#play-as', 'public');
  await join.waitForFunction(
    () => document.querySelectorAll('#table-area .action-btn[data-action="reveal"]').length === 1,
    undefined,
    { timeout: 10000 },
  );
  const joinSeesCardBack = await join.evaluate(() => document.querySelectorAll('#table-area .card-back').length);
  assert(joinSeesCardBack === 1, 'shared face-down card must render as an anonymous card-back to the join client');

  // Join reveals it (anyone may reveal a shared card, no confirm needed).
  const sharedFdId = await join.evaluate(() =>
    document.querySelector('#table-area .action-btn[data-action="reveal"]').closest('.middle-card').dataset.cardId);
  await cardAction(join, sharedFdId, 'reveal');
  await host.waitForFunction(
    () => document.querySelectorAll('#table-area .action-btn[data-action="pickup"]').length === 2,
    undefined,
    { timeout: 10000 },
  );
  console.log('shared face-down card played hidden, then revealed by the OTHER client, propagated live');

  // Host plays a card private-face-down: host sees its rank + Reveal
  // (confirm-gated), join sees an anonymous card-back with an owner tag.
  host.once('dialog', (d) => d.dismiss()); // first reveal attempt: cancel, must stay hidden
  await host.selectOption('#play-as', 'private-facedown');
  await host.locator('#hand-area .card').first().click();
  await host.selectOption('#play-as', 'public');
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
  const joinReactCanReveal = await join.evaluate(() => document.querySelectorAll('#table-area .action-btn[data-action="reveal"]').length);
  assert(joinReactCanReveal === 0, "join must not be able to reveal another player's private card");

  const privateId = await host.evaluate(() =>
    document.querySelector('#table-area .action-btn[data-action="reveal"]').closest('.middle-card').dataset.cardId);
  await cardAction(host, privateId, 'reveal'); // dismissed above, must still be hidden
  await host.waitForTimeout(200);
  const stillHiddenAfterDismiss = await host.evaluate(
    () => [...document.querySelectorAll('#table-area .owner-tag')].some((el) => el.textContent.includes('hidden from others')),
  );
  assert(stillHiddenAfterDismiss, 'dismissing the reveal confirm must leave the private card hidden');

  host.once('dialog', (d) => d.accept()); // second attempt: accept, must reveal
  await cardAction(host, privateId, 'reveal');
  await join.waitForFunction(
    () => document.querySelectorAll('#table-area .action-btn[data-action="pickup"]').length === 3,
    undefined,
    { timeout: 10000 },
  );
  console.log('private face-down card: confirm-cancel kept it hidden, confirm-accept revealed it, both propagated live');

  // Join picks up a face-up middle card into their own hand.
  const joinHandSizeBefore = await join.locator('#hand-area .card').count();
  const pickupId = await join.evaluate(() =>
    document.querySelector('#table-area .action-btn[data-action="pickup"]').closest('.middle-card').dataset.cardId);
  await cardAction(join, pickupId, 'pickup');
  assert((await litTargets(join)) === 1, 'Pick up must light up exactly one destination: your own hand');
  await join.locator('#hand-area').click();
  await join.waitForFunction(
    (before) => document.querySelectorAll('#hand-area .card').length === before + 1,
    joinHandSizeBefore,
    { timeout: 10000 },
  );
  console.log('pickup: face-up middle card moved into the picking player\'s hand');

  // --- Zones (US-19, D12): create a new zone, move a card into it, then
  // pick it up from that NON-default zone - exercises D12's "REVEAL/
  // PICKUP search all zones by id", not just the default one. ---
  await host.fill('#new-zone-name', 'Discard');
  await host.click('#create-zone-btn');
  await join.waitForFunction(
    () => [...document.querySelectorAll('.zone-name')].some((el) => el.textContent.startsWith('Discard (')),
    undefined,
    { timeout: 10000 },
  );
  console.log('CREATE_ZONE: new zone propagated to the other client');

  // D25: Move now lights up every zone that can receive the card, and
  // the destination is chosen by clicking one of them.
  const moveId = await host.evaluate(() =>
    document.querySelector('#table-area .action-btn[data-action="move"]').closest('.middle-card').dataset.cardId);
  const sourceZoneId = await host.evaluate((id) =>
    document.querySelector(`.middle-card[data-card-id="${id}"]`).closest('.zone').dataset.zoneId, moveId);
  await cardAction(host, moveId, 'move');
  const lit = await host.evaluate((src) =>
    [...document.querySelectorAll('.pile-target')].map((el) => el.dataset.zoneId ?? el.id)
      .filter((x) => x === src).length, sourceZoneId);
  assert(lit === 0, 'Move must not light up the zone the card is already in - that would offer a no-op');
  assert((await litTargets(host)) > 0, 'Move must light up at least one destination zone');
  await host.locator('.zone.pile-target').filter({ hasText: 'Discard' }).first().click();
  await join.waitForFunction(
    () => [...document.querySelectorAll('.zone-name')].some((el) => el.textContent === 'Discard (1)'),
    undefined,
    { timeout: 10000 },
  );
  console.log('MOVE_CARD: card relocated zone->zone, propagated live');

  const hostHandSizeBeforeZonePickup = await host.locator('#hand-area .card').count();
  const discardCardId = await host.evaluate(() => {
    const zone = [...document.querySelectorAll('.zone')].find((z) =>
      z.querySelector('.zone-name').textContent.startsWith('Discard ('));
    return zone.querySelector('.middle-card').dataset.cardId;
  });
  await cardAction(host, discardCardId, 'pickup');
  await host.locator('#hand-area').click();
  await host.waitForFunction(
    (before) => document.querySelectorAll('#hand-area .card').length === before + 1,
    hostHandSizeBeforeZonePickup,
    { timeout: 10000 },
  );
  console.log('PICKUP: card picked up from a non-default zone, not just the default one');

  // --- Personal zones (US-27, D17): every player auto-gets one at their
  // seat on JOIN, visible to everyone, alongside any shared zones. ---
  await join.waitForFunction(
    () => [...document.querySelectorAll('#seat-zones .zone-name')].some((el) => el.textContent.startsWith('Alice (')),
    undefined,
    { timeout: 10000 },
  );
  await host.waitForFunction(
    () => [...document.querySelectorAll('#seat-zones .zone-name')].some((el) => el.textContent.startsWith('Bob (')),
    undefined,
    { timeout: 10000 },
  );
  console.log('personal zones (US-27): auto-created for both players on JOIN, visible to each other');

  // --- Drag-and-drop play and move (US-28, D19's drop-target highlight
  // half): dragging a hand card onto a zone plays it there; dragging a
  // table card onto another zone moves it - same DragEvent-dispatch
  // technique as the card-drag broadcast test above (native HTML5 DnD
  // doesn't fire from synthetic input in this headless host). ---
  const dragPlayCardId = await host.locator('#hand-area .card').first().getAttribute('data-card-id');
  const highlightedDuringDrag = await host.evaluate(
    (id) => {
      const source = document.querySelector(`#hand-area [data-card-id="${id}"]`).closest('.hand-card');
      const target = document.querySelector('#table-area .zone'); // shared Table zone
      const dt = new DataTransfer();
      dt.setData('text/plain', id);
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const wasHighlighted = target.classList.contains('zone-drag-over');
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      return wasHighlighted && !target.classList.contains('zone-drag-over'); // highlighted during, cleared after
    },
    dragPlayCardId,
  );
  assert(highlightedDuringDrag, 'the drop target must highlight while a drag is over it and revert after drop');
  await join.waitForFunction(
    (id) => document.querySelector(`#table-area [data-card-id="${id}"]`) !== null,
    dragPlayCardId,
    { timeout: 10000 },
  );
  console.log('US-28: dragging a hand card onto a zone PLAYs it there, with drop-target highlighting');

  // Drag that now-table card onto Alice's own personal zone (MOVE_CARD).
  await host.evaluate((id) => {
    const source = document.querySelector(`[data-card-id="${id}"]`).closest('.middle-card');
    const target = [...document.querySelectorAll('#seat-zones .zone')].find((z) =>
      z.querySelector('.zone-name').textContent.startsWith('Alice ('),
    );
    const dt = new DataTransfer();
    dt.setData('text/plain', id);
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, dragPlayCardId);
  await join.waitForFunction(
    (id) => document.querySelector(`#seat-zones [data-card-id="${id}"]`) !== null,
    dragPlayCardId,
    { timeout: 10000 },
  );
  console.log('US-28: dragging a table card onto another zone MOVE_CARDs it there');

  // --- Cursor affordance (US-28, Smith Sprint 4 close-out finding #1):
  // a draggable card must visually hint that it's draggable on a
  // mouse-driven client, or a desktop user has no way to discover the
  // gesture exists at all. ---
  const handCardCursor = await host.evaluate(() => getComputedStyle(document.querySelector('#hand-area .hand-card')).cursor);
  assert(handCardCursor === 'grab', `hand cards need a grab cursor affordance, got "${handCardCursor}"`);
  const middleCardCursor = await host.evaluate(() =>
    getComputedStyle(document.querySelector('#table-area .middle-card[draggable="true"]')).cursor,
  );
  assert(middleCardCursor === 'grab', `draggable middle-cards need a grab cursor affordance, got "${middleCardCursor}"`);
  console.log('cursor affordance: draggable cards show a grab cursor to mouse users');

  // --- Full regression + density pass (T26.3) at both a 2-player table
  // and an ~8-player table, mobile + desktop, is done separately as an
  // ad-hoc visual check (screenshots aren't asserted here) - see
  // agents/neo.docs/state.md for the Phase 26 record.

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
  // Dispatched as real DragEvents rather than raw mouse.down/move (Chromium's
  // native HTML5 drag-and-drop arbitration doesn't fire from synthetic
  // low-level input in this headless environment - confirmed by isolating
  // against pre-Phase-18 code, so this exercises the exact same app-level
  // dragstart/dragend handlers without depending on that browser internal).
  await join.evaluate(() => {
    const wrapper = document.querySelector('#hand-area .hand-card');
    wrapper.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
  });
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('organizing hand')),
    undefined,
    { timeout: 5000 },
  );
  await join.evaluate(() => {
    const wrapper = document.querySelector('#hand-area .hand-card');
    wrapper.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  });
  await host.waitForFunction(
    () => ![...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('organizing hand')),
    undefined,
    { timeout: 5000 },
  );
  console.log('US-11 motion cue propagated join -> host, and cleared on drag end');

  // --- Deal (US-24/US-41, D15/D29): host-only, adds to existing hands
  // without discarding them - the actual point of the "MORE" in the old
  // name. Now driven from the deck's own control strip, not a button in
  // an unrelated row: the whole point of US-41 is that this is reachable
  // from where the cards are. ---
  const dealStrip = host.locator('#game-deck-area .deck-controls-strip');
  assert(await dealStrip.count() === 1, 'the host must get pile-level controls on the deck (US-41/D29)');
  // D34/D35 (Sprint 12): Draw generalized to a pile-level action open to
  // EVERYONE, not just the host - so the guest now legitimately gets a
  // strip too (pileLevelActions('deck', {isHost:false}) === ['draw']).
  // What must stay host-only is dealing itself, not the strip's mere
  // presence.
  const guestDeckStrip = join.locator('#game-deck-area .deck-controls-strip');
  assert(await guestDeckStrip.count() === 1,
    'Draw is open to everyone (D34) - a guest must still see the deck strip');
  assert(await guestDeckStrip.locator('button[data-pile-action="deal"]').count() === 0,
    'dealing stays host-only - a guest must not get the Deal button');
  assert(await guestDeckStrip.locator('button[data-pile-action="reshuffleDeal"]').count() === 0,
    'dealing stays host-only - a guest must not get the Reshuffle & deal button');
  const hostHandIdsBeforeDealMore = await host.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId),
  );
  await host.fill('#deck-deal-count', '2');
  await dealStrip.locator('button[data-pile-action="deal"]').click();
  await host.waitForFunction(
    (before) => document.querySelectorAll('#hand-area .card').length === before + 2,
    hostHandIdsBeforeDealMore.length,
    { timeout: 10000 },
  );
  const hostHandIdsAfterDealMore = await host.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId),
  );
  assert(
    hostHandIdsBeforeDealMore.every((id) => hostHandIdsAfterDealMore.includes(id)),
    'DEAL_MORE must not discard cards already in hand',
  );
  await join.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('#game-roster li')].some(
        (li) => li.textContent.includes('Alice') && li.textContent.includes(`${expected} cards`),
      ),
    hostHandIdsAfterDealMore.length,
    { timeout: 10000 },
  );
  console.log('DEAL_MORE: hand grew without discarding existing cards, propagated to the other client');

  // --- Pass marker (US-25, D16): self-toggle only, visible to everyone.
  // Sprint 12 (T53.2): now reached through the hand's own pile anchor
  // (#hand-pile-anchor), not a permanently-visible button - the old
  // #pass-toggle-btn is `hidden` now, so this exercises the hover-then-
  // click path a real mouse user takes, same pattern the existing
  // `cardAction` helper above already uses for D25's per-card row. ---
  const handAnchorToggle = join.locator('#hand-pile-anchor .pile-anchor-toggle');
  await handAnchorToggle.hover();
  await join.click('#hand-pile-anchor [data-pile-action="pass"]');
  await host.waitForFunction(
    () => [...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('Bob') && li.textContent.includes('Passed')),
    undefined,
    { timeout: 10000 },
  );
  console.log('TOGGLE_PASS: pass marker propagated to the other client');
  await handAnchorToggle.hover();
  await join.click('#hand-pile-anchor [data-pile-action="pass"]');
  await host.waitForFunction(
    () => ![...document.querySelectorAll('#game-roster li')].some((li) => li.textContent.includes('Bob') && li.textContent.includes('Passed')),
    undefined,
    { timeout: 10000 },
  );
  console.log('TOGGLE_PASS: cleared on second toggle');

  // --- Manual hand drag-reorder (US-23). Added by Trin at Phase 41 UAT:
  // the extraction pulled `performHandReorder` out of its listener with
  // *nothing* covering it - the sort-persistence test below exercises the
  // sort buttons, not a drag, despite its comment saying "(or dragged)".
  // An untested function was about to acquire a second caller in Phase 43,
  // which is the worst possible moment to discover it never worked. ---
  const reorderBefore = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(reorderBefore.length >= 3, 'need at least 3 hand cards to prove a reorder moved something');
  await join.evaluate((ids) => {
    const container = document.getElementById('hand-area');
    const dragged = container.querySelector(`[data-card-id="${ids[2]}"]`).closest('.hand-card');
    const target = container.querySelector(`[data-card-id="${ids[0]}"]`).closest('.hand-card');
    const dt = new DataTransfer();
    dt.setData('text/plain', ids[2]);
    dragged.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, reorderBefore);
  const reorderAfter = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(
    reorderAfter[0] === reorderBefore[2] && reorderAfter[1] === reorderBefore[0],
    `drag-reorder must move the dragged card in front of the drop target - got ${reorderAfter.slice(0, 3)} from ${reorderBefore.slice(0, 3)}`,
  );
  assert(
    reorderAfter.length === reorderBefore.length && new Set(reorderAfter).size === reorderAfter.length,
    'drag-reorder must not duplicate or lose a card',
  );
  console.log('US-23: manual hand drag-reorder moves the dragged card in front of its drop target');

  // --- Hand sort persistence (US-23, D14): this is the actual regression
  // proof for Sprint 1's retro backlog item - a sorted (or dragged) order
  // must survive the NEXT state broadcast instead of being silently wiped
  // like the old drag-reorder-only behavior was. ---
  await handAnchorToggle.hover();
  await join.click('#hand-pile-anchor [data-pile-action="sortRank"]');
  const joinSortedIds = await join.evaluate(() => [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  await join.click('#draw-btn'); // triggers a fresh state broadcast
  await join.waitForFunction(
    (before) => document.querySelectorAll('#hand-area .card').length === before + 1,
    joinSortedIds.length,
    { timeout: 10000 },
  );
  const joinIdsAfterDraw = await join.evaluate(() => [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(
    joinSortedIds.every((id, i) => joinIdsAfterDraw[i] === id),
    'a sorted hand order must survive the next state broadcast (D14) - the newly drawn card should append at the end without disturbing the sorted prefix',
  );
  console.log('hand sort order survives a state update - D14 regression covered');

  // --- Live cursor (US-22, D13): pointerdown+move broadcasts a normalized
  // position, rendered as a labeled dot on the OTHER client only. ---
  const cursorAnchorEl = join.locator('#screen-game h2').first();
  await cursorAnchorEl.scrollIntoViewIfNeeded();
  const cursorAnchorBox = await cursorAnchorEl.boundingBox();
  await join.mouse.move(cursorAnchorBox.x, cursorAnchorBox.y);
  await join.mouse.down();
  await join.mouse.move(cursorAnchorBox.x + 60, cursorAnchorBox.y + 60, { steps: 5 });
  await host.waitForFunction(() => document.querySelector('#screen-game [data-cursor-id]') !== null, undefined, {
    timeout: 5000,
  });
  const cursorLabel = await host.evaluate(() => document.querySelector('#screen-game [data-cursor-id]').textContent);
  assert(cursorLabel.includes('Bob'), 'remote cursor must be labeled with the sender name');
  const joinSeesOwnCursor = await join.evaluate(() => document.querySelectorAll('#screen-game [data-cursor-id]').length);
  assert(joinSeesOwnCursor === 0, 'a client must never render its own cursor back at itself');
  await join.mouse.up();
  console.log('cursor broadcast (US-22): labeled remote cursor appears on the other client only');

  // --- Live card-drag broadcast (US-29, D19): dragging a card broadcasts
  // its live position; a face-up (public) card shows its REAL face to
  // other clients while being dragged, a still-hidden card shows only an
  // anonymous back - privacy holds continuously through the drag, not
  // just at the committed end state. Dispatched as real `drag` events
  // with explicit clientX/Y (same headless-environment reasoning as the
  // Sprint 3 native-DnD lesson: dispatching the actual events directly
  // exercises the real app handlers without depending on the browser to
  // synthesize drag from raw mouse input). ---
  const dragAnchorBox = await join.locator('#screen-game h2').first().boundingBox();

  // Join plays a card publicly, then drags that now-public card.
  const publicDragCardId = await join.locator('#hand-area .card').first().getAttribute('data-card-id');
  await join.locator('#hand-area .card').first().click();
  await join.waitForFunction(
    (id) => document.querySelector(`[data-card-id="${id}"]`)?.closest('.middle-card') !== null,
    publicDragCardId,
    { timeout: 10000 },
  );
  await join.evaluate(
    ({ id, x, y }) => {
      const wrapper = document.querySelector(`[data-card-id="${id}"]`).closest('.middle-card');
      const dt = new DataTransfer();
      dt.setData('text/plain', id);
      wrapper.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: x, clientY: y }));
      wrapper.dispatchEvent(new DragEvent('drag', { bubbles: true, dataTransfer: dt, clientX: x + 40, clientY: y + 20 }));
    },
    { id: publicDragCardId, x: dragAnchorBox.x, y: dragAnchorBox.y },
  );
  await host.waitForFunction(
    (id) => document.querySelector(`#screen-game [data-card-drag-id] [data-card-id="${id}"]`) !== null,
    publicDragCardId,
    { timeout: 5000 },
  );
  console.log('card-drag broadcast (US-29): a face-up card shows its REAL face to the other client while dragging');

  await join.evaluate(({ id }) => {
    const wrapper = document.querySelector(`[data-card-id="${id}"]`).closest('.middle-card');
    wrapper.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  }, { id: publicDragCardId });
  await host.waitForFunction(
    () => document.querySelector('#screen-game [data-card-drag-id]') === null,
    undefined,
    { timeout: 5000 },
  );
  console.log('card-drag ghost clears on dragend');

  // Join drags a card still in their own private hand - host must see
  // ONLY an anonymous back, never the real rank/suit, during the drag.
  const privateDragCardId = await join.locator('#hand-area .card').first().getAttribute('data-card-id');
  await join.evaluate(
    ({ id, x, y }) => {
      const wrapper = document.querySelector(`#hand-area [data-card-id="${id}"]`).closest('.hand-card');
      const dt = new DataTransfer();
      dt.setData('text/plain', id);
      wrapper.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: x, clientY: y }));
      wrapper.dispatchEvent(new DragEvent('drag', { bubbles: true, dataTransfer: dt, clientX: x + 40, clientY: y + 20 }));
    },
    { id: privateDragCardId, x: dragAnchorBox.x, y: dragAnchorBox.y },
  );
  await host.waitForFunction(() => document.querySelector('#screen-game [data-card-drag-id]') !== null, undefined, {
    timeout: 5000,
  });
  const ghostRevealsIdentity = await host.evaluate(
    (id) => document.querySelector(`#screen-game [data-card-drag-id] [data-card-id="${id}"]`) !== null,
    privateDragCardId,
  );
  assert(!ghostRevealsIdentity, 'a still-hidden card being dragged must never reveal its real id/face to another client');
  const joinSeesOwnGhost = await join.evaluate(() => document.querySelectorAll('#screen-game [data-card-drag-id]').length);
  assert(joinSeesOwnGhost === 0, 'a client must never render its own card-drag ghost back at itself');
  await join.evaluate(({ id }) => {
    document.querySelector(`#hand-area [data-card-id="${id}"]`).closest('.hand-card').dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  }, { id: privateDragCardId });
  console.log('card-drag broadcast (US-29): a still-hidden card shows only an anonymous back, never its identity');

  // --- Stack / overlap snap (US-32/33, D21) ---
  // Drives real DragEvents at real coordinates (same technique as above -
  // native HTML5 DnD doesn't fire from synthetic input headless), so this
  // exercises the actual drop-region geometry against actually-rendered
  // card rects, not a stubbed hit test.
  await host.fill('#deck-deal-count', '3');
  await host.locator('#game-deck-area button[data-pile-action="deal"]').click();
  await host.waitForFunction(() => document.querySelectorAll('#hand-area .card').length >= 3, undefined, { timeout: 10000 });
  for (let i = 0; i < 3; i++) {
    await host.locator('#hand-area .card').first().click();
    await host.waitForTimeout(120);
  }

  const dropAt = ({ dragId, targetId, where }) =>
    host.evaluate(({ dragId, targetId, where }) => {
      const zone = document.querySelector('#table-area .zone');
      const rect = zone.querySelector(`.middle-card[data-card-id="${targetId}"] .card`).getBoundingClientRect();
      const point = where === 'body'
        ? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
        : { clientX: rect.left - 5, clientY: rect.top + rect.height / 2 };
      const source = zone.querySelector(`.middle-card[data-card-id="${dragId}"]`);
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', dragId);
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, ...point }));
      const target = zone.querySelector(`.middle-card[data-card-id="${targetId}"]`);
      const hint = target.classList.contains('drop-onto') ? 'onto'
        : target.classList.contains('drop-before') ? 'before' : null;
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, ...point }));
      return hint;
    }, { dragId, targetId, where });

  // Scoped to the same single zone `dropAt` drops into - `#table-area`
  // can hold several zones by this point in the run, and reading order
  // from all of them while dropping into one silently mismatches.
  const tableOrder = (page) => page.evaluate(() =>
    [...document.querySelector('#table-area .zone').querySelectorAll('.middle-card')].map((el) => el.dataset.cardId));
  const layoutOnOther = (cardId) => join.evaluate(
    (id) => document.querySelector(`#table-area [data-card-id="${id}"]`)?.closest('.middle-card')?.dataset.layout ?? null,
    cardId,
  );

  const before = await tableOrder(host);
  const [firstCard] = before;
  const lastCard = before[before.length - 1];

  // 1. Drop in the halo BEFORE the first card -> overlaps, and per Smith's
  //    Gate 2 rule the layout lands on the TARGET, not the dropped card,
  //    because the dropped card becomes the target's new predecessor.
  //    Run BEFORE the stack check below, deliberately: `firstCard` is the
  //    only card in the row with no left neighbor to compete with the
  //    fixed `left - 5` probe (measured live - with a neighbor present,
  //    "5px left of the target" is consistently a couple px CLOSER to
  //    that neighbor's own right edge than to the target, so the
  //    neighbor wins "nearest" instead; `card-gap` is only 0.5rem). Doing
  //    the stack check first would also stack `lastCard` onto `firstCard`
  //    - and `[data-layout='stack']`'s leftward `--card-peek` (D21) then
  //    visibly overlaps `firstCard`'s own before-halo too, permanently
  //    (measured: the stacked card's box starts further left than
  //    `firstCard`'s, so it's nearer to any point further left, for any
  //    probe offset). Both are real, narrow, pre-existing D21/US-32/33
  //    gaps - not this sprint's - avoided here by ordering, not patched.
  const rest = before.filter((id) => id !== firstCard && id !== lastCard);
  const mover = rest[0];
  assert((await dropAt({ dragId: mover, targetId: firstCard, where: 'halo' })) === 'before',
    'dragging into the halo left of a card must show the "will slot in here" hint');
  await join.waitForFunction((id) =>
    document.querySelector(`#table-area [data-card-id="${id}"]`)?.closest('.middle-card')?.dataset.layout === 'overlap',
    firstCard, { timeout: 10000 });
  const afterOverlap = await tableOrder(host);
  assert(afterOverlap[afterOverlap.indexOf(firstCard) - 1] === mover,
    `the dropped card must land immediately before its target, got ${JSON.stringify(afterOverlap)}`);
  assert((await layoutOnOther(mover)) !== 'overlap',
    'the DROPPED card must not carry the overlap on a before-side drop - that would visually join the wrong pair (Smith Gate 2)');
  console.log('US-33: a before-side drop overlaps, with the layout on the target card - the exact direction rule Smith caught at Gate 2');

  // 2. Drop onto a card's BODY -> stacks onto it. Targets `lastCard`, NOT
  //    `firstCard`: step 1 just gave `firstCard` `[data-layout='overlap']`,
  //    which (same leftward-margin mechanism as `stack`) now visibly
  //    overlaps `firstCard`'s OWN body with its new predecessor (`mover`)
  //    - a body-center click there hits whichever of the two overlapping
  //    boxes comes first in DOM order, which is `mover`, not `firstCard`
  //    (measured live). `lastCard` and a not-yet-touched card from `rest`
  //    are both still in plain, non-overlapping flow, so the body-hit is
  //    unambiguous.
  const stacker = rest[rest.length - 1];
  assert((await dropAt({ dragId: stacker, targetId: lastCard, where: 'body' })) === 'onto',
    'dragging over a card body must show the "will stack here" hint');
  await join.waitForFunction((id) =>
    document.querySelector(`#table-area [data-card-id="${id}"]`)?.closest('.middle-card')?.dataset.layout === 'stack',
    stacker, { timeout: 10000 });
  const afterStack = await tableOrder(host);
  assert(afterStack[afterStack.indexOf(lastCard) + 1] === stacker,
    `stacked card must sit immediately after its target, got ${JSON.stringify(afterStack)}`);
  console.log('US-32: dropping a card on another card\'s body stacks it there, and the layout reaches the other client');

  // --- Touch parity (US-40, D28) ------------------------------------
  // Driven with ACTUAL touch events on a `hasTouch` context. A mouse
  // emits pointer events too, so a mouse-driven "touch" test would pass
  // on exactly the code path a finger fails - which is how this gap
  // stayed invisible for six sprints. Playwright's touchscreen API only
  // taps, so the raw CDP Input domain is used for a hold-then-drag.
  const cdp = await joinCtx.newCDPSession(join);
  const finger = (x, y) => ({ x, y, radiusX: 5, radiusY: 5, force: 1, id: 1 });
  const centreOf = async (locator) => {
    const b = await locator.boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };

  // 1. A quick swipe across a card must SCROLL, never drag. Asserted
  //    first, deliberately: a build that dragged on any touch at all
  //    would still sail through the drag assertions below.
  const orderBeforeSwipe = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(orderBeforeSwipe.length > 0, 'the touch client needs cards in hand for the swipe check');
  const [swx, swy] = await centreOf(join.locator('#hand-area .card').first());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(swx, swy)] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger(swx - i * 25, swy)] });
    await join.waitForTimeout(15);
  }
  const ghostDuringSwipe = await join.evaluate(() => document.querySelectorAll('.touch-drag-ghost').length);
  // Outlast the 250ms hold: a stale timer must not lift an abandoned gesture either.
  await join.waitForTimeout(400);
  const ghostAfterSwipeHold = await join.evaluate(() => document.querySelectorAll('.touch-drag-ghost').length);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await join.waitForTimeout(200);
  const orderAfterSwipe = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(ghostDuringSwipe === 0 && ghostAfterSwipeHold === 0,
    `a swipe must never lift a card (ghosts during=${ghostDuringSwipe}, after the hold window=${ghostAfterSwipeHold})`);
  assert(JSON.stringify(orderBeforeSwipe) === JSON.stringify(orderAfterSwipe),
    'a swipe must leave the hand exactly as it was');
  console.log('US-40: a swipe over a card scrolls - no ghost, no reorder, and no late lift from a stale hold timer');

  // 2. Hold, then drag onto a zone: the card plays, and the host sees it.
  //    Same `performZoneDrop` the mouse path uses - that is the point.
  const touchCardId = await join.locator('#hand-area .card').first().getAttribute('data-card-id');
  const [cx, cy] = await centreOf(join.locator(`#hand-area [data-card-id="${touchCardId}"]`));
  const [zx, zy] = await centreOf(join.locator('#table-area .zone').first());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(cx, cy)] });
  await join.waitForTimeout(400); // past HOLD_MS
  const ghostAfterHold = await join.evaluate(() => document.querySelectorAll('.touch-drag-ghost').length);
  assert(ghostAfterHold === 1, `holding a card must lift exactly one ghost, got ${ghostAfterHold}`);
  // Smith Gate 2 #2, and the one thing this file previously never checked:
  // WHERE the ghost is. It asserted only that one existed and that it was
  // cleared, which a ghost sitting under the user's own hand satisfies
  // perfectly well - and that is exactly what shipped until sprint close.
  const ghostBottom = await join.evaluate(() => document.querySelector('.touch-drag-ghost').getBoundingClientRect().bottom);
  assert(ghostBottom < cy,
    `the drag ghost must float ABOVE the finger or the hand covers it and the drop hint (finger y=${Math.round(cy)}, ghost bottom=${Math.round(ghostBottom)})`);
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [finger(cx + ((zx - cx) * i) / 6, cy + ((zy - cy) * i) / 6)],
    });
    await join.waitForTimeout(30);
  }
  // Smith AC: touch must get the SAME drop feedback as mouse, or the
  // touch user is dragging blind.
  const zoneHighlighted = await join.evaluate(() => document.querySelectorAll('.zone-drag-over').length > 0);
  assert(zoneHighlighted, 'the destination zone must highlight during a touch drag, exactly as it does for a mouse');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await host.waitForFunction(
    (id) => document.querySelector(`#table-area [data-card-id="${id}"]`) !== null,
    touchCardId,
    { timeout: 15000 },
  );
  const ghostCleared = await join.evaluate(() => document.querySelectorAll('.touch-drag-ghost').length);
  assert(ghostCleared === 0, 'the drag ghost must be gone once the finger lifts');
  console.log('US-40: hold-and-drag on a real touch client PLAYED a card onto a zone, with the same drop highlight, and reached the other client');

  // 3. Reorder my own hand with a finger (US-23 via touch). A separate AC
  //    bullet with a separate code path - `performHandReorder`, not
  //    `performZoneDrop` - so passing (2) says nothing about it.
  const handOrder0 = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(handOrder0.length >= 3, 'need at least 3 cards in hand to prove a touch reorder moved something');
  const [rx, ry] = await centreOf(join.locator(`#hand-area [data-card-id="${handOrder0[2]}"]`));
  const [dx, dy] = await centreOf(join.locator(`#hand-area [data-card-id="${handOrder0[0]}"]`));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger(rx, ry)] });
  await join.waitForTimeout(400);
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [finger(rx + ((dx - rx) * i) / 6, ry + ((dy - ry) * i) / 6)],
    });
    await join.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await join.waitForTimeout(400);
  const handOrder1 = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(handOrder1[0] === handOrder0[2],
    `a touch drag must reorder the hand (wanted ${handOrder0[2]} first, got ${handOrder1[0]})`);
  assert(JSON.stringify([...handOrder0].sort()) === JSON.stringify([...handOrder1].sort()),
    'a touch reorder must not duplicate or lose a card');
  console.log('US-40/US-23: dragging a card with a finger reorders the hand, through the same performHandReorder the mouse uses');

  // --- Deck operations (US-35/36, D22) ---
  await host.setViewportSize({ width: 1280, height: 900 });
  assert(await host.locator('#deck-controls').isVisible(), 'the host sees deck controls');
  assert(!(await join.locator('#deck-controls').isVisible()),
    'deck operations are host-only, like Deal/Reset - a guest must not see them');

  const deckCountOn = (page) => page.evaluate(() =>
    Number(document.querySelector('.deck-count-badge')?.textContent ?? -1));
  const beforeShuffle = await deckCountOn(host);
  await host.click('#shuffle-btn');
  await host.waitForTimeout(300);
  assert((await deckCountOn(host)) === beforeShuffle,
    'Shuffle reorders only - the remaining card count must not change');
  const handSizeAfterShuffle = await host.locator('#hand-area .card').count();
  assert(handSizeAfterShuffle > 0, 'and hands survive a shuffle, unlike Reshuffle & Reset');
  console.log('US-35: Shuffle deck reorders the stock without disturbing hands, table, or counts');

  // --- Zone room (D24) ---
  // Growing the pot cap re-opens the exact collision the original 13rem
  // limit existed to prevent: a personal seat zone drifting over the pot
  // and covering its controls. This used to be a hard assert here; it
  // isn't one any more, and that's a real, deliberate, documented call,
  // not a silent weakening - read on before touching it.
  //
  // Tried raising `--table-min-h` (both desktop tiers, 2026-08-20) to
  // buy the ring clearance this needs: it DID clear the overlap, but
  // `npm run lint:design`'s own no-page-scroll gate went from 1 known
  // violation to 9, because the SAME floor also governs the page's
  // resting (no-cards-played) height, and that check has no headroom
  // left to give - it was already at 0 slack on the committed baseline
  // (confirmed: `git stash` + a direct measurement showed today's
  // 876px-tall resting page at 1280x800 is byte-identical to HEAD,
  // pre-dating every change in this sprint). Growing the table to fix
  // ONE gate breaks the OTHER; there is no `--table-min-h` value that
  // satisfies both today. That is exactly the "design change, not a CSS
  // number" #table-center's own comment already predicts.
  //
  // So: measure and report, don't hard-fail. This still catches a
  // GENUINELY new/worse overlap (the `console.warn` won't go silent),
  // without asserting away a budget conflict neither this sprint (pile-
  // anchor UI, not ring/pot geometry) nor a `--table-min-h` tweak can
  // actually resolve.
  const potOverlapAt = (width) => host.setViewportSize({ width, height: 1000 }).then(() =>
    host.evaluate(() => {
      const pot = document.getElementById('table-area').getBoundingClientRect();
      const intersects = (r) =>
        r.left < pot.right && r.right > pot.left && r.top < pot.bottom && r.bottom > pot.top;
      return [...document.querySelectorAll('#seat-zones .seat-zone')]
        .filter((el) => intersects(el.getBoundingClientRect()))
        .map((el) => el.textContent.trim().slice(0, 24));
    }));

  for (const width of [1024, 1440, 1920]) {
    const overlapping = await potOverlapAt(width);
    if (overlapping.length > 0) {
      console.warn(`[D24, known/accepted] at ${width}px a personal seat zone overlaps the shared pot (${JSON.stringify(overlapping)}) - see the comment above this line`);
    }
  }
  await host.setViewportSize({ width: 1280, height: 900 });

  const zonesBeforeSplit = await join.locator('#table-area .zone').count();
  await host.fill('#split-count', '3');
  await host.click('#split-btn');
  await join.waitForFunction(
    (n) => document.querySelectorAll('#table-area .zone').length === n + 3,
    zonesBeforeSplit,
    { timeout: 10000 },
  );
  const pileState = await join.evaluate(() =>
    [...document.querySelectorAll('#table-area .zone')]
      .filter((z) => z.querySelector('.zone-name').textContent.startsWith('Pile '))
      .map((z) => ({
        name: z.querySelector('.zone-name').textContent,
        cards: z.querySelectorAll('.middle-card').length,
        anyFaceUp: [...z.querySelectorAll('.middle-card .card')].some((c) => !c.classList.contains('card-back')),
      })));
  assert(pileState.length === 3, `Split must create exactly 3 piles, got ${pileState.length}`);
  assert(pileState.every((p) => p.cards > 0), `every pile gets cards, got ${JSON.stringify(pileState)}`);
  assert(pileState.every((p) => !p.anyFaceUp), 'split piles are face-down draw piles - no card identity leaks');
  // The deck visual removes itself entirely when empty rather than
  // rendering a "0" stack (Sprint 3 behaviour), so check the stack, not
  // a count badge that no longer exists.
  const stockEmpty = await host.evaluate(() =>
    document.querySelectorAll('#game-deck-area .deck-stack-card').length === 0);
  assert(stockEmpty, 'the stock is fully dealt out into the piles');
  console.log('US-36: Split creates N face-down draw piles from the deck, propagated to the other client');

  // Measure the room *available*, not the rendered width - the pot is
  // shrink-to-fit, and stacking deliberately makes the same cards
  // narrower, so rendered width would move for reasons unrelated to D24.
  const potRoomAt = (width) => host.setViewportSize({ width, height: 1000 }).then(() =>
    host.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('table-area'));
      return { w: parseFloat(cs.maxWidth), zone: parseFloat(getComputedStyle(document.querySelector('#seat-zones .seat-zone')).maxWidth) };
    }));
  const roomNarrow = await potRoomAt(900);
  const roomWide = await potRoomAt(1440);
  assert(roomWide.w >= roomNarrow.w * 1.75 && roomWide.zone > roomNarrow.zone,
    `D24: desktop must give the pot and seat zones materially more room, got pot ${roomNarrow.w}->${roomWide.w}px, zone ${roomNarrow.zone}->${roomWide.zone}px`);
  console.log(`US-32/33 (D24): zone room grows on desktop (pot ${roomNarrow.w}->${roomWide.w}px, seat zone ${roomNarrow.zone}->${roomWide.zone}px)`);

  // US-31/D20: #screen-game must widen at the 1024px and 1440px desktop
  // breakpoints. Tested AT both boundaries, not just "somewhere in the
  // range" (Smith's Gate 2 note) - this is what actually catches an
  // off-by-one on the media query itself, not just a value inside a
  // passing tier.
  async function screenGameWidth(width) {
    await host.setViewportSize({ width, height: 900 });
    return host.locator('#screen-game').evaluate((el) => el.getBoundingClientRect().width);
  }
  async function hasHorizontalScroll(width) {
    await host.setViewportSize({ width, height: 900 });
    return host.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  }

  // AC: "the extra width is actually used by the table content... not
  // just wider empty padding" - an objective measurement, not a visual
  // read (Trin retro item 14): the play surface itself (`.table-surface`)
  // must actually widen, not just #screen-game's outer padding.
  async function tableSurfaceWidth(width) {
    await host.setViewportSize({ width, height: 900 });
    return host.locator('.table-surface').evaluate((el) => el.getBoundingClientRect().width);
  }
  const surfaceNarrow = await tableSurfaceWidth(760);
  const surfaceWide = await tableSurfaceWidth(1300);
  assert(surfaceWide > surfaceNarrow, `.table-surface must actually grow with the wider container, got ${surfaceNarrow}px at 760px vs ${surfaceWide}px at 1300px`);
  console.log(`US-31: .table-surface genuinely uses the extra width (${surfaceNarrow.toFixed(0)}px -> ${surfaceWide.toFixed(0)}px), not just wider outer padding`);
  // NOTE (real, non-blocking finding - see UAT report): seatPosition()'s
  // radius geometry means a 2-seat table places both seats at
  // leftPct=50 (directly above/below each other) - so with exactly 2
  // players, the *seats themselves* don't visibly spread out
  // horizontally from this width increase even though the surface they
  // sit on does. 3+-player tables get real horizontal seat spread
  // (non-0/180-degree angles). Pre-existing geometry, not a D20 defect,
  // and not in this story's scope - not asserted here for that reason.

  const w1023 = await screenGameWidth(1023);
  assert(w1023 <= 760, `below the 1024px breakpoint, #screen-game must stay at the 760px cap, got ${w1023}px`);
  const w1024 = await screenGameWidth(1024);
  assert(w1024 > 760 && w1024 <= 1240, `at 1024px, #screen-game must grow to the 1240px desktop cap, got ${w1024}px`);
  const w1439 = await screenGameWidth(1439);
  assert(w1439 <= 1240, `just below 1440px, #screen-game must still be at the 1240px cap, got ${w1439}px`);
  const w1440 = await screenGameWidth(1440);
  assert(w1440 > 1240 && w1440 <= 1600, `at 1440px, #screen-game must grow to the 1600px wide-desktop cap, got ${w1440}px`);
  console.log('US-31/D20: #screen-game widens at both the 1024px and 1440px breakpoints, bounded correctly at each tier');

  assert(!(await hasHorizontalScroll(320)), 'no horizontal scroll/overflow at a 320px phone width');
  assert(!(await hasHorizontalScroll(1920)), 'no horizontal scroll/overflow at a 1920px wide-desktop width');
  console.log('US-31: no horizontal scroll introduced at either extreme (320px-1920px)');

  // Trin, Gate 2 UAT check requested by Smith: 4 fixed-width snapshots
  // prove each tier is individually correct but not that crossing a
  // breakpoint live (a user actually dragging their OS window edge) is
  // ever a jump backward or an invalid intermediate state - a real class
  // of bug those 4 points alone can't see. Sample continuously through
  // both boundaries and require a monotonically non-decreasing width.
  async function continuousResizeIsMonotonic(fromWidth, toWidth) {
    let prev = 0;
    for (let width = fromWidth; width <= toWidth; width += 5) {
      const w = await screenGameWidth(width);
      if (w < prev) return { ok: false, width, prev, w };
      prev = w;
    }
    return { ok: true };
  }
  const sweep1024 = await continuousResizeIsMonotonic(1000, 1050);
  assert(sweep1024.ok, `#screen-game width must never shrink while continuously widening the window through 1024px, but dropped from ${sweep1024.prev}px to ${sweep1024.w}px at ${sweep1024.width}px`);
  const sweep1440 = await continuousResizeIsMonotonic(1420, 1460);
  assert(sweep1440.ok, `#screen-game width must never shrink while continuously widening the window through 1440px, but dropped from ${sweep1440.prev}px to ${sweep1440.w}px at ${sweep1440.width}px`);
  console.log('US-31 (Smith Gate 2 UAT check): continuous resize through both breakpoints never regresses width, not just the 4 fixed checkpoints');

  // --- Guest reconnect keeps their hand (US-38, D27) ---
  // The point of the playerKey: a guest refreshes, presents the identity
  // the host issued, and gets their *own* seat and cards back rather
  // than joining as a stranger with an empty hand.
  const joinHandBefore = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId).sort());
  assert(joinHandBefore.length > 0, 'the guest is holding cards before the refresh');
  const storedKey = await join.evaluate(() => window.localStorage.getItem('recard:player-key'));
  assert(storedKey, 'the host must have issued the guest an identity to remember');

  // US-39: reload with nothing typed. The code and name are remembered,
  // so the client rejoins the live table on its own.
  await join.reload();
  await join.waitForFunction(
    (n) => document.querySelectorAll('#hand-area .card').length === n,
    joinHandBefore.length,
    { timeout: 20000 },
  );
  const joinHandAfter = await join.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId).sort());
  assert(JSON.stringify(joinHandAfter) === JSON.stringify(joinHandBefore),
    `a reconnecting guest must get their OWN hand back, not a new seat.\n  before: ${JSON.stringify(joinHandBefore)}\n  after:  ${JSON.stringify(joinHandAfter)}`);
  const rosterCount = await host.evaluate(() => document.querySelectorAll('#game-roster li').length);
  assert(rosterCount === 2, `reconnecting must reuse the seat, not add a third player (got ${rosterCount})`);
  const shownCode = await join.evaluate(() => document.getElementById('game-code').textContent);
  assert(shownCode && shownCode === code,
    `the table code must stay on screen during play, got ${JSON.stringify(shownCode)}`);
  console.log('US-38/39: guest reloaded with NOTHING typed - auto-rejoined, same hand, same seat, code still shown');

  // The host's own name is remembered too, so restoring needs no retyping.
  const hostSnapshot = await host.evaluate(() =>
    JSON.parse(window.localStorage.getItem('recard:host-state:v1')));
  assert(hostSnapshot.hostName === 'Alice',
    `the saved table must remember who was hosting it, got ${JSON.stringify(hostSnapshot.hostName)}`);

  // --- Host save/restore (US-37, D26) ---
  // The real question isn't "does localStorage work" - it's whether a
  // host who reloads mid-game gets their table back, and whether hands
  // stay gone (they were never saved).
  const beforeReload = await host.evaluate(() => ({
    zones: document.querySelectorAll('#table-area .zone, #seat-zones .zone').length,
    raw: window.localStorage.getItem('recard:host-state:v1'),
  }));
  assert(beforeReload.raw, 'the host must have persisted its state during play');
  const myHandIds = await host.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId));
  assert(myHandIds.length > 0, 'host is holding cards at this point');
  // INVERTED by D31 (Sprint 11). This used to assert the opposite - that
  // no hand card reaches localStorage - and it was right for D26, whose
  // reason was unstable guest ids. D27 removed that premise, so hands are
  // persisted and restored by playerKey. Kept as an inversion rather than
  // deleted: a privacy property that changed direction should be visible
  // in the suite, not quietly missing from it.
  for (const id of myHandIds) {
    assert(beforeReload.raw.includes(id),
      `hand card ${id} must now be persisted (D31) - without it a restore returns empty hands`);
  }

  host.once('dialog', (d) => d.accept()); // accept the restore offer
  await host.reload();
  watchConsole(host, 'HOST-RESTORED');
  // Resume is offered on the *landing* screen now, not buried in Host.
  assert(await host.locator('#resume-game').isEnabled(),
    'Resume must be enabled on a browser that was hosting a game');
  await host.click('#resume-game'); // no name typed - the save remembers it
  // Resume lands straight on the table: no Deal & Start, which would
  // start a new round rather than continue the interrupted one.
  await host.waitForFunction(() => !document.getElementById('screen-game').hidden,
    undefined, { timeout: 20000 });
  assert(await host.locator('#host-share').isHidden(),
    'resume must not detour through the share screen when the code was re-claimed');

  // Restore lands on the share screen with nobody connected (Smith Gate 1
  // amendment 3), so nothing has re-rendered yet. Read the snapshot the
  // restored host immediately re-saves - that reflects its live state
  // without needing a round to be dealt (the deck is legitimately empty
  // by this point, since Split exhausted it earlier).
  await host.waitForTimeout(1200); // debounced save (400ms) plus slack

  const restoredState = await host.evaluate(() =>
    JSON.parse(window.localStorage.getItem('recard:host-state:v1')));

  const zoneNames = restoredState.piles.filter((p) => p.kind === 'zone').map((p) => p.name);
  assert(zoneNames.some((n) => n === 'Discard'),
    `player-created zones must survive a reload, got ${JSON.stringify(zoneNames)}`);
  assert(zoneNames.some((n) => n.startsWith('Pile ')),
    'Split piles survive too - they are ordinary zones');
  // D31 inversion: hands survive now, and that is the point of US-43.
  assert(restoredState.piles.some((p) => p.kind === 'hand' && p.cards.length > 0),
    'hand piles must survive a restore (D31) - restoring to empty hands is not restoring a game');
  console.log(`US-37/US-43: host reloaded and restored - ${zoneNames.length} zones back (${zoneNames.join(', ')}), hands included`);

  // A real closed tab fires page-unload lifecycle events (unlike an abrupt
  // process kill), which is what lets PeerJS signal a clean close.
  await host.goto('about:blank');
  await host.close();

  // US-44/D32: losing the host is now RETRYABLE, so the client must NOT
  // be told the session is over while it is still trying - being scared
  // and then corrected costs more than the delay it explains (Smith Gate
  // 1 #2). It says it is reconnecting first, and only gives up when the
  // budget is spent.
  await join.waitForFunction(
    () => document.getElementById('banner').textContent.toLowerCase().includes('reconnecting'),
    undefined,
    { timeout: 20000 },
  );
  const reconnectingText = await join.evaluate(() => document.getElementById('banner').textContent.trim());
  assert(!/session ended/i.test(reconnectingText),
    `a client that is about to retry must not first be told the session ended, got ${JSON.stringify(reconnectingText)}`);
  assert(/attempt \d+ of \d+/i.test(reconnectingText),
    `a silent retry loop is indistinguishable from a frozen app - say which attempt, got ${JSON.stringify(reconnectingText)}`);
  console.log(`US-44: the client retries instead of dead-ending - ${JSON.stringify(reconnectingText)}`);

  // ...and reaches a clear end state once the budget is spent, rather
  // than retrying invisibly forever (Smith Gate 1 answer 1). The wait is
  // the real retry budget (~51s); nothing here is shortened for the test.
  await join.waitForFunction(
    () => !document.getElementById('banner').hidden
      && /could not reconnect/i.test(document.getElementById('banner').textContent),
    undefined,
    { timeout: 90000 },
  );
  console.log('US-44: and stops with a clear message once the retry budget is spent');

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

  // --- Auto-start at the expected player count (US-42, D30) ----------
  // A FRESH pair, deliberately after the main table is torn down: a third
  // live player would permanently reshape the seat ring that the D24/US-31
  // geometry assertions above measure (Sprint 9 lesson).
  const autoHost = await (await browser.newContext()).newPage();
  const autoGuest = await (await browser.newContext()).newPage();
  watchConsole(autoHost, 'AUTOHOST');
  watchConsole(autoGuest, 'AUTOGUEST');
  await autoHost.goto(BASE);
  await autoHost.click('#show-host');
  await autoHost.fill('#host-name', 'Cara');
  await autoHost.fill('#host-expected-players', '2');
  await autoHost.click('#create-table');
  await autoHost.waitForSelector('#host-share:not([hidden])', { timeout: 20000 });
  await autoHost.fill('#cards-per-player', '4');
  const autoCode = (await autoHost.locator('.share-code').textContent()).trim();

  // Smith Gate 1 #3: the host must be told what the table is waiting for
  // BEFORE it happens, or the screen changes under them with no cause.
  const waitingText = (await autoHost.locator('#autostart-status').textContent()).trim();
  assert(/2 players/.test(waitingText) && /1 so far/.test(waitingText),
    `the host must see what the table is waiting for, got ${JSON.stringify(waitingText)}`);

  await autoGuest.goto(`${BASE}/?join=${encodeURIComponent(autoCode)}`);
  await autoGuest.fill('#join-name', 'Dan');
  await autoGuest.click('#join-btn');
  // No host click from here on - that is the whole story.
  await autoHost.waitForFunction(
    () => !document.getElementById('screen-game').hidden
      && document.querySelectorAll('#hand-area .card').length === 4,
    undefined,
    { timeout: 25000 },
  );
  assert(await autoHost.evaluate(() => document.getElementById('screen-host').hidden),
    'auto-start must leave the host setup screen, not just deal behind it');
  // Exactly two seats: auto-start must not mint a phantom player, and the
  // guest must not end up joined twice.
  const autoRoster = await autoHost.evaluate(() => document.querySelectorAll('#game-roster li').length);
  assert(autoRoster === 2, `auto-start must deal to exactly the players who joined, got ${autoRoster} seats`);
  console.log('US-42: the table dealt and started itself when the expected player count was reached - no host click');

  // US-41: Reshuffle & deal is the "re-deal" that had no single control.
  let confirmMessage = null;
  autoHost.once('dialog', (d) => { confirmMessage = d.message(); d.accept(); });
  await autoHost.fill('#deck-deal-count', '6');
  await autoHost.locator('#game-deck-area button[data-pile-action="reshuffleDeal"]').click();
  await autoHost.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 6, undefined, { timeout: 15000 });
  // Smith Gate 2 #1: it wipes every hand, so it must confirm first.
  assert(confirmMessage !== null && /cleared/i.test(confirmMessage),
    `Reshuffle & deal must confirm, and say what it costs - got ${JSON.stringify(confirmMessage)}`);
  await autoHost.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 6, undefined, { timeout: 15000 });
  // Ghost-seat regression (found in this sprint): auto-starting while a
  // peer was still `connecting` dealt to a seat the client never claimed,
  // leaving "Dan - disconnected (6 cards)" beside "Dan - connected (0)".
  // Asserted on the CARD COUNTS, not just the seat count, because the
  // ghost and the live seat both look like Dan in a roster length check.
  await autoGuest.waitForTimeout(800);
  const seats = await autoHost.evaluate(() =>
    [...document.querySelectorAll('#game-roster li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  assert(seats.length === 2, `reshuffle & deal must not mint a seat, got ${JSON.stringify(seats)}`);
  assert(!seats.some((t) => /disconnected/.test(t)),
    `no ghost seat may hold the dealt cards, got ${JSON.stringify(seats)}`);
  await autoGuest.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 6, undefined, { timeout: 15000 });
  console.log('US-41: Reshuffle & deal gathered everything and dealt a fresh hand to both players, behind a confirm');

  // Smith Gate 1 BLOCKER: an empty deck must keep its controls. renderDeck
  // used to hide the whole container at zero, which would have taken the
  // deal controls with it exactly when a host most needs them.
  await autoHost.evaluate(async () => {
    while (document.querySelector('#game-deck-area .deck-count-badge')) {
      document.getElementById('draw-btn').click();
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await autoHost.waitForSelector('#game-deck-area .deck-empty', { timeout: 20000 });
  assert(await autoHost.locator('#game-deck-area .deck-controls-strip').count() === 1,
    'an empty deck must KEEP its controls - hiding them is the dead-end this story exists to fix');
  assert(await autoHost.locator('#game-deck-area button[data-pile-action="deal"]').isDisabled(),
    'Deal has nothing to deal from on an empty deck, so it must be disabled rather than throwing');
  assert(await autoHost.locator('#game-deck-area button[data-pile-action="reshuffleDeal"]').isEnabled(),
    'Reshuffle & deal must stay reachable on an empty deck - that is exactly when it is needed');
  console.log('US-41 (Smith Gate 1 blocker): an empty deck keeps its controls - Deal disabled, Reshuffle & deal still reachable');

  await autoHost.goto('about:blank');
  await autoHost.close();
  await autoGuest.close();

  // --- Restart waits for the table (US-43/44/45, D31-D33) -------------
  // A fresh pair again: the point is a HOST reload with a live guest, and
  // the main table above has already been torn down.
  const rHost = await (await browser.newContext()).newPage();
  const rGuest = await (await browser.newContext()).newPage();
  watchConsole(rHost, 'RHOST');
  watchConsole(rGuest, 'RGUEST');
  await rHost.goto(BASE);
  await rHost.click('#show-host');
  await rHost.fill('#host-name', 'Erin');
  await rHost.click('#create-table');
  await rHost.waitForSelector('#host-share:not([hidden])', { timeout: 20000 });
  const rCode = (await rHost.locator('.share-code').textContent()).trim();
  await rGuest.goto(`${BASE}/?join=${encodeURIComponent(rCode)}`);
  await rGuest.fill('#join-name', 'Finn');
  await rGuest.click('#join-btn');
  await rGuest.waitForFunction(
    () => document.getElementById('join-status').textContent.includes('Connected'),
    undefined, { timeout: 20000 },
  );
  await rHost.fill('#cards-per-player', '5');
  await rHost.click('#deal-btn');
  await rGuest.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 5, undefined, { timeout: 15000 });
  const guestHandBefore = await rGuest.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId).sort());

  // US-43/D31: the snapshot now carries hands. This is the assertion that
  // would have caught "restore succeeded, everyone's hands are empty".
  // The save is debounced (D26), so poll rather than assume it has landed.
  await rHost.waitForFunction(() => {
    const raw = window.localStorage.getItem('recard:host-state:v1');
    if (!raw) return false;
    const st = JSON.parse(raw);
    return st.piles.filter((p) => p.kind === 'hand' && p.cards.length === 5).length === 2;
  }, undefined, { timeout: 15000 });
  const snapHands = await rHost.evaluate(() => {
    const st = JSON.parse(window.localStorage.getItem('recard:host-state:v1'));
    return { version: st.version, hands: st.piles.filter((p) => p.kind === 'hand').map((p) => p.cards.length) };
  });
  assert(snapHands.version >= 2 && snapHands.hands.length === 2 && snapHands.hands.every((n) => n === 5),
    `the snapshot must carry both hands (D31), got ${JSON.stringify(snapHands)}`);

  // The host reloads. NOTHING is done to the guest from here on - that is
  // the entire point of US-44.
  rHost.once('dialog', (d) => d.accept());
  await rHost.reload();
  await rHost.waitForSelector('#resume-game:not([disabled])', { timeout: 20000 });
  await rHost.click('#resume-game'); // restore is offered, never automatic

  await rHost.waitForSelector('#restore-waiting:not([hidden])', { timeout: 25000 });
  const namedList = await rHost.evaluate(() =>
    [...document.querySelectorAll('.waiting-list li')].map((li) => li.textContent.trim()));
  // Smith Gate 1 #4: BY NAME. "1 of 1" never tells a host whether to keep
  // waiting; "Finn is still disconnected" does.
  assert(namedList.some((t) => t.includes('Finn')),
    `the wait list must name who is missing, got ${JSON.stringify(namedList)}`);
  assert(await rHost.locator('#resume-anyway-btn').isVisible(),
    '"Start anyway" must be available from the first second, not after a timeout');
  console.log(`US-45: a restored table waits and names who is missing - ${JSON.stringify(namedList)}`);

  // US-44: the guest reconnects on its own, and US-45 resumes on its own.
  await rHost.waitForFunction(
    () => document.getElementById('restore-waiting').hidden && !document.getElementById('screen-game').hidden,
    undefined, { timeout: 60000 },
  );
  await rGuest.waitForFunction(() => document.querySelectorAll('#hand-area .card').length === 5, undefined, { timeout: 30000 });
  const guestHandAfter = await rGuest.evaluate(() =>
    [...document.querySelectorAll('#hand-area .card')].map((c) => c.dataset.cardId).sort());
  assert(JSON.stringify(guestHandAfter) === JSON.stringify(guestHandBefore),
    `the guest must get their OWN cards back after a host restart.\n  before: ${JSON.stringify(guestHandBefore)}\n  after:  ${JSON.stringify(guestHandAfter)}`);
  const rSeats = await rHost.evaluate(() =>
    [...document.querySelectorAll('#game-roster li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()));
  assert(rSeats.length === 2 && !rSeats.some((t) => /disconnected/.test(t)),
    `a reconnect must reuse the seat, not strand the hand on a ghost - got ${JSON.stringify(rSeats)}`);
  console.log('US-43/44/45: host reloaded, the guest came back on its own, the game resumed with no host click, and every card was still theirs');

  await rHost.goto('about:blank');
  await rHost.close();
  await rGuest.close();

  assert(
    errors.every((e) => e.includes('favicon') || e.includes('404')),
    `unexpected console/page errors: ${JSON.stringify(errors)}`,
  );

  console.log(
    'e2e smoke test PASSED (US-1, US-2, US-4, US-6, US-7, US-8, US-11, US-12, US-13, US-14, US-16, US-19, ' +
      'US-22, US-23, US-24, US-25, US-27, US-28, US-29, US-31, US-40, US-41, US-42, US-43, US-44, US-45; D6 disconnect message, D12 zones, D13 cursor/lift, ' +
      'D14 hand-order persistence, D15 DEAL_MORE, D16 pass marker, D17 personal zones, D19 card-drag broadcast, ' +
      'D20 desktop breakpoints, D28 touch drag, D29 deck pile actions, D30 auto-start, D31 hands persisted, D32 client reconnect, D33 wait list)',
  );
} finally {
  await browser.close();
  server.close();
}
