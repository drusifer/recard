/**
 * A chip (D107, US-102). Behaviourally identical to a card in every
 * way - it drags, piles, flips, rotates, targets and splits through the
 * exact same code path, and there is no `pileableType === 'chip'` branch
 * anywhere in `ui.js` or `state.js`. The user was asked directly what a
 * chip does that a card cannot and answered "nothing"; this class exists
 * to make the vocabulary honest, not to add behaviour.
 *
 * `colour` is PRESENTATIONAL ONLY (Smith's Gate 1 condition A). Nothing
 * sums it, compares it or orders it. It exists because a supply of
 * identical discs gives a player no way to tell whether their action did
 * anything - Visibility of System Status, failed at rest rather than on
 * an action - and because a demonstration preset of identical discs
 * reads as broken. `sortActions` staying empty is what enforces that it
 * is a label and not a rank.
 */
import { Pileable } from './Pileable.js';

/** The chip colours a face can render. A palette, not a value scale -
 * the order here means nothing and must not come to mean anything. */
export const CHIP_COLOURS = ['red', 'blue', 'green', 'black', 'white'];

export class ChipPileable extends Pileable {
  /** Nothing to order by: a colour is a label, not a rank (Smith
   * condition B). An arbitrary sort is worse than no sort. */
  static sortActions = [];

  className() {
    return this.colour ? `card-chip chip-${this.colour}` : 'card-chip';
  }

  /** A chip's face is its colour, which the class above already
   * carries, so there is no content to add. Deliberately empty rather
   * than absent - the shell calls this for every Pileable. */
  render() {}
}
