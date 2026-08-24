/**
 * The Hand pile type (D42, Sprint 13/US-47). Sprint 14/Tranche 2 (D43)
 * adds the write side.
 */

/** Only the owner sees their own hand's cards; everyone else gets a
 * count (state.js's `viewFor`). */
export const visibility = 'in-hand';

/** A hand's own reorder goes through `handOrder.js` (D14), not
 * `dropTarget.js` - no halo geometry involved. D53: real method, not a
 * `dropRule` string. */
export function resolveDropTarget() {
  return {};
}

/** D53: PLAY has never gated by card content - unconditional accept
 * keeps this a zero-behavior-change refactor. */
export function canAccept() {
  return true;
}

/** A hand is reached by id (`hand:<playerId>`), never by the
 * PLAY/MOVE_CARD "any table-side pile" existence check (D45) - it has
 * its own dedicated lookup already. */
export const tableSide = false;

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

/** D43: same reuse-the-read-side pattern as `zonePile` - PLAY has never
 * been authorized per-card, only per-hand-ownership, which `cardActions`
 * already states. */
export function canRemoveCard(pile, card, viewerId, action) {
  return cardActions(pile, card, viewerId).includes(action);
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

export function insertCard(pile, card) {
  return { ...pile, cards: [...pile.cards, card] };
}
