// US-126/D150: playing Gin as a read, then a move.
//
// Two requests per decision, because the second needs the first:
//   1. READ  - how close is the opponent, and which card do they want?
//   2. MOVE  - one Choice over the LEGAL moves, with the read in state.
// Questions inside a request run in parallel and cannot see each other,
// so a read that is meant to inform the move has to be its own call.
//
// Code keeps exactly two jobs: the arithmetic (in `playState.mjs`) and
// legality - which options exist. There is no threshold and no rule
// table here; an illegal move is simply not offered, so it cannot be
// chosen at any confidence.

import { buildPlayState } from './playState.mjs';
import { floorFallback } from '../jev/escalate.mjs';
import { decide } from '../jev/decide.mjs';

/** What this turn's legal moves are, as Choice options. The `criteria`
 *  text comes from the strategy - that is where a play style lives. */
export function moveOptions(strategy, state) {
  const criteria = {};
  const filled = state.candidates.filter(Boolean).length;
  if (state.me.phase === 'draw') {
    if (state.upcard) criteria.take_upcard = strategy.move.criteria.take_upcard;
    criteria.draw_stock = strategy.move.criteria.draw_stock;
    return criteria;
  }
  for (let slot = 0; slot < filled; slot++) {
    const where = `\`candidates[${slot}]\``;
    criteria[`discard_${slot}`] = `${strategy.move.criteria.discard} (${where})`;
    if (state.me.is_gin) criteria[`gin_${slot}`] = `${strategy.move.criteria.gin} (${where})`;
    else if (state.me.can_knock) criteria[`knock_${slot}`] = `${strategy.move.criteria.knock} (${where})`;
  }
  return criteria;
}

/**
The read step's questions - asked as the file writes them.
*/
export function readQuestions(strategy, state) {
  if (state.me.phase !== 'discard') {
    // Nothing to read about on a draw: there are no candidates yet.
    const { opponent_is_close: close } = strategy.read;
    return { opponent_is_close: close };
  }
  const filled = state.candidates.filter(Boolean).length;
  return {
    ...strategy.read,
    opponent_wants: { ...strategy.read.opponent_wants, criteria: Object.fromEntries(
      Object.entries(strategy.read.opponent_wants.criteria).filter(([key]) => Number(key) < filled)) },
  };
}

/** The rule-list `GinJudgments` shape (D137), read out of the read
 *  step - so record, summary and thought bubble see one shape. */
export function judgmentsFrom(read, facts) {
  const helps = {};
  const wanted = Object.entries(read.opponent_wants?.probabilities ?? {});
  for (const [slot, probability] of wanted) {
    const card = facts.discards?.[Number(slot)]?.card;
    if (card) helps[card.id] = probability;
  }
  const threat = read.opponent_is_close;
  if (!threat && Object.keys(helps).length === 0) return null;
  return { threat: threat?.score ?? 0, threatConfidence: threat?.confidence ?? 0, helps, model: 'jev' };
}

/**
What `option` means as a move.
*/
function moveFor(option, facts) {
  if (option === 'take_upcard') return { type: 'draw', source: 'discard' };
  if (option === 'draw_stock') return { type: 'draw', source: 'stock' };
  const [kind, slot] = option.split('_', 2);
  const chosen = facts.discards[Number(slot)] ?? facts.bestDiscard;
  return { type: 'discard', cardId: chosen.card.id, declare: kind === 'discard' ? 'none' : kind };
}

/** Gin's escalation policy (D153): below the file's floor, play the
 *  cheapest legal card rather than act on a coin flip - nobody at a
 *  Gin table is asked. */
const ESCALATION = floorFallback();

/**
 * One decision: read, then move (`tools/jev/decide.mjs`).
 * @param {{ strategy: object, obs: object, facts: object, judge: { systemOne: Function } }} options
 */
export async function decideByQuestions({ strategy, obs, facts, judge }) {
  const state = buildPlayState(obs, facts);
  const questions = readQuestions(strategy, state);
  const result = await decide({
    judge, state,
    // The read becomes STATE for the move - named fields, like
    // everything else the questions refer to by path.
    read: { questions, into: (current, answers) => ({ ...current, read: {
      opponent_is_close: answers.opponent_is_close?.score ?? null,
      opponent_wants_slot: answers.opponent_wants?.choice ?? null,
    } }) },
    choice: { key: '__move__', instructions: strategy.move.instructions, criteria: moveOptions(strategy, state) },
    floor: strategy.confidence_floor ?? 0,
    escalation: ESCALATION,
    fallback: state.me.phase === 'draw' ? 'draw_stock' : 'discard_0',
  });

  return {
    decision: moveFor(result.option, facts),
    record: {
      strategy: strategy.name, phase: state.me.phase, model: result.model,
      state: result.state, questions: { read: questions, move: result.question },
      answers: { ...result.answers.read, __move__: result.answers.choice ?? undefined },
      option: result.option, distribution: result.distribution,
      confidence: result.confidence, belowFloor: result.belowFloor,
      judgments: judgmentsFrom(result.answers.read, facts),
    },
  };
}
