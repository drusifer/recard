/**
 * The Deck pile type (D42, Sprint 13/US-47).
 *
 * Sprint 14/Tranche 2 (D43) wires DRAW's transfer (deck -> hand) through
 * `canRemoveCard`/`removeCard`/`insertCard` below. DEAL/DEAL_MORE (one
 * source, MANY destinations at once) and SHUFFLE_DECK/SPLIT_DECK
 * (pile-level, deck-specific, no cross-type behavior to generalize)
 * stay direct `state.js` cases - see ARCHITECTURE.md D43 for why
 * forcing them into this shape was rejected, not just skipped.
 */

/** Nobody sees a deck's cards - only its count (state.js's `viewFor`). */
export const visibility = 'hidden';

/** No halo geometry is reachable for the deck today (D29's own strip
 * renders it, never `dropTarget.js`). */
export const dropRule = 'NONE';

/** `viewFor` never calls this for a `hidden` pile - present for
 * interface uniformity with `zonePile.redactCard` only. */
export function redactCard(card) {
  return card;
}

/**
 * D34: Draw moved to a pile-level action - the deck has never rendered
 * a per-card hover row, so this stays empty by construction, not by
 * omission.
 */
export function cardActions() {
  return [];
}

/**
 * Draw is open to everyone; every other deck action (deal, reshuffle &
 * deal, shuffle, split) is host-only, matching D29/US-35/36 exactly -
 * this module only relocates WHERE the table lives, not WHO may use it.
 */
export function pileActions({ isHost } = {}) {
  return isHost ? ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split'] : ['draw'];
}

/** DRAW has never been per-card authorized - deck cards carry no
 * owner, so unlike `zonePile`/`handPile` there is no `cardActions`
 * entry to reuse (deck's `cardActions` is intentionally always empty,
 * above - draw is a PILE-level action, not a card-level one). */
export function canRemoveCard() {
  return true;
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

/** Unexercised by any current action - DRAW only ever removes from the
 * deck, never inserts into it. Present for interface completeness, same
 * spirit as `redactCard`/`cardActions` above. Adds to the top,
 * matching a physical deck. */
export function insertCard(pile, card) {
  return { ...pile, cards: [card, ...pile.cards] };
}
