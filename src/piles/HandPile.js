/**
 * The Hand pile type (D56 - real subclass, was `handPile.js`'s flat
 * module). Abstract-ish shared base only now - direct user correction:
 * "I don't like the special ownership property for hand... make
 * PlayerHand and OpponentHand as separate classes to encapsulate the
 * visibility differences." Every viewer-perspective behavior (which
 * actions a card offers, whether faces show, what a hand contributes to
 * a view) used to live here as one class branching internally on
 * `this.ownerId === viewerId` - that branch is gone. `OpponentHandPile`
 * (the concrete `PILE_TYPES.hand` default) and `PlayerHandPile` (picked
 * instead by `pileInstanceFor` for the owner) are real siblings now,
 * each a full, unconditional implementation of its own perspective - no
 * pile method anywhere still asks "is this mine?".
 *
 * *nit (direct user request): "a hand is just a regular pile with a fan
 * lay... besides that rendering difference it should behave exactly the
 * same as all other piles." A hand card carries the SAME real per-card
 * `{owner, faceUp}` any pile's does (`state.js`'s `toHandCard` -
 * `owner: <hand's own player>, faceUp: false`, stamped on every card
 * the moment it ENTERS a hand: DEAL/DRAW/PICKUP/TAKE_PILE/PICKUP_SPLIT/
 * a plain MOVE_CARD, via `transferCard`'s own generic hand-stamping),
 * so `canAccept`/`resolveDropTarget`/`insertCard` are all inherited
 * from the base `Pile`, unmodified - no hand-specific logic left there.
 * `redactCard` isn't in that list any more for a bigger reason than
 * hand alone: it's gone entirely, everywhere (D84, "remove card
 * redaction entirely... TOTAL PERMISSIVE" - every viewer sees every
 * card's real identity, always, hands included).
 */
import { Pile } from './Pile.js';

export class HandPile extends Pile {
  static visibility = 'in-hand';
  static component = 'fan-pile';
  // A hand IS tableSide (D51: it renders at its owner's seat through
  // the same generic <zone-panel> machinery every other table-side pile
  // uses, and must appear in pilesOf()/view.piles for that). It is
  // still never a generic PLAY/MOVE_CARD drop DESTINATION - that's a
  // separate rule, `pileActions.js`'s `targetsForAction` explicitly
  // excludes `kind === 'hand'` regardless of this flag.
  static tableSide = true;
  static reparentable = false;

  /** Sorting/converting on someone else's behalf has never been possible
   * and isn't now either. This one stays here, shared, rather than
   * splitting into the two subclasses below: unlike `cardActions`/
   * `showsFace`/`contributeToView` (which used to compute `this.ownerId
   * === viewerId` themselves), `pileActions` has always taken a plain
   * `{isOwner}` CONTEXT flag pre-computed by the caller - the exact same
   * contract every other pile kind's `pileActions` already uses
   * (`Pile`/`DeckPile`/`ExilePile`). That's not the "special ownership
   * property" pattern the split above exists to remove; it's the
   * ordinary, codebase-wide one. It also has to stay ctx-driven for a
   * structural reason: `pileLevelActions` (`pileActions.js`), the one
   * caller that has no real pile/viewerId in scope (the pre-game deck
   * preview), can only ever construct the registry's default class
   * (`OpponentHandPile`) via a bare `kind` string - it has no ownerId to
   * compare, so the answer has to come from the ctx flag, not from which
   * subclass got picked. `changePileType` (D87, *nit "all pile types
   * must be convertible to any other pile type"): a hand is no longer
   * exempt from the picker - owner-gated, matching sort's own rule. */
  pileActions({ isOwner } = {}) {
    return isOwner ? ['sortRank', 'sortSuit', 'changePileType'] : [];
  }
}
