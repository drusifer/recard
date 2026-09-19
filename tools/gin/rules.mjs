// US-120/D137: the typed Gin Rummy condition set - pure functions over a
// public `GinObservation` (observe.mjs). Everything here is computable,
// so it is code; opponent inference is asked of Jev (judgments.mjs).

import { RANKS, bestMelds, cardValue, layoffs, rankIndex } from './cards.mjs';

/**
 * @typedef {import('./cards.mjs').GinCard} GinCard
 * @typedef {import('./cards.mjs').MeldResult} MeldResult
 * @typedef {import('./observe.mjs').GinObservation} GinObservation
 * @typedef {{ card: GinCard, deadwoodAfter: number, meldPaths: number, result: MeldResult }} DiscardOption
 * @typedef {'early'|'middle'|'late'} Stage
 * @typedef {{
 *   stage: Stage, deadwood: number, unseen: number, ginOuts: number,
 *   canKnock: boolean, isGin: boolean, isBigGin: boolean, isLastChance: boolean,
 *   discards: DiscardOption[], bestDiscard: DiscardOption|null,
 *   upcard: GinCard|null, upcardGain: number, upcardMelds: boolean,
 *   layoffExposure: number,
 * }} GinFacts
 */

export const KNOCK_LIMIT = 10;
// AAAI equilibrium study (25/25 bonuses): knocking all but stops once 8
// cards have left the stock; under 20/10 bonuses, once 17 have.
const EARLY_DRAWS = 8;
const MIDDLE_DRAWS = 17;
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

const key = (card) => `${card.rank}-${card.suit}`;
const DECK = SUIT_NAMES.flatMap((suit) => RANKS.map((rank) => ({ id: `${rank}-${suit}`, rank, suit })));

/**
 * @param {GinObservation} obs
 * @returns {Set<string>} rank-suit keys that are out of reach: in my hand or face up in the discard pile
 */
function deadKeys(obs) {
  return new Set([...obs.hand, ...obs.discardPile.filter((card) => !card.faceDown)].map((card) => key(card)));
}

/**
 * The 3-card melds `card` could still form with two partners nobody has
 * buried: A/K join 4, Q/2 join 5, 3..J join 6 on an open table.
 * @param {GinCard} card
 * @param {GinObservation} obs
 * @returns {number}
 */
export function meldPaths(card, obs) {
  const dead = deadKeys(obs);
  dead.delete(key(card));
  const isLive = (rank, suit) => rank >= 1 && rank <= 13 && !dead.has(`${RANKS[rank - 1]}-${suit}`);
  const others = SUIT_NAMES.filter((suit) => suit !== card.suit);
  let paths = 0;
  for (let first = 0; first < others.length; first++) {
    for (let second = first + 1; second < others.length; second++) {
      if (isLive(rankIndex(card), others[first]) && isLive(rankIndex(card), others[second])) paths += 1;
    }
  }
  const rank = rankIndex(card);
  for (const start of [rank - 2, rank - 1, rank]) {
    const partners = [start, start + 1, start + 2].filter((each) => each !== rank);
    if (partners.every((each) => isLive(each, card.suit))) paths += 1;
  }
  return paths;
}

/**
 * Chance of drawing at least one of `outs` among `unseen` cards in `draws` draws.
 * @param {{ outs: number, unseen: number }} counts
 * @param {number} draws
 * @returns {number}
 */
export function ginChance({ outs, unseen }, draws) {
  let miss = 1;
  for (let draw = 0; draw < draws; draw++) miss *= Math.max(unseen - outs - draw, 0) / (unseen - draw);
  return 1 - miss;
}

/**
 * @returns {Stage}
 */
const stageOf = (stockDrawn) => {
  if (stockDrawn < EARLY_DRAWS) return 'early';
  return stockDrawn < MIDDLE_DRAWS ? 'middle' : 'late';
};

/**
 * Every legal discard, best first: least deadwood after, then the card
 * the opponent can use least (fewest meld paths), then the higher card.
 * @param {GinObservation} obs
 * @returns {DiscardOption[]}
 */
export function discardOptions(obs) {
  return obs.hand
    .filter((card) => card.id !== obs.takenFromDiscard)
    .map((card) => {
      const result = bestMelds(obs.hand.filter((each) => each !== card));
      return { card, deadwoodAfter: result.deadwoodPoints, meldPaths: meldPaths(card, obs), result };
    })
    .toSorted((a, b) => a.deadwoodAfter - b.deadwoodAfter || a.meldPaths - b.meldPaths || cardValue(b.card) - cardValue(a.card));
}

/**
 * @param {GinObservation} obs
 * @returns {GinCard[]} cards not in my hand, not in the discard pile, not known to be in the opponent's hand
 */
export function unseenCards(obs) {
  const known = new Set([...deadKeys(obs), ...obs.opponentTook.map((card) => key(card))]);
  return DECK.filter((card) => !known.has(key(card)));
}

/**
 * Unseen cards that would let a 10-card hand go gin on the next draw.
 * @param {GinCard[]} hand10
 * @param {GinCard[]} unseen
 * @returns {number}
 */
export function ginOutsFor(hand10, unseen) {
  return unseen.filter((drawn) => {
    const eleven = [...hand10, drawn];
    return eleven.some((discard) => bestMelds(eleven.filter((each) => each !== discard)).deadwoodPoints === 0);
  }).length;
}

function upcardFacts(obs, current) {
  const top = obs.discardPile.at(-1);
  if (!top || top.faceDown) return { upcard: null, upcardGain: 0, upcardMelds: false };
  const eleven = [...obs.hand, top];
  const withUpcard = bestMelds(eleven);
  const bestAfter = Math.min(...obs.hand.map((discard) => bestMelds(eleven.filter((each) => each !== discard)).deadwoodPoints));
  return {
    upcard: top,
    upcardGain: current.deadwoodPoints - bestAfter,
    upcardMelds: withUpcard.melds.some((meld) => meld.cards.includes(top)),
  };
}

/**
 * All code-computable facts for this observation.
 * @param {GinObservation} obs
 * @returns {GinFacts}
 */
export function computeFacts(obs) {
  const stage = stageOf(obs.stockDrawn);
  const unseen = unseenCards(obs);
  const isLastChance = obs.stockCount <= 2;
  if (obs.phase !== 'discard') {
    const current = bestMelds(obs.hand);
    return {
      stage, deadwood: current.deadwoodPoints, unseen: unseen.length, ginOuts: 0,
      canKnock: false, isGin: false, isBigGin: false, isLastChance,
      discards: [], bestDiscard: null, layoffExposure: 0,
      ...upcardFacts(obs, current),
    };
  }
  const discards = discardOptions(obs);
  const bestDiscard = discards[0] ?? null;
  const deadwood = bestDiscard?.deadwoodAfter ?? Infinity;
  const hand10 = obs.hand.filter((card) => card !== bestDiscard?.card);
  return {
    stage, deadwood, unseen: unseen.length,
    ginOuts: deadwood === 0 ? 0 : ginOutsFor(hand10, unseen),
    canKnock: deadwood <= KNOCK_LIMIT,
    isGin: deadwood === 0,
    // All 11 melded: still declared by discarding a card that keeps gin
    // (an 11-card meld set always has a 4+ meld to take one from).
    isBigGin: bestMelds(obs.hand).deadwoodPoints === 0,
    isLastChance,
    discards, bestDiscard,
    upcard: null, upcardGain: 0, upcardMelds: false,
    layoffExposure: bestDiscard ? layoffs(unseen, bestDiscard.result.melds).length : 0,
  };
}
