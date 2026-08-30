/**
 * The Pile base class (D56) - real derived types: a Pile is cards +
 * behavior, full stop. D90 (direct user request, "the shape is
 * Table->Zone->Pile->Card, KISS, simplify... I don't want any kind of
 * thing that conflates zones and piles"): there is no such thing as a
 * "zone pile" - that word belongs to the Zone entity alone
 * (`state.zones`, `<zone-panel>`). The generic, no-accept-rule, per-card
 * `{owner, faceUp}` pile (`kind: 'plain'`) isn't a distinctly-named
 * subtype either - it IS this base class, concrete and directly usable,
 * not abstract. Every other kind (`DeckPile`, `HandPile`, `DiscardPile`,
 * `CascadePile`, `RankAdjacentPile`, `MeldPile` and its subclasses) is a
 * real specialization that overrides only what differs - real `class X
 * extends Pile`, not a sibling module duplicating the shared rule.
 *
 * `src/piles/pileTypes.js`'s `PILE_TYPES` registry maps a pile's `kind`
 * string to its class; `state.js`/`ui.js`/`pileActions.js` dispatch
 * through `PILE_TYPES[pile.kind]`, calling its STATIC methods
 * (`PILE_TYPES[kind].canRemoveCard(pile, card, viewerId, action)`) -
 * unchanged call shape from the pre-D56 module-registry days, since a
 * class's static members are read exactly the same way a module
 * namespace's exports were. Pile *records* in `state.js` stay plain
 * data objects (`{id, kind, name, ownerId, cards, zoneId}`) - no change
 * to persistence/network serialization.
 *
 * `kind: 'plain'` (D90 - was `'zone'`, the exact conflation this pile
 * type existed to warn against in its own doc comment) is the wire/data
 * string `CREATE_ZONE` falls back to - it maps to this base class in
 * the registry. `SNAPSHOT_VERSION` bumped alongside the rename (D90,
 * no back-compat shim - an old save with a `kind: "zone"` pile on disk
 * is discarded on load, same as any other snapshot-shape break).
 */
import { resolveDropTarget as resolveHaloTarget } from '../dropTarget.js';

function withLayout(card, layout) {
  const { layout: _previous, ...rest } = card;
  return layout ? { ...rest, layout } : rest;
}

/**
 * D55/US-62: `hide`/`show` are mutually exclusive, keyed off the pile's
 * OWN current orientation - offering both at once would ask "hide" of
 * an already-hidden pile (a no-op button) or "show" of an already-shown
 * one. An empty pile offers neither - there's nothing to flip.
 */
function orientationActions(cards = []) {
  if (cards.length === 0) return [];
  return cards.every((c) => c.faceUp === true) ? ['hide'] : ['show'];
}

export class Pile {
  /** Per-card `{owner, faceUp}` visibility - "Open" when every card is
   * face-up, "Mixed" when they differ. The base default; `DeckPile`
   * (hidden) and `HandPile` (in-hand) override it. */
  static visibility = 'mixed';

  /** D45: a legal PLAY/MOVE_CARD destination. True by default - kept
   * overridable so `CREATE_ZONE`'s eligibility guard stays meaningful
   * (`HandPile` overrides it `false`). */
  static tableSide = true;

  /** Which Web Component renders this pile's row - a component renders
   * a render SHAPE, not a 1:1 class mapping, so several classes may
   * legitimately share one tag (D56). */
  static component = 'pile-panel';

  /** D55/US-63: eligible for `MOVE_PILE` (reparenting into a different
   * Zone). True by default (this base class and `DiscardPile`);
   * `HandPile`/`CascadePile`/`RankAdjacentPile`/`MeldPile` override it
   * `false` - each for its own structural reason (a hand's per-player
   * invariant; a cascade/rank-adjacent/meld's fixed role in its own
   * game). *nit fix: this comment used to also claim `SPLIT_PILE`/
   * `TAKE_PILE`/`SET_PILE_ORIENTATION` read this flag - they never did
   * (their own hardcoded `zone`/`discard` kind checks, or `SPLIT_PILE`/
   * `PICKUP_SPLIT`'s `cardActions`-derived eligibility, `state.js`'s
   * `splitPileAt`) - stale, not a real behavior. */
  static reparentable = true;

  /** The only kind with real before/onto/after halo geometry -
   * `dropTarget.js`'s pure math. Every subclass that isn't a plain open
   * pile overrides this to `{}`. */
  static resolveDropTarget(cardBoxes, point) {
    return resolveHaloTarget(cardBoxes, point);
  }

  /** Nothing has ever gated an insert by card content for the base
   * case - unconditional accept. `MeldPile` subclasses are the real
   * content-based callers. */
  static canAccept() {
    return true;
  }

  /**
   * *nit (direct user request): "get rid of can move, it should always
   * return true - fully permissive drag and drop for all cards and
   * piles... no matter what." `pickup`/`move`/`rotate` used to be gated
   * by ownership/visibility - unconditional now, for every viewer, on
   * every card (`docs/ARCHITECTURE.md`'s "Core invariant").
   *
   * `reveal` is the one entry that keeps a condition (`faceUp === false`)
   * - not an authorization restriction, "there is nothing to reveal" on
   * a card that's already face-up. `redactCard` is gone entirely now
   * (a later, separate direct user request, D84: "remove card
   * redaction entirely... TOTAL PERMISSIVE") - `faceUp` is a plain
   * game-state field (was a card dealt/played face-up or down) with no
   * privacy meaning left; every viewer sees every card's real identity
   * regardless of it.
   */
  static cardActions(pile, card) {
    return card.faceUp === false ? ['reveal', 'pickup', 'move', 'rotate'] : ['pickup', 'move', 'rotate'];
  }

  /**
   * D55/US-60/61/62: `take`/`hide`/`show` act on the whole pile, open to
   * any player for a SHARED pile (`isShared`), owner-only for a personal
   * one (`isOwner`).
   *
   * *nit (direct user request): the old `'split'` (roughly-in-half,
   * instant on click) is gone - replaced by an index-driven Split/
   * Pickup that needs a real picker UI (raise the pile into a fan, hover
   * to choose the cut point) not yet built. `state.js`'s `SPLIT_PILE`/
   * `PICKUP_SPLIT` reducer actions are real and tested; this offer list
   * intentionally does NOT list an id for them yet - a button with
   * nowhere to send an `index` would be a false affordance (Nielsen #9),
   * worse than no button at all until that picker exists.
   */
  static pileActions({ isOwner, isShared, cards } = {}) {
    if (!isOwner && !isShared) return [];
    // US-71/72/73 (D62/D63): `remove`/`changePileType` are offered here
    // for every base-Pile-derived kind (`zone`, `discard` - DiscardPile
    // doesn't override this method) unconditionally; the reducer is
    // still the real authorization/empty-only gate (D43's standing
    // discipline - this decides what to OFFER, not what's ALLOWED).
    return ['take', 'changePileType', 'remove', ...orientationActions(cards)];
  }

  /**
   * Which of this pile's own offered actions are disabled by its
   * current state (e.g. `DeckPile`'s `deal` at zero cards). `remove`
   * (D62) is empty-only at the reducer - *nit, direct user request
   * ("don't enable X unless empty"): disabled here too instead of
   * letting a click reach the reducer's block message every time on a
   * non-empty pile (Nielsen #5, prevent the error rather than catch it
   * after the fact).
   *
   * `changePileType` was disabled here the same way under D62/D63, but
   * direct user request (2026-08-27) reopened it on non-empty piles -
   * the reducer's own empty-only guard is gone too, see `state.js`'s
   * `CHANGE_PILE_TYPE` doc comment for the risk that reopens.
   */
  static disabledActions(count) {
    return count > 0 ? ['remove'] : [];
  }

  /** D43: the write-side authorization check is the READ-side offer
   * check - `cardActions` already states exactly which actions a card
   * offers to a viewer. `this` resolves to whichever subclass this was
   * actually called through, so an override of `cardActions` alone
   * (without touching `canRemoveCard`) still takes effect correctly. */
  static canRemoveCard(pile, card, viewerId, action) {
    return this.cardActions(pile, card, viewerId).includes(action);
  }

  static removeCard(pile, cardId) {
    return { ...pile, cards: pile.cards.filter((c) => c.id !== cardId) };
  }

  /**
   * D21: `layout` always belongs to whichever card of a newly-adjacent
   * pair ends up *second*. Dropping after the target, that's the
   * dropped card; dropping before it, the dropped card becomes the
   * target's new predecessor, so it is the TARGET that now sits second
   * and carries the layout.
   */
  static insertCard(pile, card, placement = {}) {
    const { targetCardId, side = 'after', layout } = placement;
    if (!targetCardId) return { ...pile, cards: [...pile.cards, withLayout(card, layout)] };

    const { cards } = pile;
    const index = cards.findIndex((c) => c.id === targetCardId);
    if (index === -1) {
      throw new Error(`Target card ${targetCardId} is not in the destination zone`);
    }

    if (side === 'before') {
      const placed = [...cards.slice(0, index), withLayout(card, null), ...cards.slice(index)];
      return { ...pile, cards: placed.map((c) => (c.id === targetCardId ? withLayout(c, layout) : c)) };
    }
    return { ...pile, cards: [...cards.slice(0, index + 1), withLayout(card, layout), ...cards.slice(index + 1)] };
  }
}
