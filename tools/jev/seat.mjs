// US-129/D154: the one seat every game uses - its turn file, running.
//
// The runner (D153) asks a seat "is it my move?" and then "take one
// step". This seat answers both from a statechart: it looks at the
// table, tells the machine what changed as a `TABLE` event, waits until
// no `busy` state is active, and reads the answer off the state's tags.
// The table MEMORY lives here, not in any turn file: what changed since
// the last look, how long the table has been quiet, and which talk lines
// were the bot's own (its own words are never news - lessons, US-127 and
// US-128). An author never writes bookkeeping.

import { createActor, waitFor } from 'xstate';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class MachineSeat {
  #actor;
  #services;
  #clock;
  #pollMs;
  #isQuitSent = false;
  #seen = { talk: null, seq: undefined, changedAt: null, lastTalkAt: null };

  /**
   * @param {{ machine: import('xstate').AnyStateMachine, services: object, input?: object,
   *   clock?: () => number, pollMs?: number }} options
   *   `services` is what the library's actors use (peer, judge, name,
   *   questions, player, game); the seat adds `table` and `onRecord`.
   */
  constructor({ machine, services, input = {}, clock = Date.now, pollMs = 1500 }) {
    this.#services = services;
    this.#clock = clock;
    this.#pollMs = pollMs;
    services.table = { markSeen: () => this.#markSeen() };
    services.onRecord = (record) => { this.lastRecord = record; };
    this.lastRecord = null;
    this.#actor = createActor(machine, { input }).start();
  }

  /**
   * @param {{ shouldStop: () => boolean }} options
   * @returns {Promise<'move'|'wait'|'done'>}
   */
  async nextMove({ shouldStop }) {
    if (shouldStop() && !this.#isQuitSent) {
      this.#isQuitSent = true;
      this.#actor.send({ type: 'QUIT' });
    }
    if (this.#actor.getSnapshot().status === 'done') return 'done';
    this.#actor.send({ type: 'TABLE', ...(await this.#look()) });
    const snapshot = await this.#settle();
    if (snapshot.status === 'done') return 'done';
    if (snapshot.hasTag('move')) return 'move';
    await sleep(this.#pollMs);
    return 'wait';
  }

  /**
   * One step: the machine plays it; the record is what the `play` actor
   * reported.
   */
  async step() {
    this.lastRecord = null;
    this.#actor.send({ type: 'STEP' });
    await this.#settle();
    // What the bot just did is not news either: its own moves must not
    // make it wonder whether its turn has come round again.
    await this.#markSeen();
    return this.lastRecord;
  }

  /**
   * Which state the machine is in - for logs and tests.
   */
  get state() {
    return this.#actor.getSnapshot().value;
  }

  async #settle() {
    return waitFor(this.#actor, (snapshot) => snapshot.status !== 'active' || !snapshot.hasTag('busy'));
  }

  /**
   * What the table shows now, and what is NEW since the last look. The
   * first look only SEEDS - joining mid-game is not a sudden change -
   * but it still marks THIS MOMENT as the reference point a later quiet
   * check measures from. Without that, a table whose only relevant talk
   * (a dice roll, an announcement) landed before this seat's first look
   * could never be noticed quiet either: `changed` stays false forever
   * (nothing it hasn't already seen), and `quietFor` never starts
   * counting because it has no "since when" to count from - the seat
   * would wait forever for a change it can, by definition, never see
   * (D158, found running two bots against `tools/rtgTable.mjs`, whose
   * facilitator setup all lands within the first second or two).
   */
  async #look() {
    const { peer, name } = this.#services;
    const view = await peer.view();
    const talk = await peer.talk();
    const now = this.#clock();
    const seq = view.lastTouch?.seq ?? null;
    const seen = this.#seen;
    if (seen.talk === null) {
      // `lastTalkAt` stays null (nobody has spoken WHILE this seat was
      // watching - the existing talk predates it), so `quietFor` grows
      // from `changedAt` starting now, same as after any real change.
      Object.assign(seen, { talk: talk.length, seq, changedAt: now });
      return { view, talk, heard: [], changed: false, quietFor: 0, now };
    }
    const heard = talk.slice(seen.talk).filter((entry) => entry.name !== name);
    const hasMoved = seq !== seen.seq;
    if (hasMoved) seen.changedAt = now;
    if (heard.length > 0) seen.lastTalkAt = now;
    Object.assign(seen, { talk: talk.length, seq });
    const isQuietSinceChange = seen.changedAt !== null && (seen.lastTalkAt === null || seen.lastTalkAt < seen.changedAt);
    return { view, talk, heard, changed: hasMoved || heard.length > 0, quietFor: isQuietSinceChange ? now - seen.changedAt : 0, now };
  }

  /**
   * After the bot asked the table something, the question and its
   * answer are not news to judge again - that is how an unsure judgment
   * would ask forever (US-128).
   */
  async #markSeen() {
    const talk = await this.#services.peer.talk();
    const view = await this.#services.peer.view();
    this.#seen.talk = talk.length;
    this.#seen.seq = view.lastTouch?.seq ?? null;
    this.#seen.lastTalkAt = this.#clock();
  }
}
