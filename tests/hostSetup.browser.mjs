// Host setup screen: deck selection (US-110) and sticky settings
// (US-111). Direct user request: "add deck selection to the start menu
// if the game yaml has multiple decks... we don't need all the decks
// in every game. also the game params sticky so it remembers the
// previous session - just the last one."
//
// Two fresh pages sharing one browser CONTEXT (not one page across
// tests, unlike `uiActions.browser.mjs`'s shared-page convention) -
// US-111 is specifically about what a SECOND page load in the same
// browser sees, so the tests need real page boundaries between "set
// this up" and "reload and check the prefill", not just DOM state
// carried in memory.
//
// NOT part of `npm test` - needs a browser. `npm run test:hostsetup` /
// `bobp make test-hostsetup`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8214; // not 8211/8212/8213 (designLint/uiActions/rtgPlaythrough)
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

const fixture = { browser: undefined, context: undefined };

before(async () => {
  await new Promise((resolve) => server.listen(PORT, resolve));
  fixture.browser = await launchChromium();
});

after(async () => {
  await fixture.browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

async function freshHostScreen(context) {
  const page = await context.newPage();
  await page.goto(BASE);
  await page.click('#show-host');
  return page;
}

test('a preset with no deckChoices (every game but RtG) never shows the picker', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    // War is PRESETS[0] - selected by default, no `#host-preset` change needed.
    assert.equal(await page.locator('#host-preset').inputValue(), 'War');
    assert.ok(await page.locator('#host-deck-choices').isHidden(), 'no deck picker for a preset without deckChoices');
  } finally {
    await context.close();
  }
});

test('RtG shows one checkbox per catalog deck, grouped by colour and sorted by name, only the first checked', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    const checkboxes = page.locator('#host-deck-choices input[type=checkbox]');
    assert.ok(await checkboxes.count() > 1, 'RtG has more than one deck to choose from');
    assert.ok(await page.locator('#host-deck-choices').isVisible());
    // *nit (direct user request): "only select the first by default" -
    // reversed from US-110's original "every deck checked".
    const checkedStates = await checkboxes.evaluateAll((els) => els.map((element) => element.checked));
    assert.deepEqual(checkedStates, [true, ...checkedStates.slice(1).map(() => false)], 'only the first deck is checked by default');

    // *nit (direct user request): "group decks by color" - more than
    // one heading means the grouping actually rendered, not one flat list.
    assert.ok(await page.locator('.deck-choice-group-heading').count() > 1, 'decks are grouped under more than one colour heading');
  } finally {
    await context.close();
  }
});

test('deck choices within each colour group are sorted alphabetically by name', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    const rows = await page.locator('.deck-choice-group-heading, .deck-choice-name').evaluateAll(
      (els) => els.map((element) => ({ isHeading: element.classList.contains('deck-choice-group-heading'), text: element.textContent })));

    const groups = [];
    for (const row of rows) {
      if (row.isHeading) groups.push([]);
      else groups.at(-1).push(row.text);
    }
    assert.ok(groups.length > 1, 'RtG decks span more than one colour group');
    for (const names of groups) {
      assert.deepEqual(names, names.toSorted((a, b) => a.localeCompare(b)), `group [${names}] is sorted by name`);
    }
  } finally {
    await context.close();
  }
});

test('choosing 2 of 15 decks puts exactly those 2 on the real table, no others', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    const checkboxes = page.locator('#host-deck-choices input[type=checkbox]');
    const chosenIds = (await checkboxes.evaluateAll((els) => els.map((element) => element.value))).slice(0, 2);
    await checkboxes.evaluateAll((elements, ids) => { for (const element of elements) element.checked = ids.includes(element.value); }, chosenIds);

    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
    await page.click('#deal-btn');
    await page.waitForSelector('[data-pile-id]', { timeout: 15_000 });

    const deckPanelIds = await page.locator('.pile-section[data-kind="deck"]').evaluateAll((els) => els.map((element) => element.dataset.pileId));
    assert.deepEqual(deckPanelIds.toSorted(), chosenIds.toSorted(), 'exactly the chosen decks are on the table, no others');
  } finally {
    await context.close();
  }
});

test('unchecking every deck blocks table creation with a clear error, and creates nothing', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    await page.locator('#host-deck-choices input[type=checkbox]').evaluateAll((elements) => { for (const element of elements) element.checked = false; });

    await page.click('#create-table');
    await page.waitForTimeout(300);

    assert.ok(await page.locator('#host-create-error').isVisible(), 'a clear error is shown');
    assert.match(await page.locator('#host-create-error').textContent(), /deck/i);
    assert.ok(await page.locator('#host-form').isVisible(), 'still on the setup form - no table was created');
    assert.ok(await page.locator('#host-share').isHidden());
  } finally {
    await context.close();
  }
});

test('sticky settings: name, preset, expected-players, allow-zones, and deck choices all survive a fresh page load', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await freshHostScreen(context);
    await page.fill('#host-name', 'Zara');
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    await page.fill('#host-expected-players', '3');
    await page.uncheck('#host-allow-player-zones');
    const checkboxes = page.locator('#host-deck-choices input[type=checkbox]');
    const chosenIds = (await checkboxes.evaluateAll((els) => els.map((element) => element.value))).slice(0, 3);
    await checkboxes.evaluateAll((elements, ids) => { for (const element of elements) element.checked = ids.includes(element.value); }, chosenIds);

    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });

    // A genuinely fresh page load, same browser context (same
    // localStorage) - this is the actual thing US-111 promises: a NEW
    // session sees the LAST one's settings, not the current page still
    // holding form state in memory.
    const page2 = await freshHostScreen(context);
    assert.equal(await page2.locator('#host-name').inputValue(), 'Zara');
    assert.equal(await page2.locator('#host-preset').inputValue(), 'Recard the Gathering');
    assert.equal(await page2.locator('#host-expected-players').inputValue(), '3');
    assert.equal(await page2.locator('#host-allow-player-zones').isChecked(), false);
    const checkedOnReload = await page2.locator('#host-deck-choices input[type=checkbox]:checked').evaluateAll((els) => els.map((element) => element.value));
    assert.deepEqual(checkedOnReload.toSorted(), chosenIds.toSorted());
  } finally {
    await context.close();
  }
});

test('sticky settings: only the LAST session is remembered - an earlier one leaves no trace', async () => {
  const context = await fixture.browser.newContext();
  try {
    const first = await freshHostScreen(context);
    await first.fill('#host-name', 'First');
    await first.selectOption('#host-preset', { label: 'War' });
    await first.click('#create-table');
    await first.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });

    const second = await freshHostScreen(context);
    await second.fill('#host-name', 'Second');
    await second.selectOption('#host-preset', { label: 'Gin Rummy' });
    await second.click('#create-table');
    await second.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });

    const third = await freshHostScreen(context);
    assert.equal(await third.locator('#host-name').inputValue(), 'Second', 'only the most recent session, not the first');
    assert.equal(await third.locator('#host-preset').inputValue(), 'Gin Rummy');
  } finally {
    await context.close();
  }
});
