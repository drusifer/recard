#!/usr/bin/env node
// Stand up a hosted table for ANY game with N Jev bots already seated and
// the game set up the way its own table file says (deal, starting score,
// who goes first) - the setup a person otherwise does by hand before a
// live bot session, so re-running one is one command:
//
//   bobp make jev-table GAME=rtg
//   bobp make jev-table GAME=rtg PLAYERS=rules,aggressive DECK=rtg-mono-white DEAL=7 SCORE=20 STEPS=40
//   node tools/jevTable.mjs --game gin
//
// What is particular to a game lives in `games/<game>/table.yaml`
// (`jev/tableFile.mjs` says what goes in it) - nothing here knows one game
// from another. Every value in that file can be overridden on the command
// line.
//
// Hosts as a SPECTATOR (US-124) so the bots play each other, not you;
// spawns each bot as the same real `jevPlayer.mjs` CLI a person runs by
// hand. Prints the table code and URL - open it in a real browser to
// watch, or use the harness MCP tools (`recard-harness`) to observe and
// answer table talk programmatically. Ctrl-C quits every bot cleanly
// (D149: each finishes the move it is in, says goodbye, and stops)
// before closing the table - the bots run DETACHED from this process's
// own terminal group specifically so Ctrl-C reaches only this script,
// never them directly.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import { launchChromium, startStaticServer, hostTable } from '../tests/harness/multiplayer.mjs';
import { GAMES, gameDirectory } from './jev/games.mjs';
import { loadTable } from './jev/tableFile.mjs';
import { setupSteps, botArguments } from './jev/tableSetup.mjs';
import { once, waitUntilDead } from './jev/shutdown.mjs';

const JEV_PLAYER = fileURLToPath(new URL('jevPlayer.mjs', import.meta.url));
const SEAT_TIMEOUT_MS = 60_000;
const QUIT_GRACE_MS = 5000;
const KILL_GRACE_MS = 5000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** `promise`, or `fallback` if it has not settled within `ms` - a stuck
 *  `page.evaluate()` (observed live: the SAY that asks bots to leave
 *  can itself hang, with no error and no timeout of its own) must never
 *  be able to block the kill escalation that follows it from running
 *  at all. */
async function withTimeout(promise, ms, fallback) {
  const timedOut = async () => { await sleep(ms); return fallback; };
  return Promise.race([promise, timedOut()]);
}

const { values: options } = parseArgs({
  options: {
    game: { type: 'string' },
    players: { type: 'string' }, // defaults to the game's table file
    deck: { type: 'string' }, // defaults to the table's first deck pile
    deal: { type: 'string' }, // cards each seat is dealt; defaults to the table file
    score: { type: 'string' }, // starting score each seat is set to; defaults to the table file
    steps: { type: 'string' }, // decisions each bot's RUN may take; defaults to the table file
    port: { type: 'string', default: '8230' },
  },
});

function fail(message) {
  process.stderr.write(`jev-table: ${message}\n`);
  process.exit(2);
}

const games = Object.keys(GAMES);
if (!options.game) fail(`pass the game: GAME=<${games.join(', ')}> (node: --game)`);
if (!Object.hasOwn(GAMES, options.game)) fail(`unknown game "${options.game}" - choose one of: ${games.join(', ')}`);
const game = options.game;
const { adapter } = await GAMES[game]();
const known = Object.keys(adapter.strategies());
let table;
try {
  table = loadTable(`${gameDirectory(game)}/table.yaml`, { players: known });
} catch (error) {
  fail(error.message);
}

const players = options.players === undefined ? table.players : options.players.split(',').map((each) => each.trim()).filter(Boolean);
if (players.length === 0) fail(`pass at least one player: PLAYERS=<${known.join(', ')}> (node: --players)`);
for (const name of players) {
  if (!known.includes(name)) fail(`unknown ${game} player "${name}" - choose from: ${known.join(', ')}`);
}

/**
 * A number from the command line, or the table file's own when none was given.
 */
function whole(flag, text, fallback, { min, what }) {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min) fail(`${flag.toUpperCase()} must be a whole number${what}, not "${text}"`);
  return value;
}
const setup = {
  ...table,
  deal: whole('deal', options.deal, table.deal, { min: 0, what: ' >= 0' }),
  score: whole('score', options.score, table.score, { min: -Infinity, what: '' }),
  steps: whole('steps', options.steps, table.steps, { min: 1, what: ' >= 1' }),
};

const note = (line) => process.stderr.write(`jev-table: ${line}\n`);

/** Starts one bot, detached from this process's own terminal group so a
 *  Ctrl-C here does not hard-kill it before it can leave gracefully -
 *  it is asked to leave over table talk instead (`shutdown`, below). */
function spawnBot(strategy, seat, code, baseUrl, deckId) {
  const child = spawn(process.execPath, [
    JEV_PLAYER, ...botArguments({ game, strategy, code, baseUrl, deckId, table: setup, seat }),
  ], { stdio: 'inherit', detached: true });
  return { strategy, child, exited: new Promise((resolve) => child.once('exit', resolve)) };
}

/**
 * `child.kill()` signals only the child's OWN pid - for a `detached`
 * child that is its process group's LEADER, Playwright's own browser
 * subprocess was observed live to start a FURTHER, separate group of
 * its own (its main process's pgid is not the bot's pid at all), so
 * `-pid` (the POSIX convention for "the whole group") does not reach it
 * either. Signalling the bot's own pid is still correct and sufficient
 * for the NODE process itself - `pid` alone, not `-pid`.
 */
function killBot(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch { /* already gone (ESRCH) - fine */ }
}

/**
 * Whether `pid` is still a real, live process - `kill(pid, 0)` sends no
 * signal, only checks. Used instead of `child.exitCode`/`'exit'`:
 * observed live, twice, reporting a detached child already gone (Node's
 * own bookkeeping) while the OS process table said otherwise - this
 * asks the OS directly rather than trust that bookkeeping.
 */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Signals each of `pids`, then waits for them to be gone - ending the
 * moment they are (`waitUntilDead`), not when a fixed sleep runs out: a
 * bot that dies at once is not waited on for the rest of its grace period.
 * @returns the pids still standing at the limit
 */
function signalAndWait(signal, pids, ms) {
  for (const pid of pids) killBot(pid, signal);
  return waitUntilDead({ pids, isAlive, sleep, ms });
}

/** Asks every bot to leave over table talk (D149), waits for them to say
 *  so and stop, then closes the table. Kills anything still standing
 *  after the grace period - a bot that never answers, not the normal
 *  path. Every step is optional: shutdown runs from whatever point
 *  setup reached, including before a table or any bot exists. */
async function shutdown({ host, closeTable, closeBrowser, closeServer, bots }) {
  if (host) {
    try {
      await withTimeout(host.say('jev-table: closing the table - thanks for the game.', { kind: 'quit', requestId: randomUUID() }), 5000);
    } catch { /* the page may already be gone - fall through to killing what's left */ }
    await Promise.race([Promise.all(bots.map((bot) => bot.exited)), sleep(QUIT_GRACE_MS)]);
  }
  // A single best-effort SIGTERM was observed live to sometimes not
  // land in time - escalate to SIGKILL rather than trust one signal,
  // and check LIVENESS directly rather than trust Node's own exit
  // bookkeeping, which was also observed live to disagree with it.
  let stillAlive = bots.map((bot) => bot.child.pid).filter((pid) => isAlive(pid));
  if (stillAlive.length > 0) stillAlive = await signalAndWait('SIGTERM', stillAlive, KILL_GRACE_MS);
  if (stillAlive.length > 0) {
    stillAlive = await signalAndWait('SIGKILL', stillAlive, 1000);
    if (stillAlive.length > 0) note(`could not confirm these bot processes exited - check by hand: ${stillAlive.join(', ')}`);
  }
  await closeTable?.();
  await closeBrowser?.();
  await closeServer?.();
}

const resources = { host: null, closeTable: null, closeBrowser: null, closeServer: null, bots: [] };
// ONE shutdown, however it is reached: Ctrl-C and "every bot has left" both
// land here, and two running side by side both closing the table, the
// browser and the server was observed to hang the exit.
const stop = once(() => shutdown(resources));
process.on('SIGINT', async () => {
  note('asked to stop - closing the table.');
  await stop();
  process.exit(130);
});

try {
  const server = await startStaticServer(Number(options.port));
  resources.closeServer = server.close;
  // This tool owns Ctrl-C: Playwright's own handler would close the browser
  // and `process.exit(130)` before the shutdown below could reap a single
  // bot (`tests/jevTable.browser.mjs`).
  const browser = await launchChromium({ handleSIGINT: false });
  resources.closeBrowser = browser.close.bind(browser);

  const hosted = await hostTable({ browser, baseUrl: server.baseUrl, preset: setup.preset, spectate: true });
  resources.host = hosted.host;
  resources.closeTable = hosted.close;
  note(`table ${hosted.code} at ${server.baseUrl} - join it in a real browser to watch, or ask the harness MCP tools to.`);

  const view = await hosted.host.view();
  const deckId = options.deck ?? view.piles.find((pile) => pile.kind === 'deck')?.id;
  // Not fail(): a table is already open by this point, and fail() exits
  // without running the try's cleanup - throw so the catch below does.
  if (!deckId) throw new Error('no deck pile found on this table - pass DECK=<pile id>');

  resources.bots = players.map((strategy, seat) => spawnBot(strategy, seat, hosted.code, server.baseUrl, deckId));
  note(`seating ${players.join(', ')}...`);

  await hosted.host.waitForView((current, count) => current.players.filter((player) => player.role === 'player').length >= count,
    players.length, { timeout: SEAT_TIMEOUT_MS });
  note('everyone is seated - setting the table up.');
  // A bot's very first look SEEDS rather than reacts (D158) - give each
  // one at least one real poll cycle before anything worth reacting to
  // lands, or the first thing the setup below does (a deal, a roll for who
  // goes first) risks landing in that seed and needing a slower,
  // unattended follow-up question to recover from instead of being read
  // directly.
  await sleep(2000);

  const seatedView = await hosted.host.view();
  const seated = seatedView.players.filter((player) => player.role === 'player');
  const steps = setupSteps(setup, { seated, deckId });
  for (const step of steps) {
    if (step.act) await hosted.host.act(step.act);
    else await hosted.host.say(step.say);
  }

  const dealt = setup.deal ? `, ${setup.deal} cards each` : '';
  const scored = setup.score === null ? '' : `, score ${setup.score} each`;
  note(`ready: ${seated.length} seated${dealt}${scored}. Ctrl-C to end the table.`);
  await Promise.all(resources.bots.map((bot) => bot.exited));
  // They also all exit when Ctrl-C asked them to - that is not "on their own".
  if (!stop.started()) note('every bot finished its run on its own.');
  await stop();
} catch (error) {
  note(`failed: ${error.message}`);
  await stop();
  process.exit(1);
}
