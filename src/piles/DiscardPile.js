/**
 * The Discard pile type (D56 - real subclass, was `discardPile.js`'s
 * flat module). "Stack, drop-only": cards land on top with no
 * positional choice, and the pile offers no card-level action at all -
 * once a card is discarded it stays. Everything else (redaction,
 * pileActions, canAccept, resolveDropTarget) is identical to the base
 * `Pile` and is inherited rather than duplicated.
 */
import { Pile } from './Pile.js';

export class DiscardPile extends Pile {
  /** No before/after halo - a discard pile has exactly one landing
   * spot (on top). */
  static resolveDropTarget() {
    return {};
  }

  /** Drop-only: nothing is ever offered on a card once it's discarded.
   * `canRemoveCard` (inherited) reuses this, so it falls out to always
   * `false` for free. */
  static cardActions() {
    return [];
  }

  /** STACK means every drop lands on top, unconditionally - no
   * placement/halo splicing like the base class. Prepends (index 0),
   * matching `DeckPile`'s "top of the pile is index 0" convention. */
  static insertCard(pile, card) {
    return { ...pile, cards: [card, ...pile.cards] };
  }
}
