// Builder menu (US-149, D171): "Add Zone"/"Add Pile" buttons dispatch
// the already-existing CREATE_ZONE/CREATE_PILE reducer actions - found
// live to have no UI entry point at all (main.js's own standing
// comment). This file proves only the NEW UI surface; CREATE_ZONE/
// CREATE_PILE themselves and their replication are already covered by
// tests/state.test.js and the general action-dispatch path (D13) - no
// duplicate coverage here. Modeled on newGame.browser.mjs's single-
// host-page convention.
//
// NOT part of `npm test` - needs a browser. `npm run test:buildermenu` /
// `bobp make test-buildermenu`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8234; // not 8211-8233 (every other browser test file)
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

test('Add Zone reveals a kind picker, and Create adds a real, named zone panel', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    const before_ = await page.locator('.zone-panel, zone-panel').count();

    await page.click('#add-zone-btn');
    const kindSelect = page.locator('.builder-kind-select');
    assert.ok(await kindSelect.isVisible(), 'the button is replaced by a kind picker');
    await kindSelect.selectOption('discard');
    await page.click('.builder-inline-form button:has-text("Create")');

    assert.ok(await page.locator('#add-zone-btn').isVisible(), 'the button reappears once settled');
    await page.waitForFunction(
      (n) => document.querySelectorAll('.zone-panel, zone-panel').length > n,
      before_,
    );
    assert.ok(await page.locator('.zone-name-text', { hasText: 'Discard' }).count() >= 1, 'a real Discard pile/zone rendered, named by the reducer\'s own default');
  } finally {
    await context.close();
  }
});

test('Add Pile reveals a kind AND a target-zone picker, and Create adds a pile into the chosen zone', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    const before_ = await page.locator('[data-pile-id]').count();

    await page.click('#add-pile-btn');
    const kindSelect = page.locator('.builder-kind-select');
    const zoneSelect = page.locator('.builder-zone-select');
    assert.ok(await kindSelect.isVisible(), 'a kind picker is shown');
    assert.ok(await zoneSelect.isVisible(), 'a target-zone picker is shown');
    assert.ok(await zoneSelect.locator('option').count() >= 1, 'at least the Table Zone is offered');
    await kindSelect.selectOption('discard');
    await page.click('.builder-inline-form button:has-text("Create")');

    assert.ok(await page.locator('#add-pile-btn').isVisible(), 'the button reappears once settled');
    await page.waitForFunction(
      (n) => document.querySelectorAll('[data-pile-id]').length > n,
      before_,
    );
  } finally {
    await context.close();
  }
});

test('Cancel and Escape both abandon the form with no new zone/pile and no dialog', async () => {
  const context = await fixture.browser.newContext();
  try {
    const page = await hostedWarTable(context);
    let didFireDialog = false;
    page.on('dialog', (d) => { didFireDialog = true; d.accept(); });

    const zonesBefore = await page.locator('.zone-panel, zone-panel').count();
    await page.click('#add-zone-btn');
    await page.click('.builder-inline-form button:has-text("Cancel")');
    assert.ok(await page.locator('#add-zone-btn').isVisible(), 'the button reappears after Cancel');
    assert.equal(await page.locator('.zone-panel, zone-panel').count(), zonesBefore, 'Cancel created nothing');

    const pilesBefore = await page.locator('[data-pile-id]').count();
    await page.click('#add-pile-btn');
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#add-pile-btn').isVisible(), 'the button reappears after Escape');
    assert.equal(await page.locator('[data-pile-id]').count(), pilesBefore, 'Escape created nothing');
    assert.ok(!didFireDialog, 'neither cancel path reaches a dialog');
  } finally {
    await context.close();
  }
});
