/**
 * The Stack pile type (D79, US-82) — where spells wait to resolve.
 *
 * Last-in-first-out: the most recently added spell sits on top and
 * resolves first. That ordering is the whole point of the zone, and it
 * is why this is a real type rather than a shared `zone` pile with a
 * label - a `zone` pile splices a drop in beside its neighbours, which
 * would silently put a new spell underneath an older one.
 *
 * The engine does not RESOLVE anything (this is a table simulator -
 * players enforce the rules, per the sprint's framing decision).
 * Resolving is simply moving the top card to wherever it ends up, so
 * card-level `move`/`pickup` stay available, unlike discard/exile.
 */
import { Pile } from './Pile.js';

export class StackPile extends Pile {
  /**
  One landing spot - on top. No before/after halo.
  */
  resolveDropTarget() {
    return {};
  }

  /** LIFO: prepend, matching `DiscardPile`/`DeckPile`'s "top of the pile
   * is index 0" convention. */
  insertPileable(card) {
    return { ...this.toJSON(), cards: [card, ...this.cards] };
  }

  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['changePileType', 'remove'];
  }
}
