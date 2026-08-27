/**
 * The Deck pile type (D56 - real subclass, was `deckPile.js`'s flat
 * module). Nobody sees a deck's cards, only its count; it renders as a
 * visual stack + count badge, never a card row.
 */
import { Pile } from './Pile.js';

export class DeckPile extends Pile {
  static visibility = 'hidden';
  static component = 'deck-stack';
  /**
   * *nit (direct user request): "drag and drop on all piles including
   * Deck and Discard" - reverses Sprint 23's Gate 1 exclusion (D55),
   * which read too cautiously: `deckOf`/`DEAL`/`DRAW`/`SPLIT_DECK`/
   * `SHUFFLE_DECK`/`RESET` all find the deck by its fixed
   * `DECK_PILE_ID`, never by searching zones or reading its `zoneId` -
   * confirmed by grep before flipping this, not assumed. Only
   * `MOVE_PILE` reads this flag (`SPLIT_PILE`/`TAKE_PILE` use their
   * own hardcoded `zone`/`discard` kind checks, unaffected either way)
   * - the deck's title bar was already a drag SOURCE (`pileDraggable`
   * is unconditional), so this was a silent drop-then-error, not a
   * missing affordance.
   */
  static reparentable = true;

  /** No halo geometry is reachable for the deck (D29's own strip
   * renders it, never `dropTarget.js`). */
  static resolveDropTarget() {
    return {};
  }

  /** Dealing from an empty deck has never made sense - its button is
   * disabled (not hidden - a host should still see it exists) at 0. */
  static disabledActions(count) {
    return count <= 0 ? ['deal'] : [];
  }

  /** `viewFor` never calls this for a `hidden` pile - present for
   * interface uniformity only. */
  static redactCard(card) {
    return card;
  }

  /** D34: Draw moved to a pile-level action - the deck has never
   * rendered a per-card hover row, so this stays empty by construction. */
  static cardActions() {
    return [];
  }

  /**
  Draw is open to everyone; every other deck action is host-only.
  */
  static pileActions({ isHost } = {}) {
    return isHost ? ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split'] : ['draw'];
  }

  /** DRAW has never been per-card authorized - deck cards carry no
   * owner, so unlike the base case there's no `cardActions` entry to
   * reuse (deck's `cardActions` is intentionally always empty, above). */
  static canRemoveCard() {
    return true;
  }

  /** Unexercised by any current action - DRAW only ever removes from
   * the deck, never inserts into it. Adds to the top, matching a
   * physical deck (index 0, unlike the base class's append). */
  static insertCard(pile, card) {
    return { ...pile, cards: [card, ...pile.cards] };
  }
}
