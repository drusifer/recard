// US-121/D142: a bot's thought bubble at a real table. Guests stand in
// for Jev players - they speak the same `bot-decision` talk lines a real
// one does (D142), so this needs no TypeSafe key and no live Gin hand.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:thoughts` / `bobp make test-thoughts`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable } from './harness/multiplayer.mjs';

const PORT = 8222; // not 8211-8221 (every other browser test file)
const fixture = { server: undefined, browser: undefined, hosted: undefined, bot: undefined, closers: [] };

const decision = (text, extra = {}) => ({
  kind: 'bot-decision', strategy: 'equilibrium', handNumber: 1, phase: 'draw',
  decision: { type: 'draw', source: 'stock' }, actions: [{ type: 'DRAW' }],
  trace: [{ rule: 'takeUpcardIfMelds', fired: false }, { rule: 'drawStock', fired: true }],
  judgments: { threat: 2.4, helps: { '9C': 0.31 } },
  facts: { deadwood: 42 }, hand: ['A♥', '2♥'], stockCount: 30, opponentHandSize: 10, ...extra,
});

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  // The real bot-vs-bot shape (US-124): the person watches, the two
  // bots hold Gin's two seats.
  fixture.hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'Gin Rummy', spectate: true });
  fixture.closers.push(fixture.hosted.close);
  // Both bots take their seats BEFORE the deal - a Gin table seats two,
  // and anyone arriving after the deal is a spectator by design (US-124).
  for (const name of ['equilibrium', 'defensive']) {
    const joined = await joinTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: fixture.hosted.code, name });
    fixture.closers.push(joined.close);
    await joined.peer.waitForView(() => globalThis.__recardHarness.view().players.some((p) => p.id === globalThis.__recardHarness.myId()));
    fixture.bots = [...(fixture.bots ?? []), joined.peer];
  }
  fixture.bot = fixture.bots[0];
  await fixture.hosted.host.page.fill('#cards-per-player', '10');
  await fixture.hosted.host.page.click('#deal-btn');
  await fixture.hosted.host.page.waitForSelector('#screen-game:not([hidden])');
});

after(async () => {
  for (const close of fixture.closers.toReversed()) await close();
  await fixture.browser?.close();
  await fixture.server?.close();
});

const hostPage = () => fixture.hosted.host.page;
// The share screen keeps its own roster in the DOM behind the table, so
// every selector here is scoped to the table the host is looking at.
const TABLE = '.table-surface';

// Visibility, not the `hidden` property: a panel whose CSS sets
// `display: flex` renders in full with `hidden` set, which is exactly
// the bug the UX gate caught after every property-based test passed.
const visible = (selector) => hostPage().$$eval(selector, (nodes) => nodes.filter((n) => n.getClientRects().length > 0).length);

test('a bot with no decisions yet shows no bubble', async () => {
  assert.equal(await visible(`${TABLE} thought-bubble`), 0);
});

test('each decision collapses to the move in a few words on that bot\'s seat', async () => {
  await fixture.bot.say('Drew from stock', decision());
  await hostPage().waitForFunction(() => document.querySelector('.table-surface thought-bubble:not([hidden]) .thought-summary'));
  assert.match(await hostPage().$eval(`${TABLE} .thought-summary`, (element) => element.textContent), /Drew from stock/);

  await fixture.bot.say('Discarded 9♣', decision({ decision: { type: 'discard', cardId: 'x' }, phase: 'discard' }));
  await hostPage().waitForFunction(() => document.querySelector('.table-surface .thought-summary')?.textContent.includes('Discarded'));
});

test('clicking it opens the history: every decision, the rule that fired, and Jev\'s numbers', async () => {
  await hostPage().click(`${TABLE} .thought-summary`);
  await hostPage().waitForSelector('body > .thought-panel:not([hidden])');
  assert.equal(await visible('.thought-panel'), 1, 'exactly one history is on screen, and it really is on screen');
  const entries = await hostPage().$$eval('.thought-entry', (nodes) => nodes.length);
  assert.equal(entries, 2, 'both decisions are in the history, scrolled back through');
  const text = await hostPage().$eval('.thought-panel', (element) => element.textContent);
  assert.match(text, /Rule: drawStock/);
  assert.match(text, /Also weighed: takeUpcardIfMelds/);
  assert.match(text, /opponent threat 2\.4/);
  assert.match(text, /Deadwood 42/);
});

test('it stays open when the pointer leaves it - the Gate 1 condition (a scrolling history must not close under the pointer)', async () => {
  await hostPage().$eval(`${TABLE} thought-bubble`, (element) => {
    element.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    document.querySelector('.thought-panel').dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
  });
  await hostPage().mouse.move(5, 5);
  assert.equal(await visible('.thought-panel'), 1, 'still open, still on screen');
});

test('scrolling inside the history does not close it, but a click outside does', async () => {
  await hostPage().$eval('.thought-panel', (element) => { element.scrollTop = 10; element.click(); });
  assert.equal(await visible('.thought-panel'), 1);

  await hostPage().$eval('body', (element) => element.click());
  await hostPage().waitForFunction(() => {
    const panel = document.querySelector('.thought-panel');
    return panel && panel.getClientRects().length === 0;
  });
});

test('a second bot keeps its own history on its own seat', async () => {
  const [, second] = fixture.bots;
  await second.say('Drew from the discard pile', decision({ strategy: 'defensive' }));

  await hostPage().waitForFunction(() => [...document.querySelectorAll('.table-surface thought-bubble')].filter((n) => n.getClientRects().length > 0).length === 2);
  const summaries = await hostPage().$$eval(`${TABLE} .thought-summary`, (nodes) => nodes.map((n) => n.textContent));
  assert.equal(summaries.filter((s) => s.includes('Discarded')).length, 1);
  assert.equal(summaries.filter((s) => s.includes('Drew from the discard pile')).length, 1);
});

test('the open history stays fully on screen, even from a seat near the edge', async () => {
  await hostPage().click(`${TABLE} .thought-summary`);
  await hostPage().waitForSelector('body > .thought-panel:not([hidden])');
  const fits = await hostPage().$eval('.thought-panel', (element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top >= 0, left: box.left >= 0, bottom: box.bottom <= globalThis.innerHeight + 0.5, right: box.right <= globalThis.innerWidth + 0.5 };
  });
  assert.deepEqual(fits, { top: true, left: true, bottom: true, right: true });
  await hostPage().$eval('body', (element) => element.click());
});
