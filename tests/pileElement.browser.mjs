// US-137: `PileElement` - the base every pile component shares. `render` is
// written once (the pile's section, its split-picker mode); a subclass
// supplies only `buildRow`. Tested in a real browser with no table behind it,
// with a tiny subclass and a minimal pile view. NOT part of `npm test` -
// needs a browser. `npm run test:pileelement`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer } from './harness/multiplayer.mjs';

const PORT = 8229; // not 8211-8228 (every other browser test file)
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

test('all four pile components are PileElements, so they share one render', async () => {
  const shared = await fixture.page.evaluate(async () => {
    const { PileElement } = await import('/src/components/PileElement.js');
    await Promise.all(['PilePanel', 'FanPile', 'ChipTray', 'DeckStack'].map((name) => import(`/src/components/${name}.js`)));
    return ['pile-panel', 'fan-pile', 'chip-tray', 'deck-stack'].map((tag) => document.createElement(tag) instanceof PileElement);
  });
  assert.deepEqual(shared, [true, true, true, true]);
});

test('a subclass that supplies no row is refused, naming itself', async () => {
  const message = await fixture.page.evaluate(async () => {
    const { PileElement } = await import('/src/components/PileElement.js');
    if (!customElements.get('bare-pile')) customElements.define('bare-pile', class extends PileElement {});
    try {
      document.createElement('bare-pile').buildRow();
      return 'no error';
    } catch (error) {
      return error.message;
    }
  });
  assert.match(message, /bare-pile must implement buildRow/);
});

// Defines a subclass that puts a marked row in the shell, renders one pile into it,
// and reports what the page now holds.
const renderInto = (options) => fixture.page.evaluate(async (settings) => {
  const { PileElement } = await import('/src/components/PileElement.js');
  if (!customElements.get('marked-pile')) {
    customElements.define('marked-pile', class extends PileElement {
      buildRow(container) {
        const row = document.createElement('div');
        row.className = 'marked-row';
        container.append(row);
        return row;
      }
    });
  }
  await import('/src/components/HeaderActions.js');
  document.querySelector('#pile-fixture')?.remove();
  const holder = document.createElement('div');
  holder.id = 'pile-fixture';
  document.body.append(holder);
  const pile = { id: 'p1', kind: 'plain', name: 'Discard', cards: [], count: 0 };
  const element = document.createElement('marked-pile');
  holder.append(element);
  element.render(pile, [pile], settings);
  return {
    className: element.className,
    pileId: element.dataset.pileId,
    kind: element.dataset.kind,
    badge: element.querySelector('.pile-count-badge')?.textContent,
    heading: Boolean(element.querySelector('header-actions')),
    rows: element.querySelectorAll('.marked-row').length,
    pickers: element.querySelectorAll('.fan-row').length,
  };
}, options);

test('the shell is the same for every subclass: an addressable section with its badge, its title bar and ITS row', async () => {
  const shell = await renderInto({});
  assert.equal(shell.className, 'pile-section');
  assert.equal(shell.pileId, 'p1');
  assert.equal(shell.kind, 'plain');
  assert.equal(shell.badge, '0');
  assert.equal(shell.heading, true);
  assert.equal(shell.rows, 1);
});

test('a pile in Split/Pickup picking mode shows the picker instead of the subclass row - decided once, in the base', async () => {
  const picking = await renderInto({ splitPicker: { pileId: 'p1', mode: 'split' } });
  assert.equal(picking.rows, 0, 'the subclass row is not built');
  assert.equal(picking.pickers, 1, 'the picker row is');
});

test('a split picker aimed at some OTHER pile leaves this one alone', async () => {
  const other = await renderInto({ splitPicker: { pileId: 'someone-else', mode: 'split' } });
  assert.equal(other.rows, 1);
  assert.equal(other.pickers, 0);
});
