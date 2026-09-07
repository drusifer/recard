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

  /** *nit (direct user request): "add tighter/looser actions to the
   * battlefield pile" - offered by the base class already (D21/US-32),
   * this override just wasn't including them. `split`/`take` stay
   * excluded (this class's own doc comment above explains why - a
   * battlefield isn't a stack of interchangeable cards); tighten/loosen
   * has nothing to do with that, it adjusts overlap density, which a
   * battlefield's cards have exactly as much as any other pile's. */
  pileActions({ isOwner, isShared } = {}) {
    if (!isOwner && !isShared) return [];
    return ['untapAll', 'changePileType', 'remove', 'tighten', 'loosen'];
  }

  /** `remove`/`changePileType` stay empty-only, `untapAll` is never
   * disabled (untapping an empty board is a harmless no-op, and
   * greying it out mid-game would just read as broken), and
   * tighten/loosen disable at the spread ceiling/floor exactly like
   * every other pile - all of which is just the base class's own
   * `disabledActions`, unchanged. The override that used to live here
   * predated tighten/loosen and only ever duplicated the `remove` half
   * of it under a narrower signature (no `spread`) - deleted rather
   * than kept in sync by hand. */
}
