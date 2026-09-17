// US-117 phase 111 (D132): the manual table-zoom dial + S/M/L/XL
// presets, verified against the real running app - a pure function
// verified by `tableZoom.test.js` says nothing about whether the DOM
// wiring actually applies it, which is exactly the kind of gap this
// project's own history (D129) says unit tests alone will miss.
//
// NOT part of `npm test` - needs a browser. `npm run test:tablezoom`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { TABLE_ZOOM_PRESETS, TABLE_ZOOM_DEFAULT } from '../src/tableZoom.js';

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

// The zoom dial lives inside `#screen-game`, hidden until a real table
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

test('the wheel applies the sane default (M) once a table exists', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    assert.equal(await page.locator('#table-zoom-wheel').getAttribute('aria-valuenow'), String(TABLE_ZOOM_PRESETS[TABLE_ZOOM_DEFAULT]));
    assert.equal(await currentTableZoomScale(page), String(TABLE_ZOOM_PRESETS[TABLE_ZOOM_DEFAULT]));
  } finally {
    await context.close();
  }
});

for (const size of ['S', 'M', 'L', 'XL']) {
  test(`clicking the "${size}" preset sets both the wheel and #zones' scale`, async () => {
    const context = await fixture.browser.newContext();
    try {
      const page = await freshLiveTable(context);
      await page.click(`[data-zoom-preset="${size}"]`);
      assert.equal(await page.locator('#table-zoom-wheel').getAttribute('aria-valuenow'), String(TABLE_ZOOM_PRESETS[size]));
      assert.equal(await currentTableZoomScale(page), String(TABLE_ZOOM_PRESETS[size]));
    } finally {
      await context.close();
    }
  });
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

test('every preset button and the wheel itself clear the 44px touch-target floor', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    for (const size of ['S', 'M', 'L', 'XL']) {
      const box = await page.locator(`[data-zoom-preset="${size}"]`).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${size} preset button must clear the 44px floor`);
    }
    const wheelBox = await page.locator('#table-zoom-wheel').boundingBox();
    assert.ok(wheelBox.width >= 44 && wheelBox.height >= 44, 'the wheel must clear the 44px floor too');
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
    await page.click('[data-zoom-preset="XL"]');
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
    await page.click('[data-zoom-preset="XL"]');
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
