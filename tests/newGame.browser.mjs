// New Game (US-116, D116): the host swaps to a different preset on an
// already-running table, same table code, no re-host. Modeled on
// hostSetup.browser.mjs's single-page-per-test convention - this file
// only drives the HOST client (real 2-peer guest-notice coverage belongs
// on the multi-player harness, `tests/harness/multiplayer.mjs`, US-118).
//
// NOT part of `npm test` - needs a browser. `npm run test:newgame` /
// `bobp make test-newgame`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8216; // not 8211-8215 (designLint/uiActions/rtgPlaythrough/hostSetup/?)
const BASE = `http://localhost:${PORT}`;

const fixture = { server: undefined, browser: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
});

after(async () => {
  await fixture.browser?.close();
  await fixture.server?.close();
});

// War is PRESETS[0], the dropdown's default - a live table needs no
// preset selection to get started.
async function hostedWarTable(context) {
  const page = await context.newPage();
  await page.goto(BASE);
  await page.click('#show-host');
  await page.click('#create-table');
  await page.waitForSelector('#host-share:not([hidden])', { timeout: 20_000 });
  await page.click('#deal-btn');
  await page.waitForSelector('[data-pile-id]', { timeout: 15_000 });
  return page;
}

test('New Game button lives in host chrome, away from the deck panel\'s Restart game action', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    const newGameButton = page.locator('#new-game-btn');
    assert.ok(await newGameButton.isVisible(), 'visible once a game is live');
    const deckPanelHasIt = await page.locator('.pile-section[data-kind="deck"] #new-game-btn').count();
    assert.equal(deckPanelHasIt, 0, 'not inside the deck panel, unlike Restart game');
  } finally {
    await context.close();
  }
});

test('Cancel returns to the live game with nothing changed', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    const deckPanelIdsBefore = await page.locator('.pile-section[data-kind="deck"]').evaluateAll((els) => els.map((element) => element.dataset.pileId));

    await page.click('#new-game-btn');
    await page.waitForSelector('#host-newgame-only-fields:not([hidden])');
    await page.click('#cancel-new-game-btn');

    await page.waitForSelector('#screen-game:not([hidden])');
    const deckPanelIdsAfter = await page.locator('.pile-section[data-kind="deck"]').evaluateAll((els) => els.map((element) => element.dataset.pileId));
    assert.deepEqual(deckPanelIdsAfter, deckPanelIdsBefore, 'the running table is untouched by Cancel');
  } finally {
    await context.close();
  }
});

test('Start New Game asks for confirmation, then rebuilds the table for the newly chosen preset', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);

    let hasSeenDialog = false;
    page.once('dialog', async (dialog) => {
      hasSeenDialog = true;
      assert.match(dialog.message(), /discard|new game/i);
      await dialog.accept();
    });

    await page.click('#new-game-btn');
    await page.selectOption('#host-preset', { label: 'Recard the Gathering' });
    await page.click('#start-new-game-btn');

    await page.waitForSelector('#screen-game:not([hidden])', { timeout: 20_000 });
    assert.ok(hasSeenDialog, 'a confirm dialog gated the destructive action (Smith Gate 1 AC7)');
    // RtG's own shared token supply (`rtg-tokens` - a pile War never
    // has) is proof the NEW preset's shape actually replaced the old
    // one, regardless of how many of RtG's OWN deck choices default to
    // checked (only the first, since the deck-choice picker's own "only
    // select the first by default" nit).
    await page.waitForSelector('[data-pile-id="rtg-tokens"]', { timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test('Start New Game keeps the same table code - no new session, no re-host', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    const codeBefore = await page.locator('#game-code').textContent();

    page.once('dialog', (dialog) => dialog.accept());
    await page.click('#new-game-btn');
    await page.click('#start-new-game-btn'); // War -> War, no preset change needed
    await page.waitForSelector('#screen-game:not([hidden])', { timeout: 20_000 });

    assert.equal(await page.locator('#game-code').textContent(), codeBefore);
  } finally {
    await context.close();
  }
});

test('Start New Game resets scores to 0', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    // The host is the only seated player in a single-client test -
    // `<score-zone>` lists them with a live-editable `.score-input`.
    const scoreInput = page.locator('.score-input').first();
    await scoreInput.fill('42');
    await scoreInput.press('Enter');
    await page.waitForFunction(() => document.querySelector('.score-input')?.value === '42');

    page.once('dialog', (dialog) => dialog.accept());
    await page.click('#new-game-btn');
    await page.click('#start-new-game-btn');
    await page.waitForSelector('#screen-game:not([hidden])', { timeout: 20_000 });

    await page.waitForFunction(() => document.querySelector('.score-input')?.value === '0');
    assert.equal(await page.locator('.score-input').first().inputValue(), '0');
  } finally {
    await context.close();
  }
});
