/**
 * The Exile pile type (D79, US-82).
 *
 * Exile is one-way and public: a card sent here is out of the game and
 * everyone can see it. So it inherits `DiscardPile`'s "stack, drop-only,
 * no card actions" shape - the two really are the same mechanism - but
 * deliberately drops `take`: a discard pile can legitimately be scooped
 * back up in many games, and exile, by definition, cannot.
 *
 * Kept as its own kind rather than reusing `discard` because a player
 * must be able to tell at a glance which of the two a pile is; they have
 * different meanings even where they share behaviour.
 */
import { DiscardPile } from './DiscardPile.js';

export class ExilePile extends DiscardPile {
  static pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['changePileType', 'remove'];
  }
}
