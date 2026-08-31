import { PILE_TYPES, revivePile, pileForKind } from './piles/pileTypes.js';

/**
 * What a card in a given Pile can *do*, and where it can go (D23/D25).
 *
 * Pure and DOM-free, like `seating.js` (D18), `handOrder.js` (D14) and
 * `dropTarget.js` (US-32/33): the rules are the interesting part, and
 * they're only directly testable if they aren't tangled up in rendering.
 *
 * Before this, "which controls does this card get" was re-derived inline
 * at each render site with its own ad-hoc conditions, and "where may it
 * go" lived separately in the Move-to dropdown. One table means the
 * hover affordances, the drop-target highlighting and the reducer's own
 * authorization can't drift apart - they all read the same source.
 *
 * NOTE: this decides what to *offer*. It deliberately does not replace
 * the reducer's authorization checks (state.js) - the host still
 * validates every action it receives, exactly as before. This is the
 * presentation half; the reducer remains the source of truth.
 *
 * D42 (Sprint 13/US-47): `actionsForPileKind`'s per-kind switch and
 * `actionsForCard`'s per-kind + visibility/ownership filtering used to
 * live here as two functions. They're now `src/piles/*.js`'s
 * `cardActions(pile, card, viewerId)` - one function per type instead
 * of a shared switch. `actionsForPileKind` had no real caller outside
 * its own tests (grepped first) - removed rather than kept as a second,
 * now-redundant table; its coverage moved to `tests/piles.test.js`.
 */

/**
 * D51 (Actionable interface): the user's explicit direction is ONE
 * interface, fully pruned - no `ACTIONS`/`PILE_ACTIONS` split kept
 * around for compatibility. What used to be two tables (a card's
 * actions, a pile's actions) were always the same shape
 * (`{label, hint?, target, from?, destructive?, singleTarget?}`) -
 * "what can this ACTOR (card or pile) do, and where can it go" is one
 * question, not two, once you don't care which kind of actor is asking.
 * `ACTION_SPECS` below is that one table. What's still genuinely
 * separate, correctly so - this does NOT try to unify it - is
 * *offering* (`actionsForCard` vs. `pileLevelActions`: a card's
 * authorization and a pile's are real, different computations, not the
 * same rule wearing two names) and *rendering* (`ui.js`'s
 * `attachRadialMenu`/`openRadialMenu` (D52) is the shared piece both a
 * card's radial menu and a pile's go through - a `target`-bearing
 * action opens the card-follows-cursor targeting mode; see its own doc
 * comment). One spec, two offer-rules, one renderer.
 */
export const ACTION_SPECS = {
  // Card-level: act on the card under the cursor, offered in its hover
  // row. `target: null` means it happens in place, with no destination
  // to pick.
  // UX follow-up (direct user request): "Hide as"/Play Hidden removed
  // entirely - `play` is the only hand-play action now, unconditionally
  // public, the fast default gesture (tap or drag), matching Draw's own
  // "highest-frequency action gets a shortcut" precedent (D36). Keeps
  // `target: 'table'` because a native drag of the card itself DOES let
  // the drop location choose a destination pile (`highlightDragTargets`
  // in ui.js reads this). D90: `'table'`, not `'zone'` - this means "any
  // table-side pile" (`tableSide`), never the real Zone entity.
  play: { label: 'Play', target: 'table', from: 'hand', icon: '▶' },
  pickup: { label: 'Pick up', target: 'hand', from: 'table', icon: '↑' },
  move: { label: 'Move', target: 'table', from: 'table', icon: '⇄' },
  reveal: { label: 'Turn over', target: null, from: 'table', icon: '👁' },
  // D48/D40: in-place like `reveal` (no destination to pick), but stays
  // a hover-row button rather than a tap gesture - `reveal`'s tap
  // conversion (Sprint 12/Phase 55) was its own dedicated Smith-gated
  // story, not a default every in-place action inherits.
  rotate: { label: 'Rotate', target: null, from: 'table', icon: '⟳' },

  // Pile-level (D29): act on the whole pile, not the hovered card -
  // dealing does not act on the hovered card at all, it acts on the
  // whole deck. `destructive` drives the confirm and the danger
  // styling; reshuffle & deal ends the round for everyone, and the
  // players whose hands it clears never see the control that did it.
  deal: {
    label: 'Deal',
    destructive: false,
    hint: 'Deal from the deck as it stands, without disturbing anyone\'s existing cards.',
    icon: '⇉',
  },
  reshuffleDeal: {
    label: 'Reshuffle & deal',
    destructive: true,
    hint: 'Gather every card back, reshuffle, and deal a fresh hand to each player.',
    icon: '↻',
  },
  // D34/D35: Draw generalized from a per-card action (dead - deck's
  // `cardActions` always returns []) to a pile-level one, matching how
  // the user actually described it: hover the DECK, not a specific
  // hidden card. `target`/`from` mirror the card-level shape so
  // `targetsForAction` can drive drop-target highlighting for a dragged
  // Draw the same way it already does for a dragged card.
  //
  // `singleTarget: true` (D36, Smith Gate 2 #1) is a STATIC fact about
  // this action's definition - the deck has exactly one legal
  // destination (the viewer's own hand) by the rules of the game
  // itself, never something computed from how many piles currently
  // exist. This is what makes Draw safe to also offer as a plain tap
  // shortcut (Smith Gate 1 #4: the project's own highest-frequency
  // action must not become drag-only) without opening the door to
  // `move`/`pickup` silently doing the same the moment a game happens
  // to have few zones.
  draw: {
    label: 'Draw',
    destructive: false,
    hint: 'Draw the top card into your hand.',
    target: 'hand',
    from: 'deck',
    singleTarget: true,
    icon: '↓',
  },
  // Hand pile-level actions (D34). No `target`/`singleTarget` - these
  // happen in place, so they are never draggable, matching how `reveal`
  // (target: null) already works above.
  sortRank: { label: 'Sort by rank', destructive: false, hint: 'Sort your hand by rank.', icon: '#' },
  sortSuit: { label: 'Sort by suit', destructive: false, hint: 'Sort your hand by suit.', icon: '♠' },
  // Phase 56 (Sprint 12, T56.1): shuffle/split move onto the deck's own
  // pile anchor alongside deal/reshuffleDeal/draw, joining a table they
  // were never part of before (US-35/36 shipped as a standalone button
  // row, not through `pileLevelActions` at all).
  shuffle: { label: 'Shuffle', destructive: false, hint: 'Shuffle the deck stock in place.', icon: '⇌' },
  // D91/D92 (direct user request: "we're missing... split pile", then
  // "split should always fan the pile to allow the guided picker" -
  // deck included, no exceptions): the old `'split'` (roughly-in-half,
  // instant on click) was retired long ago in favor of a real, tested,
  // index-driven `SPLIT_PILE` reducer action - this is that picker
  // (`ui.js`'s `renderSplitPicker`, raise-and-choose-a-gap), the SAME
  // one for every pile kind including `deck` (`DeckPile.showsFace`
  // always `false` is what keeps a deck's own fan showing backs, not
  // real faces - `pile.cards` is the deck's real, full contents in the
  // view, D84). No pile-kind branch anywhere any more - `main.js`'s
  // `handlePileAction` just toggles the picker, full stop. Not
  // `destructive` (no confirm dialog) - opening the picker commits
  // nothing by itself.
  //
  // D91 follow-up, direct user correction: a separate `pickupSplit`
  // action briefly existed here (instant, roughly-half into the
  // player's own hand) and was WRONG - "there is not supposed to be a
  // pickupSplit, just pickup (put all the cards from this pile in my
  // hand) and separately Split." "Pickup" is `take` (below) - it
  // already does exactly that. Removed entirely; the `PICKUP_SPLIT`
  // reducer action itself (predates this whole thread, real and
  // tested) is untouched, simply has no UI trigger, same as `split`
  // did before its own picker existed.
  split: { label: 'Split', destructive: false, hint: 'Split this pile in two.', icon: '✂' },
  // Sprint 23 (US-61): pile-level, no `target` - a button, not a drag
  // gesture, same shape as `deal`/`shuffle` above. `destructive:
  // true` unconditionally, no size-based exception (Smith's Gate 1
  // ruling - a size-gated confirm is a worse, less-predictable
  // affordance than a consistent one) - the single-card skip Smith also
  // specified is a UI-layer nuance for whoever wires the confirm click
  // handler (`ui.js`), not something this spec table can express.
  take: { label: 'Take', destructive: true, hint: 'Take every card in this pile into your hand.', icon: '↥' },
  // Sprint 23 (US-62): pile-level, no `target` - in place, same shape as
  // `reveal`/`rotate` above but at the PILE level. Not destructive - a
  // pile's own `pileActions` never offers both at once (`zonePile`/
  // `discardPile`'s `orientationActions`), so there's no accidental
  // "flip it back" cost the way `take`/`reshuffleDeal` have.
  hide: { label: 'Hide', destructive: false, hint: 'Turn every card in this pile face-down.', icon: '🙈' },
  show: { label: 'Show', destructive: false, hint: 'Turn every card in this pile face-up.', icon: '👁' },
  // D71 (US-74): offered by Pile.pileActions() - same base method every
  // eligible subclass inherits/overrides, so each kind gets it "for
  // free" without a separate opt-in. Allowed on a non-empty pile too as
  // of a direct user request (2026-08-27).
  //
  // *nit (direct user request): "a menu for the change pile action and
  // give me an indication of the currently selected pile type" - `enum:
  // true` is a new ACTION_SPECS shape (an EnumAction, not the plain
  // single-click shape every other entry above uses): the header renders
  // it as a menu button showing the CURRENT value, opening a list of
  // every choice on click, rather than a plain icon that fires once.
  // Generic at this table's level - any future multi-choice pile action
  // can reuse the same `enum: true` flag - but the actual current
  // value/choices are per-instance data only the render call site has
  // (`renderPileShell`'s `enumOptions`, `ui.js`), same "static spec +
  // per-instance options" split `disabled`/`noConfirm`/`labels` already
  // use elsewhere in this table's callers.
  changePileType: {
    label: 'Change type',
    destructive: false,
    hint: 'Change this pile to a different kind.',
    icon: '⇋',
    enum: true,
  },
  // D79 (US-82): the untap step, as one atomic action rather than N
  // rotates. Not destructive - untapping loses nothing and is trivially
  // reversible by tapping again, so it takes no confirm.
  untapAll: {
    label: 'Untap all',
    destructive: false,
    hint: 'Return every permanent in this pile to upright.',
    icon: '⇧',
  },
  // US-71/72 (D62): empty-only, no cascade-delete - same base-method
  // reasoning as changePileType above.
  remove: { label: 'Remove', destructive: true, hint: 'Remove this pile. Must be empty first.', icon: '✕' },
  // *nit (2026-08-26), direct user request: "anything Actionable should
  // always get an ActionBar" - `<score-zone>`'s own +/- buttons were a
  // bespoke, hand-built header (`ScoreZoneElement._render()`), not the
  // shared `<header-actions>`/`ACTION_SPECS` table every other
  // pile/zone heading already goes through. These two entries are what
  // let it join that one table instead of staying a lookalike.
  scoreDown: { label: 'Decrease score', destructive: false, icon: '-' },
  scoreUp: { label: 'Increase score', destructive: false, icon: '+' },
};

/**
 * The actions actually offered for one card - applying the same
 * visibility/ownership rules the reducer enforces (D7/D12), owned by
 * the card's pile TYPE (`src/piles/*.js`) rather than a switch here.
 *
 * @param {{kind: string}} pile the pile the card is currently in
 * @param {{faceUp?: boolean, faceDown?: boolean, owner?: string|null}} card
 *   a card as it appears in a *view* (so it may be redacted).
 * @param {string} viewerId
 * @returns {string[]} action ids, in the order they should be offered.
 */
export function actionsForCard(pile, card, viewerId) {
  // An unrecognized `kind` offers nothing rather than silently falling
  // back to the base Pile's real actions (`revivePile`'s own fallback
  // is for reviving a KNOWN-valid state record, not for tolerating a
  // corrupt/unknown one here) - a real, deliberate distinction, not a
  // missed guard: this is presentation-layer input that must degrade
  // safely, never grant real drag-and-drop to something the registry
  // doesn't recognize.
  if (!Object.hasOwn(PILE_TYPES, pile.kind)) return [];
  return revivePile(pile).cardActions(card, viewerId);
}

/**
 * Which of `piles` can receive `action` - i.e. what should light up as a
 * drop target once the user picks that action.
 *
 * @param {string} action
 * @param {{id: string, kind: string, ownerId: string|null}[]} piles
 * @param {{viewerId: string, fromPileId?: string}} ctx
 * @returns {string[]} pile ids
 */
export function targetsForAction(action, piles, { viewerId, fromPileId } = {}) {
  // D34/D35/D51: `draw` is a pile-level action, but drop-target
  // highlighting for a dragged Draw needs the same lookup card-level
  // actions already get - one merged spec table (`ACTION_SPECS`) means
  // this never has to remember to check two tables (the D34/D35-era
  // risk this comment used to warn about no longer exists - there's
  // only one table to look in).
  const spec = ACTION_SPECS[action];
  if (!spec || spec.target === null || spec.target === undefined) return [];

  return piles
    .filter((pile) => {
      if (spec.target === 'hand') return pile.kind === 'hand' && pile.ownerId === viewerId;
      if (spec.target === 'table') {
        // D45: was `pile.kind !== 'plain'` - generalized the same way
        // state.js's `pilesOf` was, so a dragged play/move correctly
        // lights up a Discard pile too, not just plain piles.
        //
        // UX follow-up (direct user request): a hand pile is `tableSide`
        // now too (it renders at its owner's seat like any other
        // table-side pile - `state.js`'s `viewFor`/`pilesOf`), but it
        // must never light up as a generic play/move DESTINATION - only
        // `pickup`'s own `target: 'hand'` branch above may ever target a
        // hand, and only the viewer's OWN. Without this, dragging any
        // visible card would offer every player's hand as a legal `move`
        // drop, silently shoving raw table-card fields (owner/faceUp/
        // layout) into a hand pile that should never carry them.
        if (pile.kind === 'hand' || !PILE_TYPES[pile.kind]?.tableSide) return false;
        // Moving a card to the pile it's already in is a no-op offer, so
        // don't light it up. Playing from hand has no such exclusion.
        return action === 'move' ? pile.id !== fromPileId : true;
      }
      return false;
    })
    .map((pile) => pile.id);
}

/**
 * The pile-level actions `kind` offers this viewer - owned by the
 * pile TYPE (`src/piles/*.js`)'s `pileActions(ctx)` rather than a
 * switch here (D42, Sprint 13/US-47). Kept at this exact call shape
 * (`kind` string + `{isHost, isOwner}` ctx) rather than `(pile,
 * viewerId, ctx)` - checked both real call sites (`ui.js`/`main.js`)
 * first and neither has a real pile object or viewerId in scope, only
 * a kind string and a precomputed boolean (see ARCHITECTURE.md D42).
 * `isShared` (Sprint 23, US-60/61) joined the same ctx for the same
 * reason - `zonePile`/`discardPile`'s `pileActions` can't otherwise
 * tell a shared (ownerless) pile from someone else's personal one,
 * since both make `isOwner` simply `false`.
 *
 * @param {'deck'|'hand'|'plain'|'discard'} kind
 * @param {{isHost?: boolean, isOwner?: boolean, isShared?: boolean}} context
 * @returns {string[]} action ids
 */
export function pileLevelActions(kind, context = {}) {
  return pileForKind(kind)?.pileActions(context) ?? [];
}

/**
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - which of a pile's OWN offered
 * actions are currently disabled (Deal, at zero cards) is a property of
 * the pile TYPE (`src/piles/*.js`'s `disabledActions(count)`), read the
 * same polymorphic way as `pileLevelActions`/`componentFor`, not a
 * `zone.kind === 'deck'` check inside the generic pile renderer.
 *
 * @param {string} kind
 * @param {number} count
 * @returns {string[]} action ids currently disabled
 */
export function disabledPileActionsFor(kind, count) {
  return pileForKind(kind)?.disabledActions(count) ?? [];
}

/**
 * D56: which Web Component tag renders this pile kind's row - read
 * directly off the pile class's own `static component` (no `rowShape`
 * string + separate `PILE_TAGS` lookup table indirection anymore; a
 * component renders a render SHAPE, so several pile classes may
 * legitimately share one tag).
 *
 * @param {string} kind
 * @returns {string} a custom element tag name
 */
export function componentFor(kind) {
  return PILE_TYPES[kind]?.component ?? 'pile-panel';
}


/**
 * D53 (Sprint 22, replaces D45's `dropRuleFor`/`dropRule` enum): the
 * drop-target geometry for a pile of this kind, computed by the pile
 * TYPE's own `resolveDropTarget` (`src/piles/*.js`) rather than a
 * central `ui.js` branch on a `'NONE'|'FAN'|'STACK'` string. Kept as
 * its own accessor rather than having `ui.js` import `PILE_TYPES`
 * directly, same reasoning as `pileLevelActions` above.
 *
 * @param {string} kind
 * @param {object[]} cardBoxes
 * @param {{x: number, y: number}} point
 * @returns {{targetCardId?: string, side?: 'before'|'after', layout?: string}}
 */
export function resolveDropTargetFor(kind, cardBoxes, point) {
  return pileForKind(kind)?.resolveDropTarget(cardBoxes, point) ?? {};
}

