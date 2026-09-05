// RtG "spit and polish" playthrough (US-109). Direct user request: "we
// haven't given tokens a good shake yet. see if you can get through a
// game or two." This is a bug hunt, not a wiring test - it drives Recard
// the Gathering through the moves a real game actually makes (draw,
// cast to battlefield, tap, use the shared Tokens supply, exile/discard,
// the shared stack, life total, a mid-game reshuffle, and a full
// Restart) and asserts on the state that results, not on what the code
// merely intends.
//
// Uses the click-to-target flow (D101: right-click -> Move -> click a
// lit `.pile-target`) for every card/token move, same mechanism
// `uiActions.browser.mjs` already established - no synthetic DragEvents
// needed here, unlike the empty-zone-space drop case that mechanism
// can't reach.
//
// One shared page across all tests (like `uiActions.browser.mjs`'s
// card-action suite), because a real game IS sequential state - each
// `test()` is still a distinct, named checkpoint so a failure partway
// through says exactly which part of the game broke, not just "the
// playthrough failed somewhere" (D60's own lesson about monolithic
// suites, applied here).
//
// NOT part of `npm test` - needs a browser. `npm run test:ui` / `bobp
// make test-ui`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8213; // not 8211 (designLint) or 8212 (uiActions)
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

const fixture = { browser: undefined, page: undefined };

// The first deck in RtG's catalog (`decks/rtg/catalog.js`'s `DECKS[0]`) -
// stable across runs since the catalog is static content, not generated
// per-game.
const DECK_ID = 'rtg-guild-wu';
const OTHER_DECK_ID = 'rtg-guild-wb';

async function openMenu(page, locator) {
  // `force: true`: `.pile-hover-host:hover` (style.css) raises a card
  // with a `transform`/`transition` on hover, which Playwright's own
  // actionability polling can re-trigger on every retry and never
  // observe as settled - a headless-automation artifact of the hover
  // affordance, not evidence of a real user-facing bug (confirmed: the
  // move underneath still completes correctly once dispatched).
  await locator.click({ button: 'right', force: true });
  await page.waitForSelector('.card-context-menu', { timeout: 5000 });
  return page.locator('.card-context-menu .pile-action-menu-item');
}

/**
 * Right-click a card/token, choose Move, then click a lit destination
 * pile - the click-to-target flow every targeted action uses (D101).
 * `destination` is a full attribute selector fragment (e.g.
 * `[data-pile-id="rtg-tokens"]` for a fixed shared pile, or
 * `[data-kind="battlefield"]` for a per-player pile whose real id
 * isn't known ahead of time - `battlefield-<playerId>`, D55).
 */
async function moveTo(page, cardLocator, destination) {
  await openMenu(page, cardLocator);
  await page.locator('.card-context-menu [data-action="move"]').click();
  await page.locator(`.pile-section.pile-target${destination}`).click();
}

async function rotate(page, cardLocator) {
  await openMenu(page, cardLocator);
  await page.locator('.card-context-menu [data-action="rotate"]').click();
}

function pileAction(page, pileId, label) {
  return page.locator(`.pile-section[data-pile-id="${pileId}"] button[aria-label="${label}"]`);
}

/**
 * A DECK pile is HIDDEN (`DeckPile.showsFace` is always false) and
 * renders through `<deck-stack>` - inert depth layers plus ONE real
 * draggable card, never one `.middle-card` per card (D113). Its true
 * size is only ever readable from the corner `.pile-count-badge`
 * (`Pile.badge`), same as any other possibly-redacted pile - counting
 * `.middle-card` elements under a deck pile-section always reads 0,
 * REGARDLESS of how many cards are actually in it. (Caught live: an
 * earlier draft of this file did exactly that and "confirmed" a bug
 * that its own metric could never have detected either way - the real
 * bug was still real, just independently reproduced at the reducer
 * level, not by this wrong DOM read.)
 */
async function deckCount(page, pileId) {
  return Number(await page.locator(`.pile-section[data-pile-id="${pileId}"] .pile-count-badge`).textContent());
}

before(async () => {
  await new Promise((resolve) => server.listen(PORT, resolve));
  fixture.browser = await launchChromium();
  fixture.page = await (await fixture.browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const page = fixture.page;
  await page.goto(BASE);
  await page.click('#show-host');
  await page.fill('#host-name', 'Alice');
  await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
  await page.click('#create-table');
  await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  await page.click('#deal-btn'); // RtG's own DEAL is a documented no-op (cardsPerPlayer: 0) - this just starts the game
  await page.waitForSelector(`.pile-section[data-pile-id="${DECK_ID}"]`, { timeout: 15_000 });
});

after(async () => {
  await fixture.browser?.close();
  await new Promise((resolve) => server.close(resolve));
});

// *nit (direct user request: "fix panel and deck sizing for the larger
// rtg cards"): the Decks zone's captured layout box used to be sized
// for a card width that predates RtG's own wider `.card-rtg` deck
// backs - real content needed ~1055px of height the box never grew to
// hold, and SCORES' own captured position sat inside the Decks zone's
// box regardless. Both confirmed by measuring live bounding rects, not
// by reading the preset's numbers.
test('the Decks zone fits every deck panel with no overflow and no overlap with SCORES/STACK/TOKENS', async () => {
  const page = fixture.page;
  const isOverlapping = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const info = await page.evaluate(() => {
    const rect = (element) => element.getBoundingClientRect();
    const decks = document.querySelector('zone-panel[data-group-id="rtg-decks"]');
    return {
      decksRect: rect(decks).toJSON(),
      scrollHeight: decks.scrollHeight,
      clientHeight: decks.clientHeight,
      scoresRect: rect(document.querySelector('score-zone')).toJSON(),
      stackRect: rect(document.querySelector('[data-pile-id="stack"]').closest('zone-panel')).toJSON(),
      tokensRect: rect(document.querySelector('[data-pile-id="rtg-tokens"]').closest('zone-panel')).toJSON(),
    };
  });
  assert.ok(info.scrollHeight <= info.clientHeight + 1, `Decks zone overflows: needs ${info.scrollHeight}px, has ${info.clientHeight}px`);
  assert.ok(!isOverlapping(info.decksRect, info.scoresRect), 'Decks zone overlaps SCORES');
  assert.ok(!isOverlapping(info.decksRect, info.stackRect), 'Decks zone overlaps STACK');
  assert.ok(!isOverlapping(info.decksRect, info.tokensRect), 'Decks zone overlaps TOKENS');
});

test('game 1: draw an opening hand from a real deck pile', async () => {
  const page = fixture.page;
  const before = await deckCount(page, DECK_ID);
  const hand = page.locator('[data-kind="hand"] .middle-card');
  for (let index = 0; index < 3; index++) await pileAction(page, DECK_ID, 'Draw').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="hand"] .middle-card').length === 3, undefined, { timeout: 10_000 });
  assert.equal(await hand.count(), 3, 'drew 3 real cards into hand');
  assert.equal(await deckCount(page, DECK_ID), before - 3, 'the deck badge reflects exactly 3 fewer cards');
});

// US-113 (direct user request: "rtg hand sorting should be by color
// and card type not suite and rank and put cost upper left so I can
// see it in the fan"). Two checks: the hand offers the RtG-specific
// sort actions (not rank/suit, which do nothing for a card with
// neither field), and the mana cost sits at the card's LEFT edge -
// the one part of a fanned, overlapping card every sibling but the
// last doesn't cover.
test('the hand offers RtG-specific sort actions, and cost sits at the card\'s left edge (visible in a fan)', async () => {
  const page = fixture.page;
  const sortButtons = await page.locator('[data-kind="hand"] header-actions button').evaluateAll(
    (buttons) => buttons.map((b) => b.getAttribute('aria-label')).filter(Boolean),
  );
  assert.ok(sortButtons.includes('Sort by color'), `expected a color sort button, got ${sortButtons}`);
  assert.ok(sortButtons.includes('Sort by type'), `expected a type sort button, got ${sortButtons}`);
  assert.ok(sortButtons.every((label) => !/rank|suit/i.test(label)), 'rank/suit sort makes no sense for RtG cards');

  const cardBox = await page.locator('[data-kind="hand"] .card-rtg').first().boundingBox();
  const costBox = await page.locator('[data-kind="hand"] .rtg-top').first().boundingBox();
  assert.ok(Math.abs(costBox.x - cardBox.x) < 5, `cost should sit at the card's left edge, offset was ${costBox.x - cardBox.x}px`);
});

test('game 1: cast a creature to the battlefield and tap it', async () => {
  const page = fixture.page;
  const card = page.locator('[data-kind="hand"] .middle-card').first();
  const cardId = await card.getAttribute('data-pileable-id');
  await moveTo(page, card, '[data-kind="battlefield"]');
  await page.waitForSelector(`[data-kind="battlefield"] .middle-card[data-pileable-id="${cardId}"]`, { timeout: 5000 });

  const onBattlefield = page.locator(`[data-kind="battlefield"] .middle-card[data-pileable-id="${cardId}"]`);
  assert.equal(await onBattlefield.getAttribute('data-orientation'), null, 'untapped: no orientation stamp yet');
  await rotate(page, onBattlefield);
  await page.waitForFunction(
    (id) => document.querySelector(`[data-kind="battlefield"] .middle-card[data-pileable-id="${CSS.escape(id)}"]`)?.dataset.orientation === 'landscape',
    cardId, { timeout: 5000 },
  );
});

// US-112 (direct user request, found by driving the real app): a token
// dropped on empty space WITHIN THE SUPPLY'S OWN ZONE used to spawn a
// brand-new pile beside the real one - the exact chip-duplication bug
// D110 fixed, never applied to tokens because nothing named a home
// pile kind for one. Same synthetic-DragEvent mechanism
// `uiActions.browser.mjs`'s own chip-tray regression test uses -
// Playwright cannot meaningfully synthesise a real HTML5 drag.
test('game 1: a token dropped on empty space in its own zone joins the supply, not a new pile', async () => {
  const page = fixture.page;
  const pileCount = () => page.locator('.pile-section[data-pile-id]').count();
  const before = await pileCount();

  await page.evaluate(() => {
    const tokenPile = document.querySelector('[data-pile-id="rtg-tokens"]');
    const token = tokenPile.querySelector('.middle-card[data-pileable-id]');
    const zone = tokenPile.closest('zone-panel');
    const gutter = zone.querySelector('.zone-drop-gutter') ?? zone;
    const box = gutter.getBoundingClientRect();
    const transfer = new DataTransfer();
    transfer.setData('text/plain', token.dataset.pileableId);
    const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.x + 5, clientY: box.y + 5 };
    gutter.dispatchEvent(new DragEvent('dragover', at));
    gutter.dispatchEvent(new DragEvent('drop', at));
  });
  await page.waitForTimeout(500);

  assert.equal(await pileCount(), before, 'no new pile - the token rejoined the supply it belongs in');
});

// REVERSED by direct user correction, follow-up *nit ("instead of a
// stack it can be just a pile"): the token supply is an ordinary pile
// again, not grouped columns - `TokenPile` no longer extends
// `GroupedPile`. Tokens still have to be tellable apart, just by
// colour+shape (the gem *nit) rather than by which column they sit in.
test('the token supply renders as a plain pile, not grouped colour stacks', async () => {
  const page = fixture.page;
  const stacks = await page.locator('[data-pile-id="rtg-tokens"] .chip-stack').count();
  assert.equal(stacks, 0, 'no grouped columns - a plain pile has none');
  const colours = await page.locator('[data-pile-id="rtg-tokens"] .card-token').evaluateAll(
    (tokens) => new Set(tokens.map((t) => t.className)).size,
  );
  assert.ok(colours > 1, `tokens must still be tellable apart by colour, found ${colours} distinct looks`);
});

// *nit (direct user request: "do the glass bead nit now and jumble
// them up in a pile only 2 colors needed"). Round shape, a scattered
// (not perfectly aligned) arrangement, and exactly 2 colours.
test('tokens are round glass beads, jumbled (not perfectly aligned), and only 2 colours', async () => {
  const page = fixture.page;
  const tokens = page.locator('[data-pile-id="rtg-tokens"] .card-token');
  const box = await tokens.first().boundingBox();
  assert.ok(Math.abs(box.width - box.height) < 2, `a bead should be round (square-bounded), got ${box.width}x${box.height}`);

  const colours = await tokens.evaluateAll((elements) => [...new Set(elements.map((element) => element.className))]);
  assert.equal(colours.length, 2, `expected exactly 2 token colours, got ${colours.length}: ${colours}`);

  // "Jumbled" = not every bead sits at the identical rotation/offset -
  // asserted via the real computed transform on the WRAPPER (`.middle-
  // card`, where `--raise-base` is actually consumed - `.card-token`
  // itself never has a transform of its own), not just that a CSS rule
  // exists (a rule that never actually applies would still pass a
  // weaker check). `.fan-row`'s own resting-state consumption of
  // `--raise-base` doesn't reach a plain `.card-row` by default - this
  // pile needed its own copy of that rule, found live when the first
  // draft set the custom property correctly but nothing painted it.
  const wrappers = page.locator('[data-pile-id="rtg-tokens"] .middle-card');
  const transforms = await wrappers.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
  assert.ok(new Set(transforms).size > 1, `expected varied per-bead transforms, got all identical: ${transforms[0]}`);
  assert.ok(transforms.every((t) => t !== 'none'), 'every bead should have SOME jumble transform, not the identity');
});

test('game 1: a token from the shared supply can mark a permanent and be returned', async () => {
  const page = fixture.page;
  const supplyBefore = await page.locator('[data-pile-id="rtg-tokens"] .card-token').count();
  assert.ok(supplyBefore > 0, 'the token supply actually has tokens to test with');

  // `.last()`, not `.first()`: same reasoning as `uiActions.browser.mjs`'s
  // `handCard()` - an overlapping stack only leaves its LAST DOM sibling
  // unobstructed to click.
  const token = page.locator('[data-pile-id="rtg-tokens"] .card-token').last();
  const tokenId = await token.getAttribute('data-pileable-id');
  await moveTo(page, token, '[data-kind="battlefield"]');
  await page.waitForSelector(`[data-kind="battlefield"] [data-pileable-id="${tokenId}"]`, { timeout: 5000 });
  assert.equal(
    await page.locator('[data-pile-id="rtg-tokens"] .card-token').count(), supplyBefore - 1,
    'the supply lost exactly the one token that moved',
  );

  // A freshly-inserted card still has a short (0.08-0.15s, style.css)
  // position/lift transition running - settle before the next
  // right-click so a real animation frame isn't mistaken for a bug.
  await page.waitForTimeout(250);
  const onBattlefield = page.locator(`[data-kind="battlefield"] .middle-card[data-pileable-id="${tokenId}"]`);
  await moveTo(page, onBattlefield, '[data-pile-id="rtg-tokens"]');
  await page.waitForFunction(
    (count) => document.querySelectorAll('[data-pile-id="rtg-tokens"] .card-token').length === count,
    supplyBefore, { timeout: 5000 },
  );
});

test('game 1: exile, discard, the shared stack, and life total all work', async () => {
  const page = fixture.page;
  for (let index = 0; index < 3; index++) await pileAction(page, DECK_ID, 'Draw').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="hand"] .middle-card').length >= 3, undefined, { timeout: 10_000 });

  const hand = () => page.locator('[data-kind="hand"] .middle-card');
  await moveTo(page, hand().first(), '[data-kind="exile"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="exile"] .middle-card').length === 1, undefined, { timeout: 5000 });

  await moveTo(page, hand().first(), '[data-kind="discard"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="discard"] .middle-card').length === 1, undefined, { timeout: 5000 });

  const stackCard = hand().first();
  const stackCardId = await stackCard.getAttribute('data-pileable-id');
  await moveTo(page, stackCard, '[data-kind="stack"]');
  await page.waitForSelector(`[data-kind="stack"] .middle-card[data-pileable-id="${stackCardId}"]`, { timeout: 5000 });
  // Resolve it off the stack onto the battlefield, the way a resolving spell would.
  await moveTo(page, page.locator(`[data-kind="stack"] .middle-card[data-pileable-id="${stackCardId}"]`), '[data-kind="battlefield"]');
  await page.waitForSelector(`[data-kind="battlefield"] .middle-card[data-pileable-id="${stackCardId}"]`, { timeout: 5000 });
  assert.equal(await page.locator('[data-kind="stack"] .middle-card').count(), 0, 'the stack is empty again once resolved');

  const lifeInput = page.locator('score-zone .score-input').first();
  const startingLife = Number(await lifeInput.inputValue());
  // Exact text match, not `hasText` substring - "-1" is a substring of
  // "-10", and DOM order puts -10 BEFORE -1 (ScoreZone.js's own
  // `#renderRow`), so a substring match's `.first()` silently grabs the
  // wrong button.
  await page.locator('score-zone .score-adjust-btn', { hasText: /^-1$/ }).first().click();
  await page.waitForFunction((v) => Number(document.querySelector('score-zone .score-input')?.value) === v, startingLife - 1, { timeout: 5000 });
  await page.locator('score-zone .score-adjust-btn', { hasText: /^\+1$/ }).first().click();
  await page.waitForFunction((v) => Number(document.querySelector('score-zone .score-input')?.value) === v, startingLife, { timeout: 5000 });
});

test('game 1: Reshuffle & deal on one deck recalls only ITS OWN cards, wherever they are - a different deck is untouched', async () => {
  const page = fixture.page;
  const otherDeckBefore = await deckCount(page, OTHER_DECK_ID);
  const deckBefore = await deckCount(page, DECK_ID);

  page.once('dialog', (dialog) => dialog.accept());
  await pileAction(page, DECK_ID, 'Reshuffle & deal').click();
  await page.waitForTimeout(500);

  // D114's own design (the user's exact words, prior sprint): reshuffle
  // "puts ALL cards back in their original deck" - by origin, no matter
  // where they currently sit. Every card on the battlefield/exile/
  // discard/stack in this playthrough originated from DECK_ID, so this
  // correctly recalls them ALL - not a bug, the button's own confirm
  // text says exactly this ("gather every card back").
  assert.equal(await page.locator('[data-kind="battlefield"] .middle-card').count(), 0, 'every battlefield card here originated from this deck, so it IS recalled - matches D114, not a regression');
  assert.equal(await deckCount(page, OTHER_DECK_ID), otherDeckBefore, 'a DIFFERENT deck (different origin) is untouched by reshuffling this one');
  assert.ok(await deckCount(page, DECK_ID) > deckBefore, 'reshuffling gathered cards back into the deck rather than leaving it as-is');
});

test('game 2: Restart game rebuilds every deck, not just the canonical one', async () => {
  const page = fixture.page;
  const deckCountBeforeRestart = await deckCount(page, DECK_ID);

  page.once('dialog', (dialog) => dialog.accept());
  await pileAction(page, DECK_ID, 'Restart game').click();
  await page.waitForTimeout(500);

  const deckCountAfterRestart = await deckCount(page, DECK_ID);
  assert.ok(
    deckCountAfterRestart > 0,
    `RESTART GAME MUST NOT EMPTY RtG's DECKS: had ${deckCountBeforeRestart} before, ${deckCountAfterRestart} after restart - a table-zone-less preset's declared decks must be rebuilt by RESET, not merely survivor-filtered like an ordinary table-side pile`,
  );
  assert.equal(await page.locator('[data-kind="battlefield"] .middle-card').count(), 0, 'RESET is a real restart - the battlefield is cleared too');

  // A second game is actually playable: draw again.
  await pileAction(page, DECK_ID, 'Draw').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="hand"] .middle-card').length === 1, undefined, { timeout: 10_000 });
  assert.equal(await page.locator('[data-kind="hand"] .middle-card').count(), 1, 'game 2 is genuinely playable - drawing works after a restart');
});
