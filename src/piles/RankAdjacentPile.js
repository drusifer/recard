/**
 * The RankAdjacent pile type (D56 - real subclass, was
 * `rankAdjacentPile.js`'s flat module). Spit's shared center pile:
 * either direction, any suit, wraps King<->Ace. Always shared
 * (`ownerId: null`) - no player ever owns a Spit center pile.
 * `cardActions`/`redactCard`/`removeCard`/`canRemoveCard` are identical
 * to the base `Pile` rule and are inherited rather than duplicated.
 */
import { Pile } from './Pile.js';
import { RANKS } from '../decks/standardDeck.js';

export class RankAdjacentPile extends Pile {
  /** *nit fix (2026-08-26): matches `MOVE_PILE`'s own hardcoded
   * eligibility (`state.js`), now actually read from this flag instead
   * of duplicated there - Spit's single shared center pile is a fixed
   * part of that game's layout, not something meaningful to drag
   * elsewhere. */
  static reparentable = false;

  /**
  No before/after halo - exactly one landing spot (on top).
  */
  resolveDropTarget() {
    return {};
  }

  /** US-58: empty accepts anything; otherwise the next card must be
   * exactly one rank above OR below the current top card, any suit,
   * wrapping King<->Ace (Spit has no "ends" the way Foundation does). */
  canAccept(card) {
    if (this.cards.length === 0) return true;
    // `insertCard` prepends (STACK convention) - index 0 is the top.
    const top = this.cards[0];
    const cardIndex = RANKS.indexOf(card.rank);
    const topIndex = RANKS.indexOf(top.rank);
    const diff = Math.abs(cardIndex - topIndex);
    return diff === 1 || diff === RANKS.length - 1; // the wrap: A (0) <-> K (12)
  }

  /** D71 (US-74): `changePileType` is the one pile-level action
   * offered here. Allowed on a non-empty pile too as of a direct user
   * request (2026-08-27) - see `state.js`'s `CHANGE_PILE_TYPE` doc
   * comment for the risk that carries. Same `isOwner`/`isShared` gate
   * `Pile`'s own `pileActions()` uses. */
  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['changePileType'];
  }

  /** Every drop lands on top, unconditionally - same STACK shape as
   * `DiscardPile.insertCard`. */
  insertCard(card) {
    return { ...this.toJSON(), cards: [card, ...this.cards] };
  }
}
