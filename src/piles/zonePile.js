/**
 * The Zone pile type (D42, Sprint 13/US-47, Tranche 1 of D39) - the
 * general case: a shared or personal table zone whose cards each carry
 * their own `{owner, faceUp}` (D7). Read-side only - see deckPile.js's
 * header and ARCHITECTURE.md D41.
 */

/** Per-card `{owner, faceUp}` visibility, not a pile-level rule -
 * "Open" when every card is face-up, "Mixed" when they differ. */
export const visibility = 'mixed';

/** The only pile kind `dropTarget.js`'s `resolveDropTarget` (halo
 * before/onto/after) is ever called for today. */
export const dropRule = 'FAN';

/**
 * D7: a viewer sees a card's identity if it's face-up, or they own it.
 * Otherwise they see only that it exists and (if applicable) whose it
 * is - never its rank/suit. `layout` (D21) survives redaction
 * deliberately: it describes arrangement, not identity, and every
 * viewer is meant to see it identically.
 */
export function redactCard(card, viewerId) {
  if (card.faceUp || card.owner === viewerId) return card;
  const redacted = { id: card.id, owner: card.owner, faceDown: true };
  return card.layout ? { ...redacted, layout: card.layout } : redacted;
}

/**
 * The actions a zone card offers, applying the same visibility/
 * ownership rules the reducer enforces (D7/D12):
 * - a face-down card can be turned over by anyone if it's unowned, or
 *   by its owner; never by a non-owner.
 * - only a face-up card can be picked up.
 * - a still-hidden card can only be moved by its owner.
 */
export function cardActions(pile, card, viewerId) {
  const hidden = card.faceDown === true || card.faceUp === false;
  const owned = card.owner != null;
  const mine = card.owner === viewerId;

  return ['reveal', 'pickup', 'move'].filter((action) => {
    if (action === 'reveal') return hidden && (!owned || mine);
    if (action === 'pickup') return !hidden;
    // Mirrors MOVE_CARD's own rule exactly: a still-hidden card is
    // movable only by its owner; anything visible, or face-down but
    // unowned ("put or take is open to all", US-19), is movable by all.
    if (action === 'move') return !hidden || !owned || mine;
    return false;
  });
}

/** No pile-level action has ever targeted a shared zone - dealing and
 * drawing act on the deck, sorting/passing act on a hand. */
export function pileActions() {
  return [];
}
