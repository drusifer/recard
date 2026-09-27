// US-133: `<action-menu>` - the popup that both a card's right-click menu
// and a stack's gear menu are. Tested as a component, in a real browser,
// with no table behind it: it is handed rows and an anchor and reports
// what was picked. NOT part of `npm test` - needs a browser.
// `npm run test:actionmenu`.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8226; // not 8211-8225 (every other browser test file)
const fixture = { server: undefined, browser: undefined, page: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  const context = await fixture.browser.newContext({ viewport: { width: 800, height: 600 } });
  fixture.page = await context.newPage();
  await fixture.page.goto(`http://localhost:${PORT}/`);
  // Counts the seam main.js listens on, once for the whole file.
  await fixture.page.evaluate(() => {
    document.addEventListener('pilemenu:opened', () => {
      document.body.dataset.opened = String(Number(document.body.dataset.opened ?? 0) + 1);
    });
  });
});

after(async () => {
  await fixture.browser?.close();
  await fixture.server?.close();
});

// Every test starts from a page with no menu open and no record of picks.
beforeEach(async () => {
  await fixture.page.evaluate(async () => {
    const { ActionMenuElement } = await import('/src/components/ActionMenu.js');
    ActionMenuElement.close();
    document.body.dataset.picked = '';
    document.body.dataset.opened = '0';
  });
});

// What the page has been told was picked, in order.
const picked = async () => (await fixture.page.evaluate(() => document.body.dataset.picked)).split(',').filter(Boolean);

const open = (options) => fixture.page.evaluate(async (settings) => {
  await import('/src/components/ActionMenu.js');
  document.createElement('action-menu').open({ ...settings, onSelect: (id) => { document.body.dataset.picked += `${id},`; } });
  // The dismiss listeners are bound on the next tick - wait for it, as a
  // person's next click always would.
  await new Promise((resolve) => setTimeout(resolve, 20));
}, options);

const ROWS = [
  { id: 'reveal', text: '👁 Reveal', title: 'Show it', label: 'Reveal' },
  { id: 'rotate', text: '↻ Rotate', title: 'Turn it', label: 'Rotate' },
  { id: 'nope', text: 'Nope', title: 'Disabled', label: 'Nope', disabled: true },
];

test('opens at the anchor, as one menu, with a row per item that carries its identity', async () => {
  await open({ x: 100, y: 120, items: ROWS });
  const state = await fixture.page.evaluate(() => {
    const menu = document.querySelector('action-menu');
    const rect = menu.getBoundingClientRect();
    return {
      count: document.querySelectorAll('action-menu').length,
      left: rect.left, top: rect.top,
      rows: [...menu.querySelectorAll('.pile-action-menu-item')].map((row) => ({
        action: row.dataset.action, text: row.textContent, aria: row.getAttribute('aria-label'), disabled: row.disabled,
      })),
      opened: Number(document.body.dataset.opened),
    };
  });
  assert.equal(state.count, 1);
  assert.equal(state.left, 100);
  assert.equal(state.top, 120);
  assert.deepEqual(state.rows.map((row) => row.action), ['reveal', 'rotate', 'nope']);
  assert.equal(state.rows[0].aria, 'Reveal');
  assert.equal(state.rows[2].disabled, true);
  assert.equal(state.opened, 1, 'the pilemenu:opened event fires once, after the menu is in the DOM');
});

test('never spills off-screen: an anchor at the corner is shifted in', async () => {
  await open({ x: 799, y: 599, items: ROWS });
  const fits = await fixture.page.evaluate(() => {
    const rect = document.querySelector('action-menu').getBoundingClientRect();
    return rect.right <= 800 && rect.bottom <= 600 && rect.left >= 0 && rect.top >= 0;
  });
  assert.equal(fits, true);
});

test('picking a row reports its id and closes the menu', async () => {
  await open({ x: 100, y: 100, items: ROWS });
  await fixture.page.click('action-menu [data-action="rotate"]');
  assert.deepEqual(await picked(), ['rotate']);
  assert.equal(await fixture.page.locator('action-menu').count(), 0);
});

test('a disabled row cannot be picked', async () => {
  await open({ x: 100, y: 100, items: ROWS });
  await fixture.page.locator('action-menu [data-action="nope"]').click({ force: true });
  assert.deepEqual(await picked(), []);
});

test('Escape closes it', async () => {
  await open({ x: 100, y: 100, items: ROWS });
  await fixture.page.keyboard.press('Escape');
  assert.equal(await fixture.page.locator('action-menu').count(), 0);
  assert.deepEqual(await picked(), []);
});

test('a click anywhere outside closes it', async () => {
  await open({ x: 100, y: 100, items: ROWS });
  await fixture.page.mouse.click(700, 500);
  assert.equal(await fixture.page.locator('action-menu').count(), 0);
});

test('the click that opened it is not read as the click outside that closes it', async () => {
  // Opened FROM a click, with no wait: the dismiss listener must not catch that same click.
  await fixture.page.evaluate(async () => {
    await import('/src/components/ActionMenu.js');
    document.body.addEventListener('click', () => document.createElement('action-menu').open({ x: 50, y: 50, items: [{ id: 'a', text: 'A', title: 'a', label: 'A' }], onSelect: () => {} }), { once: true });
  });
  await fixture.page.mouse.click(300, 300);
  await fixture.page.waitForTimeout(50);
  assert.equal(await fixture.page.locator('action-menu').count(), 1);
});

test('opening a second menu closes the first - there is only ever one', async () => {
  await open({ x: 100, y: 100, items: ROWS });
  await open({ x: 200, y: 200, items: ROWS.slice(0, 1) });
  assert.equal(await fixture.page.locator('action-menu').count(), 1);
  assert.equal(await fixture.page.locator('action-menu .pile-action-menu-item').count(), 1);
});

test('a destructive row asks first: cancel picks nothing, confirm picks it', async () => {
  const rows = [{ id: 'reset', text: 'Reset', title: 'Wipes it', label: 'Reset', destructive: true, confirm: 'Wipes it' }];
  const dialogs = [];
  fixture.page.once('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await open({ x: 100, y: 100, items: rows });
  await fixture.page.click('action-menu [data-action="reset"]');
  assert.deepEqual(await picked(), []);
  assert.match(dialogs[0], /Wipes it/);

  fixture.page.once('dialog', (dialog) => dialog.accept());
  await open({ x: 100, y: 100, items: rows });
  await fixture.page.click('action-menu [data-action="reset"]');
  assert.deepEqual(await picked(), ['reset']);
});

test('a ready-made node (a slider) sits in the menu and clicking it does not close the menu', async () => {
  await fixture.page.evaluate(async () => {
    await import('/src/components/ActionMenu.js');
    const node = document.createElement('div');
    node.id = 'custom-row';
    node.textContent = 'slider goes here';
    node.style.minHeight = '40px';
    // What a slider does itself: it keeps its own clicks to itself.
    node.addEventListener('click', (event) => event.stopPropagation());
    document.createElement('action-menu').open({ x: 100, y: 100, items: [{ node }], onSelect: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await fixture.page.click('#custom-row');
  assert.equal(await fixture.page.locator('action-menu #custom-row').count(), 1);
});

test('extra classes reach the element, so tests and styles can tell menus apart', async () => {
  await open({ x: 10, y: 10, items: ROWS, className: 'stack-action-menu' });
  const classes = await fixture.page.evaluate(() => document.querySelector('action-menu').className);
  assert.match(classes, /card-context-menu/);
  assert.match(classes, /stack-action-menu/);
});
