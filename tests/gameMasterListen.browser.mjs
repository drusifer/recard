// US-150/D175: a LISTENING `jev-game-master --name <n>` (no --code), the
// real CLI, invited by name from real tables. It joins each table it is
// invited to as its own child process, so it can be at two at once and a
// quit at one never reaches the other (AC4). A second listener under a
// held name exits at startup (C4).
//
// NOT part of `npm test` - needs a browser and a PeerJS broker (the
// harness's local one). War's `mechanical` needs no TYPESAFE_API_KEY.
// `npm run test:gmlisten` / `bobp make test-gmlisten`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { launchChromium, startStaticServer, hostTable, localPeerServer, closeLocalPeerServer, listenAsGameMaster } from './harness/multiplayer.mjs';

const PORT = 8237; // not 8211-8236 / 8243 (every other browser test file)
const CLI = fileURLToPath(new URL('../tools/jevGameMaster.mjs', import.meta.url));
const WAIT_MS = 60_000;
const fixture = { server: undefined, browser: undefined, closers: [] };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
});

after(async () => {
  for (const close of fixture.closers.toReversed()) await close();
  await fixture.browser?.close();
  await fixture.server?.close();
  await closeLocalPeerServer();
});

async function startCli(...cliArguments) {
  const peer = await localPeerServer();
  const child = spawn(process.execPath, [CLI, '--url', fixture.server.baseUrl + peer.queryString, ...cliArguments], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const proc = { child, stderr: '' };
  child.stdout.resume();
  child.stderr.on('data', (chunk) => { proc.stderr += chunk; });
  proc.exited = new Promise((resolve) => { child.once('exit', (status) => resolve(status)); });
  // SIGINT first: a listener passes it on to every table it joined (each
  // its own process), so a failing test never leaves one sitting at a
  // table and holding this file's event loop open. SIGKILL only if that
  // didn't end it.
  fixture.closers.push(async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGINT');
    const timedOut = Symbol('timed out');
    const ended = await Promise.race([proc.exited, new Promise((resolve) => setTimeout(() => resolve(timedOut), 5000))]);
    if (ended === timedOut) child.kill('SIGKILL');
  });
  return proc;
}

async function until(check, what, proc) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const found = await check();
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`never saw ${what}. Listener stderr:\n${proc.stderr}`);
}

const heard = (host, predicate, what, proc) => until(async () => (await host.talk()).find((entry) => predicate(entry)), what, proc);

async function quit(host, name, proc) {
  const requestId = randomUUID();
  await host.say(`bye ${name}`, { kind: 'quit', requestId, target: name });
  await heard(host, (entry) => entry.data?.kind === 'quit-result' && entry.data.requestId === requestId, `${name} leaving`, proc);
}

async function hostWar() {
  const hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset: 'War' });
  fixture.closers.push(hosted.close);
  return hosted.host;
}

test('with neither --code nor --name it explains both modes and exits 2', async () => {
  const proc = await startCli();
  assert.equal(await proc.exited, 2);
  assert.match(proc.stderr, /--code/);
  assert.match(proc.stderr, /--name/);
});

test('invited by name from two tables, it joins both, adds a bot, and a quit at one leaves the other', async () => {
  const listener = await startCli('--name', 'patch');
  await until(() => listener.stderr.includes('listening as patch'), 'the listener ready', listener);

  // C4: the name is now held - a second listener under it exits at once.
  const rival = await startCli('--name', 'Patch');
  assert.equal(await rival.exited, 2);
  assert.match(rival.stderr, /name taken/);

  const tableA = await hostWar();
  const tableB = await hostWar();
  await tableA.say('/invite Patch'); // C3: any capitalisation
  await tableB.say('/invite patch');
  for (const table of [tableA, tableB]) {
    await heard(table, (entry) => entry.data?.kind === 'gm-invite-status' && entry.data.status === 'accepted', 'accepted', listener);
    const ready = await heard(table, (entry) => entry.data?.kind === 'jev-ready' && entry.name === 'patch', 'patch arriving', listener);
    assert.deepEqual(ready.data.games, ['war'], 'it detected the game on the table it was invited to');
  }

  // Through the invited game master, a bot is added the usual way.
  const requestId = randomUUID();
  await tableA.say('add a War bot', { kind: 'spawn-bot', requestId, game: 'war', strategy: 'mechanical' });
  const result = await heard(tableA, (entry) => entry.data?.kind === 'spawn-bot-result' && entry.data.requestId === requestId, 'spawn-bot-result', listener);
  assert.equal(result.data.ok, true, JSON.stringify(result));
  try {
    await heard(tableA, (entry) => entry.data?.kind === 'jev-ready' && entry.name === 'mechanical', 'the bot sitting down', listener);
  } catch (error) {
    // What table A's host saw, so a failure here says where the join stopped.
    const view = await tableA.view();
    const traffic = (await tableA.traffic({ limit: 20 })).map((entry) => `${entry.direction} ${entry.peer} ${entry.type ?? entry.message?.type ?? ''}`);
    error.message += `\nTable A roster: ${JSON.stringify(view.players.map(({ name, role }) => ({ name, role })))}\nTable A traffic (last 20):\n${traffic.join('\n')}`;
    throw error;
  }

  // AC4: leaving table A touches neither table B nor the listener.
  await quit(tableA, 'mechanical', listener);
  await quit(tableA, 'patch', listener);
  assert.ok((await tableB.view()).players.some((player) => player.name === 'patch'), 'still at table B');
  assert.equal(listener.child.exitCode, null, 'still listening');

  await quit(tableB, 'patch', listener);
  listener.child.kill('SIGINT');
  assert.equal(await listener.exited, 130);
});

// US-151/D176: the listener page lives for days, past any one set of TURN
// credentials. A refresh has to land in `peer.options.config` - where
// PeerJS reads it for every new RTCPeerConnection - or later invites
// would dial out with expired credentials.
test('a TURN credential refresh reaches the listening page where PeerJS builds each new connection', async () => {
  const refreshListeners = [];
  const relay = { onRefresh: (listener) => { refreshListeners.push(listener); return () => {}; } };
  const peer = await localPeerServer();
  const listening = await listenAsGameMaster({
    browser: fixture.browser, baseUrl: fixture.server.baseUrl + peer.queryString, name: `relay-${Date.now()}`, onInvite: () => {}, relay,
  });
  fixture.closers.push(listening.close);
  const fresh = { iceServers: [{ urls: ['turns:turn.example.com:443?transport=tcp'], username: 'u2', credential: 'p2' }], iceTransportPolicy: 'relay' };
  await Promise.all(refreshListeners.map((listener) => listener(fresh)));
  assert.deepEqual(await listening.iceConfig(), fresh);
});
