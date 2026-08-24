/**
 * The Discard pile type (D45, Sprint 15) - the first NEW pile type built
 * since D42/D43 established the interface, proving Open/Closed for
 * real: this file plus one registry entry (`pileTypes.js`) is the whole
 * change - no existing pile-type module touched.
 *
 * "Stack, drop-only" (the user's own wording from the framework
 * sidebar): cards land on top with no positional choice (`dropRule:
 * 'STACK'`, distinct from `zonePile`'s `'FAN'`), and the pile offers no
 * card-level action at all - once a card is discarded it stays. That
 * "drop-only" behavior falls straight out of the existing
 * `canRemoveCard = cardActions(...).includes(action)` pattern
 * (`zonePile`/`handPile`) with zero new logic: an empty `cardActions`
 * makes `canRemoveCard` false for every action, for free.
 */

/** Same per-card {owner, faceUp} model as a zone (D7) - a discard pile
 * CAN hold face-down cards (a hidden discard is a real house rule in
 * some games); redaction is per-card, exactly like `zonePile`. */
export const visibility = 'mixed';

/** No before/after halo - a discard pile has exactly one landing spot
 * (on top), so `dropTarget.js`'s geometry is never consulted for this
 * type. D53: real method (own module owns "no geometry"), not a
 * `dropRule` string `ui.js` branches on. */
export function resolveDropTarget() {
  return {};
}

/** D53: drop-only, but content-unconditional - anything may land on
 * top. Unconditional accept keeps this a zero-behavior-change refactor. */
export function canAccept() {
  return true;
}

/** A discard pile is a legal PLAY/MOVE_CARD destination, the same
 * "table surface" category `zonePile` is - `state.js`'s zone-only
 * existence checks now derive off this flag instead of a hardcoded
 * `kind === 'zone'` string (D45). */
export const tableSide = true;

/** Identical rule to `zonePile.redactCard` (D7/D48). Duplicated rather
 * than imported: each pile-type module stays self-contained, matching
 * how `deckPile`/`handPile` never import each other either. */
export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  let redacted = { id: card.id, owner: card.owner, faceDown: true };
  if (card.layout) redacted = { ...redacted, layout: card.layout };
  if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
  return redacted;
}

/** Drop-only: nothing is ever offered on a card once it's discarded. */
export function cardActions() {
  return [];
}

/** No pile-level action targets a discard pile today (no deal/draw/sort
 * analog for it yet). */
export function pileActions() {
  return [];
}

/** Falls out of the empty `cardActions` above - no action is ever
 * offered, so none is ever authorized to remove a card from here. */
export function canRemoveCard(pile, card, viewerId, action) {
  return cardActions(pile, card, viewerId).includes(action);
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

/** STACK means every drop lands on top, unconditionally - no
 * `placement`/halo splicing like `zonePile.insertCard`. Prepending
 * (not appending) matches `deckPile.insertCard`'s "top of the pile is
 * index 0" convention. */
export function insertCard(pile, card) {
  return { ...pile, cards: [card, ...pile.cards] };
}
