/**
 * The Zone pile type (D42, Sprint 13/US-47) - the general case: a
 * shared or personal table zone whose cards each carry their own
 * `{owner, faceUp}` (D7). Sprint 14/Tranche 2 (D43) adds the write
 * side: `canRemoveCard`/`removeCard`/`insertCard`, the shape
 * `state.js`'s PICKUP/MOVE_CARD/PLAY-into-a-zone dispatch through.
 * D53 (Sprint 22): owns `resolveDropTarget` outright (delegating to
 * `dropTarget.js`'s pure halo geometry) instead of declaring a
 * `dropRule: 'FAN'` string for `ui.js` to branch on.
 */
import { resolveDropTarget as resolveHaloTarget } from '../dropTarget.js';

/** Per-card `{owner, faceUp}` visibility, not a pile-level rule -
 * "Open" when every card is face-up, "Mixed" when they differ. */
export const visibility = 'mixed';

/** The only pile kind with real before/onto/after halo geometry today -
 * `dropTarget.js`'s pure math, owned here rather than switched on
 * centrally by a `dropRule` string. */
export function resolveDropTarget(cardBoxes, point) {
  return resolveHaloTarget(cardBoxes, point);
}

/** D53: nothing has ever gated a zone insert by card content -
 * unconditional accept keeps this a zero-behavior-change refactor.
 * The first real (content-based) `canAccept` is Sprint 22's `foundation`/
 * `cascade`/`rankAdjacent` kinds. */
export function canAccept() {
  return true;
}

/** D45: a zone is a legal PLAY/MOVE_CARD destination - `state.js`'s
 * `zonesOf` (despite its name, now "every table-side pile") derives
 * this off the flag instead of a hardcoded `kind === 'zone'` string, so
 * a second table-side type (`discardPile`, D45) is included for free. */
export const tableSide = true;

/**
 * D7: a viewer sees a card's identity if it's face-up, or they own it.
 * Otherwise they see only that it exists and (if applicable) whose it
 * is - never its rank/suit. `layout` (D21) and `orientation` (D48/D40)
 * both survive redaction deliberately: they describe arrangement, not
 * identity, and every viewer is meant to see them identically.
 */
export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  let redacted = { id: card.id, owner: card.owner, faceDown: true };
  if (card.layout) redacted = { ...redacted, layout: card.layout };
  if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
  return redacted;
}

/**
 * The actions a zone card offers, applying the same visibility/
 * ownership rules the reducer enforces (D7/D12):
 * - a face-down card can be turned over by anyone if it's unowned, or
 *   by its owner; never by a non-owner.
 * - only a face-up card can be picked up.
 * - a still-hidden card can only be moved OR rotated (D48/D40 -
 *   orientation follows `move`'s rule, not `reveal`'s: it doesn't
 *   reveal identity) by its owner.
 */
export function cardActions(pile, card, viewerId) {
  const hidden = card.faceDown === true || card.faceUp === false;
  const owned = card.owner != null;
  const mine = card.owner === viewerId;

  return ['reveal', 'pickup', 'move', 'rotate'].filter((action) => {
    if (action === 'reveal') return hidden && (!owned || mine);
    if (action === 'pickup') return !hidden;
    // Mirrors MOVE_CARD's own rule exactly: a still-hidden card is
    // movable only by its owner; anything visible, or face-down but
    // unowned ("put or take is open to all", US-19), is movable by all.
    // `rotate` shares this rule rather than `reveal`'s stricter one.
    if (action === 'move' || action === 'rotate') return !hidden || !owned || mine;
    return false;
  });
}

/** No pile-level action has ever targeted a shared zone - dealing and
 * drawing act on the deck, sorting/passing act on a hand. */
export function pileActions() {
  return [];
}

/**
 * D43: the write-side authorization check is the READ-side offer check
 * - `cardActions` already states exactly which actions a card offers to
 * a viewer, and every existing reducer case (`REVEAL`/`PICKUP`/
 * `MOVE_CARD`) enforced precisely that same rule, just written out a
 * second time inline. One source of truth instead of two copies that
 * could drift.
 */
export function canRemoveCard(pile, card, viewerId, action) {
  return cardActions(pile, card, viewerId).includes(action);
}

export function removeCard(pile, cardId) {
  return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
}

/**
 * D21, relocated from state.js's private `placeCard`/`withLayout`
 * (Tranche 2): arrangement is a ZONE concept - a hand has no adjacency
 * rendering to describe, so this belongs on the pile type that actually
 * uses it, not in the reducer.
 *
 * Smith's Gate 2 rule, implemented in exactly one place: `layout`
 * always belongs to whichever card of the newly-adjacent pair ends up
 * *second*. Dropping after the target, that's the dropped card;
 * dropping before it, the dropped card becomes the target's new
 * predecessor, so it is the TARGET that now sits second and carries the
 * layout. Getting this backwards would visually join the wrong pair.
 */
function withLayout(card, layout) {
  const { layout: _previous, ...rest } = card;
  return layout ? { ...rest, layout } : rest;
}

export function insertCard(pile, card, placement = {}) {
  const { targetCardId, side = 'after', layout } = placement;
  if (!targetCardId) return { ...pile, cards: [...pile.cards, withLayout(card, layout)] };

  const { cards } = pile;
  const index = cards.findIndex((c) => c.id === targetCardId);
  if (index === -1) {
    throw new Error(`Target card ${targetCardId} is not in the destination zone`);
  }

  if (side === 'before') {
    const placed = [...cards.slice(0, index), withLayout(card, null), ...cards.slice(index)];
    return { ...pile, cards: placed.map((c) => (c.id === targetCardId ? withLayout(c, layout) : c)) };
  }
  return { ...pile, cards: [...cards.slice(0, index + 1), withLayout(card, layout), ...cards.slice(index + 1)] };
}
