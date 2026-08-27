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

  /**
   * *nit (2026-08-26), real fix for a long-disclosed gap: a hand card
   * carries no per-card `owner`/`faceUp` of its own (unlike a table-side
   * pile's cards, D7) - ownership is the PILE's `ownerId`, so redaction
   * needs the pile in scope, not just the card. The owner sees their
   * hand in full; anyone else gets an anonymous face-down placeholder,
   * WITHOUT `id` - deliberately, unlike the base `Pile.redactCard`'s
   * `{id, owner, faceDown}` shape: this app's card ids encode rank/suit
   * (`decks/standardDeck.js`, e.g. `"A-spades-0"`), so keeping `id`
   * here would leak identity through the one field D7's own redaction
   * elsewhere is careful to strip. No card-level action ever needs to
   * address another player's hand card by id (unlike a table-side
   * pile's hidden cards, which PICKUP/REVEAL/MOVE_CARD still reference),
   * so there's nothing lost by omitting it. `owner: null` (not
   * `pile.ownerId`) is deliberate too - `ui.js`'s renderer would
   * otherwise try to tag every card with its owner's name, redundant
   * noise inside a panel that's already labeled with that name once.
   */
  static redactCard(card, viewerId, pile) {
    if (pile?.ownerId === viewerId) return card;
    return { faceDown: true, owner: null };
  }

  /**
  A hand only offers anything to its own owner.
  */
  static cardActions(pile, card, viewerId) {
    return pile.ownerId === viewerId ? ['play'] : [];
  }

  /** Sorting or passing on someone else's behalf has never been
   * possible and isn't now either. */
  static pileActions({ isOwner } = {}) {
    return isOwner ? ['sortRank', 'sortSuit', 'pass'] : [];
  }
}
