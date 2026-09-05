/**
 * A playing card (D107). The only Pileable subtype that predates the
 * hierarchy, and the reason `type` and `face` are two separate axes:
 * `type` is what a thing IS, `face` is how a CARD prints. A standard
 * card and a Recard-the-Gathering card are the same kind of object
 * rendering different content, which is exactly what `CARD_FACES` (D76)
 * already encodes - so this class delegates to it rather than absorbing
 * it. That delegation is what makes it structurally impossible for this
 * sprint to change how any existing card looks.
 */
import { Pileable } from './Pileable.js';
import { faceFor } from '../cards/cardFaces.js';

export class CardPileable extends Pileable {
  /** Rank and suit are the two orderings a standard deck of cards has.
   * A pile offers these because of what it HOLDS, not because it is a
   * hand - `HandPile` used to hardcode both (US-104). Kept as the
   * static DEFAULT (used directly by `sortActionsFor`'s fallback, and
   * by anything inspecting the class rather than a record) - the
   * INSTANCE getter below is what actually varies it per record. */
  static sortActions = ['sortRank', 'sortSuit'];

  /**
   * US-113 (direct user request: "rtg hand sorting should be by color
   * and card type not suite and rank") - an RtG card has neither `rank`
   * nor `suit` at all, so the standard sorts above are a no-op for one
   * (SORT_PILE's own "-1 either side" tie, `state.js`). This class
   * serves BOTH standard and RtG cards (same reasoning `faceModule()`
   * above already documents), distinguished only at the RECORD level by
   * `this.face` - so the override has to live on the INSTANCE, not the
   * static field every other Pileable subclass still uses directly.
   */
  get sortActions() {
    return this.face === 'rtg' ? ['sortColor', 'sortCardType'] : CardPileable.sortActions;
  }

  /** This card's face module (`CARD_FACES`).
   *
   * NOT called `face()`. A Pileable is a VIEW over its record, so every
   * record field is an own property on the instance - and a card's
   * `face` field ('rtg') would shadow a `face()` method, making it a
   * string at exactly the moment it's called. Any method added to a
   * Pileable subclass has to avoid colliding with a record field for
   * the same reason: `id`, `type`, `rank`, `suit`, `face`, `faceUp`,
   * `owner`, `layout`, `orientation`. Found by Phase 97's test run. */
  faceModule() {
    return faceFor(this);
  }

  className() {
    return this.faceModule().className?.(this) ?? '';
  }

  render(element) {
    this.faceModule().render(element, this);
  }
}
