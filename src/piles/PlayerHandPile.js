/**
 * A hand pile, from the perspective of its own owner. A render-time
 * class choice (`ui.js`'s `pileClassFor`), not a second entry in the
 * state-side `PILE_TYPES` registry - a pile's `kind` never changes
 * based on who's looking at it, it's still `'hand'` either way.
 *
 * `HandPile`'s cards are always `faceUp: false` (`toHandCard`,
 * state.js) regardless of viewer - correct for anyone ELSE looking at
 * this hand (renders as backs, same as a real opponent's hand), wrong
 * for the OWNER, who must always see their own cards to play them.
 */
import { HandPile } from './HandPile.js';

export class PlayerHandPile extends HandPile {
  showsFace() {
    return true;
  }
}
