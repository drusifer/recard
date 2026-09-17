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
  // Report a page error rather than timing out on its consequences.
  if (fixture.pageErrors.length > 0) {
    assert.fail(`the page threw before this interaction:\n${fixture.pageErrors.join('\n')}`);
  }
  // A card that is not actionable produces a 30-second timeout whose
  // message ("element never became visible, enabled and stable") says
  // nothing about WHY. Report the geometry that decides it instead.
  const box = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const stack = element.closest('.card-stack');
    return {
      card: { w: rect.width, h: rect.height, x: rect.x, y: rect.y },
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      stack: stack && {
        w: stack.getBoundingClientRect().width,
        h: stack.getBoundingClientRect().height,
        extentX: stack.style.getPropertyValue('--stack-extent-x'),
        extentY: stack.style.getPropertyValue('--stack-extent-y'),
      },
    };
  });
  assert.ok(box.card.w > 0 && box.card.h > 0,
    `a card must have a real box to be clickable, got ${JSON.stringify(box)}`);

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

  // Surface page errors instead of swallowing them. A rendering
  // exception leaves the DOM half-built, so every later test fails as
  // a 30-second "element never became stable" timeout that says
  // nothing about the actual cause - which is exactly how a whole
  // suite can go red with no usable signal. Collected rather than
  // thrown so one broken render does not mask the rest of the run.
  fixture.pageErrors = [];
  fixture.page.on('pageerror', (error) => { fixture.pageErrors.push(String(error)); });
  fixture.page.on('console', (message) => {
    if (message.type() === 'error') fixture.pageErrors.push(`console: ${message.text()}`);
  });

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
  const pileableId = await handCard().getAttribute('data-pileable-id');

  await chooseAction(handCard(), 'move');
  await fixture.page.locator('.pile-section.pile-target[data-pile-id="table"]').click();

  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.pile-section[data-pile-id="table"] .middle-card[data-pileable-id="${CSS.escape(id)}"]`) !== null,
    pileableId, { timeout: 5000 },
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
  const pileableId = await card.getAttribute('data-pileable-id');

  const faceUpRows = await openMenu(card);
  assert.ok((await faceUpRows.evaluateAll((rows) => rows.map((element) => element.dataset.action))).includes('conceal'),
    'a face-up card offers conceal, never reveal');
  await fixture.page.locator('.card-context-menu [data-action="conceal"]').click();
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-pileable-id="${CSS.escape(id)}"] .card-back`) !== null,
    pileableId, { timeout: 5000 },
  );

  const faceDownRows = await openMenu(card);
  const ids = await faceDownRows.evaluateAll((rows) => rows.map((element) => element.dataset.action));
  assert.ok(ids.includes('reveal'), 'now face-down, so it offers reveal');
  assert.ok(!ids.includes('conceal'), 'and no longer offers conceal - one direction at a time');
  await fixture.page.locator('.card-context-menu [data-action="reveal"]').click();
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-pileable-id="${CSS.escape(id)}"] .card-back`) === null,
    pileableId, { timeout: 5000 },
  );
});

// An in-place action that is NOT the flip, so the test above cannot pass
// by accident on any "clicking a row does something" behaviour.
test('Rotate: an in-place action commits on click, with no destination step', async () => {
  const card = tableCards().last();
  const pileableId = await card.getAttribute('data-pileable-id');
  // Orientation is `data-orientation` on the card's WRAPPER, not a class
  // on the `.card` face (`ui.js` line ~652; style.css rotates off that
  // attribute). Asserting the wrong one is how this test first failed.
  assert.equal(await card.getAttribute('data-orientation'), null, 'starts unrotated');

  await chooseAction(card, 'rotate');
  await fixture.page.waitForFunction(
    (id) => document.querySelector(`.middle-card[data-pileable-id="${CSS.escape(id)}"]`)?.dataset.orientation === 'landscape',
    pileableId, { timeout: 5000 },
  );
});

// Smith's Gate 1 condition on D101: a card with nothing to offer must
// leave the native OS menu alone rather than opening an empty one.
test('a card menu never opens empty', async () => {
  await openMenu(tableCards().last());
  assert.ok(await fixture.page.locator('.card-context-menu .pile-action-menu-item').count() > 0);
  await fixture.page.keyboard.press('Escape');
});

// --- Tighten/Loosen slider (*nit, 2026-09-13) ------------------------
//
// This layer earned itself again here, twice over: the reducer tests
// for the original ADJUST_PILE_SPREAD all passed while the feature did
// nothing on screen (`spread` was written to state correctly but never
// named in `Pile.getView()`'s explicit field list); and the slider's
// own drag-fighting guard (`shouldApplyExternalValue`) is a real
// browser interaction concern no unit test can see at all.
const handRow = () => fixture.page.locator('[data-kind="hand"] .card-row').first();
// D129: spread is the STACK's now, published on the stack element -
// the row carries the pile-wide fallback, which a per-stack adjustment
// no longer writes.
const spreadOf = () => handRow().evaluate((row) => row.querySelector('.card-stack')?.style.getPropertyValue('--pile-spread'));
// D129: measure where the card actually IS, not the margin that used
// to put it there. Overlap is no longer a margin at all - every
// pileable is positioned from its own index within its stack - so the
// honest question is how far apart two neighbours sit on screen. That
// is also the property a player can see, which a margin never was.
const gapPx = () => handRow().evaluate((row) => {
  const [first, second] = row.querySelectorAll('.middle-card');
  return second.getBoundingClientRect().x - first.getBoundingClientRect().x;
});
// The slider's own internal `<input type=range>` (`SpreadSlider.js`) -
// a HIGHER value means MORE overlap (tighter, smaller gap), a LOWER
// value means LESS overlap (looser, bigger gap): `ChipPile`'s own
// `defaultSpread >= 0.9` ("start nearly stacked") is the same direction.
const handSlider = () => fixture.page.locator('[data-kind="hand"] .spread-slider-input');

// Interacting with the slider hovers the pointer over the hand pile,
// which is also a focus-zoom trigger (US-117) - `HOVER_INTENT_MS`
// (180ms) is well within these tests' own wait windows, so without an
// explicit move-away the pile is left `focus-zoomed` for whichever test
// runs next in this shared-page suite (found live: three unrelated
// later tests all timed out on a pointer-events-blocked hand pile).
// `page.mouse.move(0, 0)` is the same teardown `focusZoom.browser.mjs`
// itself uses.
test('dragging the slider down really spreads the cards apart on screen, not just in state', async () => {
  const before = await gapPx();
  await handSlider().fill('0');
  await fixture.page.waitForFunction(
    (previous) => {
      const row = document.querySelector('[data-kind="hand"] .card-row');
      const [first, second] = row?.querySelectorAll('.middle-card') ?? [];
      return second && second.getBoundingClientRect().x - first.getBoundingClientRect().x > previous;
    },
    before, { timeout: 5000 },
  );
  assert.ok(await gapPx() > before, 'cards overlap less than they did');
  assert.equal(await spreadOf(), '0', 'the row really carries the pile\'s own spread');
  await fixture.page.mouse.move(0, 0);
});

test('dragging the slider back up is the exact inverse - returns to where it started', async () => {
  const before = await gapPx();
  await handSlider().fill('0.85');
  await fixture.page.waitForFunction(
    (previous) => {
      const row = document.querySelector('[data-kind="hand"] .card-row');
      const [first, second] = row?.querySelectorAll('.middle-card') ?? [];
      return second && second.getBoundingClientRect().x - first.getBoundingClientRect().x < previous;
    },
    before, { timeout: 5000 },
  );
  await handSlider().fill('0');
  await fixture.page.waitForTimeout(200);
  assert.ok(Math.abs(await gapPx() - before) < 0.5, 'back to the same overlap');
  await fixture.page.mouse.move(0, 0);
});

// The slider is bounded by its own `min`/`max` (`0`/`kind.maxSpread`) -
// unlike the old button pair, there is no disabled-at-the-limit state
// to check; the browser's own native range input enforces the range.
test('the slider is bounded by the pile kind\'s own ceiling', async () => {
  const max = await handSlider().getAttribute('max');
  assert.equal(max, '0.85', 'a card pile\'s own MAX_SPREAD ceiling (Pile.js)');
  await handSlider().fill('0');
  assert.equal(await spreadOf(), '0', 'fully loosened means no overlap at all');
  await fixture.page.mouse.move(0, 0);
});

// --- Rendering actually reaches the face (sprint pileObjects) --------
//
// Added at Phase 97's UAT, from a mutation check, not from a plan:
// breaking `CardPileable.render` so cards printed their id instead of
// their rank and suit passed all 555 unit tests and all 10 browser
// tests. Nothing anywhere asserted that a card shows its face at all -
// so the whole D107 dispatch could have been rewired to nothing and
// every gate would have been green.
//
// This is the assertion that makes the "faces are untouched" claim in
// D107 and Smith's Gate 2 approval real rather than intended.
test('a card really renders its rank and suit - the face dispatch is live, not just wired', async () => {
  const text = await fixture.page.locator('[data-kind="hand"] .card').first().textContent();
  assert.match(text, /[0-9JQKA]/, `a card must print a rank, got "${text}"`);
  assert.match(text, /[♠♥♦♣]/, `and a suit, got "${text}"`);
});

test('every card in the hand renders a face, not an id', async () => {
  const texts = await fixture.page.locator('[data-kind="hand"] .card').allTextContents();
  assert.ok(texts.length > 0);
  for (const text of texts) {
    assert.ok(!/-\d+$/.test(text.trim()), `a card printing a card id would look like this: "${text}"`);
    assert.match(text, /[♠♥♦♣]/, `card "${text}" shows no suit`);
  }
});

// --- Chips and Tokens on a real table (Phase 102, US-102/105) -------
//
// Opens its own table on the Chips & Tokens preset rather than reusing
// the shared fixture, which is dealt from a standard deck.
test('the Chips & Tokens preset puts real chips and tokens on the table, rendered as chips and tokens', async () => {
  const page = await (await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(BASE);
    await page.click('#show-host');
    await page.fill('#host-name', 'Alice');
    await page.selectOption('#host-preset', { label: 'Chips & Tokens' });
    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
    await page.click('#deal-btn');
    await page.waitForFunction(() => document.querySelectorAll('.card-chip').length > 0, undefined, { timeout: 15_000 });

    assert.ok(await page.locator('.card-chip').count() > 1, 'a supply, not one chip');
    assert.ok(await page.locator('.card-token').count() > 1, 'and tokens too');

    // Smith Gate 1 condition A: a supply of identical discs is exactly
    // what this condition existed to prevent.
    const colours = await page.locator('.card-chip').evaluateAll(
      (chips) => new Set(chips.map((chip) => chip.className)).size,
    );
    assert.ok(colours > 1, `chips must be tellable apart, found ${colours} distinct looks`);

    // UPDATED by the gem *nit (direct user request: "tokens should
    // look like gems. they don't need denominations") - a token has no
    // printed label any more; colour alone (same Gate 1 condition A
    // reasoning as chips) is what has to tell them apart.
    const tokenColours = await page.locator('.card-token').evaluateAll(
      (tokens) => new Set(tokens.map((token) => token.className)).size,
    );
    assert.ok(tokenColours > 1, `tokens must be tellable apart by colour, found ${tokenColours} distinct looks`);

    // A chip is round; a card is not. Asserted as real geometry rather
    // than as a class name, since the class only matters if CSS acts on it.
    const box = await page.locator('.card-chip').last().boundingBox();
    assert.ok(Math.abs(box.width - box.height) < 2, `a chip should be square-bounded (round), got ${box.width}x${box.height}`);

    // US-104 / Gate 1 condition B, where a player would actually see it.
    const chipPile = page.locator('.pile-section').filter({ has: page.locator('.card-chip') }).first();
    const actions = await chipPile.locator('.pile-action-btn, button').evaluateAll(
      (buttons) => buttons.map((button) => button.title),
    );
    // REVERSED by the chip-denomination *fix: chips carry a value now,
    // so a tray sorts by it. The original assertion ("no sort at all")
    // was a consequence of chips having nothing to order by, not an
    // independent rule, so it changes with the premise.
    assert.ok(actions.some((title) => /sort by value/i.test(title ?? '')),
      `a chip tray sorts by value, got ${JSON.stringify(actions)}`);
    assert.ok(actions.every((title) => !/sort by (rank|suit)/i.test(title ?? '')),
      `and never by rank or suit, got ${JSON.stringify(actions)}`);

    // US-102 AC2, the story's real claim: a chip does everything a card
    // does, THROUGH THE SAME PATH. Asserted by driving a chip's own
    // right-click menu, not by inspecting classes.
    // `.last()`, not `.first()`: the supply STACKS now (T102.2), so
    // every chip but the last is covered at its centre point and
    // Playwright correctly refuses to click it - the same reason
    // `designLint.check.mjs` uses `.last()` on a fanned hand.
    await page.locator('.card-chip').last().click({ button: 'right' });
    await page.waitForSelector('.card-context-menu', { timeout: 5000 });
    const chipActions = await page.locator('.card-context-menu .pile-action-menu-item')
      .evaluateAll((rows) => rows.map((row) => row.dataset.action));
    assert.ok(chipActions.includes('move'), `a chip must be movable like any card, got ${JSON.stringify(chipActions)}`);
    assert.ok(chipActions.length > 1, 'and offers a real menu, not one lonely entry');
    await page.keyboard.press('Escape');
  } finally {
    await page.close();
  }
});

// --- Chip trays (*fix: default pile type, denominations, make change) -
//
// This layer found all three gaps in the first cut of that fix, none of
// which a unit test could see: Make change was absent because
// `disabledActions` never received the pile's cards, Tighten was absent
// because the kind's default spread sat at the ceiling, and the tray
// arrived unsorted because stock bypassed `insertPileable`.
test('a poker chip tray is stacked by denomination, highest first, with values showing', async () => {
  const page = await (await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(BASE);
    await page.click('#show-host');
    await page.fill('#host-name', 'Alice');
    await page.selectOption('#host-preset', { label: "Texas Hold'em" });
    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
    await page.click('#deal-btn');
    await page.waitForFunction(() => document.querySelectorAll('.card-chip').length > 0, undefined, { timeout: 15_000 });

    // *nit: values are `$`-prefixed and centred on the chip now.
    const labels = await page.locator('.card-chip .chip-denom').allTextContents();
    assert.ok(labels.every((label) => label.startsWith('$')), `every chip shows a $ value, got ${labels}`);
    const values = labels.map((label) => Number(label.slice(1)));
    assert.ok(values.length > 1, 'a tray of chips');
    assert.ok(values.every((value) => value > 0), `every chip shows its value, got ${values}`);
    assert.deepEqual(values, values.toSorted((a, b) => b - a), `tray must be sorted highest first, got ${values}`);

    // *nit: "stacked chips should be in separate piles by denomination"
    // and "actually stacked like a deck one on top of the other". One
    // column per value, highest first, and within a column the chips
    // overlap almost entirely - asserted as GEOMETRY, since a class name
    // proves nothing about what a player sees.
    const denoms = await page.locator('.chip-tray .card-stack').evaluateAll((stacks) => stacks.map((s) => Number(s.dataset.denom)));
    assert.ok(denoms.length > 1, `one stack per denomination, got ${denoms}`);
    assert.deepEqual(denoms, denoms.toSorted((a, b) => b - a), 'stacks run highest value first');
    assert.equal(new Set(denoms).size, denoms.length, 'and no value is split across two stacks');

    const biggest = page.locator('.chip-tray .card-stack').filter({ has: page.locator('.card-chip') }).last();
    const chipBoxes = await biggest.locator('.middle-card').evaluateAll(
      (chips) => chips.map((chip) => chip.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, h: r.height })),
    );
    if (chipBoxes.length > 1) {
      // A slight sideways drift is intentional (the "diagonal" *nit);
      // fanning by a whole card width is the bug this catches.
      const xs = chipBoxes.map((box) => box.x);
      const spread = Math.max(...xs) - Math.min(...xs);
      assert.ok(spread < chipBoxes[0].h / 3,
        `a stack must stay a column, not fan sideways: spread ${spread}`);
      const step = Math.abs(chipBoxes[1].y - chipBoxes[0].y);
      assert.ok(step < chipBoxes[0].h / 2,
        `chips must sit ON each other like a deck, not spread: step ${step} of height ${chipBoxes[0].h}`);
    }

    // Make change: value conserved, count increased.
    const tray = page.locator('.pile-section').filter({ has: page.locator('.card-chip') }).first();
    const before = values.reduce((sum, value) => sum + value, 0);
    await tray.locator('button[title="Make change"]').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.card-chip').length > count,
      values.length, { timeout: 5000 },
    );
    const after = (await page.locator('.card-chip .chip-denom').allTextContents()).map((label) => Number(label.slice(1)));
    assert.equal(after.reduce((sum, value) => sum + value, 0), before, 'making change conserves value exactly');
    assert.ok(after.length > values.length, 'and produces more, smaller chips');
    assert.deepEqual(after, after.toSorted((a, b) => b - a), 'and the tray is still sorted');

    // *nit ("dropped chips are not aligned on the piles?"): a dropped
    // chip must sit in line with the stack it joined - asserted as real
    // x coordinates, since the misalignment came from a per-card margin
    // that no class name would have revealed.
    // This asserted EXACT x equality until the "slight diagonal" *nit
    // introduced a deliberate 1px-per-chip drift. The original intent is
    // kept, with a tolerance the intentional drift fits inside: what it
    // was written to catch was a stack fanning by a whole CARD WIDTH
    // (a CSS specificity bug that made every column spread sideways),
    // not a few pixels of perspective.
    const columns = await page.locator('.chip-tray .card-stack').evaluateAll(
      (stacks) => stacks.map((stack) => [...stack.querySelectorAll('.middle-card')]
        .map((chip) => chip.getBoundingClientRect().x)),
    );
    const cardWidth = (await page.locator('.card-chip').first().boundingBox()).width;
    for (const [index, xs] of columns.entries()) {
      const spread = Math.max(...xs) - Math.min(...xs);
      assert.ok(spread < cardWidth / 3,
        `stack ${index} must stay a column, not fan: spread ${spread} of width ${cardWidth}`);
    }
    // D129: assert real GEOMETRY, not a flag.
    //
    // What used to be here counted `[data-layout="column"]` attributes.
    // That is why the original bug shipped: the attribute was present
    // and correct on every chip while the actual rendered positions
    // were wrong (a stack at spread 0.963 sitting 69px APART instead of
    // overlapping), and a third chip landing at the second one's exact
    // offset was invisible because nothing ever compared three.
    //
    // So: measure, and require a stack deep enough for a compounding
    // error to show up in the first place.
    const stacks = await page.locator('.chip-tray .card-stack').all();
    let hasDeepStack = false;

    for (const stack of stacks) {
      // `.middle-card` (the wrapper), not `[data-pileable-id]`: that
      // attribute is stamped on the card element INSIDE each wrapper
      // too, so an unscoped query returns each chip twice and compares
      // a wrapper against its own child - which reads as a 0px gap and
      // would have made this whole assertion vacuous.
      // Carry the inputs to the layout alongside the measured result,
      // so a failure says WHY rather than just "0px". A geometry
      // assertion that cannot explain itself sends the next person
      // back to hand-probing computed styles, which is exactly the
      // loop this suite exists to end.
      const chips = await stack.evaluate((element) => [...element.children]
        .filter((child) => child.classList.contains('middle-card'))
        .map((child) => ({
          y: child.getBoundingClientRect().y,
          height: child.getBoundingClientRect().height,
          stackY: child.style.getPropertyValue('--stack-y'),
          position: getComputedStyle(child).position,
          top: getComputedStyle(child).top,
          bottom: getComputedStyle(child).bottom,
        })));
      const why = () => JSON.stringify(chips);
      const boxes = chips;
      if (boxes.length < 2) continue;

      // Chips grow UP from the tray's bottom edge, so a later chip sits
      // at a SMALLER y. Compare successive gaps rather than positions:
      // equal gaps is what "every step is the same size" means, and it
      // is the property the old margin formulas could not hold.
      const gaps = boxes.slice(1).map((box, index) => boxes[index].y - box.y);

      for (const gap of gaps) {
        assert.ok(gap > 0, `a chip must sit above the one before it, got a gap of ${gap}px from ${why()}`);
        assert.ok(gap < boxes[0].height,
          `a stack at the tray's tight default spread must OVERLAP - got ${gap}px between chips ` +
          `${boxes[0].height}px tall (the original bug: 69px apart where ~5px was wanted)`);
      }

      if (gaps.length >= 2) {
        hasDeepStack = true;
        // The 3+ assertion the old test never made. A half-pixel
        // tolerance for subpixel layout, nothing more - this must not
        // be loose enough to hide a compounding step.
        const [first] = gaps;
        for (const gap of gaps) {
          assert.ok(Math.abs(gap - first) < 0.5,
            `every step in a ${boxes.length}-chip stack must be the same size, got ${gaps.join(', ')}`);
        }
      }
    }

    assert.ok(hasDeepStack,
      'this assertion is worthless without a stack of 3+ chips - the depth where the real bug lived');

    // *nit: the badge is the tray's total VALUE, not its chip count.
    const badge = Number(await tray.locator('.pile-count-badge').textContent());
    assert.equal(badge, after.reduce((sum, value) => sum + value, 0),
      'the badge stamps the total value of the tray');
    assert.notEqual(badge, after.length, 'and is not merely the number of chips');

    // "dont show non-chip piletypes in the menu"
    assert.equal(await tray.locator('.pile-action-enum').count(), 0,
      'a chip tray offers no pile-type conversion at all - there is nowhere to convert to');
  } finally {
    await page.close();
  }
});

// *nit: "drops in chipstacks should add the chips to the existing
// piles" - and the duplication behind it. A chip dropped on the zone's
// empty space (the drop gutter) used to CREATE a pile, so every
// near-miss around a tray left another chip pile behind.
//
// Driven with synthetic drag events rather than Playwright's own drag:
// this is an HTML5 drag-and-drop, which Playwright cannot meaningfully
// synthesise - and that is precisely why nothing caught it before.
test('a chip dropped on empty zone space joins the existing tray instead of spawning a pile', async () => {
  const page = await (await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(BASE);
    await page.click('#show-host');
    await page.fill('#host-name', 'Alice');
    await page.selectOption('#host-preset', { label: "Texas Hold'em" });
    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
    await page.click('#deal-btn');
    await page.waitForFunction(() => document.querySelectorAll('.card-chip').length > 0, undefined, { timeout: 15_000 });

    const pileCount = () => page.locator('.pile-section[data-pile-id]').count();
    const before = await pileCount();
    const chipsBefore = await page.locator('.card-chip').count();

    await page.evaluate(() => {
      const chip = document.querySelector('.chip-tray .card-stack .middle-card[data-pileable-id]');
      const zone = document.querySelector('zone-panel.seat-zone');
      const gutter = zone.querySelector('.zone-drop-gutter') ?? zone;
      const box = gutter.getBoundingClientRect();
      const transfer = new DataTransfer();
      transfer.setData('text/plain', chip.dataset.pileableId);
      const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.x + 5, clientY: box.y + 5 };
      gutter.dispatchEvent(new DragEvent('dragover', at));
      gutter.dispatchEvent(new DragEvent('drop', at));
    });
    await page.waitForTimeout(500);

    assert.equal(await pileCount(), before, 'no new pile - the chip joined the tray it belongs in');
    assert.equal(await page.locator('.card-chip').count(), chipsBefore, 'and no chip was lost or duplicated');

    // And it snapped back into denomination order.
    const values = (await page.locator('.card-chip .chip-denom').allTextContents()).map((label) => Number(label.slice(1)));
    assert.deepEqual(values, values.toSorted((a, b) => b - a), `still sorted, got ${values}`);
  } finally {
    await page.close();
  }
});

// *nit (direct user request): "show the stacking for the deck of cards.
// right now it looks like there's only 1 card there."
//
// The depth layers are inert; exactly ONE real, draggable card sits on
// top. That last part is what D66/D67's opposite correction ("I should
// only see 1 card") was protecting, so it is asserted rather than
// assumed - this *nit reverses the LOOK, not that rule.
test('the deck renders as a stack with depth, but only one card is draggable', async () => {
  const deck = fixture.page.locator('.pile-section[data-pile-id="deck"]');
  assert.ok(await deck.locator('.deck-stack-layer').count() > 0, 'a full deck shows depth');
  // Scoped to the STACK: the pile's title is draggable too (that is how
  // a pile is moved), which is not what this asserts.
  assert.equal(await deck.locator('.deck-stack [draggable="true"]').count(), 1,
    'exactly one draggable card, however deep the stack looks');
  assert.equal(await deck.locator('.deck-stack-layer[draggable="true"]').count(), 0,
    'no decorative layer is ever grabbable');

  // The layers are pointer-transparent, or they would swallow clicks
  // meant for the card.
  const inert = await deck.locator('.deck-stack-layer').evaluateAll(
    (layers) => layers.every((layer) => getComputedStyle(layer).pointerEvents === 'none'),
  );
  assert.ok(inert, 'depth layers never intercept a pointer');
});

test('the deck visibly thins out as it empties, without the panel resizing', async () => {
  const deck = fixture.page.locator('.pile-section[data-pile-id="deck"]');
  const before = await deck.locator('.deck-stack-layer').count();
  const panelBefore = Math.round((await deck.boundingBox()).height);

  // Draw the deck down a long way and watch the stack lose depth.
  for (let index = 0; index < 25; index++) {
    await deck.locator('button[title="Draw"]').first().click();
  }
  await fixture.page.waitForTimeout(400);

  const after = await deck.locator('.deck-stack-layer').count();
  assert.ok(after < before, `a thinner deck shows fewer layers: ${before} -> ${after}`);

  // *nit ("give the deck panel more room for when the deck gets big"):
  // the panel RESERVES room for the deepest stack, so it never crowds a
  // full deck - and, just as importantly, never resizes as cards come
  // off. A panel that shrank on every draw made the whole row twitch.
  assert.equal(Math.round((await deck.boundingBox()).height), panelBefore,
    'the deck panel keeps its size while the stack inside it thins');
});

// *nit (direct user request): "make the stacking angles consistent wrt
// cards and chips (same perspective)", then "tighten the stacking
// angle... give a slight diagonal from lower left to upper right", then
// "less of an angle please i said slight".
//
// The deck's depth layers and a chip stack share `--stack-step` /
// `--stack-step-x`, so this asserts they actually AGREE - a shared token
// proves nothing if one of them stops reading it.
test('deck and chip stacks climb at the same slight angle, lower-left to upper-right', async () => {
  const page = await (await fixture.browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto(BASE);
    await page.click('#show-host');
    await page.fill('#host-name', 'Alice');
    await page.selectOption('#host-preset', { label: "Texas Hold'em" });
    await page.click('#create-table');
    await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
    await page.click('#deal-btn');
    await page.waitForFunction(() => document.querySelectorAll('.card-chip').length > 0, undefined, { timeout: 15_000 });

    const steps = await page.evaluate(() => {
      const deck = document.querySelector('.pile-section[data-pile-id="deck"] .deck-stack');
      const layers = [...deck.querySelectorAll('.deck-stack-layer')].map((l) => l.getBoundingClientRect());
      const columns = [...document.querySelectorAll('.chip-tray .card-stack')]
        .map((column) => [...column.querySelectorAll('.middle-card')].map((chip) => chip.getBoundingClientRect()));
      const tall = columns.find((column) => column.length > 2) ?? [];
      return {
        // layers[0] is the DEEPEST; a shallower one sits up and right.
        deck: layers.length > 1 ? { rise: layers[0].y - layers[1].y, drift: layers[1].x - layers[0].x } : null,
        // index 0 is the BOTTOM of a chip column.
        chips: tall.length > 2 ? { rise: tall[0].y - tall[1].y, drift: tall[1].x - tall[0].x } : null,
      };
    });

    assert.ok(steps.deck && steps.chips, 'both a deck and a chip stack are on the table');

    // *nit ("the top few deck cards are off"): the REAL card is the
    // shallowest thing in the deck's stack, so the gap between it and
    // the layer beneath must match the gap between two layers. It did
    // not: the card is `position: absolute` with no `left`, so it sat at
    // its STATIC position - after the box's padding - while the layers
    // use an explicit `left` measured from the padding box, which
    // ignores padding-left. Six pixels of jump at exactly the place a
    // player looks. Asserted as evenness, not as a pixel value.
    const deckXs = await page.locator('.pile-section[data-pile-id="deck"] .deck-stack > *')
      .evaluateAll((kids) => kids.map((kid) => kid.getBoundingClientRect().x));
    const gaps = deckXs.slice(1).map((x, index) => Math.round((x - deckXs[index]) * 10) / 10);
    assert.ok(gaps.length > 1, 'a full deck has several layers plus its card');
    assert.equal(new Set(gaps).size, 1, `every step across the deck must be equal, got ${gaps}`);
    for (const [name, step] of Object.entries(steps)) {
      assert.ok(step.rise > 0, `${name} must climb upward, rise ${step.rise}`);
      assert.ok(step.drift > 0, `${name} must drift right as it climbs, drift ${step.drift}`);
      // "slight": the sideways drift is a fraction of the rise, not a
      // match for it. At parity the stack reads as a real lean.
      assert.ok(step.drift < step.rise, `${name} angle must stay slight: drift ${step.drift} vs rise ${step.rise}`);
    }
    assert.ok(Math.abs(steps.deck.drift - steps.chips.drift) <= 1,
      `same perspective: deck drift ${steps.deck.drift} vs chips ${steps.chips.drift}`);
  } finally {
    await page.close();
  }
});

// D129 (direct user request): every stack carries a gear emblem that
// opens its OWN actions, and pile-level Tighten/Loosen became "All",
// routing to each stack rather than writing one pile-wide number.
test('a stack gear opens that stack\'s own actions, and flipping it turns the run', async () => {
  const page = fixture.page;
  // The HAND, not a chip tray: it always holds the five dealt cards in
  // one stack, whereas the trays are redistributed (and eventually
  // replaced) by earlier tests - "some tray with 2+ chips" is not a
  // guarantee this late in a shared-table suite.
  const stack = page.locator('[data-kind="hand"] .card-stack').first();
  const gear = stack.locator('.stack-gear');
  assert.equal(await gear.count(), 1, 'a stack with something to offer carries exactly one gear');

  const runsVertically = () => page.evaluate(() => {
    const cards = document.querySelectorAll('[data-kind="hand"] .card-stack > .middle-card');
    const [a, b] = [...cards].map((card) => card.getBoundingClientRect());
    return Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  });
  assert.equal(await runsVertically(), false, 'a hand fans sideways to begin with');

  await gear.click();
  const menu = page.locator('.stack-action-menu');
  assert.equal(await menu.count(), 1, 'the gear opens a stack action menu');
  await menu.locator('[data-action="flipStack"]').click();
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('[data-kind="hand"] .card-stack > .middle-card');
    if (cards.length < 2) return false;
    const [a, b] = [...cards].map((card) => card.getBoundingClientRect());
    return Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  }, undefined, { timeout: 5000 });

  // Flip it BACK. This suite shares one browser and one dealt table
  // (see the file header), so "each test independent within it" means
  // a test that changes replicated state has to put it back.
  await gear.click();
  await page.locator('.stack-action-menu [data-action="flipStack"]').click();
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('[data-kind="hand"] .card-stack > .middle-card');
    if (cards.length < 2) return false;
    const [a, b] = [...cards].map((card) => card.getBoundingClientRect());
    return Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
  }, undefined, { timeout: 5000 });
});

test('a stack of one offers no gear - three controls that would visibly do nothing', async () => {
  const page = fixture.page;
  const singles = await page.locator('.card-stack').evaluateAll((stacks) => stacks
    .filter((stack) => stack.querySelectorAll(':scope > .middle-card').length === 1)
    .map((stack) => stack.querySelectorAll('.stack-gear').length));
  for (const gears of singles) {
    assert.equal(gears, 0, 'a single-card stack has nothing to tighten, loosen or flip');
  }
});
