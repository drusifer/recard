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
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { launchChromium, startStaticServer, joinTable } from '../../tests/harness/multiplayer.mjs';
import { GinBot, summaryLine } from './bot.mjs';
import { STRATEGIES } from './strategies.mjs';

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
  const strategy = STRATEGIES[options.strategy];
  if (!strategy) throw new UsageError(`unknown gin strategy "${options.strategy}" - choose one of: ${Object.keys(STRATEGIES).join(', ')}`);
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
    process.stderr.write('jev-player: seated - waiting for the deal\n');
    await playHands({ bot: new GinBot({ peer, strategy, judge, firstPlayer: options.first }), hands, logFile });
  } finally {
    await browser.close();
    await server?.close();
  }
}
