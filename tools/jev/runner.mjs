// US-128/D153: the one runner every game's Jev player goes through.
//
//   bobp make jev-player GAME=<game> STRATEGY=<name> CODE=ABC123
//
// Serves this repo's app locally (or `url` another copy), opens it in
// headless Chromium, joins the table by code under the strategy's name,
// and plays the game's SEAT: "is it my move?", then one step, again.
// Everything that is not the game lives here, so no game can be missing
// it - refusing a spectator seat, announcing what it can deal in
// (D143), answering "add a bot" and "leave" from the table (D143/D149).
// Every step is one JSON line on stdout and in build/<game>/, plus one
// readable line on stderr.
import { spawn } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { launchChromium, startStaticServer, joinTable } from '../../tests/harness/multiplayer.mjs';
import { pendingSpawnRequests, pendingQuits, spawnRefusal, readyAnnouncement } from '../botRequests.mjs';

const SPAWN_POLL_MS = 1000;
const RUNNER = fileURLToPath(new URL('../jevPlayer.mjs', import.meta.url));
const LOG_ROOT = fileURLToPath(new URL('../../build', import.meta.url));
const SEAT_TIMEOUT_MS = 60_000;

/**
 * A problem with how the player was started, not with the game: the CLI
 * prints it without a stack trace and exits 2.
 */
export class UsageError extends Error {}

/**
 * What a bot says when asked to leave. It leaves at its game's next safe
 * point, not mid-move, and says so (Smith, US-128 C4).
 */
export const GOODBYE = 'Leaving the table - I will finish the move I am in first, if any. Thanks for the game.';

const note = (line) => process.stderr.write(`jev-player: ${line}\n`);

/**
 * @typedef {{ name: string, description: string, usesJev: boolean }} Strategy
 * @typedef {{ nextMove: (options: { shouldStop: () => boolean }) => Promise<'move'|'wait'|'done'>,
 *   step: () => Promise<object> }} Seat
 * @typedef {{ game: string, strategies: () => Record<string, Strategy>, checkOptions: (options: object) => void,
 *   sit: (context: object) => Seat|Promise<Seat>, summaryLine: (record: object) => string }} GameAdapter
 */

/**
 * Plays `seat` until it says it is done. The seat is handed the stop
 * signal rather than the runner acting on it, because only the game
 * knows where a turn can safely end (Gin's is a draw AND a discard).
 * `nextMove` paces itself - it waits inside rather than returning at once.
 * @param {{ seat: Seat, shouldStop: () => boolean, record: (entry: object) => Promise<void> }} options
 */
export async function playSeat({ seat, shouldStop, record }) {
  for (;;) {
    const next = await seat.nextMove({ shouldStop });
    if (next === 'done') return;
    if (next === 'move') await record(await seat.step());
  }
}

/**
 * US-122/D143: answers "add a Jev bot" and "leave" requests from the
 * table for as long as this player is at it. Polls its own talk log (the
 * requests arrive as talk `data`), spawns a second runner against the
 * SAME served app and table code, and says what happened - so the person
 * who pressed the button sees either a bot sitting down or the reason it
 * didn't. `startBot` is injected so request handling can be tested
 * without spawning real processes.
 * @returns {{ stop: () => void, poll: () => Promise<void>, wasAskedToLeave: () => boolean }}
 */
export function serveSpawnRequests({ peer, code, baseUrl, name, game, strategies, startBot = spawnRunner, pollMs = SPAWN_POLL_MS }) {
  const handled = new Set();
  let isRunning = true;
  let isAskedToLeave = false;
  // Every answer is a talk line carrying its own `kind` (D138).
  const answer = (kind, requestId, data, text) => peer.say(text, { kind, requestId, ...data });

  const poll = async () => {
    const talk = await peer.talk();
    // Leaving is told on the same channel as everything else (D138):
    // one more `data.kind`, no new message type.
    for (const request of pendingQuits(talk, handled, name)) {
      handled.add(request.requestId);
      isAskedToLeave = true;
      await answer('quit-result', request.requestId, { ok: true }, GOODBYE);
      note(`asked to leave (${request.requestId}) - stopping at the next safe point`);
    }
    for (const request of pendingSpawnRequests(talk, handled)) {
      handled.add(request.requestId);
      const refusal = spawnRefusal(request, { games: [game], env: process.env, strategies });
      const failure = refusal ?? await startBot({ ...request, code, baseUrl });
      await answer('spawn-bot-result', request.requestId, failure ? { ok: false, error: failure } : { ok: true },
        failure ? `Could not add a ${request.strategy} bot: ${failure}` : `Adding a ${request.strategy} bot - it is joining now.`);
      note(`spawn request ${request.requestId} (${request.strategy}) - ${failure ?? 'started'}`);
    }
  };

  const loop = async () => {
    try {
      while (isRunning) {
        await poll();
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    } catch (error) {
      note(`watcher stopped: ${error.message}`);
    }
  };
  loop();
  return { stop: () => { isRunning = false; }, poll, wasAskedToLeave: () => isAskedToLeave };
}

/**
 * Starts another runner against the SAME served app and table code.
 * Resolves `null` once the process is up, or the reason it wasn't -
 * "it started", not "it finished".
 */
function spawnRunner({ game, strategy, code, baseUrl }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      RUNNER, '--game', game, '--strategy', strategy, '--code', code, '--url', baseUrl,
    ], { stdio: 'inherit' });
    child.once('spawn', () => resolve(null));
    child.once('error', (error) => resolve(error.message));
  });
}

function judgeFor(strategy) {
  if (!strategy.usesJev) return null;
  try {
    return new TypeSafeClient();
  } catch (error) {
    throw new UsageError(`${strategy.name} asks Jev for judgments: ${error.message}`);
  }
}

/**
 * Joins table `options.code` as a player named after its strategy and
 * plays `adapter`'s game. Throws `UsageError` for bad options, before any
 * browser starts; closes its browser however it ends.
 * @param {GameAdapter} adapter
 * @param {{ code: string, strategy: string, name?: string, url?: string, port: string }} options
 */
export async function run(adapter, options) {
  const strategies = adapter.strategies();
  const strategy = strategies[options.strategy];
  if (!strategy) {
    throw new UsageError(`unknown ${adapter.game} strategy "${options.strategy}" - choose one of: ${Object.keys(strategies).join(', ')}`);
  }
  adapter.checkOptions(options);
  const judge = judgeFor(strategy);
  const name = options.name ?? strategy.name;
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const baseUrl = options.url ?? server.baseUrl;
  const browser = await launchChromium();
  try {
    const logDirectory = path.join(LOG_ROOT, adapter.game);
    await mkdir(logDirectory, { recursive: true });
    const logFile = path.join(logDirectory, `${new Date().toISOString().replaceAll(':', '-')}-${strategy.name}.jsonl`);
    note(`joining ${options.code} as "${name}" (${strategy.description})`);
    note(`log ${logFile}`);
    const { peer } = await joinTable({ browser, baseUrl, code: options.code, name });
    try {
      await peer.waitForSeat({ timeout: SEAT_TIMEOUT_MS });
    } catch (error) {
      throw new Error(`not seated within ${SEAT_TIMEOUT_MS / 1000}s - is table ${options.code} open, and hosted from the same Recard version?`, { cause: error });
    }
    // US-124/US-125: a full or already-started table seats a newcomer as
    // a SPECTATOR, which is never dealt in. Say so instead of waiting
    // forever for a deal that cannot come.
    if (await peer.myRole() === 'spectator') {
      throw new UsageError(`seated as a SPECTATOR at table ${options.code}, so I will never be dealt in - the game is full or already under way. Start a fresh game, or host a table with a free seat.`);
    }
    // US-122: announce what this player can deal in, so the table can
    // offer "Add Jev bot" at all (D143) - every strategy it can start.
    const ready = readyAnnouncement({ game: adapter.game, strategies });
    await peer.say(ready.text, ready.data);
    const watcher = serveSpawnRequests({ peer, code: options.code, baseUrl, name, game: adapter.game, strategies });
    try {
      const seat = await adapter.sit({ peer, strategy, judge, options, name, log: note });
      await playSeat({
        seat, shouldStop: watcher.wasAskedToLeave,
        record: async (entry) => {
          const line = JSON.stringify(entry);
          process.stdout.write(`${line}\n`);
          await appendFile(logFile, `${line}\n`);
          process.stderr.write(`${adapter.summaryLine(entry)}\n`);
        },
      });
      note(watcher.wasAskedToLeave() ? 'left the table cleanly' : 'finished - leaving the table');
    } finally {
      watcher.stop();
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}
