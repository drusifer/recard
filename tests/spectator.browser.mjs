// US-124: spectators at a real table - the option on the join screen,
// and the forced downgrade when a game is full (Gin's `playerLimit`).
// Real host + real guests over the real data channel, same harness as
// `multiplayer.browser.mjs`.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:spectator` / `bobp make test-spectator`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable } from './harness/multiplayer.mjs';

const PORT = 8220; // not 8211-8219 (every other browser test file)
const fixture = { server: undefined, browser: undefined, hosted: undefined, closers: [] };

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

const roleOf = (view, id) => view.players.find((p) => p.id === id)?.role;
// A guest's identity is assigned BY THE HOST and can arrive after its
// first view, so "am I seated yet" has to be asked in the page against
// the CURRENT `myId()`, not against an id captured before the join
// settled (the trap `dealTable` documents in the harness).
const seatedSelf = (peer) => peer.waitForView(() => globalThis.__recardHarness.view().players.some((p) => p.id === globalThis.__recardHarness.myId()));

test('someone who chooses "watch" on the join screen is seated as a spectator, with no hand pile', async () => {
  const { peer, close } = await joinTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl,
    code: fixture.hosted.code, name: 'Watcher', role: 'spectator',
  });
  fixture.closers.push(close);
  const view = await seatedSelf(peer);
  const id = await peer.myId();
  assert.equal(roleOf(view, id), 'spectator');
  assert.equal(view.piles.some((p) => p.kind === 'hand' && p.ownerId === id), false);
  // the host sees the same roster - the role is replicated, not local
  const hostView = await fixture.hosted.host.waitForView((v, who) => v.players.some((p) => p.id === who), id);
  assert.equal(roleOf(hostView, id), 'spectator');
});

test('Gin seats two; the third person to ask to PLAY is told the game is full and joins as a spectator', async () => {
  const second = await joinTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: fixture.hosted.code, name: 'Player 2',
  });
  fixture.closers.push(second.close);
  await seatedSelf(second.peer);
  const secondId = await second.peer.myId();

  const third = await joinTable({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: fixture.hosted.code, name: 'Player 3',
  });
  fixture.closers.push(third.close);
  const view = await seatedSelf(third.peer);
  const thirdId = await third.peer.myId();

  assert.equal(roleOf(view, secondId), 'player', 'the second person took the second seat');
  assert.equal(roleOf(view, thirdId), 'spectator', 'the third is seated as a spectator');
  // Gate 1 condition 2: told, in words, WHICH limit they hit
  const banner = await third.peer.page.textContent('#banner');
  assert.match(banner, /full \(2 players\)/);
  assert.match(banner, /spectator/);
});

test('US-124 AC2: a host can hold the table without taking a seat, so two others fill the game', async () => {
  const server = await startStaticServer(8223);
  const browser = await launchChromium();
  const hosted = await hostTable({ browser, baseUrl: server.baseUrl, preset: 'Gin Rummy', spectate: true });
  const guests = [];
  try {
    for (const name of ['Bot A', 'Bot B']) {
      const joined = await joinTable({ browser, baseUrl: server.baseUrl, code: hosted.code, name });
      guests.push(joined);
      await joined.peer.waitForView(() => globalThis.__recardHarness.view().players.some((p) => p.id === globalThis.__recardHarness.myId()));
    }
    const hostId = await hosted.host.myId();
    const view = await hosted.host.view();
    assert.equal(roleOf(view, hostId), 'spectator', 'the host holds no seat');
    assert.equal(view.players.filter((p) => p.role === 'player').length, 2, 'both guests are seated');

    await hosted.host.page.fill('#cards-per-player', '10');
    await hosted.host.page.click('#deal-btn');
    for (const { peer } of guests) await peer.waitForView(() => globalThis.__recardHarness.view().myHand.length === 10);
    const dealt = await hosted.host.view();
    assert.equal(dealt.myHand.length, 0, 'the spectating host is not dealt to');
    assert.equal(dealt.piles.some((p) => p.kind === 'hand' && p.ownerId === hostId), false);
  } finally {
    for (const guest of guests.reverse()) await guest.close();
    await hosted.close();
    await browser.close();
    await server.close();
  }
});
