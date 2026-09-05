/**
 * Shared base for a pile that arrives grouped and STAYS grouped -
 * "push some of that up" (direct user request, found while chasing the
 * token supply's own version of a bug chips already had fixed): a chip
 * tray (D110) and the RtG token supply are the same SHAPE of pile - a
 * flat community stock of small decorative pieces someone reaches into,
 * not a hand and not a deck - and duplicating the grouping/stacking
 * mechanics into a second bespoke class the moment a second such
 * "supply" pile showed up is exactly the copy-paste `ChipPile`'s own
 * fixes never reached.
 *
 * A subclass names ONE thing: `static sortValue(pileable)`, the value
 * everything groups and sorts by (`ChipPile`: `chip.denom`; `TokenPile`:
 * `token.colour`). Everything else - tight stacking spread, arriving
 * pre-sorted, an insert re-sorting instead of merely appending, and
 * stripping a drop's own `layout` hint (the tray's own arrangement is
 * this KIND's business, not the drop point's - see `insertPileable`
 * below) - is identical between the two and lives here exactly once.
 */
import { Pile } from './Pile.js';

/** `PileClass.sortValue` (a real static method lookup, so a subclass's
 * override is picked up correctly) descending, undefined-last. A plain
 * module function rather than a private static method on the class
 * itself - JS static private methods are NOT inherited by subclasses
 * (`Subclass.#method()` throws even when `Subclass extends Base` defines
 * it), so `this.constructor.#sorted(...)` from an instance method would
 * break the moment `ChipPile`/`TokenPile` actually called it. */
function sortedByGroupValue(PileClass, pileables) {
  return pileables.toSorted((a, b) => {
    const av = PileClass.sortValue(a);
    const bv = PileClass.sortValue(b);
    if (av === bv) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return av > bv ? -1 : 1;
  });
}

function stripLayout(cards) {
  return cards.map(({ layout, ...card }) => card);
}

export class GroupedPile extends Pile {
  /** Every subclass renders through `<chip-tray>` - one stack per
   * `sortValue()` group, the same component chips established (D110).
   * Not chip-specific despite the tag name (kept to avoid an unrelated
   * rename sweep across style.css's `.chip-tray`/`.chip-stack` classes)
   * - `ChipTrayElement` groups by whatever `PILE_TYPES[pile.kind]`
   * itself defines, never by a hardcoded field. */
  static component = 'chip-tray';

  /** Tighter stacking than a card fan may go (`Pile.maxSpread`, 0.85) -
   * a grouped supply reads by its TOP piece plus the coloured/valued
   * edges below it, the same reasoning `ChipPile` originally gave this
   * exact value. Calibrated so a step down the stack equals
   * `--stack-step` (style.css), matching the deck's own depth-layer
   * angle - "one perspective for every stack" (D113), not one chips
   * happened to get and everything else missed. */
  static defaultSpread = 0.963;
  static maxSpread = 0.97;

  /** The value a pileable groups and sorts by. The base class has none
   * of its own - a subclass MUST name one, the same "opts in" shape
   * `convertibleKinds` documents on `Pile` itself. Returning `undefined`
   * for every pileable is a valid (if degenerate) implementation: it
   * still groups everything into one bucket, just not usefully. */
  static sortValue() {}

  /** A tray arrives sorted, not in shuffled/declared stock order - the
   * same fix `ChipPile` needed once a real stocked tray (D81) arrived
   * grouped only AFTER the first manual insert. */
  static stock(pileables) {
    return sortedByGroupValue(this, pileables);
  }

  /**
   * Delegates to the base insert first (identical placement/authorization
   * handling for every pile kind), then re-sorts by `sortValue` and
   * strips whatever `layout` the drop carried - a drop's stack/overlap
   * intent (US-32/33) is a CARD-pile concept; a grouped tray's own
   * arrangement, by group, is what actually decides position here, so
   * respecting the drop's `layout` would fight it (found live: a
   * dropped chip landed out of line with the stack it joined, and
   * shifted the whole column when it landed first in one).
   */
  insertPileable(pileable, placement = {}) {
    const inserted = super.insertPileable(pileable, placement);
    return { ...inserted, cards: stripLayout(sortedByGroupValue(this.constructor, inserted.cards)) };
  }
}
