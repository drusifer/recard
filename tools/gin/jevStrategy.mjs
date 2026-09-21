// US-125/D147: playing Gin from a strategy FILE rather than a rule list.
//
// The turn is: project the state (`playState.mjs`), send the file's
// questions as they are written, and carry the answer out. There is no
// ranking, no weighting and no rule table here - the move is the slot
// Jev chose. Code's only authority is legality: a question about an
// illegal move is never asked, and no answer can produce one.

import { buildPlayState } from './playState.mjs';

/** Which questions apply to this turn's state. A question about a slot
 *  the state left empty would be a question about nothing, and one
 *  about an illegal move must not be asked at all. */
export function questionsFor(strategy, state) {
  const filled = state.candidates.filter(Boolean).length;
  const asked = {};
  for (const [id, question] of Object.entries(strategy.questions)) {
    if (id === 'knock_now' && !state.me.can_knock) continue;
    if (id === 'take_upcard' && (state.me.phase !== 'draw' || !state.upcard)) continue;
    if (question.type === 'choice') {
      // A slot question is ONE question over the candidates, and its
      // options are the slots this turn actually filled: the model
      // cannot choose an option that is not offered, so it can never
      // name a card the hand does not hold.
      if (state.me.phase !== 'discard') continue;
      asked[id] = { ...question, criteria: Object.fromEntries(
        Object.entries(question.criteria).filter(([key]) => Number(key) < filled)) };
      continue;
    }
    asked[id] = question;
  }
  return asked;
}

/**
 * One decision: one request, one move.
 * @param {{ strategy: object, obs: object, facts: object, judge: { systemOne: Function } }} options
 */
/**
 * The rule-list `GinJudgments` shape (threat + per-card helps), read out
 * of a question file's own answers. `null` when this turn asked neither.
 */
export function judgmentsFrom(answers, facts) {
  const threat = answers.opponent_is_close;
  // One Choice, not one question per card: a Choice's DISTRIBUTION
  // compares the competing options, so the probability on each slot is
  // that card's "they want it" reading - the same number eleven Nouls
  // used to produce, from one question.
  const helps = {};
  for (const [slot, probability] of Object.entries(answers.opponent_wants?.probabilities ?? {})) {
    const card = facts.discards?.[Number(slot)]?.card;
    if (card) helps[card.id] = probability;
  }
  if (!threat && Object.keys(helps).length === 0) return null;
  return {
    threat: threat?.score ?? 0,
    threatConfidence: threat?.confidence ?? 0,
    helps,
    model: 'jev',
  };
}

export async function decideByQuestions({ strategy, obs, facts, judge }) {
  const state = buildPlayState(obs, facts);
  const questions = questionsFor(strategy, state);
  const response = await judge.systemOne({ state, questions });
  const answers = response.answers ?? {};

  const record = {
    strategy: strategy.name, phase: state.me.phase, model: response.model,
    state, questions, answers, slot: null, distribution: null,
    // The same typed shape a rule-list strategy produces (D137), mapped
    // from this strategy's own answers - so `summaryLine`, the decision
    // record and `<thought-bubble>` read one shape, not two. Found
    // live: handing the raw answers over as `judgments` crashed the
    // summary, which expects `threat`.
    judgments: judgmentsFrom(answers, facts),
  };

  if (state.me.phase === 'draw') {
    // `take_upcard` is only asked when there IS an upcard, so a missing
    // answer means stock - not a coin flip.
    const takeUpcard = (answers.take_upcard?.noul ?? 0) > 0.5;
    return { decision: { type: 'draw', source: takeUpcard ? 'discard' : 'stock' }, record };
  }

  const slot = Number(answers.discard_choice?.choice ?? 0);
  record.slot = slot;
  record.distribution = answers.discard_choice?.probabilities ?? null;
  const chosen = facts.discards[slot] ?? facts.bestDiscard;

  // Declarations come from the FACTS for what is legal, and from Jev
  // only for the judgment call: gin is not a matter of opinion, and a
  // knock that is not legal is not on offer at any confidence.
  let declare = 'none';
  if (facts.isGin) declare = 'gin';
  else if (facts.canKnock && (answers.knock_now?.noul ?? 0) > 0.5) declare = 'knock';

  return { decision: { type: 'discard', cardId: chosen.card.id, declare }, record };
}
