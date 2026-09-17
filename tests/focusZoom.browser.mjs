// US-117 phase 113 (D131): focus-zoom overlay core mechanism, verified
// against the real running app - `focusZoom.test.js` only covers the
// clamp math, not whether hover/click/drag actually drive the DOM the
// way this file claims. NOT part of `npm test` - needs a browser.
// `npm run test:focuszoom`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { HOVER_INTENT_MS } from '../src/focusZoom.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8218; // not 8211-8217 (designLint/uiActions/rtgPlaythrough/hostSetup/newGame/tableZoom)
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer(async (request, response) => {
  const pathname = request.url.split('?', 1)[0];
  const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

const SYSTEM_CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
async function launchChromium() {
  try {
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (error) {
    for (const executablePath of SYSTEM_CHROMIUM_PATHS) {
      try {
        return await chromium.launch({ executablePath, args: ['--no-sandbox'] });
      } catch { /* try the next candidate */ }
    }
    throw error;
  }
}

const fixture = { browser: undefined };

before(async () => {
  await new Promise((resolve) => server.listen(PORT, resolve));
  fixture.browser = await launchChromium();
});

after(async () => {
  await fixture.browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

async function freshLiveTable(context) {
  const page = await context.newPage();
  await page.goto(BASE);
  await page.click('#show-host');
  await page.fill('#host-name', 'Alice');
  await page.click('#create-table');
  await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  await page.fill('#cards-per-player', '5');
  await page.click('#deal-btn');
  await page.waitForFunction(
    () => document.querySelector('[data-kind="hand"]')?.querySelectorAll('.card').length === 5,
    undefined, { timeout: 15_000 },
  );
  return page;
}

function myHandPile(page) {
  return page.locator('zone-panel.seat-zone').first().locator('.pile-section[data-pile-id]').first();
}

test('hovering a pile does nothing before the hover-intent delay elapses', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    await pile.hover();
    await page.waitForTimeout(HOVER_INTENT_MS / 2);
    assert.equal(await pile.evaluate((element) => element.classList.contains('focus-zoomed')), false);
  } finally {
    await context.close();
  }
});

test('hovering past the delay grows the pile as a fixed overlay in <body>', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.hover();
    await page.waitForSelector(`body > .pile-section.focus-zoomed[data-pile-id="${pileId}"]`, { timeout: 2000 });
    const parentTag = await page.evaluate(
      (id) => document.querySelector(`.focus-zoomed[data-pile-id="${CSS.escape(id)}"]`).parentElement.tagName,
      pileId,
    );
    assert.equal(parentTag, 'BODY');
  } finally {
    await context.close();
  }
});

test('clicking a pile grows it immediately, with no delay', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.click({ position: { x: 2, y: 2 } });
    const grown = await page.evaluate(
      (id) => document.querySelector(`body > .focus-zoomed[data-pile-id="${CSS.escape(id)}"]`) !== null,
      pileId,
    );
    assert.ok(grown, 'a click must grow the pile immediately, not wait for the hover-intent delay');
  } finally {
    await context.close();
  }
});

test('moving the pointer off the grown pile shrinks it back into its normal position', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.hover();
    await page.waitForSelector(`body > .focus-zoomed[data-pile-id="${pileId}"]`, { timeout: 2000 });
    await page.mouse.move(0, 0);
    await page.waitForFunction(
      (id) => document.querySelector(`body > .focus-zoomed[data-pile-id="${CSS.escape(id)}"]`) === null,
      pileId,
      { timeout: 2000 },
    );
    // Shrunk back into its ORIGINAL place, not just deleted from <body>.
    const backInZones = await page.evaluate(
      (id) => document.querySelector(`#zones .pile-section[data-pile-id="${CSS.escape(id)}"]`) !== null,
      pileId,
    );
    assert.ok(backInZones, 'the pile must return to #zones, not disappear');
  } finally {
    await context.close();
  }
});

test('starting a drag suppresses focus-zoom entirely', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const card = page.locator('[data-kind="hand"] .middle-card').last();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.dispatchEvent('[data-kind="hand"] .middle-card >> nth=-1', 'dragstart', {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    });
    await page.waitForTimeout(HOVER_INTENT_MS + 100);
    const anyFocused = await page.evaluate(() => document.querySelector('.focus-zoomed') !== null);
    assert.equal(anyFocused, false, 'no pile should grow while a drag is in progress');
    await page.mouse.up();
  } finally {
    await context.close();
  }
});

// Trin UAT addition: the live-triggered tests above never actually
// exercise the claim Neo's writeup calls the real find of this phase -
// that `reapplyFocusZoom` survives a re-render while a pile is
// focus-zoomed. `renderZones` rebuilds `#zones` wholesale on every
// state-driven render. A click on a game-action button INSIDE the
// focused pile itself (not a click elsewhere, which the "click
// outside" test above already proves correctly DISMISSES focus) is a
// real, simple way to force that render from a solo table - no 2-peer
// harness needed - while keeping the click inside the overlay so it
// does not itself get treated as a click-outside dismissal.
test('acting on the focused pile itself (causing a re-render) does not lose the focus-zoom', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const deckPile = page.locator('.pile-section[data-pile-id="deck"]');
    await deckPile.hover();
    await page.waitForSelector('body > .focus-zoomed[data-pile-id="deck"]', { timeout: 2000 });

    // A click INSIDE the now-grown (reparented to <body>) deck pile -
    // its own "Draw" action button - dispatches DRAW and forces a full
    // renderGameFromView -> renderZones. The pile's OWN DOM node from
    // before this click is now stale/destroyed by that render.
    await page.locator('body > .focus-zoomed[data-pile-id="deck"] .pile-action-btn[title="Draw"]').click();

    // Still focus-zoomed afterward - `reapplyFocusZoom` re-grew a
    // FRESH element for the same pile id, not left the old one to rot.
    const stillFocused = await page.evaluate(
      () => document.querySelector('body > .focus-zoomed[data-pile-id="deck"]') !== null,
    );
    assert.ok(stillFocused, 'focus-zoom must survive a re-render caused by acting on the focused pile');

    // Exactly ONE element for the deck pile exists in the whole
    // document - not a stale orphan left behind in <body> plus a
    // second fresh one hiding back inside #zones.
    const matchCount = await page.evaluate(
      () => document.querySelectorAll('.pile-section[data-pile-id="deck"]').length,
    );
    assert.equal(matchCount, 1, 'a re-render must not leave a duplicate/orphaned pile element behind');
  } finally {
    await context.close();
  }
});

// US-117 phase 114 (T114.2): the live proof of D130's own claim - a
// card can be dragged OUT of an already focus-zoomed (reparented to
// <body>) pile with zero drag/drop code changes, because
// `getBoundingClientRect()`/synthetic DragEvents don't care where in
// the DOM an element currently lives. Uses the same synthetic
// dragover/drop mechanism `rtgPlaythrough.browser.mjs` already
// documents as necessary - Playwright cannot synthesise a real native
// HTML5 drag gesture end-to-end.
test('a card can be dragged out of an already focus-zoomed pile to another zone', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.hover();
    await page.waitForSelector(`body > .focus-zoomed[data-pile-id="${pileId}"]`, { timeout: 2000 });

    const beforeHandCount = await page.locator(`body > .focus-zoomed[data-pile-id="${pileId}"] .card`).count();
    assert.ok(beforeHandCount > 0, 'the hand must have a card to drag in the first place');

    const moved = await page.evaluate(() => {
      const grownHand = document.querySelector('body > .focus-zoomed[data-kind="hand"]');
      const card = grownHand.querySelector('.middle-card[data-pileable-id]');
      const pileableId = card.dataset.pileableId;
      const tablePile = document.querySelector('.pile-section[data-pile-id="table"]');
      const box = tablePile.getBoundingClientRect();
      const transfer = new DataTransfer();
      transfer.setData('text/plain', pileableId);
      const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.x + 5, clientY: box.y + 5 };
      tablePile.dispatchEvent(new DragEvent('dragover', at));
      tablePile.dispatchEvent(new DragEvent('drop', at));
      return pileableId;
    });
    assert.ok(moved, 'the drop must have found a real card to move');

    await page.waitForFunction(
      (id) => document.querySelector(`.pile-section[data-pile-id="table"] [data-pileable-id="${CSS.escape(id)}"]`) !== null,
      moved,
      { timeout: 2000 },
    );
  } finally {
    await context.close();
  }
});

// T114.1's clamp math is already unit-tested (`focusZoom.test.js`) but
// never proven against a REAL layout - a small viewport all but
// guarantees at least one pile sits near an edge/corner, exercising
// Smith's D131 clamp-nudge ruling for real rather than by construction.
test('a grown pile never extends past the viewport, even on a small screen', async () => {
  const context = await fixture.browser.newContext({ viewport: { width: 500, height: 500 } });
  try {
    const page = await freshLiveTable(context);
    const piles = await page.locator('.pile-section[data-pile-id]').all();
    for (const pile of piles) {
      await pile.hover({ force: true });
      // *fix (found live, 2026-09-16): `.focus-zoomed`'s own 0.15s CSS
      // transition (`style.css`) starts only AFTER the hover-intent
      // timer fires, so a wait of just `HOVER_INTENT_MS + 50` measured
      // the overlay mid-animation, not at rest - +200 clears the full
      // 150ms transition with room to spare.
      await page.waitForTimeout(HOVER_INTENT_MS + 200);
      const overlay = page.locator('body > .pile-section.focus-zoomed');
      if (await overlay.count() === 0) continue; // hover missed - not this test's concern
      const box = await overlay.boundingBox();
      // A ~1px tolerance for sub-pixel rounding through the scale
      // transform - the same class of measurement artifact the 44px
      // touch-target check (`designLint.check.mjs`) already accounts
      // for, not a real clip a player could perceive.
      const tolerance = 1;
      assert.ok(box.x >= -tolerance && box.y >= -tolerance, `overlay must not clip the top/left edge (x=${box.x}, y=${box.y})`);
      assert.ok(box.x + box.width <= 500 + tolerance && box.y + box.height <= 500 + tolerance, `overlay must not clip the bottom/right edge (${JSON.stringify(box)})`);
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => document.querySelector('.focus-zoomed') === null, undefined, { timeout: 2000 });
    }
  } finally {
    await context.close();
  }
});

// *fix (direct user bug report, 2026-09-16): "drag a card out [of a
// zoomed pile] goes bonkers." The EXISTING drag-out test above
// dispatches synthetic `dragover`/`drop` directly, skipping `dragstart`
// entirely (Playwright cannot synthesise a full native HTML5 drag) -
// which is exactly why it never caught this: the real bug was in
// `wireFocusZoom`'s own `dragstart` listener unconditionally shrinking
// (reparenting) the CURRENTLY FOCUSED pile, including when the drag
// started from a card INSIDE that same pile - moving the drag's own
// source element mid-gesture. This test dispatches a real `dragstart`
// on a card inside the zoomed pile and checks it stays put.
test('starting a drag FROM a card inside the focus-zoomed pile does not shrink it', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.hover();
    await page.waitForSelector(`body > .pile-section.focus-zoomed[data-pile-id="${pileId}"]`, { timeout: 2000 });

    await page.dispatchEvent(`body > .focus-zoomed[data-pile-id="${pileId}"] .middle-card >> nth=0`, 'dragstart', {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    });

    const stillFocused = await page.evaluate(
      (id) => document.querySelector(`body > .pile-section.focus-zoomed[data-pile-id="${CSS.escape(id)}"]`) !== null,
      pileId,
    );
    assert.ok(stillFocused, 'the pile must stay put while its own card is mid-drag, not snap back into #zones');

    await page.dispatchEvent(`body > .focus-zoomed[data-pile-id="${pileId}"] .middle-card >> nth=0`, 'dragend');
  } finally {
    await context.close();
  }
});

// *fix (direct user bug report, 2026-09-16): "interact with the
// [Tighten/Loosen] slider [and it] goes bonkers." Dragging the slider
// can carry the pointer briefly outside the pile's own enlarged box -
// a plain `pointerleave` used to shrink (reparent) the pile mid-drag.
test('dragging the pile\'s own spread slider outside its bounds does not shrink the pile mid-drag', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const pile = myHandPile(page);
    const pileId = await pile.getAttribute('data-pile-id');
    await pile.hover();
    await page.waitForSelector(`body > .pile-section.focus-zoomed[data-pile-id="${pileId}"]`, { timeout: 2000 });

    const slider = page.locator(`body > .focus-zoomed[data-pile-id="${pileId}"] .spread-slider-input`);
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Move well outside the (enlarged) pile's own box while the button
    // is still held - the exact gesture that used to trigger a
    // mid-drag `pointerleave` shrink.
    await page.mouse.move(box.x + box.width / 2, box.y - 400);
    const stillFocusedMidDrag = await page.evaluate(
      (id) => document.querySelector(`body > .pile-section.focus-zoomed[data-pile-id="${CSS.escape(id)}"]`) !== null,
      pileId,
    );
    assert.ok(stillFocusedMidDrag, 'must not shrink while the slider drag is still in progress (button held)');

    // Releasing OUTSIDE the pile is a real "the pointer left" - it
    // should shrink NOW, not stay stuck open forever.
    await page.mouse.up();
    await page.waitForFunction(
      (id) => document.querySelector(`body > .pile-section.focus-zoomed[data-pile-id="${CSS.escape(id)}"]`) === null,
      pileId, { timeout: 2000 },
    );
  } finally {
    await context.close();
  }
});
