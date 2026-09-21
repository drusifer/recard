// US-127/D151: an RtG player that joins a table you are hosting.
//
//   bobp make jev-player GAME=rtg STRATEGY=rules CODE=ABC123 [DECK=<pile id>]
//
// The loop is the design: look at the table, hear what was said, ask
// what to do next, check the move against the game's own rules, do it,
// and say so. Nothing here knows the turn order - that emerges from
// what is legal and what the table says.

import { TypeSafeClient } from '@typesafe-ai/sdk';
import { launchChromium, startStaticServer, joinTable } from '../../tests/harness/multiplayer.mjs';
import { loadGame, RTG } from './gameFile.mjs';
import { buildRtgState } from './playState.mjs';
import { decideStep } from './decide.mjs';
import { actionsFor } from './moves.mjs';
import { readAnnouncement, readAnswer, shouldAskTable, WHOSE_TURN } from './table.mjs';

const POLL_MS = 1500;
const SEAT_TIMEOUT_MS = 60_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class UsageError extends Error {}

/** One bot at one table, until `steps` decisions have been made. */
export async function play(options) {
  const game = loadGame(RTG);
  const judge = judgeFor();
  const name = options.name ?? 'rules';
  const server = options.url ? null : await startStaticServer(Number(options.port));
  const browser = await launchChromium();
  try {
    process.stderr.write(`rtg-player: joining ${options.code} as "${name}"\n`);
    const { peer } = await joinTable({ browser, baseUrl: options.url ?? server.baseUrl, code: options.code, name });
    await peer.waitForSeat({ timeout: SEAT_TIMEOUT_MS });
    if (await peer.myRole() === 'spectator') throw new UsageError(`seated as a SPECTATOR at ${options.code} - the game is full or under way`);
    await peer.say(`${name} here - I play by the rules in my game file. Tell me when it is my turn.`);
    await loop({ peer, game, judge, name, options });
  } finally {
    await browser.close();
    await server?.close();
  }
}

async function loop({ peer, game, judge, name, options }) {
  const myId = await peer.myId();
  const turn = { is_mine: false, phase: 'unknown', land_played: false, attackers: [], arrivedThisTurn: [] };
  let seenTalk = 0;
  let lastStateChangeAt = null;
  let lastTalkAt = null;
  let pendingAnswer = null;
  const budgetOfSteps = Number(options.steps ?? 12); // a RUN limit, not a turn limit

  for (let taken = 0; taken < budgetOfSteps;) {
    const view = await peer.view();
    const talk = await peer.talk();
    for (const entry of talk.slice(seenTalk)) {
      lastTalkAt = Date.now();
      if (pendingAnswer && entry.name !== name) { pendingAnswer(readAnswer(entry)); pendingAnswer = null; }
      const heard = readAnnouncement(entry, name);
      if (heard) Object.assign(turn, heard);
    }
    seenTalk = talk.length;
    if (view.lastTouch?.seq !== undefined && view.lastTouch.seq !== lastStateChangeAt) lastStateChangeAt = Date.now();

    if (shouldAskTable({ lastStateChangeAt, lastTalkAt, turnKnown: turn.phase !== 'unknown', now: Date.now() })) {
      await peer.say(WHOSE_TURN);
      lastTalkAt = Date.now();
      continue;
    }
    if (turn.phase === 'unknown' || (!turn.is_mine && turn.attackers.length === 0)) { await sleep(POLL_MS); continue; }

    const state = buildRtgState(view, myId, turn);
    const { move, record } = await decideStep({
      game, state, tracked: { arrivedThisTurn: turn.arrivedThisTurn }, judge,
      ask: (question) => askTable(peer, question, (resolve) => { pendingAnswer = resolve; }),
    });
    taken += 1;
    process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), turn: { ...turn }, ...record, move: move.id })}\n`);
    process.stderr.write(`rtg-player: ${move.id}${record.blocked ? ` (blocked by ${record.blocked.rule})` : ''}\n`);

    const { actions, say, tracks } = actionsFor(move, state, pileIds(view, myId, options));
    for (const action of actions) await peer.act(action);
    if (say) await peer.say(say, { kind: 'rtg-move', move: move.id, checks: record.checks });
    applyTracks(turn, tracks, move);
    if (move.id === 'pass') { turn.attackers = []; await sleep(POLL_MS); }
  }
  process.stderr.write('rtg-player: step budget for this RUN reached - leaving the table cleanly\n');
}

function applyTracks(turn, tracks, move) {
  if (!tracks) return;
  if (tracks.phase) turn.phase = tracks.phase;
  if (tracks.land_played !== undefined) turn.land_played = tracks.land_played;
  if (tracks.arrivedThisTurn) turn.arrivedThisTurn = tracks.arrivedThisTurn;
  if (tracks.arrived) turn.arrivedThisTurn = [...turn.arrivedThisTurn, tracks.arrived];
  if (move.id === 'pass') turn.phase = turn.is_mine ? 'combat' : turn.phase;
}

function askTable(peer, question, hold) {
  return new Promise((resolve) => {
    hold(resolve);
    peer.say(question);
    setTimeout(() => resolve(null), 20_000); // nobody answered
  });
}

function pileIds(view, myId, options) {
  const mine = (kind) => view.piles.find((pile) => pile.kind === kind && pile.ownerId === myId)?.id;
  return {
    lands: mine('lands') ?? mine('battlefield'),
    stack: view.piles.find((pile) => pile.kind === 'stack')?.id ?? 'stack',
    library: options.deck ?? view.piles.find((pile) => pile.kind === 'deck')?.id,
  };
}

function judgeFor() {
  try {
    return new TypeSafeClient();
  } catch (error) {
    throw new UsageError(`an RtG player judges every move with Jev: ${error.message}`);
  }
}
