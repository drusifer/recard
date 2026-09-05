/**
 * A token (D107, US-102). *nit (direct user request): "tokens should
 * look like gems. they don't need denominations" - reverses the
 * original design (a MARKED disc, distinguished by a printed label the
 * way a chip shows its value) in favour of colour alone, same as a chip
 * before "make change" needed a visible value. `colour` is
 * PRESENTATIONAL ONLY (Smith Gate 1 condition A): nothing sums it,
 * compares it or orders it - `sortActions` stays empty, which is what
 * enforces that.
 */
import { Pileable } from './Pileable.js';

export class TokenPileable extends Pileable {
  static sortActions = [];

  /**
   * A reset redeals the cards; a token is not one of them.
   */
  static survivesReset = true;

  /**
   * A token belongs in a token supply - see `Pileable.homePileKind`.
   * Missing until US-112 (found live: dropping a token on empty zone
   * space spawned a brand-new pile instead of rejoining the real
   * supply, the exact chip-duplication bug D110 already fixed - just
   * never applied here, since nothing named a home to return to).
   */
  static homePileKind = 'token';

  className() {
    return this.colour ? `card-token token-${this.colour}` : 'card-token';
  }

  /** A gem is shape and colour alone (style.css) - no printed content,
   * unlike a chip's centred denomination. `render` is still required
   * (the shell calls `pileable.render(element)` unconditionally,
   * `ui.js`) even though there is nothing left to add to the element. */
  render() {}
}
