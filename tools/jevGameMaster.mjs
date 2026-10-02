#!/usr/bin/env node
// jev-game-master (queued 2026-10-01 via `*queue sprint`, built 2026-10-02
// via `*bloop`/direct user request "apply the backlogged improvements"): a
// Jev player not tied to any one `games/` directory, that just listens to
// table talk for add/remove-bot requests and answers them.
//
//   bobp make jev-game-master CODE=ABC123 [NAME="Game Master"]
//   node tools/jevGameMaster.mjs --code ABC123 [--name "Game Master"] [--url ...]
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
import { parseArgs } from 'node:util';
import { launchChromium, startStaticServer, joinTable } from '../tests/harness/multiplayer.mjs';
import { serveSpawnRequests, UsageError } from './jev/runner.mjs';
import { readyAnnouncement } from './botRequests.mjs';
import { GAMES, PRESET_NAMES } from './jev/games.mjs';

// `PRESET_NAMES` (`games.mjs`) maps `GAMES` keys -> preset names; this
// tool needs the REVERSE - a live table's preset name -> which game that
// is. Built here, not duplicated as a second hand-maintained map, so a
// new game is still only one more entry in `games.mjs`, matching its own
// header comment's promise.
const PRESET_TO_GAME = Object.fromEntries(Object.entries(PRESET_NAMES).map(([game, name]) => [name, game]));
const SEAT_TIMEOUT_MS = 60_000;
const POLL_MS = 500;

const { values: options } = parseArgs({
  options: {
    code: { type: 'string' },
    name: { type: 'string', default: 'Game Master' },
    url: { type: 'string' },
    port: { type: 'string', default: '8230' },
  },
});

const note = (line) => process.stderr.write(`jev-game-master: ${line}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message, exitCode = 2) => { process.stderr.write(`jev-game-master: ${message}\n`); process.exit(exitCode); };

if (!options.code) fail('pass the table code to join: CODE=ABC123 (node: --code)');

async function run() {
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const baseUrl = options.url ?? server.baseUrl;
  const browser = await launchChromium();
  try {
    note(`joining ${options.code} as "${options.name}" (spectator)`);
    const { peer } = await joinTable({ browser, baseUrl, code: options.code, name: options.name, role: 'spectator' });
    try {
      await peer.waitForSeat({ timeout: SEAT_TIMEOUT_MS });
    } catch (error) {
      throw new Error(`not seated within ${SEAT_TIMEOUT_MS / 1000}s - is table ${options.code} open, and hosted from the same Recard version?`, { cause: error });
    }

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

    const watcher = serveSpawnRequests({ peer, code: options.code, baseUrl, name: options.name, game, strategies });
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

process.on('SIGINT', () => process.exit(130));
try {
  await run();
} catch (error) {
  fail(error.message, error instanceof UsageError ? 2 : 1);
}
