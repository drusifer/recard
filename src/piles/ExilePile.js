/**
 * The Exile pile type (D79, US-82).
 *
 * Public: a card sent here is visible to everyone. So it inherits
 * `DiscardPile`'s "stack" shape - the two really are the same
 * mechanism - but deliberately drops `take` (a discard pile can
 * legitimately be scooped back up in many games; exile isn't offered
 * that particular bulk CONVENIENCE).
 *
 * *nit (direct user request, reversed): used to also override
 * `pileableActions` to `[]` ("exile is one-way, by definition"), on top of
 * dropping `take` - a real, repeated user correction: this app is a
 * table simulator, not a rules engine (`docs/ARCHITECTURE.md`'s "Core
 * invariant") - drag-and-drop is ALWAYS available on ANY card, no
 * pile-type override may remove it, "one-way" included. Not overridden
 * here any more - a card in exile gets the same base `Pile`
 * reveal/pickup/move/rotate rule (privacy-filtered, D7) as any other.
 *
 * Kept as its own kind rather than reusing `discard` because a player
 * must be able to tell at a glance which of the two a pile is; they have
 * different meanings even where they share behaviour.
 */
import { DiscardPile } from './DiscardPile.js';

export class ExilePile extends DiscardPile {
  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['changePileType', 'remove'];
  }
}
