/**
 * The Battlefield pile type (D79, US-82) — where permanents live.
 *
 * Genuinely different from the base `Pile`, not a rename (the standing
 * Zone/Pile-separation discipline applies to pile kinds too):
 *
 * - **No `split`/`take`.** Every other pile is a stack of interchangeable
 *   cards you can cut or scoop. A battlefield is a set of distinct game
 *   objects, each with its own tapped state and attachments — scooping
 *   it is not a move anyone makes.
 * - **`untapAll`.** The untap step is the single most frequent action in
 *   a real game, and doing it one card at a time across a wide board is
 *   the kind of tedium a simulator exists to remove.
 * - Cards stay individually addressable: `rotate` (= tapping) is the
 *   primary interaction here, so the base card actions are kept.
 */
import { Pile } from './Pile.js';

export class BattlefieldPile extends Pile {
  /** Permanents spread rather than stack, so a drop lands beside its
   * neighbours (base `Pile` halo behaviour) - inherited deliberately. */

  static pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['untapAll', 'changePileType', 'remove'];
  }

  /** `remove`/`changePileType` stay empty-only (inherited); `untapAll`
   * is never disabled - untapping an empty board is a harmless no-op,
   * and greying it out mid-game would just read as broken. */
  static disabledActions(count) {
    return count > 0 ? ['remove'] : [];
  }
}
