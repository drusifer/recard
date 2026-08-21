/**
 * The Deck pile type (D42, Sprint 13/US-47, Tranche 1 of D39).
 *
 * Read-side only: `visibility`, `dropRule`, and offered actions. The
 * reducer's actual DRAW/DEAL/SHUFFLE_DECK/SPLIT_DECK mutations stay in
 * `state.js` untouched this sprint - see ARCHITECTURE.md D41 for why
 * (none of them fit a plain remove-from-A/insert-into-B shape).
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
