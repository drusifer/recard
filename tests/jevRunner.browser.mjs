// US-128/D153: the REAL runner at a real table. The `jev-player` CLI
// runs as its own process, joins a hosted table over PeerJS/WebRTC, and
// is watched only through what the table sees - talk lines and moves -
// the way a person at the table would see it.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:jev-runner` / `bobp make test-jev-runner`. The RtG test
// needs TYPESAFE_API_KEY (RtG judges every turn with Jev); Gin's uses the
// key-free rule list `knock-early`, so it always runs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { launchChromium, startStaticServer, hostTable, dealTable } from './harness/multiplayer.mjs';
import { GOODBYE } from '../tools/jev/runner.mjs';

const PORT = 8223; // not 8211-8222 (other browser test files / the MCP server)
const CLI = fileURLToPath(new URL('../tools/jevPlayer.mjs', import.meta.url));
const WAIT_MS = 90_000;
const fixture = { server: undefined, browser: undefined, closers: [] };

before(async () => {
  fixture.server = await startStaticServer(PORT);
  fixture.browser = await launchChromium();
});

after(async () => {
  for (const close of fixture.closers.toReversed()) await close();
  await fixture.browser?.close();
  await fixture.server?.close();
});

/**
 * Starts the real CLI against `code`. Resolves its exit once it ends;
 * `stderr` collects what it printed, for the failure message.
 */
function startPlayer(code, ...cliArguments) {
  const child = spawn(process.execPath, [CLI, '--code', code, '--url', fixture.server.baseUrl, ...cliArguments], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const player = { child, stderr: '' };
  child.stdout.resume();
  child.stderr.on('data', (chunk) => { player.stderr += chunk; });
  player.exited = new Promise((resolve) => { child.once('exit', (status) => resolve(status)); });
  fixture.closers.push(async () => { if (child.exitCode === null) child.kill(); });
  return player;
}

/**
 * The first talk line matching `predicate`, waiting for it to be said.
 */
async function heard(host, predicate, what, player) {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const found = (await host.talk()).find((entry) => predicate(entry));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`never heard ${what}. Player stderr:\n${player.stderr}`);
}

async function hostFor(preset) {
  const hosted = await hostTable({ browser: fixture.browser, baseUrl: fixture.server.baseUrl, preset });
  fixture.closers.push(hosted.close);
  return hosted;
}

const readyFrom = (game) => (entry) => entry.data?.kind === 'jev-ready' && entry.data.games?.includes(game);

test('Gin: a rule-list bot joins through the runner, offers both kinds of strategy, and plays real moves (C1)', async () => {
  const { host, code } = await hostFor('Gin Rummy');
  const player = startPlayer(code, '--game', 'gin', '--strategy', 'knock-early');
  const ready = await heard(host, readyFrom('gin'), 'the jev-ready announcement', player);
  const offered = ready.data.strategies.map((each) => each.name);
  assert.ok(offered.includes('knock-early') && offered.includes('jev-balanced'), `offers both kinds: ${offered}`);

  await dealTable(host, [], { players: 2, cardsPerPlayer: 10 });
  const isBotMove = (entry) => entry.data?.kind === 'bot-decision' && entry.data.strategy === 'knock-early';
  const first = await heard(host, isBotMove, 'the bot\'s first move', player);
  assert.deepEqual(first.data.decision.type, 'draw', 'a turn opens with a draw');
  await heard(host, (entry) => isBotMove(entry) && entry.data.decision.type === 'discard', 'the bot\'s discard', player);

  await host.say('everyone out', { kind: 'quit', requestId: 'q-gin' });
  assert.equal(await player.exited, 0, player.stderr);
});

test('Gin: asked to leave before any deal, it says goodbye and exits cleanly (C4)', async () => {
  const { host, code } = await hostFor('Gin Rummy');
  const player = startPlayer(code, '--game', 'gin', '--strategy', 'knock-early');
  await heard(host, readyFrom('gin'), 'the jev-ready announcement', player);
  await host.say('knock-early, you can go', { kind: 'quit', requestId: 'q-1', target: 'knock-early' });
  const goodbye = await heard(host, (entry) => entry.data?.kind === 'quit-result', 'a goodbye', player);
  assert.equal(goodbye.text, GOODBYE);
  assert.equal(await player.exited, 0, player.stderr);
  assert.match(player.stderr, /left the table cleanly/);
});

test('RtG: now answers "add a bot" and "leave" like every game - the gap US-128 closes (AC4)', {
  skip: !process.env.TYPESAFE_API_KEY && 'RtG judges every turn with Jev: set TYPESAFE_API_KEY',
}, async () => {
  const { host, code } = await hostFor('Recard the Gathering');
  const player = startPlayer(code, '--game', 'rtg', '--strategy', 'rules');
  const ready = await heard(host, readyFrom('rtg'), 'the jev-ready announcement', player);
  assert.deepEqual(ready.data.strategies.map((each) => each.name), ['rules']);

  // A request it cannot honour is refused in words, at the table.
  await host.say('add one', { kind: 'spawn-bot', requestId: 'r-1', game: 'rtg', strategy: 'nope' });
  const refused = await heard(host, (entry) => entry.data?.kind === 'spawn-bot-result' && entry.data.requestId === 'r-1', 'an answer to add-bot', player);
  assert.equal(refused.data.ok, false);
  assert.match(refused.text, /unknown strategy "nope" - I can play: rules/);

  await host.say('rules, you can go', { kind: 'quit', requestId: 'q-2', target: 'rules' });
  const goodbye = await heard(host, (entry) => entry.data?.kind === 'quit-result', 'a goodbye', player);
  assert.equal(goodbye.text, GOODBYE);
  assert.equal(await player.exited, 0, player.stderr);
});
