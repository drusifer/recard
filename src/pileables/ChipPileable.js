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

/**
 * Denomination by colour, in the conventional casino order.
 *
 * This REVERSES this sprint's own earlier ruling that a chip carries no
 * value (direct user instruction: chips "should be stacked by denom and
 * have actions for braking large denom to smaller denom"). Breaking a
 * denomination is meaningless without one, so the "colour is a label,
 * not a rank" reasoning that gave `sortActions` its empty list no longer
 * holds - and `sortActions` changes with it rather than being left
 * inconsistent.
 */
export const CHIP_VALUES = { white: 1, red: 5, blue: 10, green: 25, black: 100 };

/**
 * Every denomination, ascending - the ladder `BREAK_CHIP` walks down.
 */
export const CHIP_DENOMINATIONS = Object.values(CHIP_VALUES).toSorted((a, b) => a - b);

/** The colour a denomination is printed on, for chips made by breaking
 * a bigger one. The inverse of `CHIP_VALUES`, derived rather than kept
 * as a second table that could drift out of step with it. */
export const COLOUR_FOR_VALUE = Object.fromEntries(
  Object.entries(CHIP_VALUES).map(([colour, value]) => [value, colour]),
);

/**
 * The largest denomination SMALLER than `denom` that divides it evenly -
 * what breaking a chip yields. A 25 breaks into five 5s, not two and a
 * half 10s; a 100 breaks into four 25s. `undefined` for the smallest
 * denomination, which cannot be broken at all.
 */
export function breakInto(denom) {
  return CHIP_DENOMINATIONS.findLast((value) => value < denom && denom % value === 0);
}

export class ChipPileable extends Pileable {
  /** A denomination is a real ordering, so a chip pile sorts by it.
   * This was `[]` while chips carried no value - the empty list was a
   * consequence of that ruling, not an independent decision, so it
   * changes with it. */
  static sortActions = ['sortDenom'];

  /**
   * A chip belongs in a chip tray - see `Pileable.homePileKind`.
   */
  static homePileKind = 'chip';

  /**
   * A reset redeals the cards; it does not take your money.
   */
  static survivesReset = true;

  className() {
    return this.colour ? `card-chip chip-${this.colour}` : 'card-chip';
  }

  /**
   * A chip prints its DENOMINATION. It rendered nothing while chips
   * carried no value - colour alone identified them - but a tray sorted
   * by value that doesn't show the values is unreadable, and "make
   * change" is unverifiable without them.
   *
   * CENTRED, with a `$` (direct user request). The value sat top-left
   * while chips were laid out in a row, so a covered chip still showed
   * its number. In a real STACK only the top chip is readable anyway -
   * which is how a physical stack works - so the centre is both what
   * was asked for and what now reads correctly.
   */
  render(element) {
    if (this.denom === undefined) return;
    const value = document.createElement('span');
    value.className = 'chip-denom';
    value.textContent = `$${this.denom}`;
    element.append(value);
  }
}
