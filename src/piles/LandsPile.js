/**
 * The Lands pile (direct user request: "I want to organize my lands by
 * color, each color stacked vertically, overlapped so it's easy to
 * count/tap/untap. Should we create a pile type for 'lands' or is it
 * easier to add columns to the base pile type?"). Answer, after
 * confirming `BattlefieldPile`'s own flat row can't do "multiple
 * columns side by side" no matter how a card is dropped into it: reuse
 * `GroupedPile` - the exact same shape a chip tray and the token supply
 * already are ("one stack per group value, side by side"), just grouped
 * by colour instead of denomination/colour-of-token, and rendered
 * VERTICALLY (a cascade - column-1997) via that same `<chip-tray>`
 * component's existing `.chip-stack` layout.
 *
 * `insertPileable` (inherited from `GroupedPile`) already re-sorts into
 * the right colour's column and strips whatever `layout` a drop
 * carried - a card always lands in its colour's own column
 * automatically, not wherever it was dropped. That's a deliberate
 * trade-off from the same conversation: the fine stack/column/overlap/
 * adjacent placement built for `BattlefieldPile` doesn't apply here,
 * because "organize by colour" IS the placement.
 */
import { GroupedPile } from './GroupedPile.js';
import { derivedColors, PIP_CLASS } from '../cards/RtgCardFace.js';

/** Colourless (a land with no derivable mana symbol at all) sorts last,
 * same "undefined-last" convention `GroupedPile` already gives every
 * other group - but a real bucket, not literally undefined, so a
 * colourless land still gets its own column instead of vanishing. */
const COLORLESS = 'C';

export class LandsPile extends GroupedPile {
  /** A land's real colour identity (`derivedColors`, RtgCardFace.js) -
   * the FIRST one, same "primary colour" simplification `state.js`'s
   * own SORT_PILE-by-colour already makes for a hand. A genuinely
   * multicolour land groups under its first colour rather than getting
   * a second, rarer bucket - not worth the extra column for how
   * infrequently it comes up. */
  static sortValue(card) {
    return derivedColors(card)[0] ?? COLORLESS;
  }

  /** Same reasoning `BattlefieldPile` already gives: `untapAll` is the
   * one truly frequent action here, and no `take`/`split` - a lands
   * pile is a set of distinct permanents, not a stack of interchangeable
   * cards to scoop or cut. */
  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['untapAll', 'changePileType', 'remove', 'tighten', 'loosen'];
  }

  /**
   * *nit (direct user request): "have it display the total manacount in
   * a cool way, when tapping" - each colour's own column gets a small
   * pip-coloured badge (the SAME colour dot the mana cost/cast-picker
   * already use, `PIP_CLASS`) showing how much of that colour is still
   * available to tap, out of how many lands of that colour exist -
   * live, since it's derived from `orientation` on every render, not a
   * separately-tracked count that could drift.
   *
   * `<chip-tray>` (ChipTray.js) calls this per column if the pile kind
   * defines it - undefined (the `GroupedPile` default) renders no badge
   * at all, so chips/tokens are unaffected.
   *
   * @param {object[]} cards this column's own cards (already grouped).
   * @returns {{text: string, className: string, title: string}}
   */
  static groupBadge(cards) {
    const untapped = cards.filter((card) => card.orientation !== 'landscape').length;
    const colorValue = this.sortValue(cards[0]);
    return {
      text: String(untapped),
      className: PIP_CLASS[colorValue] ?? 'pip-generic',
      title: `${untapped} of ${cards.length} untapped`,
    };
  }
}
