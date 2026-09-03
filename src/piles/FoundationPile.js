/**
 * FoundationPile (D56 - real subclass, was `foundationPile.js`'s flat
 * module). Solitaire's foundation: same-suit, strictly ascending,
 * append-only, starting at Ace. `extends RunPile` - the only rule that
 * differs from a general same-suit run is the empty-pile case (must be
 * an Ace, not "anything"); every other member (`pileableActions`,
 * `canRemove`, `pileActions`, `resolveDropTarget`, `insertPileable`,
 * `redactCard`) is inherited from `RunPile`/`MeldPile`/`Pile` rather
 * than duplicated.
 */
import { RunPile } from './RunPile.js';

export class FoundationPile extends RunPile {
  /** US-56: empty foundation accepts only an Ace; otherwise defers to
   * `RunPile`'s "same suit, next rank" rule. */
  canAccept(card) {
    if (this.cards.length === 0) return card.rank === 'A';
    return super.canAccept(card);
  }
}
