// Browser tests for card ACTIONS, driven through the right-click menu.
//
// Why this file exists (direct user observation): "it might be easier to
// test the ux actions now that we have the menu." Exactly right, and it
// is the reason this layer was missing before. Until D101 every card
// action was reachable only as a GESTURE - a native HTML5 drag, or a tap
// whose meaning depended on the card's facing. Playwright cannot
// meaningfully synthesise an HTML5 drag-and-drop, so the actions were
// effectively undrivable and only their pure helpers got tested. The
// context menu gave every action a named, clickable row with a stable
// `data-action` id, so a test can now perform a real user action and
// assert the real result.
//
// Scope, deliberately: the MIDDLE of the pyramid. `pileActions.test.js`
// covers what a row says and how it dispatches; `state.test.js` covers
// what the reducer does. Neither can catch the wiring BETWEEN them - a
// menu row bound to the wrong callback, a dispatch that never reaches
// the reducer, an action offered but dead on click. That gap is what
// this file is for, so it stays small and stays about wiring.
//
// Discrete `test()` cases, not one long script - Trin's own retro note
// on the retired e2e suite (D60): a failure anywhere in a monolith hides
// everything after it. One shared browser and one dealt table (`before`),
// each test independent within it.
//
// NOT part of `npm test` - it needs a browser and takes seconds, not
// milliseconds. `npm run test:ui` / `bobp make test-ui`, and part of
// `make check`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8212; // not 8211 - designLint.check.mjs owns that one
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// Same static server + system-chromium fallback as `designLint.check.mjs`.
const server = http.createServer(async (request, response) => {
  const pathname = request.url.split('?', 1)[0];
  // Resolve to the real file BEFORE reading its extension: `extname('/')`
  // is empty, so typing the root as octet-stream makes the browser
  // download index.html instead of rendering it ("fixture.page.goto: Download is
  // starting"), which is exactly what happened the first time this ran.
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

// One holder object, not two `let`s: `unicorn/no-top-level-assignment-in-function`
// forbids a `before` hook writing top-level bindings, and a shared
// fixture is exactly what a `before` hook is for.
const fixture = { browser: undefined, page: undefined };

/**
 * The card the tests act on: the last card in the host's own hand fan.
 * `.last()` for the same reason `designLint.check.mjs` uses it - the fan
 * overlaps every card except the last, so only that one is unobstructed
 * at its centre point.
 */
const handCard = () => fixture.page.locator('[data-kind="hand"] .middle-card').last();
const tableCards = () => fixture.page.locator('.pile-section[data-pile-id="table"] .middle-card');

/**
 * Open a card's context menu and return its rows.
 */
async function openMenu(locator) {
  await locator.click({ button: 'right' });
  await fixture.page.waitForSelector('.card-context-menu', { timeout: 5000 });
  return fixture.page.locator('.card-context-menu .pile-action-menu-item');
}

async function chooseAction(locator, actionId) {
  await openMenu(locator);
  await fixture.page.locator(`.card-context-menu [data-action="${actionId}"]`).click();
}

before(async () => {
  await new Promise((resolve) => server.listen(PORT, resolve));
  fixture.browser = await launchChromium();
  fixture.page = await (await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await fixture.page.goto(BASE);
  await fixture.page.click('#show-host');
  await fixture.page.fill('#host-name', 'Alice');
  await fixture.page.click('#create-table');
  await fixture.page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  await fixture.page.fill('#cards-per-player', '5');
  await fixture.page.click('#deal-btn');
  await fixture.page.waitForFunction(
    () => document.querySelector('[data-kind="hand"]')?.querySelectorAll('.card').length === 5,
    undefined, { timeout: 15_000 },
  );
});

after(async () => {
  await fixture.browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

// The *nit that prompted this file: rows were icon-only, with the name
// reachable only as a tooltip. This is that assertion against the real
// rendered menu, not against the model.
test('every card action row shows the action name, not just an icon', async () => {
  const rows = await openMenu(handCard());
  const count = await rows.count();
  assert.ok(count > 0, 'a hand card offers at least one action');
  for (let index = 0; index < count; index++) {
    const row = rows.nth(index);
    const text = (await row.textContent()).trim();
    const label = await row.getAttribute('title');
    assert.ok(label && label.length > 0, 'every row carries its name as a tooltip too');
    assert.ok(text.includes(label), `row "${text}" must show its own name (${label})`);
    assert.ok(text.length > label.length, `row "${text}" must show an icon as well as the name`);
  }
  await fixture.page.keyboard.press('Escape');
});

// D102: a hand card's only card-level action is `move` - the retired
// `play` verb would have shown up here as an extra row.
test('a hand card offers exactly one action, Move - the retired play verb is really gone (D102)', async () => {
  const rows = await openMenu(handCard());
  assert.deepEqual(await rows.evaluateAll((rows) => rows.map((element) => element.dataset.action)), ['move']);
  await fixture.page.keyboard.press('Escape');
});

// The targeted-action path end to end: choose Move, then click a
// destination pile. Nothing else in the suite exercises the two-step
// pick, and it is pure wiring - three layers have to agree.
test('Move from hand: choosing Move then clicking the table really moves the card there', async () => {
  const before = await tableCards().count();
  const cardId = await handCard().getAttribute('data-card-id');

  await chooseAction(handCard(), 'move');
  await fixture.page.locator('.pile-section.pile-target[data-pile-id="table"]').click();

  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.pile-section[data-pile-id="table"] .middle-card[data-card-id="${CSS.escape(id)}"]`) !== null,
    cardId, { timeout: 5000 },
  );
  assert.equal(await tableCards().count(), before + 1);
});

// D102 again, through the UI this time: a card leaving a hand arrives
// public and face-up. The reducer test asserts the fields; this asserts
// the player can actually see the face.
test('a card moved out of hand lands face-up on the table (D102 transform, through the real UI)', async () => {
  const card = tableCards().last();
  assert.equal(await card.locator('.card-back').count(), 0, 'not showing a back');
  const face = (await card.textContent()).trim();
  assert.ok(face.length > 0, `the card shows a real face, got "${face}"`);
});

// D103, the show/hide toggle, as a user performs it: the row's NAME is
// the assertion - it must offer the direction the card is actually
// going, which is the whole reason there are two offer ids.
test('Turn face down then Turn over: the menu offers the opposite direction each time (D103)', async () => {
  const card = tableCards().last();
  const cardId = await card.getAttribute('data-card-id');

  const faceUpRows = await openMenu(card);
  assert.ok((await faceUpRows.evaluateAll((rows) => rows.map((element) => element.dataset.action))).includes('conceal'),
    'a face-up card offers conceal, never reveal');
  await fixture.page.locator('.card-context-menu [data-action="conceal"]').click();
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-card-id="${CSS.escape(id)}"] .card-back`) !== null,
    cardId, { timeout: 5000 },
  );

  const faceDownRows = await openMenu(card);
  const ids = await faceDownRows.evaluateAll((rows) => rows.map((element) => element.dataset.action));
  assert.ok(ids.includes('reveal'), 'now face-down, so it offers reveal');
  assert.ok(!ids.includes('conceal'), 'and no longer offers conceal - one direction at a time');
  await fixture.page.locator('.card-context-menu [data-action="reveal"]').click();
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-card-id="${CSS.escape(id)}"] .card-back`) === null,
    cardId, { timeout: 5000 },
  );
});

// An in-place action that is NOT the flip, so the test above cannot pass
// by accident on any "clicking a row does something" behaviour.
test('Rotate: an in-place action commits on click, with no destination step', async () => {
  const card = tableCards().last();
  const cardId = await card.getAttribute('data-card-id');
  // Orientation is `data-orientation` on the card's WRAPPER, not a class
  // on the `.card` face (`ui.js` line ~652; style.css rotates off that
  // attribute). Asserting the wrong one is how this test first failed.
  assert.equal(await card.getAttribute('data-orientation'), null, 'starts unrotated');

  await chooseAction(card, 'rotate');
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-card-id="${CSS.escape(id)}"]`)?.dataset.orientation === 'landscape',
    cardId, { timeout: 5000 },
  );
});

// Smith's Gate 1 condition on D101: a card with nothing to offer must
// leave the native OS menu alone rather than opening an empty one.
test('a card menu never opens empty', async () => {
  await openMenu(tableCards().last());
  assert.ok(await fixture.page.locator('.card-context-menu .pile-action-menu-item').count() > 0);
  await fixture.page.keyboard.press('Escape');
});

// --- Tighten / Loosen (*nit) ----------------------------------------
//
// This layer earned itself again here. The reducer tests for
// ADJUST_PILE_SPREAD all passed while the feature did nothing on
// screen: `spread` was written to state correctly but never named in
// `Pile.getView()`'s explicit field list, so it never crossed into the
// view. Nothing below the browser could have seen that.
const handRow = () => fixture.page.locator('[data-kind="hand"] .card-row').first();
const spreadOf = () => handRow().evaluate((row) => row.style.getPropertyValue('--pile-spread'));
const overlapPx = () => handRow().evaluate((row) => {
  const second = row.querySelectorAll('.middle-card')[1];
  return Number.parseFloat(getComputedStyle(second).marginLeft);
});

test('Loosen really spreads the cards apart on screen, not just in state', async () => {
  const before = await overlapPx();
  await fixture.page.locator('[data-kind="hand"] button[title="Loosen"]').click();
  await fixture.page.waitForFunction(
    (previous) => {
      const row = document.querySelector('[data-kind="hand"] .card-row');
      const second = row?.querySelectorAll('.middle-card')[1];
      return second && Number.parseFloat(getComputedStyle(second).marginLeft) > previous;
    },
    before, { timeout: 5000 },
  );
  assert.ok(await overlapPx() > before, 'cards overlap less than they did');
  assert.notEqual(await spreadOf(), '', 'the row really carries the pile\'s own spread');
});

test('Tighten is the exact inverse - one of each returns to where it started', async () => {
  const before = await overlapPx();
  await fixture.page.locator('[data-kind="hand"] button[title="Tighten"]').click();
  await fixture.page.waitForFunction(
    (previous) => {
      const row = document.querySelector('[data-kind="hand"] .card-row');
      const second = row?.querySelectorAll('.middle-card')[1];
      return second && Number.parseFloat(getComputedStyle(second).marginLeft) < previous;
    },
    before, { timeout: 5000 },
  );
  await fixture.page.locator('[data-kind="hand"] button[title="Loosen"]').click();
  await fixture.page.waitForTimeout(200);
  assert.ok(Math.abs(await overlapPx() - before) < 0.5, 'back to the same overlap');
});

// The disabled-at-the-limit rule, which only exists so a player never
// clicks a control that cannot do anything.
test('Loosen disappears at minimum spread, and Tighten still works from there', async () => {
  for (let index = 0; index < 12; index++) {
    const loosen = fixture.page.locator('[data-kind="hand"] button[title="Loosen"]');
    if (await loosen.count() === 0 || await loosen.isDisabled()) break;
    await loosen.click();
    await fixture.page.waitForTimeout(80);
  }
  const loosen = fixture.page.locator('[data-kind="hand"] button[title="Loosen"]');
  assert.ok(await loosen.count() === 0 || await loosen.isDisabled(), 'no dead Loosen at the floor');
  assert.equal(await spreadOf(), '0', 'fully loosened means no overlap at all');

  const tighten = fixture.page.locator('[data-kind="hand"] button[title="Tighten"]');
  assert.ok(await tighten.count() > 0 && !(await tighten.isDisabled()), 'the other direction is still open');
});
