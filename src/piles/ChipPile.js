/**
 * The default pile for chips (*fix, direct user request: "we need a good
 * default piletype for chips they should be stacked by denom and have
 * actions for braking large denom to smaller denom").
 *
 * Chips were sitting in `plain` piles, which lay them out in arrival
 * order - so a tray drifted into a meaningless jumble the moment anyone
 * moved a chip. A real tray is sorted by denomination and stays that
 * way without anyone tidying it - `GroupedPile` (this class's parent)
 * is what actually does that now; this class names only what's truly
 * chip-specific (denomination as the group key, the value badge, the
 * break action).
 *
 * NOT a rules engine, and not restrictive: `canAccept` is inherited
 * unchanged, so a card dragged onto a chip tray still lands there. The
 * Core invariant ("fully permissive drag and drop... no matter what")
 * outranks tidiness, and a pile that rejected things would be the first
 * in the codebase to do so for presentation reasons.
 *
 * `GroupedPile` extraction (US-112, direct user request: "token piles
 * have a lot of the same issues as the CardPiles did - they share a
 * parent class though so let's push some of that up"): the stacking
 * spread, arrive-pre-sorted, and insert-re-sorts-and-strips-layout
 * mechanics used to live here alone. `TokenPile` needed the exact same
 * shape for a different group key (colour, not denomination) - rather
 * than copy-pasting this file a second time (which is exactly how the
 * token supply ended up with NONE of these fixes in the first place),
 * both now extend one shared base.
 */
import { GroupedPile } from './GroupedPile.js';
import { breakInto } from '../pileables/ChipPileable.js';
import { sortActionsFor } from '../pileables/pileableTypes.js';

export class ChipPile extends GroupedPile {
  /** A chip's group/sort key is its denomination, highest first
   * (`GroupedPile`'s comparator sorts descending, `undefined` last). */
  static sortValue(chip) {
    return chip.denom ?? 0;
  }

  /**
   * The tray's total VALUE, not its chip count (*nit, direct user
   * request). A non-chip that landed here contributes nothing - a tray
   * accepts anything (the Core invariant), so that case is real rather
   * than defensive.
   */
  static badge(pile) {
    return pile.cards.reduce((total, chip) => total + (chip.denom ?? 0), 0);
  }

  /**
   * "dont show non-chip piletypes in the menu" - a chip tray offers no
   * conversion to `deck`/`hand`/`foundation`/etc. Only `chip`, which it
   * already is, so `pileActions` below drops `changePileType` entirely
   * rather than showing a menu whose single entry is the status quo.
   *
   * Declared as a class method rather than a `kind` list somewhere
   * central, so a new pile kind decides its own conversions the same way
   * it decides everything else.
   */
  static convertibleKinds() {
    return ['chip'];
  }

  pileActions({ isOwner, isShared, cards = [] } = {}) {
    if (!isOwner && !isShared) return [];
    // `changePileType` is absent, not disabled: there is exactly one
    // kind to convert to and the pile already is it, so the control
    // could never do anything. Same "no false affordance" rule the rest
    // of this class hierarchy follows.
    return ['take', 'split', 'remove', 'break', 'tighten', 'loosen', ...sortActionsFor(cards)];
  }

  disabledActions(count, context = {}) {
    const disabled = super.disabledActions(count, context);
    // Nothing to break if every chip is already the smallest
    // denomination - the button would be a guaranteed no-op.
    const cards = context.cards ?? this.cards;
    if (cards.every((chip) => breakInto(chip.denom) === undefined)) disabled.push('break');
    return disabled;
  }
}
