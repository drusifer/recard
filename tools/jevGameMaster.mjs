#!/usr/bin/env node
// jev-game-master (queued 2026-10-01 via `*queue sprint`, built 2026-10-02
// via `*bloop`/direct user request "apply the backlogged improvements"): a
// Jev player not tied to any one `games/` directory, that just listens to
// table talk for add/remove-bot requests and answers them.
//
//   bobp make jev-game-master CODE=ABC123 [NAME="Game Master"]
//   node tools/jevGameMaster.mjs --code ABC123 [--name "Game Master"] [--url ...]
//   node tools/jevGameMaster.mjs --name patch          (listening, US-150)
//
// LISTENING mode (US-150/D175): with `--name` and no `--code`, it holds
// a PeerJS address derived from the name and waits; "/invite <name>" in
// any table's talk makes that table's host dial it with the table code.
// Each accepted invite starts THIS script again in `--code` mode, as its
// own child process - so it can be at several tables at once, and a
// quit at one never reaches another.
//
// Every seated Jev player ALREADY answers "add a bot"/"leave" requests as
// a side effect of playing its own game (US-122/D143, `tools/jev/runner.
// mjs`'s `serveSpawnRequests`) - but only once one is already sitting
// down. This is that same, already-built, already-tested machinery,
// standing on its own: joins as a SPECTATOR (plays nothing, takes no
// seat), reads which of the three supported games is actually on the
// table from the table's own preset name, loads THAT game's real player
// list, and serves spawn/quit requests for it - so a table never needs an
// already-seated bot before anyone can ask for one.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launchChromium, startStaticServer, joinTable, listenAsGameMaster } from '../tests/harness/multiplayer.mjs';
import { gameMasterName } from '../src/gameMasterInvite.js';
import { serveSpawnRequests, UsageError } from './jev/runner.mjs';
import { readyAnnouncement } from './botRequests.mjs';
import { GAMES, PRESET_NAMES } from './jev/games.mjs';
import { sharedTurnRelay, TURN_TTL_SECONDS } from './turnRelay.mjs';

// `PRESET_NAMES` (`games.mjs`) maps `GAMES` keys -> preset names; this
// tool needs the REVERSE - a live table's preset name -> which game that
// is. Built here, not duplicated as a second hand-maintained map, so a
// new game is still only one more entry in `games.mjs`, matching its own
// header comment's promise.
const PRESET_TO_GAME = Object.fromEntries(Object.entries(PRESET_NAMES).map(([game, name]) => [name, game]));
const POLL_MS = 500;

const { values: options } = parseArgs({
  options: {
    code: { type: 'string' },
    name: { type: 'string' }, // --code mode defaults it to "Game Master"; listening mode requires it
    url: { type: 'string' },
    port: { type: 'string', default: '8230' },
  },
});

const note = (line) => process.stderr.write(`jev-game-master: ${line}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, exitCode = 2) => { process.stderr.write(`jev-game-master: ${message}\n`); process.exit(exitCode); };

const USAGE = 'either join one table: --code ABC123 [--name "Game Master"]\n'
  + '  or listen for "/invite <name>" from any table: --name <name> (letters, digits, -)';
if (!options.code && !options.name) fail(USAGE);
const listenName = options.code ? null : gameMasterName(options.name);
if (!listenName && !options.code) fail(`"${options.name}" can't be a game master name - ${USAGE}`);
const seatName = options.name ?? 'Game Master';

/**
 * Listening mode: one page holds the address; each invite becomes a
 * `--code` child of this same script, sharing this static server.
 */
async function listen() {
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const baseUrl = options.url ?? server.baseUrl;
  const browser = await launchChromium();
  const children = new Set();
  const onInvite = (code) => {
    note(`invited to ${code} - joining`);
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--code', code, '--name', listenName, '--url', baseUrl], { stdio: 'inherit' });
    children.add(child);
    child.once('exit', (status) => {
      children.delete(child);
      note(`left ${code} (${status ?? 'signal'}) - still listening as ${listenName}`);
    });
  };
  try {
    await listenAsGameMaster({ browser, baseUrl, name: listenName, onInvite });
  } catch (error) {
    await browser.close();
    await server?.close();
    if (error.type === 'unavailable-id') throw new UsageError(`name taken: another game master is already listening as "${listenName}"`);
    throw error;
  }
  note(`listening as ${listenName} - at any table, say "/invite ${listenName}" in table talk`);
  // Ctrl-C at a terminal, or SIGTERM when a container is stopped: every
  // table it joined is its own process, so each is told before it goes.
  process.removeAllListeners('SIGINT');
  const stop = (exitCode) => () => {
    for (const child of children) child.kill('SIGINT');
    process.exit(exitCode);
  };
  process.on('SIGINT', stop(130));
  process.on('SIGTERM', stop(143));
}

async function run() {
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const baseUrl = options.url ?? server.baseUrl;
  const browser = await launchChromium();
  try {
    note(`joining ${options.code} as "${seatName}" (spectator)`);
    // realBroker: true - see jev/runner.mjs's own comment: a jev tool
    // defaults to the public broker, and whichever broker is actually
    // reachable lives entirely in `baseUrl` itself.
    const { peer } = await joinTable({ browser, baseUrl, code: options.code, name: seatName, role: 'spectator', realBroker: true });

    const view = await peer.view();
    const presetName = view.gameConfig?.presetName;
    const game = PRESET_TO_GAME[presetName];
    if (!game) {
      throw new UsageError(`this table is playing "${presetName ?? '(no preset)'}" - no Jev player exists for it yet (only ${Object.keys(PRESET_TO_GAME).join(', ')})`);
    }

    const { adapter } = await GAMES[game]();
    const strategies = adapter.strategies();
    note(`detected "${presetName}" - offering: ${Object.keys(strategies).join(', ')}`);

    const ready = readyAnnouncement({ game, strategies });
    await peer.say(ready.text, ready.data);

    const watcher = serveSpawnRequests({ peer, code: options.code, baseUrl, name: seatName, game, strategies });
    try {
      while (!watcher.wasAskedToLeave()) await sleep(POLL_MS);
      note('asked to leave - closing.');
    } finally {
      watcher.stop();
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}

/**
 * US-151/D176: with the Cloudflare TURN env set, every page this process
 * (and each child and bot, minting their own) opens is relayed. Minted
 * here first so a bad key fails at startup, not as a silent invite.
 */
async function announceRelay() {
  if (!await sharedTurnRelay()) return;
  note(`relaying WebRTC through Cloudflare TURN (credentials last ${TURN_TTL_SECONDS / 3600} h, refreshed before then)`);
}

process.on('SIGINT', () => process.exit(130));
try {
  await announceRelay();
  if (options.code) await run();
  else await listen();
} catch (error) {
  fail(error.message, error instanceof UsageError ? 2 : 1);
}
