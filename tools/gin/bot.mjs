// US-120/D137: one Gin Rummy bot player. Observes through a peer (a
// harness peer in a real browser, or a fake table in tests), decides with
// a typed strategy (plus Jev when the strategy uses it), acts through the
// same reducer actions a person's clicks produce, and returns one typed
// record per decision. Knocks and gin are also said on table talk (D138),
// since a face-down card alone is a silent knock (Smith, US-120 gate).

import { GinTracker } from './observe.mjs';
import { computeFacts } from './rules.mjs';
import { askJev } from './judgments.mjs';
import { decideByQuestions } from './jevStrategy.mjs';
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

/**
 * US-121/D142: what the bot SAYS about a decision - the move in a few
 * words for the people at the table, and the whole record as `data` for
 * `<thought-bubble>` to expand. One line per decision: a knock keeps
 * its own announcement text (melds + deadwood) rather than being said
 * twice, with the record merged onto the same line.
 * @returns {{ text: string, data: object }}
 */
export function decisionTalk(record, announcement) {
  const { decision } = record;
  const thrown = decision.type === 'discard' && record.observation.hand.find((card) => card.id === decision.cardId);
  const source = decision.source === 'discard' ? 'the discard pile' : 'stock';
  const text = decision.type === 'draw' ? `Drew from ${source}` : `Discarded ${short(thrown)}`;
  return {
    text: announcement?.text ?? text,
    data: {
      kind: 'bot-decision',
      ...announcement?.data,
      strategy: record.strategy, iteration: record.iteration, handNumber: record.handNumber,
      phase: record.phase, decision, actions: record.actions,
      trace: record.trace, judgments: record.judgments, facts: record.facts,
      hand: record.observation.hand.map((card) => short(card)),
      discardTop: record.observation.discardTop && short(record.observation.discardTop),
      stockCount: record.observation.stockCount, opponentHandSize: record.observation.opponentHandSize,
    },
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
   * @param {{ peer: object, strategy: GinStrategy, judge?: { systemOne: Function }|null,
   *   firstPlayer?: 'bot'|'opponent' }} options
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
   * US-129/D154: what the table says right now - phase (draw | discard |
   * wait | hand-over), hand number and outcome. Gin's turn file reads
   * its turn from this; nothing here decides what happens next.
   * @returns {Promise<GinObservation>}
   */
  async look() {
    const { obs } = await this.#observe();
    return obs;
  }

  /**
   * Waits (bounded) until it is this bot's move, or the hand is over -
   * or, with `pastHandOver`, until the NEXT hand's first move (a redeal).
   * The MCP `gin_turn` tool's wait (D137); a seated bot's turn is
   * `games/gin/turn.yaml` instead.
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
    // US-125/D147: a question-file strategy decides by asking its own
    // questions; a rule-list one (D137) runs its rules. Everything
    // after this point - acting, narrating, the record - is identical.
    const asked = this.#strategy.kind === 'questions'
      ? await decideByQuestions({ strategy: this.#strategy, obs, facts, judge: this.#judge })
      : null;
    const jev = !asked && this.#strategy.usesJev ? await askJev(this.#judge, obs, facts) : null;
    const { decision, trace } = asked
      ? { decision: asked.decision, trace: [
        { rule: 'read', fired: true, threat: asked.record.judgments?.threat ?? null },
        { rule: '__move__', fired: true, option: asked.record.option, confidence: asked.record.confidence,
          distribution: asked.record.distribution, ...(asked.record.belowFloor && { belowFloor: true }) },
      ] }
      : decide(this.#strategy, { obs, facts, jev });
    const actions = await this.#execute(decision, obs);
    const declared = decision.type === 'discard' && decision.declare !== 'none'
      ? announcementFor(decision, facts)
      : null;
    // US-121: every decision is narrated, not just knocks - one line,
    // carrying the record the thought bubble expands (D142).
    const full = { ...record, facts: factsSummary(facts), judgments: jev ?? asked?.record.judgments ?? null, trace, decision, actions };
    const line = decisionTalk(full, declared);
    await this.#peer.say(line.text, line.data);
    return { ...full, announcement: declared?.text ?? null };
  }
}
