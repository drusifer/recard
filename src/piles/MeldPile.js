/**
 * MeldPile (D56, new abstract base) - the shared shape every
 * rule-checked "locked once placed" pile has: inserts are always a
 * plain append (no before/after halo splicing - a meld has exactly one
 * growth point). `FoundationPile` (via `RunPile`) and `SetPile` (D91)
 * are its two concrete, registered subclasses.
 *
 * Not directly instantiable itself (no `kind` maps to `MeldPile` in
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

  /** *nit (direct user request, reversed): "no card is ever removable"
   * used to be enforced here (`pileableActions` always `[]`) as "the real
   * Solitaire rule a foundation exists to enforce." Direct, repeated
   * user correction: this app is a table simulator, not a rules engine
   * (`docs/ARCHITECTURE.md`'s "Core invariant") - drag-and-drop is
   * ALWAYS available on ANY card, no pile-type override may remove it.
   * `pileableActions` is no longer overridden here at all - a meld's cards
   * get the exact same base `Pile` reveal/pickup/move/rotate rule
   * (privacy-filtered, D7) as any other pile's. `SPLIT_PILE`/
   * `PICKUP_SPLIT` (`state.js`'s `splitPileAt`) now derive their own
   * eligibility straight from this - "pileableActions are the more general
   * case" (direct user request) - so a meld is bulk-splittable too, no
   * separate flag needed any more. */

  /**
   * D71 (US-74): `changePileType` is the first pile-level action ever
   * offered on a meld. Allowed on a non-empty pile too as of a direct
   * user request (2026-08-27) - see `state.js`'s `CHANGE_PILE_TYPE`
   * doc comment for the risk that carries. Same `isOwner`/`isShared`
   * gate `Pile.pileActions()` uses, for consistency - a meld is
   * normally ownerless/shared (Solitaire's foundations), same as any
   * other shared pile.
   *
   * D91: `split` joins it, per this class's own comment above ("a meld
   * is bulk-splittable too, no separate flag needed any more") -
   * `disabledActions` is inherited unchanged from `Pile` (below 2
   * cards), same minimum `splitPileAt` enforces. (`pickupSplit` briefly
   * joined it too and was a direct user correction - "there is not
   * supposed to be a pickupSplit" - removed.)
   */
  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    // *nit (direct user request): "pile actions for tighten/loosen to
    // adjust the overlap on fan and MELD piles or RUNS or whatever."
    // Named in the request, and this method fully overrides the base
    // one, so they're listed here rather than inherited. A meld lays
    // its cards out in a row like any other spread pile - the rule it
    // enforces is about what may JOIN it, not how it's displayed.
    return ['split', 'changePileType', 'tighten', 'loosen'];
  }

  /** No before/after halo - a meld has exactly one landing spot
   * (`canAccept` decides whether a card may land there at all). */
  resolveDropTarget() {
    return {};
  }

  /** Append-only, same "top of the pile is the end of the array"
   * convention the base `Pile` open-ended case uses. */
  insertPileable(card) {
    return { ...this.toJSON(), cards: [...this.cards, card] };
  }
}
