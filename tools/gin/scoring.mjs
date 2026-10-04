// Real Gin Rummy scoring (standard rules) - US-??? direct user request:
// "put two players in a game, have them play through, then score the
// game play when they are finished." Nothing in this app scores Gin
// today (deliberately - "a table simulator, not a rules engine", D-core
// invariant); a knock/gin is only ever announced on table talk. This is
// new ARITHMETIC over primitives `tools/gin/cards.mjs` already has
// (`bestMelds`, `layoffs`) - no new card logic, no new game rules.
//
// Standard Gin scoring: the knocker's final hand (post-discard) melds at
// minimum deadwood; the opponent lays off onto the KNOCKER'S melds
// (chaining - `layoffs` already does this) to reduce their own deadwood,
// UNLESS the knocker went gin (0 deadwood), which forbids any lay-off at
// all. If the opponent's deadwood after layoff is <= the knocker's, the
// knocker is undercut: the OPPONENT wins instead, deadwood difference +
// 25. Otherwise the knocker wins, deadwood difference (gin adds +25 to
// the knocker instead, no undercut is possible on gin by definition -
// 0 deadwood can never be undercut).
import { bestMelds, layoffs, cardValue } from './cards.mjs';

const GIN_BONUS = 25;
const UNDERCUT_BONUS = 25;

/**
 * @param {{ knockerHand: {id:string,rank:string,suit:string}[],
 *   opponentHand: {id:string,rank:string,suit:string}[], outcome: 'knock'|'gin' }} options
 *   Both hands are the FINAL hands at the moment of knock/gin - the
 *   knocker's already has the knock/gin card discarded (10 cards), the
 *   opponent's is whatever it held on their last turn (10 or 11 cards).
 * @returns {{ winner: 'knocker'|'opponent', points: number, undercut: boolean,
 *   knockerDeadwood: number, opponentDeadwoodBeforeLayoff: number,
 *   laidOff: number, opponentDeadwoodAfterLayoff: number }}
 */
export function scoreHand({ knockerHand, opponentHand, outcome }) {
  const knockerMelds = bestMelds(knockerHand);
  const opponentMelds = bestMelds(opponentHand);
  const knockerDeadwood = knockerMelds.deadwoodPoints;

  // Gin forbids laying off entirely - the opponent's deadwood stands as
  // their own best arrangement found it, nothing chained onto the
  // knocker's melds.
  const laidOffCards = outcome === 'gin' ? [] : layoffs(opponentMelds.deadwood, knockerMelds.melds);
  const laidOffIds = new Set(laidOffCards.map((card) => card.id));
  const opponentDeadwoodAfterLayoff = opponentMelds.deadwood
    .filter((card) => !laidOffIds.has(card.id))
    .reduce((sum, card) => sum + cardValue(card), 0);

  const isUndercut = opponentDeadwoodAfterLayoff <= knockerDeadwood;
  const winner = isUndercut ? 'opponent' : 'knocker';
  const ginBonus = outcome === 'gin' ? GIN_BONUS : 0;
  const points = isUndercut
    ? (knockerDeadwood - opponentDeadwoodAfterLayoff) + UNDERCUT_BONUS
    : (opponentDeadwoodAfterLayoff - knockerDeadwood) + ginBonus;

  return {
    winner, points, undercut: isUndercut, knockerDeadwood,
    opponentDeadwoodBeforeLayoff: opponentMelds.deadwoodPoints,
    laidOff: laidOffCards.length,
    opponentDeadwoodAfterLayoff,
  };
}

