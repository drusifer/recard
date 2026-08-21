/**
 * The Hand pile type (D42, Sprint 13/US-47, Tranche 1 of D39).
 *
 * Read-side only - see deckPile.js's header and ARCHITECTURE.md D41.
 */

/** Only the owner sees their own hand's cards; everyone else gets a
 * count (state.js's `viewFor`). */
export const visibility = 'in-hand';

/** A hand's own reorder goes through `handOrder.js` (D14), not
 * `dropTarget.js` - no halo geometry involved. */
export const dropRule = 'NONE';

/** `viewFor` never calls this for an `in-hand` pile - present for
 * interface uniformity with `zonePile.redactCard` only. */
export function redactCard(card) {
  return card;
}

/** A hand only offers anything to its own owner - matches
 * `actionsForCard`'s pre-D42 rule exactly. */
export function cardActions(pile, card, viewerId) {
  return pile.ownerId === viewerId ? ['play'] : [];
}

/** Sorting or passing on someone else's behalf has never been possible
 * and isn't now either. */
export function pileActions({ isOwner } = {}) {
  return isOwner ? ['sortRank', 'sortSuit', 'pass'] : [];
}
