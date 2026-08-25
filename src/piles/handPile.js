/**
 * The Hand pile type (D42, Sprint 13/US-47). Sprint 14/Tranche 2 (D43)
 * adds the write side.
 */

/** Only the owner sees their own hand's cards; everyone else gets a
 * count (state.js's `viewFor`). */
export const visibility = 'in-hand';

/** UX follow-up (direct user request): a hand's cards fan out in a
 * rotated arc (`ui.js`'s `<fan-pile>`), never a flat `.card-row` -
 * `rowShapeFor` (`pileActions.js`) reads this the same polymorphic way
 * `visibility`/`tableSide` are already read, instead of a `zone.kind
 * === 'hand'` check inside the generic pile renderer. */
export const rowShape = 'fan';

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

/** Direct user request: a hand is now a real seat-zone entry in
 * `zonesOf()`/`view.zones` (`state.js`) - the D17 personal seat zone is
 * retired, and the hand pile itself renders at the seat instead, via
 * the same generic `<zone-panel>` every other table-side pile uses. A
 * hand still isn't reachable through `CREATE_ZONE` (that's a separate,
 * explicit `kind === 'hand'` guard now, not this flag) - exactly one
 * hand pile per player, created by `ensureHandPile`, never player-
 * addable.
 *
 * NOTE (flagged, not yet done): `redactCard` below is still a no-op, so
 * an opponent's hand cards are NOT hidden yet now that they flow
 * through the same pipeline a `mixed`-visibility zone's cards do - a
 * deliberate, temporary gap. Direct user instruction: get this
 * rendering working first, fix the actual hiding as a following step. */
export const tableSide = true;

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
