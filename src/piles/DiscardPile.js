/**
 * The Discard pile type (D56 - real subclass, was `discardPile.js`'s
 * flat module). "Stack": cards land on top with no positional choice.
 *
 * *nit (direct user request, reversing D45): "discard pile is just a
 * deck (face up or down)" - the original "drop-only, no card-level
 * action at all" rule is gone. A discard pile now offers full per-card
 * access (reveal/pickup/move/rotate), identical to the base `Pile` -
 * `cardActions` is inherited, not overridden, same as `canAccept`/
 * `redactCard`/`pileActions`. `resolveDropTarget`/`insertCard` below
 * are the only real difference left from a plain zone: cards always
 * stack on top (a deck's own convention - hence "just a deck"), never
 * splice into a before/after halo position.
 */
import { Pile } from './Pile.js';

export class DiscardPile extends Pile {
  /** No before/after halo - a discard pile has exactly one landing
   * spot (on top). */
  resolveDropTarget() {
    return {};
  }

  /** STACK means every drop lands on top, unconditionally - no
   * placement/halo splicing like the base class. Prepends (index 0),
   * matching `DeckPile`'s "top of the pile is index 0" convention. */
  insertCard(card) {
    return { ...this.toJSON(), cards: [card, ...this.cards] };
  }
}
