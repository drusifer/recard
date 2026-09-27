// US-135: `<zone-panel>` - the bordered box a ZONE is: title bar, body, and
// where things dropped on it go. Tested as a component in a real browser with
// no table behind it (rendered empty, with recorded callbacks). Move/resize
// is `panelInteraction.js`, exercised by the live-table suites.
// NOT part of `npm test` - needs a browser. `npm run test:zonepanel`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8227; // not 8211-8226 (every other browser test file)
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

// Renders an empty zone into #zones-fixture and returns what the test asks about.
async function renderZone({ id, title, withDrops }) {
  return fixture.page.evaluate(async (settings) => {
    await import('/src/components/HeaderActions.js');
    await import('/src/components/ZonePanel.js');
    document.querySelector('#zone-fixture')?.remove();
    const holder = document.createElement('div');
    holder.id = 'zone-fixture';
    document.body.append(holder);
    const zone = document.createElement('zone-panel');
    holder.append(zone);
    // What the zone reported, in order, kept on the page as JSON.
    holder.dataset.calls = '[]';
    const record = (...call) => {
      holder.dataset.calls = JSON.stringify([...JSON.parse(holder.dataset.calls), call]);
    };
    const options = settings.withDrops
      ? {
        onDropCardOnZone: (cardId, zoneId) => { record('card', cardId, zoneId); },
        onMovePile: (pileId, zoneId) => { record('pile', pileId, zoneId); },
      }
      : {};
    zone.render(settings.id, settings.title, [], [], options);
    return null;
  }, { id, title, withDrops });
}

const drop = (data) => fixture.page.evaluate((text) => {
  const body = document.querySelector('#zone-fixture .zone-body');
  const transfer = new DataTransfer();
  transfer.setData('text/plain', text);
  body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  return JSON.parse(document.querySelector('#zone-fixture').dataset.calls);
}, data);

test('renders the box: a zone with its id, a title bar and a body', async () => {
  await renderZone({ id: 'z1', title: 'Discard', withDrops: true });
  const shape = await fixture.page.evaluate(() => {
    const zone = document.querySelector('#zone-fixture zone-panel');
    return {
      className: zone.className,
      groupId: zone.dataset.groupId,
      title: zone.querySelector('header-actions')?.textContent,
      body: Boolean(zone.querySelector(':scope > .zone-body')),
      removable: zone.querySelectorAll('.pile-action-btn').length,
    };
  });
  assert.equal(shape.className, 'zone');
  assert.equal(shape.groupId, 'z1');
  assert.match(shape.title, /Discard/);
  assert.equal(shape.body, true);
  assert.equal(shape.removable, 1, 'an empty zone can be removed');
});

test('the Table Zone is never removable', async () => {
  await renderZone({ id: 'table-zone', title: 'Table', withDrops: true });
  assert.equal(await fixture.page.locator('#zone-fixture .pile-action-btn').count(), 0);
});

test('a pile dropped on the zone is moved into it; a card dropped on it is dealt to it', async () => {
  await renderZone({ id: 'z1', title: 'Discard', withDrops: true });
  const afterPile = await drop('pile-drag:hand-alice');
  assert.deepEqual(afterPile, [['pile', 'hand-alice', 'z1']]);
  const afterCard = await drop('card-7');
  assert.deepEqual(afterCard.at(-1), ['card', 'card-7', 'z1']);
  assert.equal(afterCard.length, 2, 'a pile drop is not also a card drop');
});

test('the zone lights up while something is dragged over its body, and stops when it leaves', async () => {
  await renderZone({ id: 'z1', title: 'Discard', withDrops: true });
  const lit = () => fixture.page.evaluate(() => document.querySelector('#zone-fixture zone-panel').classList.contains('drag-over'));
  await fixture.page.evaluate(() => {
    document.querySelector('#zone-fixture .zone-body').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
  });
  assert.equal(await lit(), true);
  await fixture.page.evaluate(() => {
    document.querySelector('#zone-fixture .zone-body').dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
  });
  assert.equal(await lit(), false);
});

test('with no drop callbacks the zone is not a drop target and has no gutter', async () => {
  await renderZone({ id: 'z1', title: 'Discard', withDrops: false });
  assert.equal(await fixture.page.locator('#zone-fixture .zone-drop-gutter').count(), 0);
  assert.deepEqual(await drop('card-7'), []);
});

test('with drop callbacks the body ends in a drop gutter', async () => {
  await renderZone({ id: 'z1', title: 'Discard', withDrops: true });
  assert.equal(await fixture.page.locator('#zone-fixture .zone-body > .zone-drop-gutter').count(), 1);
});
