/**
 * The Pile base class (D56) - real derived types: a Pile is cards +
 * behavior, full stop. There is no such thing as a "zone pile" - that
 * word belongs to the Zone entity alone (`state.zones`, `<zone-panel>`).
 * The generic, no-accept-rule, per-card `{owner, faceUp}` pile (`kind:
 * 'zone'`) isn't a distinctly-named subtype either - it IS this base
 * class, concrete and directly usable, not abstract. Every other kind
 * (`DeckPile`, `HandPile`, `DiscardPile`, `CascadePile`,
 * `RankAdjacentPile`, `MeldPile` and its subclasses) is a real
 * specialization that overrides only what differs - real `class X
 * extends Pile`, not a sibling module duplicating the shared rule.
 *
 * `src/piles/pileTypes.js`'s `PILE_TYPES` registry maps a pile's `kind`
 * string to its class; `state.js`/`ui.js`/`pileActions.js` dispatch
 * through `PILE_TYPES[pile.kind]`, calling its STATIC methods
 * (`PILE_TYPES[kind].canRemoveCard(pile, card, viewerId, action)`) -
 * unchanged call shape from the pre-D56 module-registry days, since a
 * class's static members are read exactly the same way a module
 * namespace's exports were. Pile *records* in `state.js` stay plain
 * data objects (`{id, kind, name, ownerId, cards, zoneId}`) - no change
 * to persistence/network serialization.
 *
 * `kind: 'zone'` is the wire/data string CREATE_ZONE still falls back
 * to (unchanged - renaming a persisted string carries no benefit here,
 * only churn) - it maps to this base class in the registry.
 */
import { resolveDropTarget as resolveHaloTarget } from '../dropTarget.js';

function withLayout(card, layout) {
  const { layout: _previous, ...rest } = card;
  return layout ? { ...rest, layout } : rest;
}

/**
 * D55/US-62: `hide`/`show` are mutually exclusive, keyed off the pile's
 * OWN current orientation - offering both at once would ask "hide" of
 * an already-hidden pile (a no-op button) or "show" of an already-shown
 * one. An empty pile offers neither - there's nothing to flip.
 */
function orientationActions(cards = []) {
  if (cards.length === 0) return [];
  return cards.every((c) => c.faceUp === true) ? ['hide'] : ['show'];
}

export class Pile {
  /** Per-card `{owner, faceUp}` visibility - "Open" when every card is
   * face-up, "Mixed" when they differ. The base default; `DeckPile`
   * (hidden) and `HandPile` (in-hand) override it. */
  static visibility = 'mixed';

  /** D45: a legal PLAY/MOVE_CARD destination. True by default - kept
   * overridable so `CREATE_ZONE`'s eligibility guard stays meaningful
   * (`HandPile` overrides it `false`). */
  static tableSide = true;

  /** Which Web Component renders this pile's row - a component renders
   * a render SHAPE, not a 1:1 class mapping, so several classes may
   * legitimately share one tag (D56). */
  static component = 'pile-panel';

  /** D55/US-63: eligible for `MOVE_PILE`/`SPLIT_PILE`/`TAKE_PILE`/
   * `SET_PILE_ORIENTATION`. True by default (this base class and
   * `DiscardPile`); `DeckPile` and `HandPile` override it `false`. */
  static reparentable = true;

  /** The only kind with real before/onto/after halo geometry -
   * `dropTarget.js`'s pure math. Every subclass that isn't a plain open
   * pile overrides this to `{}`. */
  static resolveDropTarget(cardBoxes, point) {
    return resolveHaloTarget(cardBoxes, point);
  }

  /** Nothing has ever gated an insert by card content for the base
   * case - unconditional accept. `MeldPile` subclasses are the real
   * content-based callers. */
  static canAccept() {
    return true;
  }

  /** D7: a viewer sees a card's identity if it's face-up, or they own
   * it. Otherwise they see only that it exists and (if applicable)
   * whose it is - never its rank/suit. `layout`/`orientation` both
   * survive redaction deliberately: they describe arrangement, not
   * identity. */
  static redactCard(card, viewerId) {
    if (card.faceUp || card.owner === viewerId) return card;
    let redacted = { id: card.id, owner: card.owner, faceDown: true };
    if (card.layout) redacted = { ...redacted, layout: card.layout };
    if (card.orientation) redacted = { ...redacted, orientation: card.orientation };
    return redacted;
  }

  /**
   * A face-down card can be turned over by anyone if it's unowned, or
   * by its owner; never by a non-owner. Only a face-up card can be
   * picked up. A still-hidden card can only be moved OR rotated by its
   * owner; anything visible, or face-down but unowned, is movable by
   * anyone.
   */
  static cardActions(pile, card, viewerId) {
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

  /**
   * D55/US-60/61/62: `split`/`take`/`hide`/`show` act on the whole
   * pile, open to any player for a SHARED pile (`isShared`), owner-only
   * for a personal one (`isOwner`).
   */
  static pileActions({ isOwner, isShared, cards } = {}) {
    if (!isOwner && !isShared) return [];
    return ['split', 'take', ...orientationActions(cards)];
  }

  /** Which of this pile's own offered actions are disabled by its
   * current state (e.g. `DeckPile`'s `deal` at zero cards). None for
   * the base case. */
  static disabledActions() {
    return [];
  }

  /** D43: the write-side authorization check is the READ-side offer
   * check - `cardActions` already states exactly which actions a card
   * offers to a viewer. `this` resolves to whichever subclass this was
   * actually called through, so an override of `cardActions` alone
   * (without touching `canRemoveCard`) still takes effect correctly. */
  static canRemoveCard(pile, card, viewerId, action) {
    return this.cardActions(pile, card, viewerId).includes(action);
  }

  static removeCard(pile, cardId) {
    return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
  }

  /**
   * D21: `layout` always belongs to whichever card of a newly-adjacent
   * pair ends up *second*. Dropping after the target, that's the
   * dropped card; dropping before it, the dropped card becomes the
   * target's new predecessor, so it is the TARGET that now sits second
   * and carries the layout.
   */
  static insertCard(pile, card, placement = {}) {
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
}
