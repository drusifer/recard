/**
 * SetPile (D56 placeholder, implemented D91 - "finish the Meld pile
 * types" direct user request, prompted by trying to meld in a real
 * game of Gin Rummy and finding no way to). A Rummy-style same-rank
 * meld: 3-4 cards sharing a rank, any suit - the complement to
 * `RunPile`'s same-suit sequential rule.
 *
 * Only the rank is checked, not "distinct suit" - a single standard
 * deck can never offer two cards of the same rank AND suit anyway, so
 * that constraint is already structurally guaranteed, not something
 * this pile needs to police. No minimum-count enforcement either, same
 * as `FoundationPile` never requiring a complete run before it's
 * "valid" - this app is a table simulator, not a rules engine (`docs/
 * ARCHITECTURE.md`'s "Core invariant"); a 1 or 2-card set mid-meld is a
 * real, normal intermediate state, not an error.
 */
import { MeldPile } from './MeldPile.js';

export class SetPile extends MeldPile {
  canAccept(card) {
    if (this.cards.length === 0) return true;
    return card.rank === this.cards.at(-1).rank;
  }
}
