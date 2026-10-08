// US-150/D175, host side: "/invite <name>" at a real table dials that
// name's PeerJS address and reports every step in talk, to everyone. A
// bare page holding an address stands in for a listening game master
// here (it accepts and never comes), so this phase is tested without
// one. The real listener is covered by tests/gameMasterListen.browser.mjs.
//
// The bounds are shortened through `setInviteTimings` - never a real
// 15s/90s wait (D164's reconnect-clock idea).
//
// NOT part of `npm test` - needs a browser and a PeerJS broker (the
// harness's local one). `npm run test:gminvite` / `bobp make test-gminvite`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChromium, startStaticServer, hostTable, joinTable, closeLocalPeerServer } from './harness/multiplayer.mjs';

const PORT = 8236; // not 8211-8235 / 8243 (every other browser test file)
const fixture = { server: undefined, browser: undefined, hosted: undefined, guest: undefined, closers: [] };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
  fixture.hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'Gin Rummy' });
  fixture.closers.push(fixture.hosted.close);
  const joined = await joinTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, code: fixture.hosted.code, name: 'Guest' });
  fixture.closers.push(joined.close);
  fixture.guest = joined.peer;
  await fixture.guest.waitForSeat();
  await fixture.hosted.host.page.evaluate(() => globalThis.__recardHarness.setInviteTimings({ answerMs: 3000, arrivalMs: 1500 }));
});

after(async () => {
  for (const close of fixture.closers.toReversed()) await close();
  await fixture.browser?.close();
  await fixture.server?.close();
  await closeLocalPeerServer();
});

/**
 * The invite status lines, as THIS viewer's talk log has them.
 */
async function statuses(peer, count) {
  await peer.page.waitForFunction((n) => globalThis.__recardHarness.talk()
    .filter((entry) => entry.data?.kind === 'gm-invite-status').length >= n, count, { timeout: 15_000 });
  return (await peer.talk()).filter((entry) => entry.data?.kind === 'gm-invite-status');
}

test('a bare /invite gets a usage line, never silence (C3)', async () => {
  await fixture.guest.say('/invite');
  const [usage] = await statuses(fixture.hosted.host, 1);
  assert.equal(usage.data.status, 'usage');
  assert.match(usage.text, /\/invite <game master name>/);
});

test('an invite for a name nobody holds says inviting, then no-answer with how to recover - to everyone', async () => {
  await fixture.guest.say('/invite Nobody-Here');
  const lines = (await statuses(fixture.guest, 3)).slice(1);
  assert.deepEqual(lines.map((line) => line.data.status), ['inviting', 'no-answer']);
  assert.equal(lines[1].data.name, 'nobody-here', 'C3: the name is matched lowercased');
  assert.match(lines[1].text, /--name nobody-here/);
});

test('a game master that accepts but never joins is reported as never-arrived', async () => {
  // A page holding the address, answering exactly as a listener does.
  const context = await fixture.browser.newContext();
  fixture.closers.push(() => context.close());
  const fake = await context.newPage();
  await fake.goto(fixture.hosted.host.page.url());
  await fake.evaluate(async () => {
    const { peerOptionsFromSearch } = await import('/src/peerOptions.js');
    const { gameMasterAddress, ACCEPTED_MESSAGE } = await import('/src/gameMasterInvite.js');
    const peer = new globalThis.Peer(gameMasterAddress('ghost'), peerOptionsFromSearch(globalThis.location.search));
    await new Promise((resolve, reject) => { peer.on('open', resolve); peer.on('error', reject); });
    peer.on('connection', (conn) => conn.on('data', () => conn.send({ kind: ACCEPTED_MESSAGE })));
  });

  await fixture.hosted.host.say('/invite ghost');
  const lines = (await statuses(fixture.hosted.host, 6)).slice(3);
  assert.deepEqual(lines.map((line) => line.data.status), ['inviting', 'accepted', 'never-arrived']);
  assert.match(lines[2].text, /same Recard version/);
});
