/**
 * The default pile for tokens (US-112, direct user request: "token
 * piles have a lot of the same issues as the CardPiles did... let's
 * push some of that up so TokenPiles are more playable" - and the
 * follow-up *nit, "instead of a stack it can be just a pile").
 *
 * Before this class existed, RtG's Tokens supply was declared
 * `kind: 'plain'` and had no `homePileKind` to return to, so a token
 * dropped on empty zone space spawned a brand-new pile beside the real
 * supply on every near-miss: the EXACT bug `ChipPile`/D110 already
 * fixed for chips, simply never applied here. Confirmed live before
 * fixing: dropping a token on empty space took the table's pile count
 * from 21 to 22.
 *
 * A dedicated `token` kind still exists for exactly one reason:
 * `TokenPileable.homePileKind = 'token'` needs a REAL pile kind of that
 * name to find and rejoin - that's the actual bug fix, and it lives on
 * the Pileable, not here. The grouped-by-colour stacking `GroupedPile`
 * gave this class initially (mirroring `ChipPile`) was reverted by
 * direct user correction: a token supply reads fine as an ordinary
 * pile, and didn't need the extra visual machinery. This class is
 * therefore `Pile`, plain and unmodified in every way but its own
 * action list.
 */
import { Pile } from './Pile.js';
import { sortActionsFor } from '../pileables/pileableTypes.js';

export class TokenPile extends Pile {
  pileActions({ isOwner, isShared, cards = [] } = {}) {
    if (!isOwner && !isShared) return [];
    // No `break` (that's a CHIP-specific, denomination concept) and no
    // `changePileType` (same "no false affordance" reasoning `ChipPile`
    // already applies - a token pile converting to a Foundation or a
    // Discard is a meaningless operation, not a real choice a host
    // would make).
    return ['take', 'split', 'remove', 'tighten', 'loosen', ...sortActionsFor(cards)];
  }
}
