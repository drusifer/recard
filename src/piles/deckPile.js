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

/** UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - a deck pile renders as a visual
 * stack + count badge (`ui.js`'s `<deck-stack>`), never a `.card-row`
 * of individual cards the way `visibility: 'hidden'` + `cards: []`
 * would otherwise render as (nothing at all - a deck's cards never
 * reach the view). One more per-kind property alongside `visibility`/
 * `tableSide`, read the same polymorphic way (`rowShapeFor`,
 * `pileActions.js`) instead of a `zone.kind === 'deck'` check inside
 * the generic pile renderer. */
export const rowShape = 'stack';

/** The one deck action whose availability depends on the pile's OWN
 * state, not just who's asking (`pileActions` above) - dealing from an
 * empty deck has never made sense, so its button is disabled (not
 * hidden - a host should still see it exists) at zero. */
export function disabledActions(count) {
  return count <= 0 ? ['deal'] : [];
}

/** No halo geometry is reachable for the deck today (D29's own strip
 * renders it, never `dropTarget.js`). D53: this is now a real method,
 * not a `dropRule` string `ui.js` branches on. */
export function resolveDropTarget() {
  return {};
}

/** D53: nothing has ever gated a DRAW/insert into the deck by card
 * content - unconditional accept keeps this a zero-behavior-change
 * refactor. Present so `transferCard` (state.js) has one uniform call
 * site across every pile kind. */
export function canAccept() {
  return true;
}

/** UX follow-up (direct user request): "make Deck a pile type so decks
 * can go into zones" - was `false` (D45: "the deck is never a PLAY/
 * MOVE_CARD destination"). A deck is a legal destination now, the same
 * "table surface" category every other tableSide kind is - creatable
 * via CREATE_ZONE{kind:'deck'}, draggable/repositionable like any other
 * panel (`ui.js`'s `attachPanelDrag`), and a card dropped onto one gets
 * shuffled into it face-down (deck's own `canAccept`, unconditional -
 * already true before this changed). More than one deck-kind pile can
 * exist now (SPLIT_DECK's own piles are deck-kind too, D53 follow-up) -
 * `state.js`'s `deckOf()`/`DECK_PILE_ID` still name exactly ONE of them
 * as THE draw pile DRAW/DEAL/SHUFFLE_DECK/SPLIT_DECK act on, matched by
 * id now, not by kind. */
export const tableSide = true;

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
