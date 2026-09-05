/**
 * The default pile for tokens (US-112, direct user request: "token
 * piles have a lot of the same issues as the CardPiles did... let's
 * push some of that up so TokenPiles are more playable").
 *
 * Before this class existed, RtG's Tokens supply was declared
 * `kind: 'plain'` - the generic base `Pile` every ordinary card zone
 * also uses - so it rendered as one overlapping row (a token supply
 * read like a fanned hand of cards, not a tray of pieces) and had no
 * `homePileKind` to return to, so a token dropped on empty zone space
 * spawned a brand-new pile beside the real supply on every near-miss:
 * the EXACT bug `ChipPile`/D110 already fixed for chips, simply never
 * applied here. Confirmed live before fixing: dropping a token on empty
 * space took the table's pile count from 21 to 22.
 *
 * `GroupedPile` is what both fixes actually needed - grouped-by-key
 * stacking and a real home to return to - so this class exists to NAME
 * the one thing tokens differ on (colour, not denomination) rather than
 * duplicate `ChipPile`'s mechanics a second time.
 */
import { GroupedPile } from './GroupedPile.js';
import { sortActionsFor } from '../pileables/pileableTypes.js';

export class TokenPile extends GroupedPile {
  /** A token's group/sort key is its colour - there is no magnitude to
   * order by (US-102/D107: a token's colour is a label, not a rank),
   * so any consistent value groups same-colour tokens together, which
   * is the entire ask ("should read as N distinct colour groups", per
   * Smith's original *user test finding on the ungrouped supply). */
  static sortValue(token) {
    return token.colour ?? '';
  }

  pileActions({ isOwner, isShared, cards = [] } = {}) {
    if (!isOwner && !isShared) return [];
    // No `break` (that's a CHIP-specific, denomination concept) and no
    // `changePileType` (same "no false affordance" reasoning `ChipPile`
    // already applies - a token tray converting to a Foundation or a
    // Discard is a meaningless operation, not a real choice a host
    // would make).
    return ['take', 'split', 'remove', 'tighten', 'loosen', ...sortActionsFor(cards)];
  }
}
