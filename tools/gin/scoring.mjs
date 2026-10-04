// Gin Rummy hand MEASUREMENT - direct user request: keep meld-finding
// in code (it is a real search algorithm, not a fact or a threshold -
// `bestMelds`'s own doc comment: "backtracks over candidate melds"),
// but the scoring DECISIONS (undercut? gin? which bonus?) belong in
// `games/gin/scoring.yaml` as named states, not buried in a function.
// This is the line: raw deadwood numbers out, no winner/points/bonus
// here at all - that is `scoreLibrary.mjs`'s small named guards/actions
// now, reading straight off this function's output.
import { bestMelds, layoffs, cardValue } from './cards.mjs';

/**
 * @param {{ knockerHand: {id:string,rank:string,suit:string}[],
 *   opponentHand: {id:string,rank:string,suit:string}[], outcome: 'knock'|'gin' }} options
 *   Both hands are the FINAL hands at the moment of knock/gin - the
 *   knocker's already has the knock/gin card discarded (10 cards), the
 *   opponent's is whatever it held on their last turn (10 or 11 cards).
 * @returns {{ knockerDeadwood: number, opponentDeadwoodBeforeLayoff: number,
 *   laidOff: number, opponentDeadwoodAfterLayoff: number }}
 */
export function measureHand({ knockerHand, opponentHand, outcome }) {
  const knockerMelds = bestMelds(knockerHand);
  const opponentMelds = bestMelds(opponentHand);

  // Gin forbids laying off entirely - the opponent's deadwood stands as
  // their own best arrangement found it, nothing chained onto the
  // knocker's melds.
  const laidOffCards = outcome === 'gin' ? [] : layoffs(opponentMelds.deadwood, knockerMelds.melds);
  const laidOffIds = new Set(laidOffCards.map((card) => card.id));
  const opponentDeadwoodAfterLayoff = opponentMelds.deadwood
    .filter((card) => !laidOffIds.has(card.id))
    .reduce((sum, card) => sum + cardValue(card), 0);

  return {
    knockerDeadwood: knockerMelds.deadwoodPoints,
    opponentDeadwoodBeforeLayoff: opponentMelds.deadwoodPoints,
    laidOff: laidOffCards.length,
    opponentDeadwoodAfterLayoff,
  };
}
