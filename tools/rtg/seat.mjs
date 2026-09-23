// US-127/D151, as a seat for the shared runner (US-128/D153).
//
// The loop is the design: look at the table, hear what was said, ask
// what to do next, check the move against the game's own rules, do it,
// and say so. Nothing here knows the turn order - that emerges from what
// is legal and what the table says. Joining, quitting and add-bot are the
// runner's (`tools/jev/runner.mjs`), not this file's.

import { buildRtgState } from './playState.mjs';
import { decideStep } from './decide.mjs';
import { actionsFor } from './moves.mjs';
import { readAnnouncement, TURN_QUESTION } from './table.mjs';
import { turnStatus } from './turnOrder.mjs';
import { shouldAskTable, trackChange, askPeer } from '../jev/table.mjs';
import { askTable } from '../jev/escalate.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RtgSeat {
  #peer;
  #game;
  #judge;
  #name;
  #deck;
  #steps;
  #log;
  #clock;
  #pollMs;
  #quietMs;
  #answerMs;
  #answerPollMs;
  #myId = null;
  #taken = 0;
  #turn = { is_mine: false, phase: 'unknown', land_played: false, attackers: [], arrivedThisTurn: [] };
  #seenTalk = 0;
  #touchSeen = { seq: null, changedAt: null };
  #lastTalkAt = null;
  #checkedTalkTo = 0;
  #checkedStateSeq = null;

  /**
   * @param {{ peer: object, game: object, judge: { systemOne: Function }, name: string, deck?: string,
   *   steps?: number, log?: (line: string) => void, clock?: () => number, pollMs?: number,
   *   quietMs?: number, answerMs?: number, answerPollMs?: number }} options
   *   `steps` is a RUN limit, not a turn limit - a turn ends when its
   *   resources do (D151).
   */
  constructor({ peer, game, judge, name, deck, steps = 12, log = () => {}, clock = Date.now,
    pollMs = 1500, quietMs = 8000, answerMs = 20_000, answerPollMs = 500 }) {
    this.#peer = peer;
    this.#game = game;
    this.#judge = judge;
    this.#name = name;
    this.#deck = deck;
    this.#steps = steps;
    this.#log = log;
    this.#clock = clock;
    this.#pollMs = pollMs;
    this.#quietMs = quietMs;
    this.#answerMs = answerMs;
    this.#answerPollMs = answerPollMs;
  }

  /**
   * Sits down. D152: the turn judgment is re-asked only when the board or
   * the talk has moved since the last ask - seeded from what already
   * exists, so joining mid-game costs no request on an empty table.
   */
  async join() {
    this.#myId = await this.#peer.myId();
    const talk = await this.#peer.talk();
    const view = await this.#peer.view();
    this.#checkedTalkTo = talk.length;
    this.#checkedStateSeq = view.lastTouch?.seq ?? null;
    await this.#peer.say(`${this.#name} here - I play by the rules in my game file. Tell me when it is my turn.`);
  }

  /**
   * One yes/no question to the table, heard while the seat waits.
   */
  #ask(question) {
    return askPeer({ peer: this.#peer, name: this.#name, question, timeoutMs: this.#answerMs, pollMs: this.#answerPollMs });
  }

  #startMyTurn() {
    Object.assign(this.#turn, { is_mine: true, phase: 'untap', land_played: false, attackers: [] });
  }

  /**
   * Is it my turn? Asked ONCE, as a yes/no, and the answer is kept either
   * way (Smith C3): a yes starts the turn, a no means it is theirs.
   * Silence settles nothing.
   */
  async #askWhoseTurn() {
    const outcome = await askTable((question) => this.#ask(question)).resolve(TURN_QUESTION);
    this.#lastTalkAt = this.#clock();
    // The question and its answer are not NEW talk to judge again: an
    // unsure judgment re-run on its own exchange would ask forever.
    const talk = await this.#peer.talk();
    this.#checkedTalkTo = talk.length;
    if (outcome.accepted) this.#startMyTurn();
    else if (outcome.answered === false) Object.assign(this.#turn, { is_mine: false, phase: 'their-turn' });
  }

  /**
   * Reads what is new at the table into what the seat knows.
   */
  async #hear() {
    const view = await this.#peer.view();
    const talk = await this.#peer.talk();
    for (const entry of talk.slice(this.#seenTalk)) {
      this.#lastTalkAt = this.#clock();
      const heard = readAnnouncement(entry, this.#name);
      if (heard) Object.assign(this.#turn, heard);
    }
    this.#seenTalk = talk.length;
    this.#touchSeen = trackChange(this.#touchSeen, view.lastTouch?.seq, this.#clock());
    return { view, talk };
  }

  /**
   * US-128/D153: this seat's "is it my move?". One look at the table per
   * call - the runner calls again on `wait`.
   * @param {{ shouldStop: () => boolean }} options
   * @returns {Promise<'move'|'wait'|'done'>}
   */
  async nextMove({ shouldStop }) {
    // Every step completes its own actions, so between steps is always a
    // safe place to leave (C4).
    if (shouldStop()) return 'done';
    if (this.#taken >= this.#steps) {
      this.#log('step budget for this RUN reached - leaving the table cleanly');
      return 'done';
    }
    const { view, talk } = await this.#hear();
    const turn = this.#turn;

    // D152: has THEIR turn ended, so mine can start? A judgment over the
    // board and the talk, re-run only when either has moved.
    if (!turn.is_mine && (talk.length > this.#checkedTalkTo || view.lastTouch?.seq !== this.#checkedStateSeq)) {
      this.#checkedTalkTo = talk.length;
      this.#checkedStateSeq = view.lastTouch?.seq ?? this.#checkedStateSeq;
      const status = await turnStatus({ game: this.#game, state: buildRtgState(view, this.#myId, turn), talk, judge: this.#judge });
      if (status.isOver) this.#startMyTurn();
      else if (status.unclear) await this.#askWhoseTurn();
    }

    // Never silently stuck: a quiet table after a change gets the same
    // one question.
    const isQuiet = shouldAskTable({
      lastStateChangeAt: this.#touchSeen.changedAt, lastTalkAt: this.#lastTalkAt,
      turnKnown: turn.phase !== 'unknown', now: this.#clock(), quietMs: this.#quietMs,
    });
    if (isQuiet) await this.#askWhoseTurn();

    if (turn.phase === 'unknown' || (!turn.is_mine && turn.attackers.length === 0)) {
      await sleep(this.#pollMs);
      return 'wait';
    }
    return 'move';
  }

  /**
   * One step: decide, check against the rules, act, and say so.
   */
  async step() {
    const view = await this.#peer.view();
    const turn = this.#turn;
    const state = buildRtgState(view, this.#myId, turn);
    const { move, record } = await decideStep({
      game: this.#game, state, tracked: { arrivedThisTurn: turn.arrivedThisTurn }, judge: this.#judge,
      ask: (question) => this.#ask(question),
    });
    this.#taken += 1;
    const entry = { at: new Date().toISOString(), turn: { ...turn }, ...record, move: move.id };

    const { actions, say, tracks } = actionsFor(move, state, this.#pileIds(view));
    for (const action of actions) await this.#peer.act(action);
    if (say) await this.#peer.say(say, { kind: 'rtg-move', move: move.id, checks: record.checks });
    applyTracks(turn, tracks, move);
    if (move.id === 'pass') turn.attackers = [];
    return entry;
  }

  #pileIds(view) {
    const mine = (kind) => view.piles.find((pile) => pile.kind === kind && pile.ownerId === this.#myId)?.id;
    return {
      lands: mine('lands') ?? mine('battlefield'),
      stack: view.piles.find((pile) => pile.kind === 'stack')?.id ?? 'stack',
      library: this.#deck ?? view.piles.find((pile) => pile.kind === 'deck')?.id,
    };
  }
}

function applyTracks(turn, tracks, move) {
  if (!tracks) return;
  if (tracks.phase) turn.phase = tracks.phase;
  if (tracks.land_played !== undefined) turn.land_played = tracks.land_played;
  if (tracks.arrivedThisTurn) turn.arrivedThisTurn = tracks.arrivedThisTurn;
  if (tracks.arrived) turn.arrivedThisTurn = [...turn.arrivedThisTurn, tracks.arrived];
  if (move.id === 'pass') turn.phase = turn.is_mine ? 'combat' : turn.phase;
}
