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
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8213; // not 8211 (designLint) or 8212 (uiActions)
const BASE = `http://localhost:${PORT}`;

const fixture = { server: undefined, browser: undefined, page: undefined };

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
 *
 * Clicks the pile's own TITLE bar (`.pile-title`), not the panel as a
 * whole - direct user request ("use the Move card action to reveal the
 * ACTUAL targets within the piles") made a click on the pile's BODY
 * resolve to a real per-card placement (onto/below/beside/adjacent a
 * specific card) instead of always blindly appending. This helper's own
 * job is "just get it into this pile, position doesn't matter for what
 * the test is checking" - the title bar is never part of the card row,
 * so it's guaranteed empty space regardless of how crowded the pile is,
 * the same "just append" outcome this helper always meant. A test that
 * wants a SPECIFIC per-card target should compute its own point and
 * dispatch the click there directly, the way the column/adjacent tests
 * elsewhere in this file already do.
 */
async function moveTo(page, cardLocator, destination) {
  await openMenu(page, cardLocator);
  await page.locator('.card-context-menu [data-action="move"]').click();
  await page.locator(`.pile-section.pile-target${destination} .pile-title`).click();
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
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  fixture.page = await (await fixture.browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const page = fixture.page;
  await page.goto(BASE);
  await page.click('#show-host');
  await page.fill('#host-name', 'Alice');
  await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
  // *nit (direct user request, "only select the first by default"):
  // deck choices no longer default to all-checked, so this playthrough
  // (which needs BOTH `DECK_ID` and `OTHER_DECK_ID` on the table) has to
  // check them explicitly rather than relying on the old default.
  await page.locator(`#host-deck-choices input[value="${DECK_ID}"]`).check();
  await page.locator(`#host-deck-choices input[value="${OTHER_DECK_ID}"]`).check();
  await page.click('#create-table');
  await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  await page.click('#deal-btn'); // RtG's own DEAL is a documented no-op (cardsPerPlayer: 0) - this just starts the game
  await page.waitForSelector(`.pile-section[data-pile-id="${DECK_ID}"]`, { timeout: 15_000 });
});

after(async () => {
  await fixture.browser?.close();
  await fixture.server?.close();
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

// *fix (queued 2026-09-10, direct user reports: "deck/pile split...
// super wide because of all the actions" / "fold pile actions into
// rows"): Deck carries the most header actions of any pile kind (6
// icons + the changePileType control) - `.pile-title`'s old
// `width: max-content` with no cap meant it always forced the WHOLE
// panel open to fit that unwrapped row, rather than ever wrapping.
test('a Deck panel\'s header wraps its many actions instead of forcing the whole panel wide', async () => {
  const page = fixture.page;
  const width = await page.locator(`.pile-section[data-pile-id="${DECK_ID}"]`).evaluate((element) => element.getBoundingClientRect().width);
  // Was 210px before this fix (one unbroken action row); the fixed
  // 11rem (176px) cap on `.pile-title` brings it back near the panel's
  // own 11rem `min-width` floor instead of being dictated by the
  // button row.
  assert.ok(width <= 200, `Deck panel should be narrow now that its actions wrap (was 210px unwrapped), got ${width}px`);

  const buttonRows = await page.locator(`.pile-section[data-pile-id="${DECK_ID}"] .pile-title .pile-action-btn, .pile-section[data-pile-id="${DECK_ID}"] .pile-title .pile-action-enum`)
    .evaluateAll((elements) => new Set(elements.map((element) => Math.round(element.getBoundingClientRect().top))).size);
  assert.ok(buttonRows >= 2, 'Deck\'s 7 header controls must wrap onto at least 2 rows, not force one unbroken row');
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
  // `.last()`, not `.first()`: same reasoning as `uiActions.browser.mjs`'s
  // own `handCard()` - a fanned, overlapping hand only leaves its LAST
  // DOM sibling actually unobstructed to click. `.first()` happened to
  // still land on real pixels at the OLD, RtG-cards-too-small fan
  // spacing (the very bug US-116's card-size fix corrects) - once the
  // fan spread the correct amount for RtG's real card size, `.first()`
  // was genuinely covered and a `force: true` right-click on it landed
  // on whichever card actually sits on top instead (caught live: the
  // WRONG card moved to the battlefield, not a timeout with nothing
  // happening at all).
  const card = page.locator('[data-kind="hand"] .middle-card').last();
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

// *fix (queued 2026-09-10, direct user report: "No Gears on RTG
// stacks?", then "move the gear to the top right of the stack"): a
// LONE permanent - the single-card state the previous test just built,
// before any column exists - is the sharpest reproduction: its
// `.stack-gear` sits right at the edge of the battlefield's
// `overflow-y: auto` card-row (Smith Gate-1 condition C2) with no other
// row content to give it accidental slack, unlike the multi-column
// board state the "taps and untaps" test further down exercises. Two
// real bugs compounded originally: the gear rendered at the global
// 44px button touch-target floor instead of its own documented 1.3rem,
// and the row reserved no space for anything positioned outside its
// stacks' own boxes - first past the bottom (the gear's original
// position), then past the TOP once the gear moved there.
test('game 1: a lone battlefield permanent\'s stack gear is not clipped by the row\'s own scroll box', async () => {
  const page = fixture.page;
  const gear = page.locator('[data-kind="battlefield"] .stack-gear').first();
  assert.equal(await gear.count(), 1, 'even a stack of one gets tapStack/untapStack (D129) on Battlefield');

  const [gearBox, rowBox] = await Promise.all([
    gear.evaluate((element) => element.getBoundingClientRect().toJSON()),
    page.locator('[data-kind="battlefield"] .card-row').evaluate((element) => element.getBoundingClientRect().toJSON()),
  ]);
  assert.ok(gearBox.top >= rowBox.top - 0.5, `gear (top ${gearBox.top}) must fit inside its scrollable row (top ${rowBox.top}), not be clipped past it`);

  // Real containment, not just a geometry check against a stale
  // clip box: Playwright's own actionability click already fails on a
  // genuinely non-interactable (clipped) element, so a successful click
  // confirms a real user could reach it too.
  await gear.click();
  await page.waitForSelector('.stack-action-menu', { timeout: 5000 });
  // Dismissed by its own next-outside-click handler (openStackActionMenu,
  // ui.js) - there is no Escape binding, so a plain click elsewhere is
  // the real dismissal path, not a test-only shortcut. That handler
  // attaches on a `setTimeout(..., 0)` (deliberately, so the click that
  // OPENED the menu isn't itself read as the closing one) - a dismiss
  // click fired in the same tick can race ahead of it and get silently
  // ignored, which is exactly the flake this `waitForTimeout` closes,
  // found by running this test repeatedly until it reproduced.
  await page.waitForTimeout(50);
  await page.mouse.click(10, 10);
  await page.waitForSelector('.stack-action-menu', { state: 'detached', timeout: 5000 });
});

// D-nit (direct user request): "vertical drop targets... like how
// lands are normally arranged in a game of mtg", then a real bug found
// live and fixed the same session: "adding additional cards to the
// vertical layout blocks the second one instead of offsetting from the
// previous card" - a THIRD card dropped onto the second's lower half
// landed at the same height as the second (cross-axis flex margins
// don't chain the way `margin-left`'s negative pull does), not one
// step further down. `--column-depth` (ui.js) fixed it; this pins the
// fix down as a real regression test, not just the manual screenshot
// verification that originally caught it.
test('game 1: a column of 3+ cards offsets each one further down, not on top of the last', async () => {
  const page = fixture.page;

  // Direct synthetic drag straight from hand to a specific point on the
  // battlefield, same mechanism the token test below already uses -
  // avoids `moveTo`'s menu-driven "drop into open space" path (no
  // specific target point) and any earlier test's own leftover
  // battlefield cards (this only ever touches the 3 ids drawn here).
  async function dropAt(cardId, x, y) {
    await page.evaluate(({ id, px, py }) => {
      const bf = document.querySelector('[data-kind="battlefield"]');
      const transfer = new DataTransfer();
      transfer.setData('text/plain', id);
      const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: px, clientY: py };
      bf.dispatchEvent(new DragEvent('dragover', at));
      bf.dispatchEvent(new DragEvent('drop', at));
    }, { id: cardId, px: x, py: y });
    await page.waitForSelector(`[data-kind="battlefield"] .middle-card[data-pileable-id="${cardId}"]`, { timeout: 5000 });
  }

  const handCountBefore = await page.locator('[data-kind="hand"] .middle-card').count();
  for (let index = 0; index < 3; index++) await pileAction(page, DECK_ID, 'Draw').click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-kind="hand"] .middle-card').length >= n,
    handCountBefore + 3, { timeout: 10_000 },
  );
  const [idA, idB, idC] = await page.locator('[data-kind="hand"] .middle-card[data-pileable-id]').evaluateAll(
    (elements) => elements.slice(-3).map((element) => element.dataset.pileableId),
  );

  const bfBox = await page.locator('[data-kind="battlefield"]').boundingBox();
  await dropAt(idA, bfBox.x + 50, bfBox.y + 50);
  await page.waitForTimeout(150);

  async function boxOf(id) {
    return page.locator(`[data-kind="battlefield"] .middle-card[data-pileable-id="${id}"] .card`).boundingBox();
  }
  let box = await boxOf(idA);
  await dropAt(idB, box.x + box.width / 2, box.y + box.height * 0.85);
  await page.waitForTimeout(150);

  box = await boxOf(idB);
  await dropAt(idC, box.x + box.width / 2, box.y + box.height * 0.85);
  await page.waitForTimeout(150);

  const [yA, yB, yC] = [await boxOf(idA), await boxOf(idB), await boxOf(idC)].map((b) => b.y);
  const [deltaAB, deltaBC] = [yB - yA, yC - yB];
  assert.ok(deltaAB > 5, `card B must sit below card A, got delta ${deltaAB}`);
  assert.ok(deltaBC > 5, `card C must sit below card B, got delta ${deltaBC} - a delta near 0 means it landed on top of B instead of offsetting further`);
  assert.ok(Math.abs(deltaAB - deltaBC) < 2, `each column step should be the same size, got ${deltaAB} then ${deltaBC}`);

  // *fix (queued 2026-09-10, direct user report: "hover over stack
  // Effect has some weird shadows that look weirdly overlapped"):
  // hovering a card that's a member of this 3-card column used to
  // switch it from `position: absolute` (D129's stack layout) to
  // `position: relative` (a stale `.middle-card:hover` rule, D25-era,
  // that had equal CSS specificity and came later in source order),
  // dropping it back into `.card-row`'s normal flex flow. There its
  // width resolved against `.middle-card`'s own `max-width: 8.5rem`
  // ceiling instead of its ~44px card content - an invisible 136px-wide
  // box whose `box-shadow` painted as a large, disconnected smudge.
  const topCard = page.locator(`[data-kind="battlefield"] .middle-card[data-pileable-id="${idC}"]`);
  await topCard.hover({ force: true });
  await page.waitForTimeout(150);
  const [hoverPosition, hoverWidth, innerCardWidth] = await topCard.evaluate((element) => [
    getComputedStyle(element).position,
    element.getBoundingClientRect().width,
    element.querySelector('.card').getBoundingClientRect().width,
  ]);
  assert.equal(hoverPosition, 'absolute', 'a stack member must stay absolutely positioned through hover, not fall back into flex flow');
  assert.ok(Math.abs(hoverWidth - innerCardWidth) < 1, `hovered wrapper (${hoverWidth}px) should match its real card content (${innerCardWidth}px), not balloon out to the unrelated max-width floor`);
});

// D129 (direct user request: "add stackaction for tap/untap, keep
// pile level for all stacks") - the gear on a real, live BattlefieldPile
// column: Tap sets every card in THAT stack, Untap reverses it, and a
// card outside the stack is never touched. Reuses the exact column
// the test above just built rather than re-creating one.
test('game 1: a stack gear taps and untaps one battlefield column without touching the rest', async () => {
  const page = fixture.page;
  const battlefield = page.locator('[data-kind="battlefield"]');
  const columns = await battlefield.locator('.card-stack').evaluateAll(
    (stacks) => stacks.map((element) => element.querySelectorAll(':scope > .middle-card').length),
  );
  const deepIndex = columns.findIndex((count) => count >= 2);
  assert.notEqual(deepIndex, -1, 'need the 3-card column the previous test built');
  const column = battlefield.locator('.card-stack').nth(deepIndex);

  // The only permanent outside this column is the one "cast a creature
  // and tap it" left TAPPED - and a tapped card cannot show a leaking
  // Tap. Untap it first, so the card outside is one a leak WOULD change.
  const tappedOutside = await battlefield.locator('.card-stack').evaluateAll(
    (stacks, index) => stacks.filter((element, index_) => index_ !== index)
      .flatMap((element) => [...element.querySelectorAll(':scope > .middle-card[data-orientation="landscape"]')])
      .map((card) => card.dataset.pileableId),
    deepIndex,
  );
  for (const id of tappedOutside) {
    await rotate(page, battlefield.locator(`.middle-card[data-pileable-id="${id}"]`));
    await page.waitForFunction(
      (cardId) => document.querySelector(`[data-kind="battlefield"] .middle-card[data-pileable-id="${CSS.escape(cardId)}"]`)?.dataset.orientation !== 'landscape',
      id, { timeout: 5000 },
    );
  }

  // Snapshot BEFORE tapping - "no other card CHANGED" is the invariant.
  const outsideBefore = await battlefield.locator('.card-stack').evaluateAll(
    (stacks, index) => stacks.filter((element, index_) => index_ !== index)
      .flatMap((element) => [...element.querySelectorAll(':scope > .middle-card')].map((card) => card.dataset.orientation ?? null)),
    deepIndex,
  );
  assert.ok(outsideBefore.some((orientation) => orientation !== 'landscape'),
    'need an UNTAPPED card outside the column, or a leaking Tap would be invisible');

  const gear = column.locator('.stack-gear');
  assert.equal(await gear.count(), 1, 'a multi-card battlefield column carries a gear');
  await gear.click();
  const menu = page.locator('.stack-action-menu');
  assert.equal(await menu.count(), 1);
  await menu.locator('[data-action="tapStack"]').click();

  await page.waitForFunction((index) => {
    const stack = document.querySelectorAll('[data-kind="battlefield"] .card-stack')[index];
    const cards = [...stack.querySelectorAll(':scope > .middle-card')];
    return cards.length > 0 && cards.every((card) => card.dataset.orientation === 'landscape');
  }, deepIndex, { timeout: 5000 });

  // A card OUTSIDE this stack must be untouched by a stack-scoped action.
  const outsideAfter = await battlefield.locator('.card-stack').evaluateAll(
    (stacks, index) => stacks.filter((element, index_) => index_ !== index)
      .flatMap((element) => [...element.querySelectorAll(':scope > .middle-card')].map((card) => card.dataset.orientation ?? null)),
    deepIndex,
  );
  assert.deepEqual(outsideAfter, outsideBefore, 'a card outside the tapped stack must not change orientation');

  // Untap reverses it - and put the table back the way the next tests expect.
  await gear.click();
  await page.locator('.stack-action-menu [data-action="untapStack"]').click();
  await page.waitForFunction((index) => {
    const stack = document.querySelectorAll('[data-kind="battlefield"] .card-stack')[index];
    const cards = [...stack.querySelectorAll(':scope > .middle-card')];
    return cards.length > 0 && cards.every((card) => card.dataset.orientation !== 'landscape');
  }, deepIndex, { timeout: 5000 });
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
  // D129: every pile renders as stacks now, so "not grouped" is no
  // longer "no stacks at all" - it is exactly ONE. A grouped supply
  // would show a column per colour.
  const stacks = await page.locator('[data-pile-id="rtg-tokens"] .card-stack').count();
  assert.equal(stacks, 1, 'one stack - a plain pile is not split into colour columns');
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

  // `.last()`, not `.first()`: same reasoning as `uiActions.browser.mjs`'s
  // own `handCard()` and this file's own "cast a creature" test - a
  // fanned, overlapping hand only leaves its LAST DOM sibling actually
  // unobstructed to click.
  const hand = () => page.locator('[data-kind="hand"] .middle-card');
  await moveTo(page, hand().last(), '[data-kind="exile"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="exile"] .middle-card').length === 1, undefined, { timeout: 5000 });

  await moveTo(page, hand().last(), '[data-kind="discard"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-kind="discard"] .middle-card').length === 1, undefined, { timeout: 5000 });

  const stackCard = hand().last();
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

// D129: the LANDS tray's own cascade, live.
//
// This surface had NO live coverage at all before now, which is how
// its cascade broke twice without a test noticing - and it is the one
// the original report was about ("3 cards cascades weird", then "zero
// overlap, cards FARTHER apart than before the fix"). It is also the
// only user of the downward (`GroupedPile.stacksDownward`) direction,
// so the whole `top:`-anchored half of the stacking CSS rests on it.
test('game 1: a lands column cascades downward with an even, overlapping step', async () => {
  const page = fixture.page;

  const lands = page.locator('[data-kind="lands"]').first();
  assert.equal(await lands.count(), 1, 'the RtG preset gives each player a lands pile');

  // Move three cards from hand into the lands pile through the real
  // menu action, so this exercises the same path a player uses.
  // Enough draws that SOME colour column is guaranteed 3+ deep: the
  // tray groups by derived colour, and a 3-card draw can land one in
  // each of three columns - which is exactly a depth a cascade bug
  // hides at. Nine from a two-colour guild deck leaves no such out.
  const DRAWS = 9;
  const handCountBefore = await page.locator('[data-kind="hand"] .middle-card').count();
  for (let index = 0; index < DRAWS; index++) await pileAction(page, DECK_ID, 'Draw').click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-kind="hand"] .middle-card').length >= n,
    handCountBefore + DRAWS, { timeout: 10_000 },
  );

  const ids = await page.locator('[data-kind="hand"] .middle-card[data-pileable-id]').evaluateAll(
    (elements, n) => elements.slice(-n).map((element) => element.dataset.pileableId),
    DRAWS,
  );
  const landsId = await lands.getAttribute('data-pile-id');
  for (const id of ids) {
    await page.evaluate(({ cardId, toPileId }) => {
      const target = document.querySelector(`[data-pile-id="${CSS.escape(toPileId)}"]`);
      const transfer = new DataTransfer();
      transfer.setData('text/plain', cardId);
      const box = target.getBoundingClientRect();
      const at = {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      };
      target.dispatchEvent(new DragEvent('dragover', at));
      target.dispatchEvent(new DragEvent('drop', at));
    }, { cardId: id, toPileId: landsId });
    await page.waitForTimeout(150);
  }

  // Find whichever colour column actually received 3+ cards - the
  // grouping is by derived colour, so which column that is depends on
  // what was drawn.
  // Carry the layout's own inputs beside the measured result so a
  // failure explains itself instead of sending the next person to
  // hand-probe computed styles.
  const columns = await lands.locator('.card-stack').all();
  let deepest = null;
  for (const column of columns) {
    const boxes = await column.evaluate((element) => {
      // The spread is the layout's other input; a zero step is almost
      // always a spread of 1, not a broken direction, and reporting it
      // is the difference between a one-line diagnosis and a hunt.
      const spread = getComputedStyle(element).getPropertyValue('--pile-spread');
      return [...element.children]
        .filter((child) => child.classList.contains('middle-card'))
        .map((child) => ({
          spread,
          y: child.getBoundingClientRect().y,
          height: child.getBoundingClientRect().height,
          stackX: child.style.getPropertyValue('--stack-x'),
          stackY: child.style.getPropertyValue('--stack-y'),
          top: getComputedStyle(child).top,
          position: getComputedStyle(child).position,
        }));
    });
    if (!deepest || boxes.length > deepest.length) deepest = boxes;
  }
  const why = () => JSON.stringify(deepest);

  assert.ok(deepest && deepest.length >= 3,
    `need a column of 3+ to see a cascade bug at all, deepest was ${deepest?.length ?? 0}`);

  // Downward: each card sits BELOW the one before it (larger y), the
  // opposite of a chip stack, and the direction the whole `top:`
  // -anchored branch of the stacking CSS exists for.
  const steps = deepest.slice(1).map((box, index) => box.y - deepest[index].y);
  for (const step of steps) {
    assert.ok(step > 0, `a cascade must run DOWNWARD, got a step of ${step}px from ${why()}`);
    assert.ok(step < deepest[0].height,
      `a cascade must OVERLAP, not separate - got ${step}px between cards ${deepest[0].height}px tall ` +
      '(the reported bug: cards farther apart than before the "fix")');
  }

  // Smith's usability defect, as a permanent assertion rather than a
  // one-off screenshot review: a buried land must still be
  // IDENTIFIABLE, not just present. At the chip-calibrated spread this
  // pile used to inherit (0.963) each covered card showed a 2-3px
  // sliver, so a 7-mana column told a player how many lands they had
  // but not which. Recognition over recall - the strip carrying a
  // card's name and cost has to survive.
  const visibleStrip = steps[0];
  assert.ok(visibleStrip > deepest[0].height * 0.1,
    `a buried land must stay identifiable - only ${visibleStrip.toFixed(1)}px of a ` +
    `${deepest[0].height.toFixed(1)}px card shows, which is a sliver, not a name`);

  // Even steps: the third card must land one step past the second, not
  // on top of it. This is the assertion the tray never had.
  const [first] = steps;
  for (const step of steps) {
    assert.ok(Math.abs(step - first) < 0.5,
      `every step of a ${deepest.length}-card cascade must match, got ${steps.join(', ')}`);
  }
});
