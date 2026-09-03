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
   * D102 (*nit, "get rid of the Play card action on the user hand -
   * that's old kruft"): `['move']`, not the old `['play']`. `'play'`
   * existed as a naming necessity - it was the one verb carrying the
   * public/face-up transform a card gets when it leaves a hand, so
   * `'move'` couldn't be used here. `transferCard` (`state.js`) now
   * applies that transform generically, from the transition rather
   * than from the verb, so the hand's vocabulary is the same one every
   * other pile uses.
   *
   * Still an override rather than inheriting the base list: the base
   * offers `reveal`/`pickup`/`rotate` too, none of which mean anything
   * for a card in your own hand (it is already yours to see, already
   * picked up).
   */
  cardActions() {
    return ['move'];
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
