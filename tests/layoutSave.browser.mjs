// SaveAs naming UI (US-148, D170): `#save-layout-as-btn` swaps for an
// inline `<input>` instead of `globalThis.prompt()` - Enter commits,
// Escape cancels, a blank name reverts silently. Modeled on
// `newGame.browser.mjs`'s single-page-per-test convention.
//
// NOT part of `npm test` - needs a browser. `npm run test:layoutsave` /
// `bobp make test-layoutsave`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8233; // not 8211-8232 (every other browser test file)
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
  await page.waitForSelector('#layout-controls:not([hidden])', { timeout: 10_000 });
  return page;
}

test('Save Layout As reveals an inline input, not a native prompt, and Enter commits a save', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    let didFireDialog = false;
    page.on('dialog', (d) => { didFireDialog = true; d.accept(); });

    await page.click('#save-layout-as-btn');
    const input = page.locator('.layout-save-as-edit');
    assert.ok(await input.isVisible(), 'the button is replaced by an inline input');
    assert.equal(await page.locator('#save-layout-as-btn').count(), 0, 'the button itself is gone while editing');

    await input.fill('My Layout');
    await input.press('Enter');

    assert.ok(await page.locator('#save-layout-as-btn').isVisible(), 'the button reappears once settled');
    // `globalThis.alert`/`confirm` ARE still native (US-148 scopes only
    // the naming prompt) - the save-success alert fires, which IS a
    // dialog; asserting one fired here would just prove the save ran,
    // not that naming avoided a dialog. Instead assert the override
    // actually persisted under the typed name.
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('recard:layout-overrides:v1') ?? '{}'));
    assert.ok(Object.hasOwn(saved, 'My Layout'), 'the typed name was saved as a real override');
    assert.ok(didFireDialog, 'the save-success alert still fires (unchanged by this story)');
  } finally {
    await context.close();
  }
});

test('Escape abandons the Save As edit with no save and no dialog at all', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    let didFireDialog = false;
    page.on('dialog', (d) => { didFireDialog = true; d.accept(); });

    await page.click('#save-layout-as-btn');
    await page.locator('.layout-save-as-edit').fill('Abandoned');
    await page.keyboard.press('Escape');

    assert.ok(await page.locator('#save-layout-as-btn').isVisible(), 'the button reappears on cancel');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('recard:layout-overrides:v1') ?? '{}'));
    assert.ok(!Object.hasOwn(saved, 'Abandoned'), 'nothing was saved under the abandoned name');
    assert.ok(!didFireDialog, 'cancelling never reaches a dialog of any kind');
  } finally {
    await context.close();
  }
});

test('a blank name reverts silently - no save, no dialog', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    let didFireDialog = false;
    page.on('dialog', (d) => { didFireDialog = true; d.accept(); });

    await page.click('#save-layout-as-btn');
    await page.locator('.layout-save-as-edit').fill('');
    await page.keyboard.press('Enter');

    assert.ok(await page.locator('#save-layout-as-btn').isVisible(), 'the button reappears after a blank commit');
    assert.ok(!didFireDialog, 'a blank name never reaches a dialog');
  } finally {
    await context.close();
  }
});
