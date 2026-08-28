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
  /** *nit fix (2026-08-26): a real gap found while wiring MOVE_PILE to
   * actually READ this flag instead of its own separate hardcoded
   * kind check - the base `Pile` default (`true`) was never overridden
   * here, even though `MOVE_PILE`'s own hardcoded eligibility list
   * (`state.js`) has excluded every Meld-family kind since D55. The
   * flag was correct in intent, documented, and simply never wired to
   * anything - this is what actually makes it real. A meld has a fixed
   * structural role in its game (Solitaire's 4 foundation slots, etc.)
   * - reparenting one between zones was never a meaningful operation. */
  static reparentable = false;

  /** Nothing is ever offered on a card once it's part of a meld -
   * `canRemoveCard` (inherited) reuses this, so it falls out to always
   * `false` for free, same pattern as `DiscardPile`. */
  static cardActions() {
    return [];
  }

  /**
   * D71 (US-74): `changePileType` is the first pile-level action ever
   * offered on a meld. Allowed on a non-empty pile too as of a direct
   * user request (2026-08-27) - see `state.js`'s `CHANGE_PILE_TYPE`
   * doc comment for the risk that carries. Same `isOwner`/`isShared`
   * gate `Pile.pileActions()` uses, for consistency - a meld is
   * normally ownerless/shared (Solitaire's foundations), same as any
   * other shared pile.
   */
  static pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['changePileType'];
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
