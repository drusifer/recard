// jev-game-master (queued 2026-10-01, built 2026-10-02): a Jev player not
// tied to any one game, that answers "add a bot"/"leave" table-talk
// requests without ever taking a seat itself. The REAL CLI, against a
// real hosted table - same shape as `tests/jevRunner.browser.mjs`.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:jev-game-master` / `bobp make test-jev-game-master`. War's
// `mechanical` player needs no TYPESAFE_API_KEY, so this always runs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { launchChromium, startStaticServer, hostTable, localPeerServer, closeLocalPeerServer } from './harness/multiplayer.mjs';

const PORT = 8224; // not 8211-8223 (other browser test files / the MCP server / jevRunner's own)
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

async function startMaster(code, ...cliArguments) {
  // The real CLI defaults to the public broker (D172) - this test's host
  // is on the local one (this file's own default), so its `--url` needs
  // that server's query string too. Any bot IT spawns in turn (the
  // grandchild-process test below) inherits the same `baseUrl` verbatim
  // (`jev/runner.mjs`'s `spawnRunner`), so this one fix covers both.
  const peer = await localPeerServer();
  const child = spawn(process.execPath, [CLI, '--code', code, '--url', fixture.server.baseUrl + peer.queryString, ...cliArguments], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const proc = { child, stderr: '' };
  child.stdout.resume();
  child.stderr.on('data', (chunk) => { proc.stderr += chunk; });
  proc.exited = new Promise((resolve) => { child.once('exit', (status) => resolve(status)); });
  fixture.closers.push(async () => { if (child.exitCode === null) child.kill(); });
  return proc;
}

async function hostFor(preset) {
  const hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset });
  fixture.closers.push(hosted.close);
  return hosted;
}

/**
 * The first talk line matching `predicate`, waiting for it to be said.
 */
async function heard(host, predicate, what, proc) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const found = (await host.talk()).find((entry) => predicate(entry));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`never heard ${what}. Game-master stderr:\n${proc.stderr}`);
}

/**
 * Asks a seated bot to leave BY NAME and waits for its own real exit -
 * every test that leaves one running has to call this, not just rely on
 * `fixture.closers`' blunt `child.kill()` (SIGTERM, no handler for it
 * here or in `jevGameMaster.mjs`/`jevPlayer.mjs`, so a killed process
 * never reaches its own `finally` - its OWN Playwright browser is left
 * orphaned, which is what was keeping the whole test file's event loop
 * from ever going idle, found live running this file for real).
 */
async function quit(host, master, name) {
  const requestId = randomUUID();
  await host.say(`bye ${name}`, { kind: 'quit', requestId, target: name });
  await heard(host, (entry) => entry.data?.kind === 'quit-result' && entry.data.requestId === requestId, `${name} leaving`, master);
}

test('joins as a spectator, detects War from the table, and announces mechanical without being told the game', async () => {
  const { host, code } = await hostFor('War');
  const master = await startMaster(code);

  const ready = await heard(host, (entry) => entry.data?.kind === 'jev-ready', 'jev-ready announcement', master);
  assert.deepEqual(ready.data.games, ['war']);
  assert.deepEqual(ready.data.strategies.map((s) => s.name), ['mechanical']);

  // A spectator, not a seated player - confirmed via the host's own roster.
  const view = await host.view();
  const seated = view.players.find((p) => p.name === 'Game Master');
  assert.equal(seated?.role, 'spectator');

  await quit(host, master, 'Game Master');
  await master.exited;
});

test('answers a real "add a bot" request by spawning the real jevPlayer CLI, which joins and plays', async () => {
  const { host, code } = await hostFor('War');
  const master = await startMaster(code);
  await heard(host, (entry) => entry.data?.kind === 'jev-ready', 'jev-ready announcement', master);

  const requestId = randomUUID();
  await host.say('add a War bot', { kind: 'spawn-bot', requestId, game: 'war', strategy: 'mechanical' });

  const result = await heard(host, (entry) => entry.data?.kind === 'spawn-bot-result' && entry.data.requestId === requestId,
    'spawn-bot-result', master);
  assert.equal(result.data.ok, true, JSON.stringify(result));

  // The spawned bot is a SEPARATE real process, joining for real - confirmed
  // by its own jev-ready line (name "mechanical", not the game-master's name).
  await heard(host, (entry) => entry.data?.kind === 'jev-ready' && entry.name === 'mechanical', 'the spawned bot\'s own jev-ready', master);

  // Cleanup: the spawned bot is a GRANDCHILD process (game-master -> spawn
  // -> jevPlayer), not tracked by `fixture.closers` - left running, it
  // plays War indefinitely and the event loop never goes idle. It already
  // answers its own quit requests (same mechanism this whole file tests),
  // so ask it, and the game-master itself, to leave the same way a person would.
  await quit(host, master, 'mechanical');
  await quit(host, master, 'Game Master');
  await master.exited;
});

test('a refused request (unknown strategy) is answered with a clear reason, not silently dropped', async () => {
  const { host, code } = await hostFor('War');
  const master = await startMaster(code);
  await heard(host, (entry) => entry.data?.kind === 'jev-ready', 'jev-ready announcement', master);

  const requestId = randomUUID();
  await host.say('add a bot', { kind: 'spawn-bot', requestId, game: 'war', strategy: 'nope' });
  const result = await heard(host, (entry) => entry.data?.kind === 'spawn-bot-result' && entry.data.requestId === requestId,
    'spawn-bot-result', master);
  assert.equal(result.data.ok, false);
  assert.match(result.text, /unknown strategy "nope"/);

  await quit(host, master, 'Game Master');
  await master.exited;
});

test('asked to leave by name, it answers and actually exits', async () => {
  const { host, code } = await hostFor('War');
  const master = await startMaster(code);
  await heard(host, (entry) => entry.data?.kind === 'jev-ready', 'jev-ready announcement', master);

  const requestId = randomUUID();
  await host.say('bye', { kind: 'quit', requestId, target: 'Game Master' });
  await heard(host, (entry) => entry.data?.kind === 'quit-result' && entry.data.requestId === requestId, 'quit-result', master);
  const status = await master.exited;
  assert.equal(status, 0, `expected a clean exit. stderr:\n${master.stderr}`);
});

test('a preset with no Jev player (Hearts) is refused up front, not a silent hang', async () => {
  const { code } = await hostFor('Hearts');
  const master = await startMaster(code);
  const status = await master.exited;
  // UsageError -> exit 2, same convention as jevPlayer.mjs's own "seated
  // as a spectator" refusal - this table can't do what the CLI came to
  // do, which is the operator's problem to fix (wrong table/code), not
  // a runtime failure.
  assert.equal(status, 2, `expected exit 2 (UsageError). stderr:\n${master.stderr}`);
  assert.match(master.stderr, /no Jev player exists for it yet/);
});
