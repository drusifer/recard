/**
 * Pure, client-side hand ordering (D14, US-23). Hand order is a per-
 * viewer display preference, never part of authoritative state and never
 * broadcast - these functions only ever operate on plain data (arrays of
 * card ids / card objects), with no DOM/network dependency, so both the
 * "sort" buttons and manual drag-reorder can share one source of truth
 * instead of fighting each other (Smith Gate 1 requirement).
 */

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_ORDER = ['clubs', 'diamonds', 'hearts', 'spades'];

function rankIndex(rank) {
  const index = RANK_ORDER.indexOf(rank);
  return index === -1 ? RANK_ORDER.length : index; // JOKER (or anything unknown) sorts last
}

function suitIndex(suit) {
  const index = SUIT_ORDER.indexOf(suit);
  return index === -1 ? SUIT_ORDER.length : index; // JOKER (suit: null) sorts last
}

/**
 * Reconciles a previously-known display order against the current set of
 * cards: ids still present keep their prior relative position (this is
 * what makes drag-reorder AND sort buttons durable across state updates,
 * unlike the old behavior where the next broadcast silently wiped any
 * manual ordering), newly-seen ids append in arrival order, and ids no
 * longer present are dropped.
 * @param {string[]} previousOrder
 * @param {{id: string}[]} currentCards
 * @returns {string[]}
 */
export function reconcileOrder(previousOrder, currentCards) {
  const currentIds = new Set(currentCards.map((c) => c.id));
  const kept = previousOrder.filter((id) => currentIds.has(id));
  const keptSet = new Set(kept);
  const added = currentCards.map((c) => c.id).filter((id) => !keptSet.has(id));
  return [...kept, ...added];
}

/**
 * @param {{id: string, rank: string, suit: string|null}[]} cards
 * @returns {string[]} card ids sorted rank-ascending (A..K, JOKER last),
 *   ties broken by suit
 */
export function sortByRank(cards) {
  return cards
    .toSorted((a, b) => rankIndex(a.rank) - rankIndex(b.rank) || suitIndex(a.suit) - suitIndex(b.suit))
    .map((c) => c.id);
}

/**
 * @param {{id: string, rank: string, suit: string|null}[]} cards
 * @returns {string[]} card ids sorted suit-grouped (clubs/diamonds/
 *   hearts/spades, JOKER last), rank-ascending within each suit
 */
export function sortBySuit(cards) {
  return cards
    .toSorted((a, b) => suitIndex(a.suit) - suitIndex(b.suit) || rankIndex(a.rank) - rankIndex(b.rank))
    .map((c) => c.id);
}
