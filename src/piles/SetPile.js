/**
 * SetPile (D56, placeholder - NOT wired into `pileTypes.js`, no `kind`
 * maps to it). Documented slot in the Meld hierarchy for a future
 * Rummy-style same-rank/distinct-suit meld - deliberately not
 * implemented speculatively (this project's standing "don't build for
 * hypothetical requirements" discipline). Whoever picks up the real
 * feature request implements `canAccept` here and adds a registry
 * entry; nothing else in the codebase references this class yet.
 */
import { MeldPile } from './MeldPile.js';

export class SetPile extends MeldPile {
  // static canAccept(pile, card) { ... } - not yet defined.
}
