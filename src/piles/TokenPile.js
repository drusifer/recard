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
 * action list and its own default stack style.
 *
 * US-147 (direct user request): a JUMBLE default - tokens scatter into
 * a disordered pile rather than lining up in `Pile`'s own base
 * HORIZONTAL row. A supply of tokens reads as a loose heap someone
 * reaches into, not a fanned or stacked collection - the same "supply,
 * not a hand or a deck" framing `GroupedPile`'s own docstring gives
 * chips/lands, just a different shape for a kind that (per the
 * reversion above) isn't grouped at all.
 */
import { Pile } from './Pile.js';
import { sortActionsFor } from '../pileables/pileableTypes.js';
import { JUMBLE } from '../pileables/Stackable.js';

export class TokenPile extends Pile {
  static stackStyle = JUMBLE;

  // `Pile.defaultSpread` is 0 - every OTHER style reads that as "fully
  // collapsed," a sensible rest state you Tighten/Loosen away from. For
  // jumble specifically that reads as ONE token with 15 more perfectly
  // hidden under it (found live: a fresh supply looked like a single
  // token until spread was manually raised) - the opposite of "a
  // disordered pile" as an out-of-the-box look, which is the entire
  // point of the style. A real default scatter, not a manual step the
  // host has to discover, is what the user actually asked for.
  static defaultSpread = 0.6;

  pileActions({ cards = [] } = {}) {
    // No `break` (that's a CHIP-specific, denomination concept) and no
    // `changePileType` (same "no false affordance" reasoning `ChipPile`
    // already applies - a token pile converting to a Foundation or a
    // Discard is a meaningless operation, not a real choice a host
    // would make).
    return ['take', 'split', 'remove', 'spread', ...sortActionsFor(cards)];
  }
}
