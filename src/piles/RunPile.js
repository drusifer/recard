/**
 * RunPile (D56, registered as its own `'run'` kind D91) - a same-suit,
 * sequential meld. An empty run accepts any card (it can start
 * anywhere); `FoundationPile` narrows that to "must start at Ace" as
 * the one thing it overrides - the ascending-from-Ace foundation rule
 * IS a same-suit sequential run's special case, not a separate concept,
 * so it extends this rather than duplicating the "same suit, rank+1"
 * check. Was reachable only through `FoundationPile` before D91 - a
 * player can now `changePileType` any pile straight to `'run'` too
 * (a Gin Rummy-style run meld, not just Solitaire's ace-anchored one).
 */
import { MeldPile } from './MeldPile.js';
import { RANKS } from '../decks/standardDeck.js';

export class RunPile extends MeldPile {
  canAccept(card) {
    if (this.cards.length === 0) return true;
    const top = this.cards.at(-1);
    return card.suit === top.suit && RANKS.indexOf(card.rank) === RANKS.indexOf(top.rank) + 1;
  }
}
