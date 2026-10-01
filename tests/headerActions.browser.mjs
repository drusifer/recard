// US-136: `<header-actions>` - the actionable title bar every pile and zone
// has: a title, an optional rename, an optional pile drag handle, and a
// single gear that opens a menu of this pile/zone's own actions (US-150:
// was one always-visible button per action). Tested as a component in a
// real browser with no table behind it. NOT part of `npm test` - needs a
// browser. `npm run test:headeractions`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8228; // not 8211-8227 (every other browser test file)
const fixture = { server: undefined, browser: undefined, page: undefined };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  const context = await fixture.browser.newContext({ viewport: { width: 800, height: 600 } });
  fixture.page = await context.newPage();
  await fixture.page.goto(`http://localhost:${PORT}/`);
});

after(async () => {
  await fixture.browser?.close();
  await fixture.server?.close();
});

// Renders a header into #header-fixture; what it reports is kept on the page as JSON.
async function renderHeader({ title = 'Hand', actionIds = [], options = {} }) {
  await fixture.page.evaluate(async (settings) => {
    await import('/src/components/HeaderActions.js');
    document.querySelector('#header-fixture')?.remove();
    const holder = document.createElement('div');
    holder.id = 'header-fixture';
    holder.dataset.calls = '[]';
    document.body.append(holder);
    const record = (...call) => {
      holder.dataset.calls = JSON.stringify([...JSON.parse(holder.dataset.calls), call]);
    };
    const header = document.createElement('header-actions');
    holder.append(header);
    header.render(settings.title, settings.actionIds, {
      ...settings.options,
      onAction: (id) => { record('action', id); },
      onRename: settings.options.renamable ? (name) => { record('rename', name); } : undefined,
    });
  }, { title, actionIds, options });
}

const calls = () => fixture.page.evaluate(() => JSON.parse(document.querySelector('#header-fixture').dataset.calls));

// UX follow-up (direct user request, "move pile action buttons to a
// corner gear icon menu"): one `.pile-gear` now opens an `<action-menu>`
// popup instead of each action being its own always-visible button -
// same shape as the stack's own gear menu. `openGear` + `menuItem`
// replace the old direct `button(label)` lookup.
const openGear = () => fixture.page.locator('#header-fixture .pile-gear').click({ timeout: 1000 });
const menuItem = (id) => fixture.page.locator(`action-menu .pile-action-menu-item[data-action="${id}"]`);

test('renders the title, the heading class and the id it was given', async () => {
  await renderHeader({ title: 'Discard', options: { headingClass: 'panel-title', headingId: 'h1' } });
  const shape = await fixture.page.evaluate(() => {
    const header = document.querySelector('#header-fixture header-actions');
    return { className: header.className, id: header.id, title: header.querySelector('.zone-name-text').textContent };
  });
  assert.match(shape.className, /zone-name/);
  assert.match(shape.className, /pile-action-header/);
  assert.match(shape.className, /panel-title/);
  assert.equal(shape.id, 'h1');
  assert.equal(shape.title, 'Discard');
});

test('the gear opens a menu with one row per action; clicking a row reports its id', async () => {
  await renderHeader({ actionIds: ['sortRank', 'sortSuit'] });
  assert.equal(await fixture.page.locator('#header-fixture .pile-gear').count(), 1, 'one gear, not one button per action');
  await openGear();
  assert.equal(await fixture.page.locator('action-menu .pile-action-menu-item').count(), 2);
  await menuItem('sortSuit').click({ timeout: 1000 });
  assert.deepEqual(await calls(), [['action', 'sortSuit']]);
});

test('a disabled action is not offered in the menu at all', async () => {
  await renderHeader({ actionIds: ['sortRank', 'sortSuit'], options: { disabled: ['sortRank'] } });
  await openGear();
  assert.equal(await menuItem('sortRank').count(), 0);
  assert.equal(await menuItem('sortSuit').count(), 1);
});

test('no actions at all means no gear is rendered', async () => {
  await renderHeader({ actionIds: [] });
  assert.equal(await fixture.page.locator('#header-fixture .pile-gear').count(), 0);
});

test('a destructive action asks first: cancel does nothing, confirm reports it', async () => {
  await renderHeader({ actionIds: ['remove'] });
  await openGear();
  fixture.page.once('dialog', (dialog) => dialog.dismiss());
  await menuItem('remove').click({ timeout: 1000 });
  assert.deepEqual(await calls(), []);
  await openGear();
  fixture.page.once('dialog', (dialog) => dialog.accept());
  await menuItem('remove').click({ timeout: 1000 });
  assert.deepEqual(await calls(), [['action', 'remove']]);
});

test('a destructive action listed in noConfirm goes straight through, with no dialog', async () => {
  await renderHeader({ actionIds: ['remove'], options: { noConfirm: ['remove'] } });
  await openGear();
  let wasAsked = false;
  fixture.page.once('dialog', (dialog) => { wasAsked = true; return dialog.dismiss(); });
  await menuItem('remove').click({ timeout: 1000 });
  assert.equal(wasAsked, false);
  assert.deepEqual(await calls(), [['action', 'remove']]);
});

test('double-clicking a renamable title edits it; Enter commits a new name', async () => {
  await renderHeader({ title: 'Discard', options: { renamable: true } });
  await fixture.page.locator('#header-fixture .zone-name-text').dblclick();
  await fixture.page.locator('#header-fixture .zone-name-edit').fill('Graveyard');
  await fixture.page.keyboard.press('Enter');
  assert.deepEqual(await calls(), [['rename', 'Graveyard']]);
  assert.equal(await fixture.page.locator('#header-fixture .zone-name-text').count(), 1, 'the title is back');
});

test('Escape abandons a rename, and an unchanged name is not a rename', async () => {
  await renderHeader({ title: 'Discard', options: { renamable: true } });
  await fixture.page.locator('#header-fixture .zone-name-text').dblclick();
  await fixture.page.locator('#header-fixture .zone-name-edit').fill('Graveyard');
  await fixture.page.keyboard.press('Escape');
  await fixture.page.locator('#header-fixture .zone-name-text').dblclick();
  await fixture.page.keyboard.press('Enter');
  assert.deepEqual(await calls(), []);
});

test('a title with no rename callback is not renamable', async () => {
  await renderHeader({ title: 'Table' });
  assert.equal(await fixture.page.locator('#header-fixture .zone-name-text.renamable').count(), 0);
});

test('a draggable pile header carries the pile drag token when dragged', async () => {
  await renderHeader({ options: { pileDraggable: true, pileId: 'hand-alice' } });
  const dragged = await fixture.page.evaluate(() => {
    const header = document.querySelector('#header-fixture header-actions');
    const transfer = new DataTransfer();
    header.dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }));
    return { draggable: header.draggable, token: transfer.getData('text/plain') };
  });
  assert.equal(dragged.draggable, true);
  assert.equal(dragged.token, 'pile-drag:hand-alice');
});
