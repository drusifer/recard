// US-122/D143: "Add Jev bot" at a real table. A guest stands in for a
// running Jev player - it announces `jev-ready` and answers the request
// on table talk, which is exactly the protocol a real one speaks, so
// this needs no TypeSafe key and no live Gin hand.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:addbot` / `bobp make test-addbot`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable } from './harness/multiplayer.mjs';

const PORT = 8221; // not 8211-8220 (every other browser test file)
const STRATEGIES = [{ name: 'equilibrium', description: 'balanced' }, { name: 'defensive', description: 'blocks the opponent' }];
const fixture = { server: undefined, browser: undefined, hosted: undefined, jev: undefined, closers: [] };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  fixture.hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'Gin Rummy' });
  fixture.closers.push(fixture.hosted.close);
});

after(async () => {
  for (const close of fixture.closers.reverse()) await close();
  await fixture.browser?.close();
  await fixture.server?.close();
});

const controlHidden = () => fixture.hosted.host.page.$eval('add-bot', (el) => el.hidden);

test('with no Jev player at the table, there is nothing to add and the control is hidden', async () => {
  assert.equal(await controlHidden(), true);
});

test('a Jev player announcing itself reveals the control, listing strategies with their descriptions', async () => {
  const joined = await joinTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: fixture.hosted.code, name: 'equilibrium' });
  fixture.closers.push(joined.close);
  fixture.jev = joined.peer;
  await fixture.jev.waitForView(() => globalThis.__recardHarness.view().players.some((p) => p.id === globalThis.__recardHarness.myId()));
  await fixture.jev.say('Jev player here.', { kind: 'jev-ready', games: ['gin'], strategies: STRATEGIES });

  // The host is on its share screen until it deals, and the control
  // lives on the table - so deal, the way a real host would before
  // wanting a second bot in the game.
  await fixture.hosted.host.page.fill('#cards-per-player', '10');
  await fixture.hosted.host.page.click('#deal-btn');
  await fixture.hosted.host.page.waitForSelector('#screen-game:not([hidden])');
  await fixture.hosted.host.page.waitForFunction(() => document.querySelector('add-bot')?.hidden === false);
  const options = await fixture.hosted.host.page.$$eval('.add-bot-strategy option', (nodes) => nodes.map((n) => n.textContent));
  assert.deepEqual(options, ['equilibrium - balanced', 'defensive - blocks the opponent']);
});

test('pressing it asks the Jev player on the table channel, and says so while it waits', async () => {
  const host = fixture.hosted.host;
  await host.page.selectOption('.add-bot-strategy', 'defensive');
  await host.page.click('.add-bot-btn');

  // in flight: named, and the button can't be pressed again
  await host.page.waitForFunction(() => document.querySelector('.add-bot-status')?.textContent.startsWith('Asking'));
  assert.equal(await host.page.$eval('.add-bot-btn', (b) => b.disabled), true);

  const talk = await fixture.jev.waitForTalk(2);
  const asked = talk.find((entry) => entry.data?.kind === 'spawn-bot');
  assert.equal(asked.data.strategy, 'defensive');
  assert.equal(asked.data.game, 'gin');
  assert.ok(asked.data.requestId, 'the request carries an id to answer');
});

test('a refusal comes back in words, and the control is usable again', async () => {
  const talk = await fixture.jev.talk();
  const { requestId } = talk.find((entry) => entry.data?.kind === 'spawn-bot').data;
  await fixture.jev.say('Could not add a defensive bot.', {
    kind: 'spawn-bot-result', requestId, ok: false, error: 'TYPESAFE_API_KEY is not set where I am running',
  });

  await fixture.hosted.host.page.waitForFunction(() => document.querySelector('.add-bot-status')?.textContent.includes('TYPESAFE_API_KEY'));
  assert.equal(await fixture.hosted.host.page.$eval('.add-bot-btn', (b) => b.disabled), false);
});
