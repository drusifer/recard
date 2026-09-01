/**
 * A hand pile, from the perspective of its own owner. A render/
 * authorization-time class choice (`pileTypes.js`'s `pileInstanceFor`),
 * not a second entry in the state-side `PILE_TYPES` registry - a pile's
 * `kind` never changes based on who's looking at it, it's still
 * `'hand'` either way. Sibling of `OpponentHandPile`, not a special
 * case layered on top of it - direct user correction: "make PlayerHand
 * and OpponentHand as separate classes to encapsulate the visibility
 * differences" (previously one `HandPile` branched internally on
 * `this.ownerId === viewerId`).
 */
import { HandPile } from './HandPile.js';

export class PlayerHandPile extends HandPile {
  /**
   * The owner always sees their own cards to play them.
   */
  showsFace() {
    return true;
  }

  /**
   * The owner gets `['play']`, not `['move']` - a naming necessity:
   * `transferCard`'s own authorization for `PLAY` checks
   * `canRemoveCard(pile, card, viewerId, 'play')`, which reuses THIS
   * list, and the base `Pile` never produces the string `'play'` (its
   * own vocabulary is reveal/pickup/move/rotate) - inheriting it would
   * silently break every play from hand. `'play'` is also the ONLY verb
   * that carries PLAY's own public-visibility transform (`{owner: null,
   * faceUp: true}` on a real play).
   */
  cardActions() {
    return ['play'];
  }

  /**
   * D94: the one real difference left between `viewFor`'s old "hidden"/
   * "in-hand"/"mixed" branches, once `Pile.getView()` made the other two
   * identical - a hand ALSO feeds `view.myHand` (the owner's own, full
   * cards - still real, full cards are in `view.piles` too since D84,
   * this is a convenience tally existing consumers already read).
   */
  contributeToView(view, viewerId) {
    super.contributeToView(view, viewerId);
    view.myHand = this.cards;
  }
}
