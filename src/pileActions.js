import { PILE_TYPES } from './piles/pileTypes.js';

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
  // D51 follow-up (direct user request): "play" and "play hidden" are
  // two distinct actions now, not one gesture plus a separately-armed
  // "Play as" dropdown. `play` is unconditionally public - the fast,
  // default gesture (tap or drag), matching Draw's own "highest-
  // frequency action gets a shortcut" precedent (D36); it keeps
  // `target: 'zone'` because a native drag of the card itself DOES let
  // the drop location choose a destination zone (`highlightDragTargets`
  // in ui.js reads this). `playHidden` is the deliberate, secondary
  // case, reached ONLY via the card's radial menu, never draggable
  // itself (no `draggable: true` passed to its `attachRadialMenu` call)
  // - `target: null`, same as `reveal`/`rotate`, so a click dispatches
  // it directly instead of opening the "choose a destination" targeting
  // mode `openRadialMenu` would otherwise (wrongly) enter for a
  // `target`-bearing action with no `targetsFor` wired for it - always
  // plays to the same default zone `onPlay` does, no picker. Which
  // visibility it actually plays as (shared vs. private face-down) is
  // chosen by the remaining "Hide as" selector, which now only offers
  // the two hidden modes (main.js).
  play: { label: 'Play', target: 'zone', from: 'hand' },
  playHidden: { label: 'Play hidden', target: null, from: 'hand' },
  pickup: { label: 'Pick up', target: 'hand', from: 'zone' },
  move: { label: 'Move', target: 'zone', from: 'zone' },
  reveal: { label: 'Turn over', target: null, from: 'zone' },
  // D48/D40: in-place like `reveal` (no destination to pick), but stays
  // a hover-row button rather than a tap gesture - `reveal`'s tap
  // conversion (Sprint 12/Phase 55) was its own dedicated Smith-gated
  // story, not a default every in-place action inherits.
  rotate: { label: 'Rotate', target: null, from: 'zone' },

  // Pile-level (D29): act on the whole pile, not the hovered card -
  // dealing does not act on the hovered card at all, it acts on the
  // whole deck. `destructive` drives the confirm and the danger
  // styling; reshuffle & deal ends the round for everyone, and the
  // players whose hands it clears never see the control that did it.
  deal: {
    label: 'Deal',
    destructive: false,
    hint: 'Deal from the deck as it stands, without disturbing anyone\'s existing cards.',
  },
  reshuffleDeal: {
    label: 'Reshuffle & deal',
    destructive: true,
    hint: 'Gather every card back, reshuffle, and deal a fresh hand to each player.',
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
  },
  // Hand pile-level actions (D34). No `target`/`singleTarget` - these
  // happen in place, so they are never draggable, matching how `reveal`
  // (target: null) already works above.
  sortRank: { label: 'Sort by rank', destructive: false, hint: 'Sort your hand by rank.' },
  sortSuit: { label: 'Sort by suit', destructive: false, hint: 'Sort your hand by suit.' },
  pass: { label: 'Pass', destructive: false, hint: 'Toggle your own passed marker.' },
  // Phase 56 (Sprint 12, T56.1): shuffle/split move onto the deck's own
  // pile anchor alongside deal/reshuffleDeal/draw, joining a table they
  // were never part of before (US-35/36 shipped as a standalone button
  // row, not through `pileLevelActions` at all).
  shuffle: { label: 'Shuffle', destructive: false, hint: 'Shuffle the deck stock in place.' },
  split: { label: 'Split into piles', destructive: false, hint: 'Split the deck into face-down draw piles.' },
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
  return PILE_TYPES[pile.kind]?.cardActions(pile, card, viewerId) ?? [];
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
      if (spec.target === 'zone') {
        // D45: was `pile.kind !== 'zone'` - generalized the same way
        // state.js's `zonesOf` was, so a dragged play/move correctly
        // lights up a Discard pile too, not just plain zones.
        if (!PILE_TYPES[pile.kind]?.tableSide) return false;
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
 *
 * @param {'deck'|'hand'|'zone'} kind
 * @param {{isHost?: boolean, isOwner?: boolean}} ctx
 * @returns {string[]} action ids
 */
export function pileLevelActions(kind, ctx = {}) {
  return PILE_TYPES[kind]?.pileActions(ctx) ?? [];
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
  return PILE_TYPES[kind]?.resolveDropTarget(cardBoxes, point) ?? {};
}
