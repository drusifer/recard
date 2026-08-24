/**
 * The Cascade pile type (D53, Sprint 22/US-57) - Solitaire's tableau:
 * alternating-color, strictly descending. Reuses D21's existing
 * `layout: 'overlap'` rendering verbatim (US-32/33's stacking/overlap
 * mechanic already draws a pile this way) - only `canAccept` and the
 * automatic `layout` on insert are new.
 */
import { RANKS } from '../decks/standardDeck.js';

const RED_SUITS = new Set(['diamonds', 'hearts']);

export const visibility = 'mixed';
export const tableSide = true;

/** No before/after halo choice - a card either fits the sequence or it
 * doesn't (`canAccept` decides that); it always lands at the end,
 * offset by `layout: 'overlap'` in `insertCard` below. */
export function resolveDropTarget() {
  return {};
}

/** Identical rule to `zonePile.redactCard` (D7/D48). */
export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  let redacted = { id: card.id, owner: card.owner, faceDown: true };
  if (card.layout) redacted = { ...redacted, layout: card.layout };
  if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
  return redacted;
}

/** US-57: empty cascade accepts any card (deal-time fill); otherwise
 * the next card must be the opposite color and exactly one rank lower
 * than the current top card. */
export function canAccept(pile, card) {
  if (pile.cards.length === 0) return true;
  const top = pile.cards[pile.cards.length - 1];
  const oppositeColor = RED_SUITS.has(card.suit) !== RED_SUITS.has(top.suit);
  return oppositeColor && RANKS.indexOf(card.rank) === RANKS.indexOf(top.rank) - 1;
}

/** Same per-card offer rule as `zonePile` - a cascade card is not
 * treated differently once it has landed; US-57 explicitly scopes
 * multi-card sequence moves out, so single-card move/reveal/pickup/
 * rotate stay governed by the same visibility/ownership rule as any
 * other table pile. */
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

/** Always appends; every card after the first carries `layout:
 * 'overlap'` automatically - a cascade has no flat/stacked choice like
 * a general zone, it IS the overlap layout. */
export function insertCard(pile, card) {
  const placed = pile.cards.length === 0 ? card : { ...card, layout: 'overlap' };
  return { ...pile, cards: [...pile.cards, placed] };
}
