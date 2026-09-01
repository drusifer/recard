/**
 * The Deck pile type (D56 - real subclass, was `deckPile.js`'s flat
 * module). Nobody sees a deck's cards, only its count; it renders as a
 * visual stack + count badge, never a card row.
 */
import { Pile } from './Pile.js';

export class DeckPile extends Pile {
  static visibility = 'hidden';
  static component = 'deck-stack';
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
   * (only `toHandCard`/PLAY's transform ever set one) - the base
   * `Pile.showsFace` (`card.faceUp !== false`) would read that missing
   * field as "face-up" and show the real card. `visibility: 'hidden'`
   * already says nobody sees a deck's cards; this is what makes the
   * picker (`ui.js`'s `renderSplitPicker`, reused unchanged for a deck
   * via `<deck-stack>` now) actually agree - a deck's fan shows real
   * backs, same silhouette as any other hidden card, never the faces. */
  showsFace() {
    return false;
  }

  /**
  Draw is open to everyone; every other deck action is host-only.
  D91 (direct user request, "add the split pile action to the Deck Pile
  type"): `split` joins the host-only list. No `pickupSplit` here - that
  action doesn't exist at all any more (direct user correction: "there
  is not supposed to be a pickupSplit") - `take` already covers
  "everything into my hand" for any pile, deck included.

  `changePileType` (D87, *nit "all pile types must be convertible to any
  other pile type"): a deck is no longer exempt from the picker -
  host-gated, matching every other deck-management action here.
  */
  pileActions({ isHost } = {}) {
    return isHost ? ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split', 'changePileType'] : ['draw'];
  }

  /** A card moved/put back onto the deck lands on top, matching a
   * physical deck (index 0, unlike the base class's append). */
  insertCard(card) {
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
  cardActions() {
    return ['reveal', 'pickup', 'move', 'rotate'];
  }

  /** `draw` isn't a per-card action `cardActions` lists (it's a
   * pile-level button, `pileActions` above) - DRAW's own authorization
   * (`transferCard`, state.js) still routes through this same check, so
   * it needs an explicit yes here. Everything else defers to the base
   * Pile rule, which now reads the override above. */
  canRemoveCard(card, viewerId, action) {
    return action === 'draw' || super.canRemoveCard(card, viewerId, action);
  }
}
