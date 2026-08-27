/**
 * RunPile (D56, new) - a same-suit, sequential meld. An empty run
 * accepts any card (it can start anywhere); `FoundationPile` narrows
 * that to "must start at Ace" as the one thing it overrides - the
 * ascending-from-Ace foundation rule IS a same-suit sequential run's
 * special case, not a separate concept, so it extends this rather than
 * duplicating the "same suit, rank+1" check.
 */
import { MeldPile } from './MeldPile.js';
import { RANKS } from '../decks/standardDeck.js';

export class RunPile extends MeldPile {
  static canAccept(pile, card) {
    if (pile.cards.length === 0) return true;
    const top = pile.cards.at(-1);
    return card.suit === top.suit && RANKS.indexOf(card.rank) === RANKS.indexOf(top.rank) + 1;
  }
}
