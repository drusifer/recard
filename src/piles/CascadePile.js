/**
 * The Cascade pile type (D56 - real subclass, was `cascadePile.js`'s
 * flat module). Solitaire's tableau: alternating-color, strictly
 * descending. Reuses D21's `layout: 'overlap'` rendering. `cardActions`/
 * `redactCard`/`removeCard`/`canRemoveCard` are identical to the base
 * `Pile` rule and are inherited rather than duplicated.
 */
import { Pile } from './Pile.js';
import { RANKS } from '../decks/standardDeck.js';

const RED_SUITS = new Set(['diamonds', 'hearts']);

export class CascadePile extends Pile {
  /** *nit fix (2026-08-26): matches `MOVE_PILE`'s own hardcoded
   * eligibility (`state.js`), now actually read from this flag instead
   * of duplicated there - a cascade is one of Solitaire's 7 fixed
   * tableau columns, not something meaningful to drag elsewhere. */
  static reparentable = false;

  /** No before/after halo choice - a card either fits the sequence or
   * it doesn't (`canAccept` decides that); it always lands at the end. */
  static resolveDropTarget() {
    return {};
  }

  /** US-57: empty cascade accepts any card (deal-time fill); otherwise
   * the next card must be the opposite color and exactly one rank
   * lower than the current top card. */
  static canAccept(pile, card) {
    if (pile.cards.length === 0) return true;
    const top = pile.cards[pile.cards.length - 1];
    const oppositeColor = RED_SUITS.has(card.suit) !== RED_SUITS.has(top.suit);
    return oppositeColor && RANKS.indexOf(card.rank) === RANKS.indexOf(top.rank) - 1;
  }

  /** US-57 explicitly scopes multi-card sequence moves out - no
   * pile-level action has ever targeted a cascade. */
  static pileActions() {
    return [];
  }

  /** Always appends; every card after the first carries `layout:
   * 'overlap'` automatically - a cascade has no flat/stacked choice
   * like a general pile, it IS the overlap layout. */
  static insertCard(pile, card) {
    const placed = pile.cards.length === 0 ? card : { ...card, layout: 'overlap' };
    return { ...pile, cards: [...pile.cards, placed] };
  }
}
