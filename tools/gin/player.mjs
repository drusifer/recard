// US-120: a Gin Rummy player that joins a table YOU are hosting - run
// through `tools/jevPlayer.mjs`:
//
//   bobp make jev-player GAME=gin STRATEGY=gin-hunter CODE=ABC123
//
// Serves this repo's app locally (or `url` another copy), opens it in
// headless Chromium, and joins by table code named after its strategy (e.g. "equilibrium") over
// the real PeerJS/WebRTC path. Every decision is one JSON line on stdout
// (and in build/gin/), plus one readable line on stderr. Knocks and gin
// are announced on table talk. Jev strategies need TYPESAFE_API_KEY.
import { spawn } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { launchChromium, startStaticServer, joinTable } from '../../tests/harness/multiplayer.mjs';
import { GinBot, summaryLine } from './bot.mjs';
import { STRATEGIES } from './strategies.mjs';
import { resolveStrategy, allStrategyNames } from './strategyKinds.mjs';
import { pendingSpawnRequests, spawnRefusal, readyAnnouncement } from '../botRequests.mjs';

const SPAWN_POLL_MS = 1000;
const RUNNER = fileURLToPath(new URL('../jevPlayer.mjs', import.meta.url));

const LOG_DIR = fileURLToPath(new URL('../../build/gin', import.meta.url));
const TURN_TIMEOUT_MS = 30 * 60_000;
const SEAT_TIMEOUT_MS = 60_000;

/**
 * A problem with how the player was started, not with the game: the CLI
 * prints it without a stack trace and exits 2.
 */
export class UsageError extends Error {}

/**
 * @returns {{ strategy: import('./strategies.mjs').GinStrategy, hands: number }}
 */
function checkOptions(options) {
  let strategy;
  try {
    strategy = resolveStrategy(options.strategy);
  } catch {
    throw new UsageError(`unknown gin strategy "${options.strategy}" - choose one of: ${allStrategyNames().join(', ')}`);
  }
  if (!['bot', 'opponent'].includes(options.first)) throw new UsageError(`FIRST must be "bot" or "opponent", not "${options.first}"`);
  const hands = Number(options.hands);
  if (!Number.isSafeInteger(hands) || hands < 1) throw new UsageError(`HANDS must be a whole number >= 1, not "${options.hands}"`);
  return { strategy, hands };
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
 * US-122/D143: answers "add a Jev bot" requests from the table for as
 * long as this player is at it. Polls its own talk log (the requests
 * arrive as talk `data`), spawns a second runner against the SAME
 * served app and table code, and says what happened - so the person
 * who pressed the button sees either a bot sitting down or the reason
 * it didn't.
 * `startBot` is injected so request handling can be tested without
 * spawning real processes (the default spawns the runner for real).
 * @returns {{ stop: () => void, poll: () => Promise<void> }}
 */
export function serveSpawnRequests({ peer, code, baseUrl, startBot = spawnRunner, pollMs = SPAWN_POLL_MS }) {
  const handled = new Set();
  let running = true;
  const answer = (requestId, data, text) => peer.say(text, { kind: 'spawn-bot-result', requestId, ...data });

  const poll = async () => {
    for (const request of pendingSpawnRequests(await peer.talk(), handled)) {
      handled.add(request.requestId);
      const refusal = spawnRefusal(request, { games: ['gin'], strategies: STRATEGIES, env: process.env });
      const failure = refusal ?? await startBot({ ...request, code, baseUrl });
      await answer(request.requestId, failure ? { ok: false, error: failure } : { ok: true },
        failure ? `Could not add a ${request.strategy} bot: ${failure}` : `Adding a ${request.strategy} bot - it is joining now.`);
      process.stderr.write(`jev-player: spawn request ${request.requestId} (${request.strategy}) - ${failure ?? 'started'}\n`);
    }
  };

  const loop = async () => {
    while (running) {
      await poll();
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  };
  loop().catch((error) => process.stderr.write(`jev-player: spawn watcher stopped: ${error.message}\n`));
  return { stop: () => { running = false; }, poll };
}

/**
 * Starts another runner against the SAME served app and table code.
 * Resolves `null` once the process is up, or the reason it wasn't -
 * "it started", not "it finished": the requester is waiting for a seat
 * to fill, and the bot plays on for the rest of the game.
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

async function playHands({ bot, hands, logFile }) {
  let finished = 0;
  let isBetweenHands = false;
  while (finished < hands) {
    const obs = await bot.waitForTurn({ timeoutMs: TURN_TIMEOUT_MS, pastHandOver: isBetweenHands });
    if (obs.phase === 'wait') continue; // still nobody's move after a long wait - keep waiting
    isBetweenHands = obs.phase === 'hand-over';
    if (isBetweenHands) {
      finished += 1;
      process.stderr.write(`jev-player: hand ${obs.handNumber} over (${obs.outcome}) - ${finished}/${hands}\n`);
      continue;
    }
    const record = await bot.step();
    const line = JSON.stringify(record);
    process.stdout.write(`${line}\n`);
    await appendFile(logFile, `${line}\n`);
    process.stderr.write(`${summaryLine(record)}\n`);
    if (record.announcement) process.stderr.write(`jev-player: said "${record.announcement}"\n`);
  }
}

/**
 * Joins table `options.code` as a player named after its strategy (direct
 * user request, 2026-09-19) and plays `options.hands` hands of Gin.
 * Throws `UsageError` for bad options; closes its browser however it ends.
 * @param {{ code: string, strategy: string, first: string, hands: string, name?: string, url?: string, port: string }} options
 */
export async function play(options) {
  const { strategy, hands } = checkOptions(options);
  const judge = judgeFor(strategy);
  const name = options.name ?? strategy.name;
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const browser = await launchChromium();
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const logFile = path.join(LOG_DIR, `${new Date().toISOString().replaceAll(':', '-')}-${strategy.name}.jsonl`);
    process.stderr.write(`jev-player: joining ${options.code} as "${name}" (${strategy.description})\njev-player: log ${logFile}\n`);
    const { peer } = await joinTable({ browser, baseUrl: options.url ?? server.baseUrl, code: options.code, name });
    try {
      await peer.waitForSeat({ timeout: SEAT_TIMEOUT_MS });
    } catch (error) {
      throw new Error(`not seated within ${SEAT_TIMEOUT_MS / 1000}s - is table ${options.code} open, and hosted from the same Recard version?`, { cause: error });
    }
    // US-124/US-125: a full or already-started table seats a newcomer as
    // a SPECTATOR, which has no hand and is never dealt to. Found live:
    // the bot sat there "seated" forever, waiting for a deal that could
    // not come. Say so instead.
    if (await peer.myRole() === 'spectator') {
      throw new UsageError(`seated as a SPECTATOR at table ${options.code}, so I will never be dealt in - the game is full (Gin seats 2) or already under way. Start a fresh hand, or host a table with a free seat.`);
    }
    process.stderr.write('jev-player: seated - waiting for the deal\n');
    // US-122: announce what this player can deal in, so the table can
    // offer "Add Jev bot" at all (D143 - the control's presence is
    // evidence a Jev player is running).
    const ready = readyAnnouncement({ game: 'gin', strategies: STRATEGIES });
    await peer.say(ready.text, ready.data);
    const spawnWatcher = serveSpawnRequests({ peer, code: options.code, baseUrl: options.url ?? server.baseUrl });
    try {
      await playHands({ bot: new GinBot({ peer, strategy, judge, firstPlayer: options.first }), hands, logFile });
    } finally {
      spawnWatcher.stop();
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}
