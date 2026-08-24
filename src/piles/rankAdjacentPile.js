/**
 * The RankAdjacent pile type (D53, Sprint 22/US-58) - Spit's shared
 * center pile: either direction, any suit, wraps King<->Ace. Always
 * shared (`ownerId: null`) - no player ever owns a Spit center pile.
 */
import { RANKS } from '../decks/standardDeck.js';

export const visibility = 'mixed';
export const tableSide = true;

/** No before/after halo - exactly one landing spot (on top), same
 * shape as `discardPile`/`foundationPile`. */
export function resolveDropTarget() {
  return {};
}

export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  let redacted = { id: card.id, owner: card.owner, faceDown: true };
  if (card.layout) redacted = { ...redacted, layout: card.layout };
  if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
  return redacted;
}

/** US-58: empty accepts anything; otherwise the next card must be
 * exactly one rank above OR below the current top card, any suit,
 * wrapping King<->Ace (Spit has no "ends" the way Foundation does). */
export function canAccept(pile, card) {
  if (pile.cards.length === 0) return true;
  // `insertCard` prepends (STACK convention, same as `discardPile`) -
  // index 0 is the top of the pile.
  const top = pile.cards[0];
  const cardIdx = RANKS.indexOf(card.rank);
  const topIdx = RANKS.indexOf(top.rank);
  const diff = Math.abs(cardIdx - topIdx);
  return diff === 1 || diff === RANKS.length - 1; // the wrap: A (0) <-> K (12)
}

/** No turn-order enforcement - Spit is explicitly simultaneous/
 * real-time by rule, and the existing MOVE_CARD authorization (any
 * player may move a card they can see/reach) already matches that
 * exactly, same rule as `zonePile`. */
export function cardActions(pile, card, viewerId) {
  const hidden = card.faceDown === true || card.faceUp === false;
  const owned = card.owner != null;
  const mine = card.owner === viewerId;

  return ['reveal', 'pickup', 'move', 'rotate'].filter((action) => {
    if (action === 'reveal') return hidden && (!owned || mine);
    if (action === 'pickup') return !hidden;
    if (action === 'move' || action === 'rotate') return !hidden || !owned || mine;
    return false;
  });
}

export function pileActions() {
  return [];
}

export function canRemoveCard(pile, card, viewerId, action) {
  return cardActions(pile, card, viewerId).includes(action);
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

/** Every drop lands on top, unconditionally - same STACK shape as
 * `discardPile.insertCard`. */
export function insertCard(pile, card) {
  return { ...pile, cards: [card, ...pile.cards] };
}
