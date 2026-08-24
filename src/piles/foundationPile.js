/**
 * The Foundation pile type (D53, Sprint 22/US-56) - Solitaire's
 * same-suit, strictly ascending, append-only pile. First real caller of
 * D53's `canAccept` (a genuine content-based accept rule, not the
 * unconditional `true` every pre-Sprint-22 kind uses).
 */
import { RANKS } from '../decks/standardDeck.js';

/** Same per-card {owner, faceUp} model as a zone (D7) - a foundation
 * card is expected to always be face-up in practice, but the redaction
 * rule stays real rather than assumed. */
export const visibility = 'mixed';

/** No before/after halo - a foundation has exactly one landing spot
 * (on top of the sequence), same shape as `discardPile`. */
export function resolveDropTarget() {
  return {};
}

/** A foundation is a legal PLAY/MOVE_CARD destination, same "table
 * surface" category as `zonePile`/`discardPile`/`cascadePile`. */
export const tableSide = true;

/** Identical rule to `zonePile.redactCard` (D7/D48). Duplicated rather
 * than imported, matching every other pile-type module's precedent of
 * staying self-contained. */
export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  let redacted = { id: card.id, owner: card.owner, faceDown: true };
  if (card.layout) redacted = { ...redacted, layout: card.layout };
  if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
  return redacted;
}

/** US-56: empty foundation accepts only an Ace; otherwise the next
 * card must match the top card's suit and be exactly one rank higher. */
export function canAccept(pile, card) {
  if (pile.cards.length === 0) return card.rank === 'A';
  const top = pile.cards[pile.cards.length - 1];
  return card.suit === top.suit && RANKS.indexOf(card.rank) === RANKS.indexOf(top.rank) + 1;
}

/** No card is ever removable from a foundation once placed (US-56's
 * stated simplification - deferred, not a bug). Always-empty
 * `cardActions` gives the "this is locked" silence for free, per
 * Smith's Gate 2 note - same pattern `discardPile`'s drop-only rule
 * already established. */
export function cardActions() {
  return [];
}

export function pileActions() {
  return [];
}

export function canRemoveCard() {
  return false;
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

/** Append-only, same "top of the pile is the end of the array"
 * convention every other pile type uses. */
export function insertCard(pile, card) {
  return { ...pile, cards: [...pile.cards, card] };
}
