/**
 * The Hand pile type (D56 - real subclass, was `handPile.js`'s flat
 * module).
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

  /**
   * *nit (direct user request, reversed AGAIN): "fully permissive drag
   * and drop for all cards and piles... remove the older restrictions
   * from ALL pile and zone types... [including hand]." A non-owner used
   * to get `[]` here (nothing offered on someone else's hand card at
   * all); now gets `['move']` - `MOVE_CARD` (`state.js`) finds a card by
   * id across every pile generically (`findPileAndCard`, not a fixed
   * source), so this genuinely works: any player can now drag a card
   * straight out of anyone else's hand.
   *
   * The owner still gets `['play']`, not `['move']` - not a remaining
   * restriction, a naming necessity: `transferCard`'s own authorization
   * for `PLAY` checks `canRemoveCard(pile, card, viewerId, 'play')`,
   * which reuses THIS list, and the base `Pile` never produces the
   * string `'play'` (its own vocabulary is reveal/pickup/move/rotate) -
   * inheriting it would silently break every play from hand. `'play'`
   * is also the ONLY verb that carries PLAY's own public-visibility
   * transform (`{owner: null, faceUp: true}` on a real play) - a
   * non-owner dragging someone else's card away is a plain `move`
   * instead, which leaves `faceUp`/`owner` as `toHandCard` set them
   * (still real GAME-STATE fields - see `Pile.cardActions`'s own
   * comment on `redactCard` being gone; this is not a privacy switch
   * any more, whoever holds the card can already be seen by everyone).
   */
  static cardActions(pile, card, viewerId) {
    return pile.ownerId === viewerId ? ['play'] : ['move'];
  }

  /** Sorting on someone else's behalf has never been possible and
   * isn't now either. `changePileType` (D87, *nit "all pile types must
   * be convertible to any other pile type"): a hand is no longer
   * exempt from the picker - owner-gated, matching sort's own rule,
   * since it's the pile's own presentation choice to make. */
  static pileActions({ isOwner } = {}) {
    return isOwner ? ['sortRank', 'sortSuit', 'changePileType'] : [];
  }
}
