// US-120/D137: the Jev (TypeSafe System One) judgments a Gin strategy
// can use. Code owns every rule; Jev is asked only what code cannot
// compute - reading the opponent from their public history. One request
// per decision fans out a threat Score plus one Noul per top discard
// candidate (TypeSafe's speculative fan-out pattern); a strategy uses
// only the answers it needs.

import { noul, score } from '@typesafe-ai/sdk';

/**
 * @typedef {import('./observe.mjs').GinObservation} GinObservation
 * @typedef {import('./rules.mjs').GinFacts} GinFacts
 * @typedef {{ threat: number, threatConfidence: number, helps: Record<string, number>, model: string }} GinJudgments
 */

export const DISCARD_CANDIDATES = 4;

/**
 * Levels 0..4 - the answer's `score` is a position on this scale.
 */
export const THREAT_LEVELS = [
  'Far from knocking: still discarding high cards and has shown no melds forming.',
  'Building melds but likely still holding a lot of deadwood.',
  'Could plausibly knock within the next two or three turns.',
  'Likely able to knock now or on the next turn.',
  'Likely one card away from gin.',
];

const COURT = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const cardName = (card) => `${COURT[card.rank] ?? card.rank} of ${card.suit}`;

/**
 * The public state Jev judges, and the questions asked of it.
 * @param {GinObservation} obs
 * @param {GinFacts} facts
 */
export function ginRequest(obs, facts) {
  const candidates = facts.discards.slice(0, DISCARD_CANDIDATES);
  const state = {
    game: 'Two-player Gin Rummy. Melds are sets of 3-4 cards of one rank or runs of 3+ consecutive cards of one suit (ace low). A player may knock with 10 or fewer deadwood points; gin is 0.',
    myHand: obs.hand.map((card) => cardName(card)),
    discardPileTop: obs.discardPile.at(-1)?.faceDown ? null : (obs.discardPile.at(-1) && cardName(obs.discardPile.at(-1))),
    stock: { remaining: obs.stockCount, drawnSoFar: obs.stockDrawn },
    opponent: {
      handSize: obs.opponentHandSize,
      discarded: obs.opponentDiscards.map((card) => cardName(card)),
      tookFromDiscardPile: obs.opponentTook.map((card) => cardName(card)),
    },
    myDiscards: obs.myDiscards.map((card) => cardName(card)),
  };
  const questions = {
    opponent_threat: score(
      'From `opponent.discarded` (oldest first), `opponent.tookFromDiscardPile` and how far the game is (`stock.drawnSoFar`), how close is the opponent to being able to knock?',
      THREAT_LEVELS,
    ),
  };
  for (const [index, option] of candidates.entries()) {
    questions[`helps_${index}`] = noul(
      `If I discard the ${cardName(option.card)}, would the opponent likely use it in a meld? Weigh the cards they took from the discard pile (\`opponent.tookFromDiscardPile\`), the cards they chose to discard (\`opponent.discarded\`), and that cards in \`myHand\` are not available to them.`,
    );
  }
  return { state, questions, candidates };
}

/**
 * Asks Jev once for this decision. Null outside the discard phase.
 * @param {{ systemOne: Function }} judge - a TypeSafeClient, or a fake in tests
 * @param {GinObservation} obs
 * @param {GinFacts} facts
 * @returns {Promise<GinJudgments|null>}
 */
export async function askJev(judge, obs, facts) {
  if (obs.phase !== 'discard') return null;
  const { state, questions, candidates } = ginRequest(obs, facts);
  const response = await judge.systemOne({ state, questions });
  const threat = response.answers.opponent_threat;
  return {
    threat: threat.score,
    threatConfidence: threat.confidence,
    helps: Object.fromEntries(candidates.map((option, index) => [option.card.id, response.answers[`helps_${index}`].noul])),
    model: response.model,
  };
}
