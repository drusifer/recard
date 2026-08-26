/**
 * MeldPile (D56, new abstract base) - the shared shape every
 * rule-checked, "locked once placed" pile has: no card is ever
 * removable, nothing is offered on a placed card, and inserts are
 * always a plain append (no before/after halo splicing - a meld has
 * exactly one growth point). `FoundationPile` is the first concrete
 * subclass (via `RunPile`); `SetPile` is a documented placeholder for a
 * same-rank meld, not yet built by any sprint - do not implement
 * `canAccept` here speculatively.
 *
 * Not directly instantiable in practice (no `kind` maps to it in
 * `pileTypes.js`) - subclasses must supply their own `canAccept`.
 */
import { Pile } from './Pile.js';

export class MeldPile extends Pile {
  /** Nothing is ever offered on a card once it's part of a meld -
   * `canRemoveCard` (inherited) reuses this, so it falls out to always
   * `false` for free, same pattern as `DiscardPile`. */
  static cardActions() {
    return [];
  }

  /** No pile-level action has ever targeted a meld. */
  static pileActions() {
    return [];
  }

  /** No before/after halo - a meld has exactly one landing spot
   * (`canAccept` decides whether a card may land there at all). */
  static resolveDropTarget() {
    return {};
  }

  /** Append-only, same "top of the pile is the end of the array"
   * convention the base `Pile` open-ended case uses. */
  static insertCard(pile, card) {
    return { ...pile, cards: [...pile.cards, card] };
  }
}
