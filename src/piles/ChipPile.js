/**
 * The default pile for chips (*fix, direct user request: "we need a good
 * default piletype for chips they should be stacked by denom and have
 * actions for braking large denom to smaller denom").
 *
 * Chips were sitting in `plain` piles, which lay them out in arrival
 * order - so a tray drifted into a meaningless jumble the moment anyone
 * moved a chip. A real tray is sorted by denomination and stays that
 * way without anyone tidying it, which is what `insertPileable` below
 * does.
 *
 * NOT a rules engine, and not restrictive: `canAccept` is inherited
 * unchanged, so a card dragged onto a chip tray still lands there. The
 * Core invariant ("fully permissive drag and drop... no matter what")
 * outranks tidiness, and a pile that rejected things would be the first
 * in the codebase to do so for presentation reasons.
 */
import { Pile } from './Pile.js';
import { breakInto } from '../pileables/ChipPileable.js';
import { sortActionsFor } from '../pileables/pileableTypes.js';

export class ChipPile extends Pile {
  /** `<chip-tray>` (`src/components/ChipTray.js`), not the default flat
   * row: a tray shows one STACK per denomination. Direct user
   * correction - "stacked chips should be in separate piles by
   * denomination... an overlapping row doesn't make sense with chips". */
  static component = 'chip-tray';

  /** A tray is stacked, not laid out flat - the same lesson Smith's
   * `*user test` produced on the first chips preset, made the default
   * for the kind instead of a per-preset declaration. The exact value is
   * calibrated so a chip's step down the stack equals `--stack-step`
   * (style.css) - the same offset the deck's depth layers use, which is
   * what "same perspective" means in practice rather than in intent.
   * Deliberately inside
   * the adjustable range rather than at `MAX_SPREAD`: starting at the
   * ceiling leaves Tighten permanently disabled, which reads as a broken
   * control rather than a tray that is already as tight as it goes. */
  static defaultSpread = 0.963;

  /** Tighter than a card fan may go - see `Pile.maxSpread`. A chip
   * stack reads by its top chip and the coloured edges below it. */
  static maxSpread = 0.97;

  /**
   * The tray's total VALUE, not its chip count (*nit, direct user
   * request). A non-chip that landed here contributes nothing - a tray
   * accepts anything (the Core invariant), so that case is real rather
   * than defensive.
   */
  static badge(pile) {
    return pile.cards.reduce((total, chip) => total + (chip.denom ?? 0), 0);
  }

  /** A tray arrives sorted, highest value first - the same order
   * `insertPileable` maintains from then on. Without this the initial
   * stock kept its shuffled deck order and only later additions were
   * placed, so the invariant was true of everything except what a
   * player first sees. */
  static stock(pileables) {
    return pileables.toSorted((a, b) => (b.denom ?? 0) - (a.denom ?? 0));
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

  /**
   * A chip joins its OWN denomination group, highest first - the tray is
   * sorted by construction and never needs tidying.
   *
   * Delegates to the base insert FIRST and re-sorts, rather than doing
   * its own splice. The first version ignored `placement` entirely,
   * which silently discarded the `layout` a drop carries (US-32/33's
   * stack-vs-overlap mode) - so a chip could never be stacked, which is
   * exactly what the user reported. Everything `placement` means is the
   * base class's business; the only thing this kind adds is the
   * ordering, and `toSorted` is stable so chips of equal value keep the
   * position the base gave them.
   */
  insertPileable(pileable, placement = {}) {
    const inserted = super.insertPileable(pileable, placement);
    return {
      ...inserted,
      cards: inserted.cards
        // *nit ("dropped chips are not aligned on the piles?"): the
        // per-card `layout` a drop carries (US-32/33 stack/overlap)
        // brings its own margins, so a dropped chip sat out of line with
        // the stack it joined - and shifted the entire column sideways
        // when it landed first in one. A tray's arrangement is this
        // KIND's business, by denomination; the drop point has no say,
        // so the layout is stripped rather than respected.
        //
        // This reverses an earlier fix that made `insertPileable` honour
        // `placement.layout`. That was right while a tray was one flat
        // row and stacking could only come from the drop; `<chip-tray>`
        // stacks natively now, so the same field became noise.
        .map(({ layout, ...chip }) => chip)
        .toSorted((a, b) => (b.denom ?? 0) - (a.denom ?? 0)),
    };
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
