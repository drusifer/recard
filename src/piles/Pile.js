/**
 * The Pile base class (D56, converted to real instances D93 - direct
 * user request: "you've got to undo the Piles are plain data objects
 * decision... I'm trying to create a rich type hierarchy with domain
 * abstraction"). A Pile is a real object now: `new Pile(data)` (or
 * `revivePile(data)` (pileTypes.js), which picks the right subclass by `kind`) gives
 * you something with real INSTANCE methods (`pile.cardActions(card,
 * viewerId)`), not a static method you pass the data into
 * (`PILE_TYPES[pile.kind].cardActions(pile, card, viewerId)`) - every
 * `pile.kind` switch/case this codebase had is a real polymorphic
 * dispatch now, not a lookup table pretending to be one.
 *
 * Serialization is free, not extra ceremony: `toJSON()` returns the
 * plain fields, and `JSON.stringify` (every `session.send`/
 * `localStorage` write already does this on the whole state tree)
 * calls it automatically - no call site anywhere needed to change.
 * `pileTypes.js`'s `revivePile(data)` is the reverse: reconstructs a
 * real instance from plain data arriving over the wire or from
 * storage, picking the right subclass by `kind` - lives there rather
 * than here since it needs the full `PILE_TYPES` registry, and THIS
 * file is one of the things that registry imports (a circular import
 * back to here would break the module graph).
 *
 * `state.piles` in the reducer still holds PLAIN records at rest, not
 * live instances - `insertCard`/`removeCard` (the only two methods
 * that produce a NEW pile rather than just answering a question about
 * an existing one) return plain shapes, same as the reducer's own
 * `{...pile, field}` update style elsewhere, so the state tree stays
 * uniform and every existing plain-object test fixture still works
 * unchanged. Everywhere ELSE - every card/pile-action/visibility QUERY
 * - goes through a real instance (`revivePile(pile).method(...)`),
 * which is where the actual "case statement instead of a class"
 * problem lived.
 *
 * D90: there is no such thing as a "zone pile" - that word belongs to
 * the Zone entity alone (`state.zones`, `<zone-panel>`). The generic,
 * no-accept-rule, per-card `{owner, faceUp}` pile (`kind: 'plain'`)
 * isn't a distinctly-named subtype either - it IS this base class,
 * concrete and directly usable, not abstract. Every other kind is a
 * real specialization that overrides only what differs - real `class X
 * extends Pile`, not a sibling module duplicating the shared rule.
 *
 * `src/piles/pileTypes.js`'s `PILE_TYPES` registry maps a pile's `kind`
 * string to its class - used by `revivePile`, not by
 * callers reaching into it directly any more (the three call sites
 * that used to - `state.js`/`pileActions.js`/`persistence.js` - now go
 * through `revivePile(pile).method(...)`).
 *
 * `kind: 'plain'` (D90 - was `'zone'`) is the wire/data string
 * `CREATE_ZONE` falls back to - it maps to this base class in the
 * registry. `SNAPSHOT_VERSION` bumped alongside the rename (D90, no
 * back-compat shim).
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
   * (hidden) and `HandPile` (in-hand) override it. Stays a static class
   * property (a fact ABOUT the type, not about any one instance). */
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
   * `false` - each for its own structural reason. */
  static reparentable = true;

  /**
   * D93: real instance fields, not a plain-object shape callers had to
   * remember - `id`/`kind`/`name`/`ownerId`/`zoneId`/`cards` are
   * whatever the caller passes (matches the pre-D93 record shape
   * exactly, so `revivePile(existingPlainPile)` round-trips unchanged).
   */
  constructor({ id, kind, name, ownerId = null, cards = [], zoneId } = {}) {
    this.id = id;
    this.kind = kind;
    this.name = name;
    this.ownerId = ownerId;
    this.cards = cards;
    this.zoneId = zoneId;
  }

  /** Free serialization - `JSON.stringify` calls this automatically on
   * anything that has it, so every existing `session.send`/
   * `localStorage` write (already stringifying the whole state tree)
   * needs zero changes. Plain fields only, same shape a pre-D93 pile
   * record always had. */
  toJSON() {
    return { id: this.id, kind: this.kind, name: this.name, ownerId: this.ownerId, cards: this.cards, zoneId: this.zoneId };
  }

  /**
   * D94 (direct user request: "state.js viewFor is a monstrosity...
   * just do pile.getView()... every case statement should be a derived
   * method call"). The per-pile wire shape `state.js`'s `viewFor` sends
   * to a client - full cards, always (D84, "TOTAL PERMISSIVE", the DATA
   * was never redacted - only `showsFace` decides the VISUAL, a
   * separate concern this method has nothing to do with). `DeckPile`
   * overrides this to add `count` (kept for existing consumers that
   * read it instead of `cards.length`); every other kind's shape is
   * identical, which is exactly why the old `switch (pileVisibility
   * (pile))` in `viewFor` had three near-duplicate branches instead of
   * one real difference.
   */
  getView() {
    return { id: this.id, name: this.name, ownerId: this.ownerId ?? null, kind: this.kind, zoneId: this.zoneId, cards: this.cards };
  }

  /**
   * Adds this pile's contribution to the whole-game `view` object
   * `viewFor` assembles - its own `getView()` shape into `view.piles`,
   * by default. `HandPile` overrides this to ALSO feed `view.myHand`/
   * `view.otherHandCounts` - the one real per-kind difference left once
   * `getView()` above made the other two "hidden"/"mixed" `viewFor`
   * branches identical. This is the actual replacement for the old
   * `switch` - one polymorphic call per pile, no case statement
   * anywhere in `viewFor` itself.
   */
  contributeToView(view) {
    view.piles.push(this.getView());
  }

  /**
   * Whether a card in this pile shows its real face to a viewer, or its
   * back. Default: follows the card's own real table orientation
   * (`faceUp`) - a face-down card looks face-down to every viewer, same
   * as a real table (D84 never redacted the DATA, only ever the
   * "who can move it" question; this is the separate VISUAL question).
   * `HandPile` overrides this - a hand's own `faceUp` was never a real
   * orientation - and `PlayerHandPile` overrides it again for the one
   * viewer whose hand it actually is.
   */
  showsFace(card) {
    return card.faceUp !== false;
  }

  /** The only kind with real before/onto/after halo geometry -
   * `dropTarget.js`'s pure math. Every subclass that isn't a plain open
   * pile overrides this to `{}`. */
  resolveDropTarget(cardBoxes, point) {
    return resolveHaloTarget(cardBoxes, point);
  }

  /** Nothing has ever gated an insert by card content for the base
   * case - unconditional accept. `MeldPile` subclasses are the real
   * content-based callers. */
  canAccept() {
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
   * (D84: "remove card redaction entirely... TOTAL PERMISSIVE") -
   * `faceUp` is a plain game-state field with no privacy meaning left;
   * every viewer sees every card's real identity regardless of it.
   */
  cardActions(card) {
    return card.faceUp === false ? ['reveal', 'pickup', 'move', 'rotate'] : ['pickup', 'move', 'rotate'];
  }

  /**
   * D55/US-60/61/62: `take`/`hide`/`show` act on the whole pile, open to
   * any player for a SHARED pile (`isShared`), owner-only for a personal
   * one (`isOwner`).
   *
   * D91: `split` (the old roughly-in-half `'split'`'s real, index-
   * driven replacement) is offered here now that a real picker UI
   * exists (`ui.js`'s `renderSplitPicker`) - `disabledActions` below
   * still gates it off below 2 cards, matching `splitPileAt`'s
   * (state.js) own minimum. `take` (above) already covers "everything
   * into my hand" - a separate `pickupSplit` briefly existed alongside
   * it and was a direct user correction: "there is not supposed to be
   * a pickupSplit."
   */
  pileActions({ isOwner, isShared, cards } = {}) {
    if (!isOwner && !isShared) return [];
    // US-71/72/73 (D62/D63): `remove`/`changePileType` are offered here
    // for every base-Pile-derived kind unconditionally; the reducer is
    // still the real authorization/empty-only gate (D43's standing
    // discipline - this decides what to OFFER, not what's ALLOWED).
    return ['take', 'split', 'changePileType', 'remove', ...orientationActions(cards)];
  }

  /**
   * Which of this pile's own offered actions are disabled by its
   * current state (e.g. `DeckPile`'s `deal` at zero cards). `remove`
   * (D62) is empty-only at the reducer - disabled here too instead of
   * letting a click reach the reducer's block message every time on a
   * non-empty pile (Nielsen #5, prevent the error rather than catch it
   * after the fact).
   *
   * D91: `split` disabled below 2 cards - `splitPileAt` (state.js)
   * throws under that minimum, same reasoning as `remove`.
   */
  disabledActions(count) {
    const disabled = count > 0 ? ['remove'] : [];
    if (count < 2) disabled.push('split');
    return disabled;
  }

  /** D43: the write-side authorization check is the READ-side offer
   * check - `cardActions` already states exactly which actions a card
   * offers to a viewer. Real prototype dispatch: calling `this.
   * cardActions(...)` on a subclass instance already resolves to that
   * subclass's own override, no explicit re-dispatch needed. */
  canRemoveCard(card, viewerId, action) {
    return this.cardActions(card, viewerId).includes(action);
  }

  /** Returns a plain NEW pile shape (not `this` mutated, not a new
   * instance) - the reducer stores plain records at rest; this result
   * re-enters `state.piles` exactly the same way a pre-D93 `{...pile,
   * cards: […]}` spread did. */
  removeCard(cardId) {
    return { ...this.toJSON(), cards: this.cards.filter((c) => c.id !== cardId) };
  }

  /**
   * D21: `layout` always belongs to whichever card of a newly-adjacent
   * pair ends up *second*. Dropping after the target, that's the
   * dropped card; dropping before it, the dropped card becomes the
   * target's new predecessor, so it is the TARGET that now sits second
   * and carries the layout. Returns a plain shape, same reasoning as
   * `removeCard` above.
   */
  insertCard(card, placement = {}) {
    const { targetCardId, side = 'after', layout } = placement;
    const base = this.toJSON();
    if (!targetCardId) return { ...base, cards: [...this.cards, withLayout(card, layout)] };

    const { cards } = this;
    const index = cards.findIndex((c) => c.id === targetCardId);
    if (index === -1) {
      throw new Error(`Target card ${targetCardId} is not in the destination zone`);
    }

    if (side === 'before') {
      const placed = [...cards.slice(0, index), withLayout(card, null), ...cards.slice(index)];
      return { ...base, cards: placed.map((c) => (c.id === targetCardId ? withLayout(c, layout) : c)) };
    }
    return { ...base, cards: [...cards.slice(0, index + 1), withLayout(card, layout), ...cards.slice(index + 1)] };
  }
}
