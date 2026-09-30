// US-144/D166: real coverage for the resume/restore-waiting flow moved
// into src/hostSetup.js's `resumeHostedTable`/`offerRestore`. Never had a
// browser test before this move (D164's own note flagged "full host-
// recovery test" as out of scope, blocked on a 2-peer harness that now
// exists) - closing that gap while this exact code is being touched,
// rather than trusting a manual move by inspection alone.
//
// Modeled on newGame.browser.mjs's single-page-per-test convention, but
// needs TWO pages sharing one browser CONTEXT (like hostSetup.browser.mjs's
// sticky-settings tests) - resume is specifically about what a fresh page
// load in the same browser sees in `localStorage`.
//
// NOT part of `npm test` - needs a browser. `npm run test:resume` /
// `bobp make test-resume`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8231; // not 8211-8230 (every other browser test file)
const BASE = `http://localhost:${PORT}`;
const SAVE_DEBOUNCE_MS = 400; // src/main.js's scheduleSave()

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

test('a fresh page in the same browser offers Resume once a hosted table has saved', async () => {
  const context = await fixture.browser.newContext();
  try {
    const hostPage = await hostedWarTable(context);
    const code = await hostPage.evaluate(() => globalThis.__recardHarness.myId());
    await hostPage.waitForTimeout(SAVE_DEBOUNCE_MS + 200); // scheduleSave's debounce
    // Real reload frees the old PeerJS peer id at the broker before the
    // new page ever asks for it back - close the old page (not the
    // CONTEXT, which would also clear the localStorage save) to match.
    await hostPage.close();

    const landingPage = await context.newPage();
    await landingPage.goto(BASE);
    const resumeButton = landingPage.locator('#resume-game');
    assert.equal(await resumeButton.isEnabled(), true, 'a saved host table makes Resume clickable');
    assert.equal(await resumeButton.getAttribute('data-mode'), 'host');
    const hint = await landingPage.locator('#resume-hint').textContent();
    assert.match(hint, /You were hosting a table/);

    // offerRestore() confirms before restoring (Smith Gate 1/2 wording) -
    // a real browser blocks on this dialog until it's answered.
    landingPage.once('dialog', (dialog) => dialog.accept());
    await resumeButton.click();
    await landingPage.waitForSelector('#screen-game:not([hidden])', { timeout: 20_000 });
    // US-39: same code, no re-host - the whole point of Resume over Create.
    assert.equal(await landingPage.evaluate(() => globalThis.__recardHarness.myId()), code);
    // D33/US-43: hands come back, not just the table shell.
    await landingPage.waitForSelector('[data-pile-id]', { timeout: 15_000 });
  } finally {
    await context.close();
  }
});

test('Resume with nothing saved stays disabled, with no misleading hint', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(BASE);
    assert.equal(await page.locator('#resume-game').isEnabled(), false);
    assert.equal((await page.locator('#resume-hint').textContent()).trim(), '');
  } finally {
    await context.close();
  }
});
