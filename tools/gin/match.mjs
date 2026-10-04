// A full, REAL Gin Rummy game between two named strategies, scored to a
// target (standard: 100) - direct user request: "put two players in a
// game, have them play through, and then score the game play when
// they are finished", reusing the real harness and local-WebRTC work
// (D172), not a headless simulation. Real browsers, real PeerJS data
// channel, real bot processes, real Jev judgments where a strategy
// uses them - the SAME path a person hosting a table gets, driven
// unattended for as many hands as it takes to reach the target.
//
// Pure library (`playMatch`, like `tools/jev/runner.mjs` is to
// `tools/jevPlayer.mjs`) - the CLI is `tools/ginMatch.mjs`;
// `tools/gin/tournament.mjs`/`evolve.mjs` call this directly, one
// match in-process at a time, rather than shelling out N times.
//
// Scoring itself is `games/gin/scoring.yaml`, run by `scoreMachine.mjs`/
// `scoreLibrary.mjs` - this file is ORCHESTRATION only: host a table,
// seat two real bots, redeal between hands, feed each hand's result
// into the scoring machine, stop at the target.
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
export const DEFAULT_TARGET = 100; // standard Gin
export const DEFAULT_MAX_HANDS = 40; // safety cap - a real game of 100 rarely needs this many

/**
 * Asked to stop (SIGINT) mid-match - thrown AFTER a clean shutdown, so
 * a caller never has to tell "stopped on purpose" from "really failed"
 * by string-matching an error message. A library never calls
 * `process.exit()` itself (`tools/ginMatch.mjs`'s own job); this is how
 * it hands the "the user asked to stop" fact back up instead.
 */
export class Interrupted extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function killBot(pid, signal) {
  try { process.kill(pid, signal); } catch { /* already gone */ }
}
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * A strategy spec is either a plain registry name (string) or an
 * EVOLVED VARIANT - `{ name, base, params }`, a name with no entry
 * anywhere, carried to its own bot process via `GIN_VARIANT`
 * (`tools/gin/strategyKinds.mjs`'s own doc comment has the full
 * reasoning). Normalized once here so the rest of this file only ever
 * deals in plain name strings - `tools/gin/evolve.mjs` is the only
 * caller that ever passes the object form.
 */
function resolveSpec(spec) {
  if (typeof spec === 'string') return { name: spec, env: undefined };
  // `name` rides along in the JSON too, not just the CLI's own
  // `--strategy` flag - `tools/gin/adapter.mjs`'s `strategies()` needs
  // it to register the ONE extra entry a variant run needs, since it
  // is called with no arguments at all (no other way for it to know
  // which name this run is even asking about).
  return { name: spec.name, env: { GIN_VARIANT: JSON.stringify({ name: spec.name, base: spec.base, params: spec.params ?? {} }) } };
}

/** Starts one real `jevPlayer.mjs` process, detached (same reasoning as
 *  `jevTable.mjs`'s own `spawnBot`: Ctrl-C here must not hard-kill it
 *  before it can leave gracefully). */
function spawnBot({ spec, seat, code, baseUrl, deckId, maxHands }) {
  const { name, env } = resolveSpec(spec);
  const flags = [
    '--game', 'gin', '--strategy', name, '--code', code, '--url', baseUrl, '--deck', deckId,
    '--hands', String(maxHands), '--first', seat === 0 ? 'bot' : 'opponent',
  ];
  const child = spawn(process.execPath, [JEV_PLAYER, ...flags], {
    stdio: 'inherit', detached: true, env: env ? { ...process.env, ...env } : process.env,
  });
  return { name, child, exited: new Promise((resolve) => child.once('exit', resolve)) };
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
 * reads both final hands off the table. Resolves `null` on timeout OR
 * on `signal.interrupted` going true - the caller distinguishes them.
 */
async function waitForHandOver(host, since, signal) {
  const deadline = Date.now() + HAND_TIMEOUT_MS;
  for (;;) {
    if (signal.interrupted) return null;
    const talk = await host.talk();
    const entry = talk.slice(since).find((each) => each.data?.declare === 'knock' || each.data?.declare === 'gin');
    if (entry) return entry;
    if (Date.now() > deadline) return null;
    await sleep(HAND_POLL_MS);
  }
}

/**
 * Plays one full, real Gin game between `strategyA` and `strategyB` to
 * `target` points, over a fresh table/browser/peer-server this function
 * owns start to finish - always torn down, win or throw.
 * @param {{ strategyA: string|{name:string,base:string,params?:object},
 *   strategyB: string|{name:string,base:string,params?:object}, target?: number,
 *   maxHands?: number, port: number, peerPort: number, note?: (line: string) => void }} options
 *   A strategy is a plain registry name, or an evolved VARIANT spec
 *   (`{name, base, params}` - `resolveSpec`'s own doc comment).
 * @returns {Promise<{ strategyA: string, strategyB: string, hands: number,
 *   totals: Record<string,number>, winner: string, winnerId: string }>}
 */
export async function playMatch({ strategyA: specA, strategyB: specB, target = DEFAULT_TARGET, maxHands = DEFAULT_MAX_HANDS, port, peerPort, note = () => {} }) {
  const strategyA = resolveSpec(specA).name;
  const strategyB = resolveSpec(specB).name;
  const resources = { host: null, closeTable: null, closeBrowser: null, closeServer: null, closePeerServer: null, bots: [] };
  const stop = once(() => shutdown(resources));
  // Registered per-call (not module-level) so a TOURNAMENT running many
  // matches in one process still gets exactly one listener live at a
  // time, for whichever match is actually in flight - the `finally`
  // below always removes it, success or failure, so it never piles up
  // across matches. Sets a flag `waitForHandOver`'s own poll loop
  // checks, rather than exiting the process directly - a library never
  // owns that decision (`tools/ginMatch.mjs`'s job); `Interrupted`
  // thrown below is how "the user asked to stop" reaches the caller.
  const signal = { interrupted: false };
  const onSigint = () => { note('asked to stop.'); signal.interrupted = true; };
  process.on('SIGINT', onSigint);
  try {
    const server = await startStaticServer(port);
    resources.closeServer = server.close;
    const browser = await launchChromium({ handleSIGINT: false });
    resources.closeBrowser = browser.close.bind(browser);

    const peerServer = await startLocalPeerServer(peerPort);
    resources.closePeerServer = peerServer.close;
    const baseUrl = server.baseUrl + peerServer.queryString;

    const hosted = await hostTable({ browser, baseUrl, preset: 'Gin Rummy', spectate: true, realBroker: true });
    resources.host = hosted.host;
    resources.closeTable = hosted.close;
    note(`table ${hosted.code} - ${strategyA} vs ${strategyB}, first to ${target}`);

    const startView = await hosted.host.view();
    const deckId = startView.piles.find((pile) => pile.kind === 'deck').id;
    resources.bots = [specA, specB].map((spec, seat) =>
      spawnBot({ spec, seat, code: hosted.code, baseUrl, deckId, maxHands }));

    await hosted.host.waitForView((view, count) => view.players.filter((player) => player.role === 'player').length >= count,
      2, { timeout: SEAT_TIMEOUT_MS });
    await sleep(DEAL_SEED_MS); // D158 - see jevTable.mjs's own identical wait
    const seatedView = await hosted.host.view();
    const seated = seatedView.players.filter((player) => player.role === 'player');
    note(`seated: ${seated.map((player) => player.name).join(' vs ')}`);

    const { machine } = loadScoring(SCORING_FILE, { library: ginScoreLibrary({ log: note }) });
    const scorer = createActor(machine, { input: { target } });
    scorer.start();

    await hosted.host.act({ type: 'DEAL', cardsPerPlayer: CARDS_PER_PLAYER, pileId: deckId });
    let talkSeen = 0;
    let handNumber = 0;
    for (;;) {
      const entry = await waitForHandOver(hosted.host, talkSeen, signal);
      if (signal.interrupted) throw new Interrupted('asked to stop mid-match');
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
      if (handNumber >= maxHands) throw new Error(`hit the ${maxHands}-hand safety cap before either player reached ${target} - raise maxHands`);
      await hosted.host.act({ type: 'RESHUFFLE_DEAL', pileId: deckId, cardsPerPlayer: CARDS_PER_PLAYER });
    }

    const totals = scorer.getSnapshot().context.totals;
    const [winnerId, winnerPoints] = Object.entries(totals).toSorted((a, b) => b[1] - a[1])[0];
    const winnerName = seated.find((player) => player.id === winnerId)?.name ?? winnerId;
    note(`${winnerName} wins, ${winnerPoints} to ${Object.values(totals).toSorted((a, b) => b - a)[1] ?? 0}, in ${handNumber} hand(s).`);
    return { strategyA, strategyB, hands: handNumber, totals, winner: winnerName, winnerId };
  } finally {
    process.off('SIGINT', onSigint);
    await stop();
  }
}
