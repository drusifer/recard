/**
 * A hand pile, from the perspective of anyone who ISN'T its owner - the
 * `PILE_TYPES.hand` default. `pileInstanceFor` (`pileTypes.js`) only
 * ever picks `PlayerHandPile` instead for the owner themself; every
 * other viewer, and every viewer-agnostic call (`revivePile`), gets
 * this class.
 */
import { HandPile } from './HandPile.js';

export class OpponentHandPile extends HandPile {
  /**
   * *nit (direct user request, reversed AGAIN): "fully permissive drag
   * and drop for all cards and piles... remove the older restrictions
   * from ALL pile and zone types... [including hand]." Used to be `[]`
   * here (nothing offered on someone else's hand card at all); now
   * `['move']` - `MOVE` (`state.js`) finds a card by id across
   * every pile generically (`findPileAndCard`, not a fixed source), so
   * this genuinely works: any player can drag a card straight out of
   * anyone else's hand.
   */
  pileableActions() {
    return ['move'];
  }

  /**
   * A hand's own `faceUp` (`toHandCard`, state.js) stamps "this card
   * entered a hand", never a real table orientation - so the base
   * `Pile`'s default (follow `card.faceUp`) is wrong here regardless.
   * Renders as backs, same as a real opponent's hand.
   */
  showsFace() {
    return false;
  }

  /**
   * D94: everyone but the owner only ever sees a hand's count.
   */
  contributeToView(view, viewerId) {
    super.contributeToView(view, viewerId);
    view.otherHandCounts[this.ownerId] = this.cards.length;
  }
}
