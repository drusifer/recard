/**
 * The Deck pile type (D56 - real subclass, was `deckPile.js`'s flat
 * module). Nobody sees a deck's cards, only its count; it renders as a
 * visual stack + count badge, never a card row.
 */
import { Pile } from './Pile.js';

export class DeckPile extends Pile {
  static visibility = 'hidden';
  static component = 'deck-stack';
  // A static field is INHERITED BY REFERENCE unless redeclared - without
  // this, `DeckPile.registerActions(...)` (below the class body) would
  // silently mutate `Pile`'s own shared Map instead of getting its own.
  static actions = new Map();
  /**
   * *nit (direct user request): "drag and drop on all piles including
   * Deck and Discard" - reverses Sprint 23's Gate 1 exclusion (D55),
   * which read too cautiously: `deckOf`/`DEAL`/`DRAW`/`SHUFFLE_DECK`/
   * `RESET` all find the deck by its fixed `DECK_PILE_ID`, never by
   * searching zones or reading its `zoneId` - confirmed by grep before
   * flipping this, not assumed. Only `MOVE_PILE` reads this flag
   * (`TAKE_PILE` uses its own hardcoded `zone`/`discard` kind check,
   * unaffected either way; `SPLIT_PILE`/`PICKUP_SPLIT` have no kind
   * check to be affected by any more, see `splitPileAt`'s own comment)
   * - the deck's title bar was already a drag SOURCE (`pileDraggable`
   * is unconditional), so this was a silent drop-then-error, not a
   * missing affordance.
   */
  static reparentable = true;

  /** No halo geometry is reachable for the deck (D29's own strip
   * renders it, never `dropTarget.js`). */
  resolveDropTarget() {
    return {};
  }

  /** Dealing from an empty deck has never made sense - its button is
   * disabled (not hidden - a host should still see it exists) at 0.
   * D91: `split` disabled below 2 cards, same minimum `splitPileAt`
   * (state.js) enforces for every kind. */
  disabledActions(count) {
    return [...(count <= 0 ? ['deal'] : []), ...(count < 2 ? ['split'] : [])];
  }

  /** D94: `count` joins the base view shape - kept for every existing
   * consumer that reads it instead of `cards.length` (D84 already sends
   * the deck's real, full contents to every viewer, so the two numbers
   * are always identical now; this is a compatibility field, not a
   * privacy-era leftover with different meaning). */
  getView() {
    return { ...super.getView(), count: this.cards.length };
  }

  /** D92 (direct user request: "split should always fan the pile to
   * allow the guided picker" - deck included, no instant-shortcut
   * carve-out). A real deck card never carries a `faceUp` field at all
   * (only `toHandCard` and `transferCard`'s leaving-a-hand rule ever
   * set one) - the base
   * `Pile.showsFace` (`card.faceUp !== false`) would read that missing
   * field as "face-up" and show the real card. `visibility: 'hidden'`
   * already says nobody sees a deck's cards; this is what makes the
   * picker (`PileElement`'s split picker, reused unchanged for a deck
   * via `<deck-stack>` now) actually agree - a deck's fan shows real
   * backs, same silhouette as any other hidden card, never the faces. */
  showsFace() {
    return false;
  }

  /**
  *fix (queued 2026-09-10, direct user request: "every player should
  have access to teh deck pile actions" - since generalized to "All
  players have access to all pile actions no matter what"): every deck
  action is now open to every player, host or not - the `isHost` split
  this method used to make is gone, along with the parameter itself.

  D91 (direct user request, "add the split pile action to the Deck Pile
  type"): `split` joins the list. No `pickupSplit` here - that action
  doesn't exist at all any more (direct user correction: "there is not
  supposed to be a pickupSplit") - `take` already covers "everything
  into my hand" for any pile, deck included.

  `changePileType` (D87, *nit "all pile types must be convertible to any
  other pile type"): a deck is no longer exempt from the picker.
  */
  pileActions() {
    // D114 (US-106): `reset` restarts the whole game; `reshuffleDeal`
    // only touches this deck's own cards. Two different consequences,
    // so both stay reachable rather than one silently absorbing the
    // other's job.
    return ['draw', 'deal', 'reshuffleDeal', 'reset', 'shuffle', 'split', 'changePileType'];
  }

  /** A card moved/put back onto the deck lands on top, matching a
   * physical deck (index 0, unlike the base class's append). */
  insertPileable(card) {
    return { ...this.toJSON(), cards: [card, ...this.cards] };
  }

  /** Direct user correction: "it is absolutely permissable to put cards
   * back on the deck and take cards off" - D34's old blanket `[]` struck.
   * `reveal` is unconditional rather than the base rule's `faceUp ===
   * false` check: a real deck card never carries a `faceUp` field at all
   * (same fact `showsFace` above already relies on), so the base
   * condition would never fire for one - a deck card is always
   * effectively hidden at the PILE level (`visibility: 'hidden'`), not
   * via a per-card flag. */
  pileableActions() {
    return ['reveal', 'pickup', 'move', 'rotate'];
  }

  /** `draw` isn't a per-card action `pileableActions` lists (it's a
   * pile-level button, `pileActions` above) - DRAW's own authorization
   * (`transferCard`, state.js) still routes through this same check, so
   * it needs an explicit yes here. Everything else defers to the base
   * Pile rule, which now reads the override above. */
  canRemove(card, viewerId, action) {
    return action === 'draw' || super.canRemove(card, viewerId, action);
  }

  /**
   * US-41/D29: every deck-specific action - the deck's pile anchor is
   * the ONE thing that dispatches these, having absorbed both the
   * legacy strip's deal/reshuffleDeal and the legacy shuffle row.
   * `changePileType`/`split` are not registered here - `Pile.performAction`
   * falls back to the base class's own table for those. A static
   * INITIALIZER block, not a module-top-level call (lint:
   * `unicorn/no-top-level-side-effects`).
   *
   * `deal`/`reshuffleDeal`'s `value` is the count to deal - the CALLER
   * resolves that (what's currently typed into the box, `tableActions.js`)
   * before ever calling `performAction`, same as it always did.
   *
   * `draw`/`shuffle` never throw in practice (`'silent'`); `deal`/
   * `reshuffleDeal`/`reset` validate at the reducer and report beside the
   * deck (`'deckError'`, D-29 UX: "fail the way it already does - a clear
   * message, no partial deal"), not the base class's `'alert'`.
   */
  static {
    this.registerActions({
      draw: (pile) => ({ action: { type: 'DRAW', pileId: pile.id }, guard: 'silent' }),
      shuffle: (pile) => ({ action: { type: 'SHUFFLE_DECK', pileId: pile.id }, guard: 'silent' }),
      reset: () => ({ action: { type: 'RESET' }, guard: 'deckError' }),
      deal: (pile, { value }) => ({ action: { type: 'DEAL_MORE', cardsPerPlayer: value, pileId: pile.id }, guard: 'deckError' }),
      reshuffleDeal: (pile, { value }) => ({ action: { type: 'RESHUFFLE_DEAL', cardsPerPlayer: value, pileId: pile.id }, guard: 'deckError' }),
    });
  }
}
