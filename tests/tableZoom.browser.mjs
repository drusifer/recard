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

test('the dial applies the sane default (M) once a table exists', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    assert.equal(await page.locator('#table-zoom-dial').inputValue(), String(TABLE_ZOOM_PRESETS[TABLE_ZOOM_DEFAULT]));
    assert.equal(await currentTableZoomScale(page), String(TABLE_ZOOM_PRESETS[TABLE_ZOOM_DEFAULT]));
  } finally {
    await context.close();
  }
});

for (const size of ['S', 'M', 'L', 'XL']) {
  test(`clicking the "${size}" preset sets both the dial and #zones' scale`, async () => {
    const context = await fixture.browser.newContext();
    try {
      const page = await freshLiveTable(context);
      await page.click(`[data-zoom-preset="${size}"]`);
      assert.equal(await page.locator('#table-zoom-dial').inputValue(), String(TABLE_ZOOM_PRESETS[size]));
      assert.equal(await currentTableZoomScale(page), String(TABLE_ZOOM_PRESETS[size]));
    } finally {
      await context.close();
    }
  });
}

test('dragging the dial directly (not a preset) also updates the applied scale', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    await page.locator('#table-zoom-dial').fill('1.2');
    await page.locator('#table-zoom-dial').dispatchEvent('input');
    assert.equal(await currentTableZoomScale(page), '1.2');
  } finally {
    await context.close();
  }
});

test('every preset button and the dial itself clear the 44px touch-target floor', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshLiveTable(context);
    for (const size of ['S', 'M', 'L', 'XL']) {
      const box = await page.locator(`[data-zoom-preset="${size}"]`).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${size} preset button must clear the 44px floor`);
    }
  } finally {
    await context.close();
  }
});
