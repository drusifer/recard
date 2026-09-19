// US-120/D137: the typed Gin Rummy card core - values, melds, the exact
// deadwood-minimising meld arrangement, and lay-offs. Pure functions over
// `GinCard`s (Recard's own card shape, trimmed), no game state.

/**
 * @typedef {'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'} Rank
 * @typedef {'clubs'|'diamonds'|'hearts'|'spades'} Suit
 * @typedef {{ id: string, rank: Rank, suit: Suit }} GinCard
 * @typedef {{ kind: 'set'|'run', cards: GinCard[] }} Meld
 * @typedef {{ melds: Meld[], deadwood: GinCard[], deadwoodPoints: number }} MeldResult
 */

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Ace low: A=1 ... K=13.
 */
export const rankIndex = (card) => RANKS.indexOf(card.rank) + 1;

/**
 * Deadwood points: ace 1, pips face value, J/Q/K 10.
 */
export const cardValue = (card) => Math.min(rankIndex(card), 10);

export const pointsOf = (cards) => cards.reduce((sum, card) => sum + cardValue(card), 0);

/**
 * Every 3-subset of a list (and the list itself when it has 4).
 */
function setsOf(sameRank) {
  if (sameRank.length < 3) return [];
  if (sameRank.length === 3) return [sameRank];
  return [sameRank, ...sameRank.map((_, skip) => sameRank.filter((__, index) => index !== skip))];
}

/**
 * Every run of 3+ consecutive ranks inside one suit's cards.
 */
function runsOf(suited) {
  const byRank = new Map(suited.map((card) => [rankIndex(card), card]));
  const runs = [];
  for (let start = 1; start <= 11; start++) {
    const run = [];
    for (let rank = start; byRank.has(rank); rank++) {
      run.push(byRank.get(rank));
      if (run.length >= 3) runs.push([...run]);
    }
  }
  return runs;
}

/**
 * @param {GinCard[]} hand @returns {Meld[]}
 */
export function candidateMelds(hand) {
  const bySuit = Object.groupBy(hand, (card) => card.suit);
  const byRank = Object.groupBy(hand, (card) => card.rank);
  return [
    ...Object.values(byRank).flatMap((same) => setsOf(same.toSorted((a, b) => a.suit.localeCompare(b.suit))).map((cards) => ({ kind: 'set', cards }))),
    ...Object.values(bySuit).flatMap((suited) => runsOf(suited).map((cards) => ({ kind: 'run', cards }))),
  ];
}

/**
 * The meld arrangement with the least deadwood. Exact: backtracks over
 * candidate melds (a hand has at most 11 cards, so this is small), so a
 * card that fits both a set and a run goes wherever the total is lowest.
 * @param {GinCard[]} hand @returns {MeldResult}
 */
export function bestMelds(hand) {
  const candidates = candidateMelds(hand);
  let best = { melds: [], used: new Set(), melded: 0 };
  function search(from, melds, used, melded) {
    if (melded > best.melded) best = { melds: [...melds], used: new Set(used), melded };
    for (let index = from; index < candidates.length; index++) {
      const meld = candidates[index];
      if (meld.cards.some((card) => used.has(card.id))) continue;
      for (const card of meld.cards) used.add(card.id);
      melds.push(meld);
      search(index + 1, melds, used, melded + pointsOf(meld.cards));
      melds.pop();
      for (const card of meld.cards) used.delete(card.id);
    }
  }
  search(0, [], new Set(), 0);
  const deadwood = hand.filter((card) => !best.used.has(card.id));
  return { melds: best.melds, deadwood, deadwoodPoints: pointsOf(deadwood) };
}

function extendsMeld(card, meld) {
  if (meld.kind === 'set') return meld.cards.length < 4 && card.rank === meld.cards[0].rank;
  if (card.suit !== meld.cards[0].suit) return false;
  const ranks = meld.cards.map((each) => rankIndex(each));
  return rankIndex(card) === Math.min(...ranks) - 1 || rankIndex(card) === Math.max(...ranks) + 1;
}

/**
 * The cards among `cards` that can be laid off on `melds`, chaining: a
 * card that extends a run makes the next one along layable too.
 * @param {GinCard[]} cards @param {Meld[]} melds @returns {GinCard[]}
 */
export function layoffs(cards, melds) {
  const grown = melds.map((meld) => ({ kind: meld.kind, cards: [...meld.cards] }));
  const laid = [];
  let remaining = [...cards];
  let didLayOff = true;
  while (didLayOff) {
    didLayOff = false;
    for (const card of remaining) {
      const target = grown.find((meld) => extendsMeld(card, meld));
      if (!target) continue;
      target.cards.push(card);
      laid.push(card);
      didLayOff = true;
    }
    remaining = remaining.filter((card) => !laid.includes(card));
  }
  return laid;
}
