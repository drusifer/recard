// US-120/D137: one Gin Rummy bot player. Observes through a peer (a
// harness peer in a real browser, or a fake table in tests), decides with
// a typed strategy (plus Jev when the strategy uses it), acts through the
// same reducer actions a person's clicks produce, and returns one typed
// record per decision. Knocks and gin are also said on table talk (D138),
// since a face-down card alone is a silent knock (Smith, US-120 gate).

import { GinTracker } from './observe.mjs';
import { computeFacts } from './rules.mjs';
import { askJev } from './judgments.mjs';
import { decide } from './strategies.mjs';

/**
 * @typedef {import('./observe.mjs').GinObservation} GinObservation
 * @typedef {import('./strategies.mjs').GinStrategy} GinStrategy
 * @typedef {import('./strategies.mjs').GinDecision} GinDecision
 * @typedef {{
 *   iteration: number, at: string, strategy: string, handNumber: number, phase: string,
 *   observation: GinObservation, facts: object|null, judgments: object|null,
 *   trace: Array<{ rule: string, fired: boolean }>, decision: GinDecision|null,
 *   actions: object[], announcement: string|null,
 * }} GinIteration
 */

const ACT_TIMEOUT_MS = 15_000;
// Waiting for the other player polls the view: the tracker works from
// snapshot diffs, so a state missed between polls costs nothing.
const POLL_MS = 200;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const short = (card) => `${card.rank}${SUIT_SYMBOL[card.suit]}`;

/**
 * The facts worth keeping in a record: no per-discard meld arrays.
 */
function factsSummary(facts) {
  const { discards, bestDiscard, upcard, ...rest } = facts;
  return {
    ...rest,
    upcard: upcard && short(upcard),
    bestDiscard: bestDiscard && short(bestDiscard.card),
    discards: discards.slice(0, 5).map((option) => ({ card: short(option.card), deadwoodAfter: option.deadwoodAfter, meldPaths: option.meldPaths })),
  };
}

function announcementFor(decision, facts) {
  const kept = facts.bestDiscard.card.id === decision.cardId
    ? facts.bestDiscard
    : facts.discards.find((option) => option.card.id === decision.cardId);
  const { melds, deadwood, deadwoodPoints } = kept.result;
  const shown = melds.map((meld) => meld.cards.map((card) => short(card)).join(' ')).join(' · ');
  const text = decision.declare === 'gin'
    ? `Gin! ${shown}`
    : `Knock! ${shown} | deadwood ${deadwoodPoints}: ${deadwood.map((card) => short(card)).join(' ')}`;
  return {
    text,
    data: {
      declare: decision.declare,
      deadwood: deadwoodPoints,
      melds: melds.map((meld) => meld.cards.map((card) => card.id)),
      deadwoodCards: deadwood.map((card) => card.id),
    },
  };
}

/**
 * One human-readable line per record (stderr, beside the JSONL).
 * @param {GinIteration} record
 * @returns {string}
 */
export function summaryLine(record) {
  const head = `#${record.iteration} hand ${record.handNumber} ${record.phase}`;
  if (!record.decision) return `${head}: waiting`;
  const rule = record.trace.find((step) => step.fired)?.rule;
  const extra = record.judgments ? `, threat ${record.judgments.threat.toFixed(1)}` : '';
  if (record.decision.type === 'draw') return `${head}: draw from ${record.decision.source} (${rule}) | deadwood ${record.facts.deadwood}`;
  const declared = record.decision.declare === 'none' ? 'discard' : record.decision.declare.toUpperCase();
  const thrown = record.observation.hand.find((card) => card.id === record.decision.cardId);
  return `${head}: ${declared} ${short(thrown)} (${rule}) | deadwood ${record.facts.deadwood}${extra}`;
}

export class GinBot {
  #peer;
  #strategy;
  #judge;
  #tracker;
  #myId;
  #iteration = 0;

  /**
   * @param {{ peer: object, strategy: GinStrategy, judge?: { systemOne: Function }|null, firstPlayer?: 'bot'|'opponent' }} options
   */
  constructor({ peer, strategy, judge = null, firstPlayer = 'bot' }) {
    if (!judge && strategy.usesJev) throw new Error(`${strategy.name} calls Jev: pass a TypeSafe client as \`judge\``);
    this.#peer = peer;
    this.#strategy = strategy;
    this.#judge = judge;
    this.firstPlayer = firstPlayer;
  }

  async #observe() {
    this.#myId ??= await this.#peer.myId();
    this.#tracker ??= new GinTracker({ myId: this.#myId, firstPlayer: this.firstPlayer });
    const view = await this.#peer.view();
    return { view, obs: this.#tracker.update(view) };
  }

  /**
   * Waits (bounded) until it is this bot's move, or the hand is over -
   * or, with `pastHandOver`, until the NEXT hand's first move (a redeal).
   * @param {{ timeoutMs: number, pastHandOver?: boolean }} options
   * @returns {Promise<GinObservation>}
   */
  async waitForTurn({ timeoutMs, pastHandOver = false }) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { obs } = await this.#observe();
      const isWaiting = obs.phase === 'wait' || (pastHandOver && obs.phase === 'hand-over');
      if (!isWaiting || Date.now() >= deadline) return obs;
      await sleep(POLL_MS);
    }
  }

  async #execute(decision, obs) {
    const act = async (action) => {
      await this.#peer.act(action);
      return action;
    };
    if (decision.type === 'draw') {
      const action = decision.source === 'stock'
        ? { type: 'DRAW', pileId: 'deck' }
        : { type: 'MOVE', pileableId: obs.discardPile.at(-1).id, toPileId: `hand:${this.#myId}` };
      const actions = [await act(action)];
      await this.#peer.waitForView((view) => view.myHand.length === 11, undefined, { timeout: ACT_TIMEOUT_MS });
      return actions;
    }
    const actions = [await act({ type: 'MOVE', pileableId: decision.cardId, toPileId: 'table' })];
    if (decision.declare !== 'none') actions.push(await act({ type: 'FLIP', pileableId: decision.cardId }));
    await this.#peer.waitForView((view, [cardId, isFaceDown]) => {
      const top = view.piles.find((pile) => pile.id === 'table')?.cards.at(-1);
      const isDown = top?.faceUp === false;
      return top?.id === cardId && isDown === isFaceDown;
    }, [decision.cardId, decision.declare !== 'none'], { timeout: ACT_TIMEOUT_MS });
    return actions;
  }

  /**
   * At most one decision: observe, decide, act. A bot that is waiting
   * (not its turn, not dealt, hand over) acts on nothing.
   * @returns {Promise<GinIteration>}
   */
  async step() {
    const { obs } = await this.#observe();
    this.#iteration += 1;
    const record = {
      iteration: this.#iteration, at: new Date().toISOString(), strategy: this.#strategy.name,
      handNumber: obs.handNumber, phase: obs.phase, observation: obs,
      facts: null, judgments: null, trace: [], decision: null, actions: [], announcement: null,
    };
    if (obs.phase !== 'draw' && obs.phase !== 'discard') return record;

    const facts = computeFacts(obs);
    const jev = this.#strategy.usesJev ? await askJev(this.#judge, obs, facts) : null;
    const { decision, trace } = decide(this.#strategy, { obs, facts, jev });
    const actions = await this.#execute(decision, obs);
    let announcement = null;
    if (decision.type === 'discard' && decision.declare !== 'none') {
      const { text, data } = announcementFor(decision, facts);
      await this.#peer.say(text, data);
      announcement = text;
    }
    return { ...record, facts: factsSummary(facts), judgments: jev, trace, decision, actions, announcement };
  }
}
