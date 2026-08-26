/**
 * The Hand pile type (D56 - real subclass, was `handPile.js`'s flat
 * module). Only the owner sees their own hand's cards; it fans out in
 * a rotated arc, never a flat card row.
 */
import { Pile } from './Pile.js';

export class HandPile extends Pile {
  static visibility = 'in-hand';
  static component = 'fan-pile';
  // A hand IS tableSide (D51: it renders at its owner's seat through
  // the same generic <zone-panel> machinery every other table-side pile
  // uses, and must appear in zonesOf()/view.zones for that). It is
  // still never a generic PLAY/MOVE_CARD drop DESTINATION - that's a
  // separate rule, `pileActions.js`'s `targetsForAction` explicitly
  // excludes `kind === 'hand'` regardless of this flag.
  static tableSide = true;
  static reparentable = false;

  /** A hand's own reorder goes through `handOrder.js` (D14) - no halo
   * geometry involved. */
  static resolveDropTarget() {
    return {};
  }

  /** `viewFor` never calls this for an `in-hand` pile - present for
   * interface uniformity only. */
  static redactCard(card) {
    return card;
  }

  /** A hand only offers anything to its own owner. */
  static cardActions(pile, card, viewerId) {
    return pile.ownerId === viewerId ? ['play'] : [];
  }

  /** Sorting or passing on someone else's behalf has never been
   * possible and isn't now either. */
  static pileActions({ isOwner } = {}) {
    return isOwner ? ['sortRank', 'sortSuit', 'pass'] : [];
  }
}
