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
 * stamping every pileable with the stack it belongs to (D129)
 * instead of respecting a drop's own hint (the tray's own arrangement
 * is this KIND's business, not the drop point's - see `insertPileable`
 * below) - is identical between the two and lives here exactly once.
 */
import { Pile } from './Pile.js';
import { VERTICAL } from '../pileables/Stackable.js';

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

/**
 * Stamp each pileable with the STACK it belongs to (D129) - its group
 * value, which for a tray is exactly what a stack is: one column per
 * denomination/colour.
 *
 * This REPLACES the old `withColumnLayout`, which stamped a per-card
 * `layout: 'column'` flag on every card whose group matched the one
 * immediately before it. That flag could only ever say "overlap onto
 * whoever precedes me", and everything wrong with it followed from
 * that relative phrasing: it had to be recomputed from scratch on
 * every insert, it went stale the moment a predecessor moved or left
 * (`Pile.removePileable` still carries a dedicated strip for exactly
 * that), and the first card of each group deliberately carried NO
 * flag, so a stack of one was not represented at all.
 *
 * Membership names the stack itself, so none of that applies: it
 * survives a reorder untouched, and the first pileable of a group is
 * IN its stack rather than outside it - which is what lets a second
 * one join. `layout` is stripped rather than left beside it; there is
 * one way a tray's arrangement is described, not two.
 */
function withStackIds(PileClass, pileables) {
  return pileables.map((pileable) => {
    const { layout: _layout, ...rest } = pileable;
    return { ...rest, stackId: PileClass.sortValue(pileable) };
  });
}

export class GroupedPile extends Pile {
  /** Every subclass renders through `<chip-tray>` - one stack per
   * `sortValue()` group, the same component chips established (D110).
   * Not chip-specific despite the tag name (kept to avoid an unrelated
   * rename sweep across style.css's `.chip-tray`/`.chip-stack` classes)
   * - `ChipTrayElement` groups by whatever `PILE_TYPES[pile.kind]`
   * itself defines, never by a hardcoded field. */
  static component = 'chip-tray';

  /** A tray is COLUMNS of stacked pieces, so its stacks run vertically
   * (D129) - overridden once here for every grouped kind (chips,
   * tokens, lands) rather than restated by each subclass. */
  static stackDirection = VERTICAL;

  /** Tighter stacking than a card fan may go (`Pile.maxSpread`, 0.85) -
   * a grouped supply reads by its TOP piece plus the coloured/valued
   * edges below it, the same reasoning `ChipPile` originally gave this
   * exact value. Calibrated so a step down the stack equals
   * `--stack-step` (style.css), matching the deck's own depth-layer
   * angle - "one perspective for every stack" (D113), not one chips
   * happened to get and everything else missed. */
  static defaultSpread = 0.963;
  static maxSpread = 0.97;

  /** Which way a column grows from its own top-aligned/bottom-aligned
   * tray edge. `false` (the default: chips, tokens) grows UPWARD from
   * the tray's bottom edge, like a real stack of chips sitting on a
   * table. *nit (direct user request, "align cascades to the top"):
   * `LandsPile` overrides this `true` - a cascade of lands reads top-
   * down (the first card at the top, later ones cascading below it),
   * matching the SAME downward "column" layout `BattlefieldPile`'s own
   * drop-target already builds elsewhere, not the chip tray's own
   * physical-stack metaphor. `<chip-tray>` (ChipTray.js) is the only
   * reader. */
  static stacksDownward = false;

  /** The value a pileable groups and sorts by. The base class has none
   * of its own - a subclass MUST name one, the same "opts in" shape
   * `convertibleKinds` documents on `Pile` itself. Returning `undefined`
   * for every pileable is a valid (if degenerate) implementation: it
   * still groups everything into one bucket, just not usefully. */
  static sortValue() {}

  /** A tray arrives sorted (and already carrying its own overlap
   * layout - `withColumnLayout`) - the same fix `ChipPile` needed once
   * a real stocked tray (D81) arrived grouped only AFTER the first
   * manual insert. */
  static stock(pileables) {
    return withStackIds(this, sortedByGroupValue(this, pileables));
  }

  /**
   * Delegates to the base insert first (identical placement/authorization
   * handling for every pile kind), then re-sorts by `sortValue` and
   * reassigns stack membership (`withStackIds`) - a
   * drop's own stack/overlap intent (US-32/33) is a CARD-pile concept;
   * a grouped tray's own arrangement, by group, is what actually
   * decides position here, so respecting the drop's `layout` would
   * fight it (found live: a dropped chip landed out of line with the
   * stack it joined, and shifted the whole column when it landed first
   * in one).
   */
  insertPileable(pileable, placement = {}) {
    const inserted = super.insertPileable(pileable, placement);
    return {
      ...inserted,
      cards: withStackIds(this.constructor, sortedByGroupValue(this.constructor, inserted.cards)),
      // D129: a grouped tray's stacks ALL run the kind's own direction,
      // so the drop's direction hint is discarded exactly as its
      // membership hint already is - "organize by group" IS the
      // placement here. Without this, dropping a card onto one already
      // in a column recorded that column as horizontal (the base class
      // faithfully honouring a hint this pile kind does not take), and
      // a lands cascade laid itself out sideways while every model
      // test that inserted without a placement still passed.
      stacks: this.stacks,
    };
  }
}
