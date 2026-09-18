// US-117 phase 111 (D132): the manual table-zoom wheel, verified
// against the real running app - a pure function verified by
// `tableZoom.test.js` says nothing about whether the DOM wiring
// actually applies it, which is exactly the kind of gap this project's
// own history (D129) says unit tests alone will miss.
// *fix (2026-09-17, direct user request): the S/M/L/XL preset buttons
// this suite used to also cover are gone entirely, no back-compat
// shim - the wheel is the only control now.
//
// NOT part of `npm test` - needs a browser. `npm run test:tablezoom`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WHEEL_DRAG_RANGE_PX, computeFitZoom } from '../src/tableZoom.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8217; // not 8211-8216 (designLint/uiActions/rtgPlaythrough/hostSetup/newGame)
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

async function currentTableZoomScale(page) {
  return page.evaluate(() => getComputedStyle(document.querySelector('#zones')).getPropertyValue('--table-zoom').trim());
}

// The zoom wheel lives inside `#screen-game`, hidden until a real table
// exists (`index.html`) - every test needs a live solo table, not just
// a page load, same startup sequence `uiActions.browser.mjs` uses.
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

// D132 revised (2026-09-17): the default is no longer a flat constant
// (`TABLE_ZOOM_DEFAULT_SCALE` is still exported, but only as
// `TableCamera`'s pre-layout starting value - see its own doc comment)
// - it's `computeFitZoom(<the active preset's own canvas size>, <the
// real .table-surface box>)`, so this asserts against that same math
// rather than a hardcoded number that would silently drift from
// `computeFitZoom`'s own behavior. Reads the canvas size back off the
// live `--table-canvas-w`/`-h` vars (D134: a preset MAY declare its own
// `tableCanvasSize`, so the DEFAULT preset's real canvas is not
// guaranteed to be the shared `TABLE_CANVAS_SIZE` constant).
test('the wheel applies the computed fit-zoom default once a table exists', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const { surface, canvas } = await page.evaluate(() => {
      const zones = document.querySelector('#zones');
      const cs = getComputedStyle(zones);
      const { width, height } = document.querySelector('.table-surface').getBoundingClientRect();
      return {
        surface: { width, height },
        canvas: { width: Number.parseFloat(cs.getPropertyValue('--table-canvas-w')), height: Number.parseFloat(cs.getPropertyValue('--table-canvas-h')) },
      };
    });
    const expected = String(computeFitZoom(canvas, surface));
    assert.equal(await page.locator('#table-zoom-wheel').getAttribute('aria-valuenow'), expected);
    assert.equal(await currentTableZoomScale(page), expected);
  } finally {
    await context.close();
  }
});

/** Drags the wheel up by more than a full range - always lands at
 * TABLE_ZOOM_MAX regardless of the starting scale (`zoomFromWheelDrag`
 * clamps). Used by the pan tests below, which need real room to pan in
 * (`maxPan` is 0 at/below 1x) now that the XL preset button is gone. */
async function zoomToMax(page) {
  const wheel = page.locator('#table-zoom-wheel');
  const box = await wheel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - (WHEEL_DRAG_RANGE_PX + 50));
  await page.mouse.up();
}

// *fix (direct user request, 2026-09-16): "like the zoom wheel on a
// mouse" as its own manual control - a vertical drag, tread up zooms
// in, down zooms out. Replaces the old `<input type=range>` dial test.
test('dragging the wheel UP zooms in, DOWN zooms out', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const wheel = page.locator('#table-zoom-wheel');
    const box = await wheel.boundingBox();
    const startScale = Number(await currentTableZoomScale(page));

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60); // UP
    const afterUp = Number(await currentTableZoomScale(page));
    assert.ok(afterUp > startScale, `spinning up must zoom in (${startScale} -> ${afterUp})`);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120); // back down, past start
    const afterDown = Number(await currentTableZoomScale(page));
    assert.ok(afterDown < afterUp, `spinning down must zoom back out (${afterUp} -> ${afterDown})`);
    await page.mouse.up();
  } finally {
    await context.close();
  }
});

test('the wheel clears the 44px touch-target floor', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const wheelBox = await page.locator('#table-zoom-wheel').boundingBox();
    assert.ok(wheelBox.width >= 44 && wheelBox.height >= 44, 'the wheel must clear the 44px floor');
  } finally {
    await context.close();
  }
});

// *fix (direct user request, 2026-09-16): "we'll also need to pan with
// drag on table." Dragging the empty table background (not a pile/
// card/button) pans the view.
test('dragging the empty table background pans #zones', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    // Pan only has room to move once zoomed in past 1x (`maxPan`).
    await zoomToMax(page);
    const surface = page.locator('.table-surface');
    const box = await surface.boundingBox();
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 55, box.y + 45);
    await page.mouse.up();
    const pan = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('#zones'));
      return { x: style.getPropertyValue('--table-pan-x').trim(), y: style.getPropertyValue('--table-pan-y').trim() };
    });
    assert.notEqual(pan.x, '', 'a pan-x must actually be set');
    assert.ok(Number.parseFloat(pan.x) > 0, `dragging right must pan positively on x, got ${pan.x}`);
    assert.ok(Number.parseFloat(pan.y) > 0, `dragging down must pan positively on y, got ${pan.y}`);
  } finally {
    await context.close();
  }
});

test('dragging a card does not pan the table - only the empty background does', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    await zoomToMax(page);
    const card = page.locator('[data-kind="hand"] .middle-card').first();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 80);
    await page.mouse.up();
    const panX = await page.evaluate(() => getComputedStyle(document.querySelector('#zones')).getPropertyValue('--table-pan-x').trim());
    assert.ok(panX === '' || Number.parseFloat(panX) === 0, `a card drag must never pan the table, got --table-pan-x: ${panX}`);
  } finally {
    await context.close();
  }
});

// *fix (direct user bug report, 2026-09-17): "drag alignment is still
// off it needs to readjust when the table zoom changes" - then, once
// pinned to the real culprit: "you need to scale the movement." A
// zone/pile's title bar drag (`attachPanelDrag`, ui.js) computed a
// SCREEN-space pointer delta and assigned it directly to the panel's
// own LOCAL `left`/`top` (the coordinate space `position: absolute`
// uses inside a `scale()`-transformed ancestor) - correct only at
// exactly 1x zoom. `TableCamera.toLocalDelta` (tableZoom.js) is the
// fix; this is the live proof it actually tracks the cursor 1:1 no
// matter the current zoom, not just at the unzoomed default.
async function dragTitleAndMeasureDelta(page) {
  const title = page.locator('.pile-title, .zone-name').first();
  const titleBox = await title.boundingBox();
  const panel = page.locator('[data-pile-id], .zone').first();
  const before = await panel.boundingBox();

  const startX = titleBox.x + titleBox.width / 2;
  const startY = titleBox.y + titleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const moveX = 150;
  const moveY = 80;
  await page.mouse.move(startX + moveX, startY + moveY, { steps: 8 });
  await page.waitForTimeout(50);
  const after = await panel.boundingBox();
  await page.mouse.up();
  await page.waitForTimeout(50);
  return { moveX, moveY, actualDx: after.x - before.x, actualDy: after.y - before.y };
}

// At the default (unzoomed) scale - this direction already worked
// before the fix, kept as a regression guard against re-breaking it.
test('dragging a panel\'s title bar tracks the cursor 1:1, at the default table zoom', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    const { moveX, moveY, actualDx, actualDy } = await dragTitleAndMeasureDelta(page);
    assert.ok(Math.abs(actualDx - moveX) < 2, `expected dx~=${moveX}, got ${actualDx}`);
    assert.ok(Math.abs(actualDy - moveY) < 2, `expected dy~=${moveY}, got ${actualDy}`);
  } finally {
    await context.close();
  }
});

// *fix (direct user bug report, 2026-09-17): "drag alignment is still
// off it needs to readjust when the table zoom changes" - then, once
// pinned to the real culprit: "you need to scale the movement." A
// zone/pile's title bar drag (`attachPanelDrag`, ui.js) computed a
// SCREEN-space pointer delta and assigned it directly to the panel's
// own LOCAL `left`/`top` (the coordinate space `position: absolute`
// uses inside a `scale()`-transformed ancestor) - correct only at
// exactly 1x zoom. `TableCamera.toLocalDelta` (tableZoom.js) is the
// fix; this is the live proof it actually tracks the cursor 1:1 while
// zoomed in, which is the direction that was actually broken.
test('dragging a panel\'s title bar tracks the cursor 1:1, zoomed in', async () => {
  // *fix (2026-09-17, D132-revision follow-up): an explicit viewport,
  // not Playwright's 1280x720 default - the Table Zone panel this test
  // drags moved down (`presets.js`' `SIMPLE_LAYOUT`, `y: 290 -> 480`,
  // clearing the top seat's own zone) to fix `lint:design`'s "Table
  // Zone overlaps Bob" finding. At MAX zoom (1.6x) that panel now
  // renders at screen-y ~768px, below a 720px-tall viewport entirely -
  // the drag missed empty space, not a regression in the delta math
  // this test actually exists to prove. 1440x900 is one of this
  // project's own real breakpoints (`designLint.check.mjs`'s
  // `VIEWPORTS`), not an arbitrary number picked to dodge the failure.
  const context = await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await freshLiveTable(context);
    await zoomToMax(page);
    const { moveX, moveY, actualDx, actualDy } = await dragTitleAndMeasureDelta(page);
    assert.ok(Math.abs(actualDx - moveX) < 2, `expected dx~=${moveX}, got ${actualDx}`);
    assert.ok(Math.abs(actualDy - moveY) < 2, `expected dy~=${moveY}, got ${actualDy}`);
  } finally {
    await context.close();
  }
});
