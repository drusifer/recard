#!/usr/bin/env node
// A full, REAL Gin Rummy game between two named strategies, scored to a
// target (standard: 100) - direct user request: "put two players in a
// game, have them play through, and then score the game play when
// they are finished", reusing the real harness and local-WebRTC work
// (D172), not a headless simulation. Real browsers, real PeerJS data
// channel, real bot processes, real Jev judgments where a strategy
// uses them - the SAME path a person hosting a table gets, driven
// unattended for as many hands as it takes to reach the target.
//
//   bobp make gin-match A=knock-early B=jev-balanced
//   node tools/gin/match.mjs --strategy-a knock-early --strategy-b jev-balanced
//
// Scoring itself is `games/gin/scoring.yaml` (D1??), run by
// `scoreMachine.mjs`/`scoreLibrary.mjs` - this file is ORCHESTRATION
// only: host a table, seat two real bots, redeal between hands, feed
// each hand's result into the scoring machine, stop at the target.
//
// Deliberately NOT built on `jevTable.mjs`'s own table.yaml machinery
// (`tools/jev/tableSetup.mjs`'s `botArguments`): that schema has no
// concept of a multi-hand RUN (`--hands`) or of reading the score back
// out - this is Gin-specific orchestration, not a generic table setup,
// and forcing it through a generic path built for a different shape
// would cost more than the small amount of real duplication here
// (spawn/shutdown, same spirit as `jevTable.mjs`'s own).
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import { createActor, waitFor } from 'xstate';
import { launchChromium, startStaticServer, hostTable } from '../../tests/harness/multiplayer.mjs';
import { startLocalPeerServer } from '../localPeerServer.mjs';
import { once, waitUntilDead } from '../jev/shutdown.mjs';
import { loadScoring } from './scoreMachine.mjs';
import { ginScoreLibrary } from './scoreLibrary.mjs';

const JEV_PLAYER = fileURLToPath(new URL('../jevPlayer.mjs', import.meta.url));
const SCORING_FILE = fileURLToPath(new URL('../../games/gin/scoring.yaml', import.meta.url));
const CARDS_PER_PLAYER = 10;
const SEAT_TIMEOUT_MS = 60_000;
const DEAL_SEED_MS = 2000; // same seed wait jevTable.mjs gives bots before their first look (D158)
const HAND_POLL_MS = 500;
const HAND_TIMEOUT_MS = 180_000; // a single hand genuinely hanging (not just slow) is a real bug, not patience
const QUIT_GRACE_MS = 5000;
const KILL_GRACE_MS = 5000;

const { values: options } = parseArgs({
  options: {
    'strategy-a': { type: 'string' },
    'strategy-b': { type: 'string' },
    target: { type: 'string', default: '100' }, // standard Gin: first to 100
    'max-hands': { type: 'string', default: '40' }, // safety cap - a real game of 100 rarely needs this many
    port: { type: 'string', default: '8240' },
    'peer-port': { type: 'string', default: '9001' },
  },
});

function fail(message) {
  process.stderr.write(`gin-match: ${message}\n`);
  process.exit(2);
}

if (!options['strategy-a'] || !options['strategy-b']) fail('pass both strategies: --strategy-a <name> --strategy-b <name>');

const note = (line) => process.stderr.write(`gin-match: ${line}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function killBot(pid, signal) {
  try { process.kill(pid, signal); } catch { /* already gone */ }
}
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Starts one real `jevPlayer.mjs` process, detached (same reasoning as
 *  `jevTable.mjs`'s own `spawnBot`: Ctrl-C here must not hard-kill it
 *  before it can leave gracefully). */
function spawnBot({ strategy, seat, code, baseUrl, deckId, maxHands }) {
  const flags = [
    '--game', 'gin', '--strategy', strategy, '--code', code, '--url', baseUrl, '--deck', deckId,
    '--hands', String(maxHands), '--first', seat === 0 ? 'bot' : 'opponent',
  ];
  const child = spawn(process.execPath, [JEV_PLAYER, ...flags], { stdio: 'inherit', detached: true });
  return { strategy, child, exited: new Promise((resolve) => child.once('exit', resolve)) };
}

async function shutdown(resources) {
  if (resources.host) {
    try { await resources.host.say('gin-match: game over - closing the table.', { kind: 'quit' }); } catch { /* page may be gone */ }
    await Promise.race([Promise.all(resources.bots.map((bot) => bot.exited)), sleep(QUIT_GRACE_MS)]);
  }
  let stillAlive = resources.bots.map((bot) => bot.child.pid).filter((pid) => isAlive(pid));
  if (stillAlive.length > 0) {
    for (const pid of stillAlive) killBot(pid, 'SIGTERM');
    stillAlive = await waitUntilDead({ pids: stillAlive, isAlive, sleep, ms: KILL_GRACE_MS });
  }
  if (stillAlive.length > 0) {
    for (const pid of stillAlive) killBot(pid, 'SIGKILL');
    await waitUntilDead({ pids: stillAlive, isAlive, sleep, ms: 1000 });
  }
  await resources.closeTable?.();
  await resources.closeBrowser?.();
  await resources.closeServer?.();
  await resources.closePeerServer?.();
}

/**
 * Waits for the next knock/gin talk entry (`GinBot`'s own
 * `announcementFor`, D121/D142) past `since` entries already seen, then
 * reads both final hands off the table. Resolves `null` on timeout -
 * the caller decides whether that is a real hang.
 */
async function waitForHandOver(host, since) {
  const deadline = Date.now() + HAND_TIMEOUT_MS;
  for (;;) {
    const talk = await host.talk();
    const entry = talk.slice(since).find((each) => each.data?.declare === 'knock' || each.data?.declare === 'gin');
    if (entry) return entry;
    if (Date.now() > deadline) return null;
    await sleep(HAND_POLL_MS);
  }
}

const resources = { host: null, closeTable: null, closeBrowser: null, closeServer: null, closePeerServer: null, bots: [] };
const stop = once(() => shutdown(resources));
process.on('SIGINT', async () => { note('asked to stop.'); await stop(); process.exit(130); });

try {
  const server = await startStaticServer(Number(options.port));
  resources.closeServer = server.close;
  const browser = await launchChromium({ handleSIGINT: false });
  resources.closeBrowser = browser.close.bind(browser);

  const peerServer = await startLocalPeerServer(Number(options['peer-port']));
  resources.closePeerServer = peerServer.close;
  const baseUrl = server.baseUrl + peerServer.queryString;

  const hosted = await hostTable({ browser, baseUrl, preset: 'Gin Rummy', spectate: true, realBroker: true });
  resources.host = hosted.host;
  resources.closeTable = hosted.close;
  note(`table ${hosted.code} - ${options['strategy-a']} vs ${options['strategy-b']}, first to ${options.target}`);

  const startView = await hosted.host.view();
  const deckId = startView.piles.find((pile) => pile.kind === 'deck').id;
  const maxHands = Number(options['max-hands']);
  resources.bots = [options['strategy-a'], options['strategy-b']].map((strategy, seat) =>
    spawnBot({ strategy, seat, code: hosted.code, baseUrl, deckId, maxHands }));

  await hosted.host.waitForView((view, count) => view.players.filter((player) => player.role === 'player').length >= count,
    2, { timeout: SEAT_TIMEOUT_MS });
  await sleep(DEAL_SEED_MS); // D158 - see jevTable.mjs's own identical wait
  const seatedView = await hosted.host.view();
  const seated = seatedView.players.filter((player) => player.role === 'player');
  note(`seated: ${seated.map((player) => player.name).join(' vs ')}`);

  const { machine } = loadScoring(SCORING_FILE, { library: ginScoreLibrary({ log: note }) });
  const scorer = createActor(machine, { input: { target: Number(options.target) } });
  scorer.start();

  await hosted.host.act({ type: 'DEAL', cardsPerPlayer: CARDS_PER_PLAYER, pileId: deckId });
  let talkSeen = 0;
  let handNumber = 0;
  for (;;) {
    const entry = await waitForHandOver(hosted.host, talkSeen);
    if (!entry) throw new Error(`no hand concluded within ${HAND_TIMEOUT_MS / 1000}s - a real hang, not patience`);
    handNumber += 1;
    const view = await hosted.host.view();
    const talk = await hosted.host.talk();
    talkSeen = talk.length;
    const knockerId = entry.from;
    const opponent = seated.find((player) => player.id !== knockerId);
    const handOf = (playerId) => view.piles.find((pile) => pile.kind === 'hand' && pile.ownerId === playerId).cards;
    scorer.send({
      type: 'HAND_OVER', knockerId, opponentId: opponent.id, outcome: entry.data.declare,
      knockerHand: handOf(knockerId), opponentHand: handOf(opponent.id),
    });
    await waitFor(scorer, (snapshot) => snapshot.value === 'waiting_for_hand' || snapshot.status === 'done');
    if (scorer.getSnapshot().status === 'done') break;
    if (handNumber >= maxHands) throw new Error(`hit the ${maxHands}-hand safety cap before either player reached ${options.target} - raise --max-hands`);
    await hosted.host.act({ type: 'RESHUFFLE_DEAL', pileId: deckId, cardsPerPlayer: CARDS_PER_PLAYER });
  }

  const totals = scorer.getSnapshot().context.totals;
  const [winnerId, winnerPoints] = Object.entries(totals).toSorted((a, b) => b[1] - a[1])[0];
  const winnerName = seated.find((player) => player.id === winnerId)?.name ?? winnerId;
  process.stdout.write(`${JSON.stringify({ strategyA: options['strategy-a'], strategyB: options['strategy-b'], hands: handNumber, totals, winner: winnerName })}\n`);
  note(`${winnerName} wins, ${winnerPoints} to ${Object.values(totals).toSorted((a, b) => b - a)[1] ?? 0}, in ${handNumber} hand(s).`);
  await stop();
} catch (error) {
  await stop();
  fail(error.message);
}
