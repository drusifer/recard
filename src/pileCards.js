// US-133/D160, cluster 4b: how a pile's CARDS are drawn - the card shell, the
// stacks, a stack's gear, and the two menus (a card's right-click menu, a
// stack's gear menu) - moved out of `ui.js` unchanged. What a menu ROW means
// for a card or a stack is decided here; the popup itself is `<action-menu>`
// (cluster 1) and where a drag lands is `dragDrop.js` (cluster 2). A plain
// module: `PileElement`'s subclasses call `renderPileCards` for their row, and
// it touches `document` only when called.
import { ACTION_SPECS, pileableMenuItems, actionsForPileable } from './pileActions.js';
import { buildSpecialActionControl } from './actionControls.js';
import { stacksOf, stackKeyFor } from './piles/Stack.js';
import { MAX_SPREAD, MIN_SPREAD } from './piles/Pile.js';
import { PILE_TYPES, pileInstanceFor } from './piles/pileTypes.js';
import { beginCardTargetPick, clearPileTargets, wireCardDrag, wireCardLiftCue } from './dragDrop.js';
import { pileableFor } from './pileables/pileableTypes.js';
import { VERTICAL, HORIZONTAL, FAN } from './pileables/Stackable.js';

/**
 * The card SHELL, shared by every card face (D76). The `<button>`, its
 * `dataset.pileableId`, and the click/disabled wiring are identical for all
 * faces - only the CONTENT is dispatched, via `CARD_FACES`. That split
 * is what lets a new card type (Recard the Gathering) exist without the
 * table simulation changing: nothing about how a card is dragged,
 * clicked, rotated or targeted lives in a face.
 *
 * The rank/suit rendering that used to be inline here now lives in
 * `StandardCardFace` unchanged, and is what any card without a `face`
 * field still gets.
 */
export function cardElement(card, { onClick, disabled, back = false } = {}) {
  const element = document.createElement('button');
  element.type = 'button';
  // D107: the shell dispatches on the Pileable TYPE now, not straight
  // to a card face. `CardPileable` delegates to `faceFor`, so every
  // existing face renders through the identical path - which is what
  // makes it structurally impossible for this sprint to change how a
  // card looks. The shell itself stays type-blind (Smith Gate 1).
  const pileable = pileableFor(card);
  const extraClass = pileable.className();
  element.className = 'card' + (back ? ' card-back' : '') + (extraClass ? ` ${extraClass}` : '');
  element.dataset.pileableId = card.id;

  if (back) element.textContent = '🂠';
  else pileable.render(element);

  if (onClick && !disabled) element.addEventListener('click', () => onClick(card));
  else element.disabled = true;
  return element;
}

/**
 * *nit (direct user request): a card back is sized off the same `face`
 * dispatch `cardElement`'s face-up shell uses (`faceFor`, `cardFaces.js`)
 * - previously always the plain `'card card-back'` classes regardless of
 * which game's card this is, so an RTG card back rendered at the
 * standard size next to its full-size, face-up siblings. `card` may be
 * the redacted `{id, face, faceDown}` shape (`Pile`/`HandPile`
 * `redactCard`) or `null` (a still-hidden card this viewer has no
 * information about at all, e.g. `updateDragGhost`'s drag ghost) -
 * `faceFor` already defaults an absent/unknown `face` to `standard`.
 */
export function cardBackElement(card) {
  const element = document.createElement('div');
  const extraClass = pileableFor(card).className();
  element.className = 'card card-back' + (extraClass ? ` ${extraClass}` : '');
  element.textContent = '🂠';
  if (card?.id) element.dataset.pileableId = card.id;
  return element;
}

/**
 * Reveal a still-hidden card (Sprint 12, Phase 55, T55.1): a direct tap
 * on the card itself, joining the existing tap vocabulary, rather than
 * a separate hover-revealed button.
 *
 * The confirm gate (Smith Gate 2 #2) still fires for your OWN private
 * card, but its copy changed with the show/hide *nit: "This cannot be
 * undone" is no longer true - `hide` is exactly the undo. Kept rather
 * than dropped because the consequence it warns about is real and
 * unaffected: everyone at the table SEES the card in the moment you
 * reveal it, and turning it back face-down does not unsee it. The
 * wording now warns about that, not about permanence.
 */
function performReveal(card, viewerId, onReveal) {
  clearPileTargets();
  const isMine = card.owner != undefined && card.owner === viewerId;
  if (isMine && !globalThis.confirm('Show this card to everyone? They will see it even if you hide it again.')) return;
  onReveal?.(card.id);
}

/**
 * A pile's current overlap factor: its own adjusted `spread` if a player
 * has ever used Tighten/Loosen on it, otherwise its TYPE's default
 * (`Pile.defaultSpread` - 0 for a plain row, 0.7 for a hand's fan).
 *
 * *nit (direct user request): "pile actions for tighten/loosen to adjust
 * the overlap on fan and meld piles or runs or whatever." The 0.65 used
 * to be a literal in `style.css`. It is a property of the pile TYPE
 * now, and every row gets the property written from this one function -
 * no second "unadjusted" rendering path anywhere.
 */
export function effectiveSpread(pileView) {
  return pileView.spread ?? PILE_TYPES[pileView.kind]?.defaultSpread ?? 0;
}

/** Which click behavior + face-down styling a card's face gets (US-107
 * extraction) - same precedence `renderPileCards` used inline,
 * unchanged: see its own call site comment for why the tap stays
 * one-way between reveal and rotate. */
function faceOptionsFor(canReveal, canRotate, isBack, card, options) {
  if (canReveal) return { onClick: () => performReveal(card, options.viewerId, options.onReveal), back: isBack };
  if (canRotate) return { onClick: () => options.onRotate(card.id), back: isBack };
  return { disabled: true, back: isBack };
}

/**
 * The gear emblem a stack carries (direct user request: "since this is
 * universal for stacks use an additional emblem using the gear symbols
 * to pull up the stack action menu").
 *
 * Universal - every stack that has anything to offer gets the same
 * emblem, unlike the mana badge beside it, which is one pile kind's
 * opt-in decoration. It sits ON the stack because that is the object
 * it acts on: a stack has no header of its own, and giving it one
 * would put a second title bar inside every pile (a plain pile IS one
 * stack, so it would duplicate the pile header exactly).
 *
 * Absent on a stack of one, where `stackActions` offers nothing -
 * tighten, loosen and flip on a single card are three controls that
 * visibly do nothing, the same "no false affordance" rule
 * `ChipPile` applies to `changePileType`.
 */
function stackGearFor(stack, pileView, options) {
  const maxSpread = PILE_TYPES[pileView.kind]?.maxSpread ?? MAX_SPREAD;
  const { ids, disabled } = stack.stackActions({
    canTap: PILE_TYPES[pileView.kind]?.supportsStackTap === true,
  });
  if (ids.length === 0) return null;
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'stack-gear';
  gear.dataset.stackKey = stackKeyFor(stack.id);
  gear.textContent = '⚙';
  gear.title = 'Stack actions';
  gear.setAttribute('aria-label', 'Stack actions');
  gear.addEventListener('click', (event) => {
    event.stopPropagation();
    const at = gear.getBoundingClientRect();
    // Tighten/Loosen slider (2026-09-13): `spreadStack`'s current value
    // and bounds - the per-stack sibling of the pile-level menu's own
    // `rangeOptions.spread` (see the `<pile-panel>` call site).
    const rangeOptions = { spreadStack: { value: stack.spread, min: MIN_SPREAD, max: maxSpread } };
    // US-145/D167: Flip's 3 choices + the stack's own current direction -
    // same "static spec, per-instance value at the call site" split
    // `changePileType`'s `enumOptions` already uses (`PileElement.js`).
    const enumOptions = { flipStack: { value: stack.direction, choices: FLIP_DIRECTION_CHOICES } };
    openStackActionMenu(at.left, at.bottom, ids, disabled, pileView.id, stackKeyFor(stack.id), rangeOptions, enumOptions, options);
  });
  return gear;
}

/**
 * US-145/D167: a small literal illustration of 2-3 overlapping card
 * shapes, arranged the way `direction` would actually lay a stack out -
 * not a generic arrow glyph, per the user's own design answer. Pure DOM
 * construction (no measurement, no card content) - CSS does the actual
 * positioning per direction (`.stack-direction-preview-<direction>`,
 * `style.css`), the same "JS builds the box, CSS positions it" split
 * `Stackable.offsetIn`'s own stride-multiplier design already uses for
 * the real stack layout.
 */
function buildDirectionPreview(direction) {
  const preview = document.createElement('span');
  preview.className = `stack-direction-preview stack-direction-preview-${direction}`;
  preview.setAttribute('aria-hidden', 'true'); // decoration only - the choice's own label carries the meaning (Smith Gate 1)
  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement('span');
    card.className = 'stack-direction-preview-card';
    preview.append(card);
  }
  return preview;
}

const FLIP_DIRECTION_CHOICES = [
  { value: VERTICAL, label: 'Column', preview: () => buildDirectionPreview(VERTICAL) },
  { value: HORIZONTAL, label: 'Row', preview: () => buildDirectionPreview(HORIZONTAL) },
  { value: FAN, label: 'Fan', preview: () => buildDirectionPreview(FAN) },
];

/** The box one `Stack` lays itself out inside (D129): its own
 * positioning origin, sized from the stack's real extent so it
 * reserves exactly the room it uses and no more - a stack claiming
 * more than it draws is what pushes a table past the viewport. */
function stackElementFor(stack) {
  const element = document.createElement('div');
  element.className = 'card-stack';
  if (stack.id !== undefined) element.dataset.stackId = String(stack.id);
  // D129: spread is the STACK's, so it is published here rather than on
  // the row. It no longer drives the layout (that is `offsetIn`, in
  // JS) - it is what the drop-ghost preview reads to place itself one
  // step along, and what a test can read back to see what a control
  // actually did.
  element.style.setProperty('--pile-spread', String(stack.spread));
  const { x, y } = stack.extent();
  element.style.setProperty('--stack-extent-x', String(x));
  element.style.setProperty('--stack-extent-y', String(y));
  return element;
}

export function renderPileCards(container, pileView, allPiles, options = {}) {
  const { onCardLift } = options;
  container.replaceChildren();
  // *nit (Tighten/Loosen): every row carries its pile's own spread, and
  // `style.css`'s single overlap rule reads it. Written
  // unconditionally, from `effectiveSpread` - an unadjusted pile gets
  // its TYPE's default rather than a different rendering path, so there
  // is exactly one way a row's overlap is decided.
  container.style.setProperty('--pile-spread', String(effectiveSpread(pileView)));
  // D45: was hardcoded `kind: 'plain'` below - harmless while plain was
  // the only 'mixed'-visibility pile type, a real bug the moment a
  // second one (discard) exists: every card-level authorization check
  // in this function would have been evaluated against the plain kind's
  // rules even for a discard pile's own cards.
  const pile = { id: pileView.id, kind: pileView.kind, ownerId: pileView.ownerId ?? null };
  // UX follow-up (direct user request): "create WebComponents for the
  // different pile types... fix the fan layout issue by implementing
  // FanPile." `opts.fan` (set by `<fan-pile>`, `src/components/
  // FanPile.js`) is the ONLY difference from the plain flat-row case -
  // every other per-card behavior (drag/actions/reveal/redaction) is
  // identical, so this stays ONE function rather than a forked copy.
  // The fan math (rotate + arc, pivoting from the bottom like cards
  // actually held in a hand) is exactly `renderHand`'s old formula,
  // just applied generically by index instead of being hand-specific.
  // *fix (real bug, direct user report): "adding additional cards to
  // the vertical layout blocks the second one instead of offsetting
  // from the previous card". `margin-top` (style.css's own `[data-
  // layout='column']` rule) is a CROSS-axis margin in this row - unlike
  // `margin-left`'s negative pull (which shrinks the main-axis space
  // every LATER sibling's own position is computed from, so horizontal
  // overlap chains for free), each flex item's own cross-axis margin
  // offsets it from the LINE's shared top independently of its
  // siblings' margins. A third column card landed at exactly the same
  // depth as the second, not one step further down, because both
  // margins were being measured from the same shared reference point,
  // never from each other. `--column-depth` makes the chain explicit
  // instead of assuming flex will do it: how many CONSECUTIVE cards
  // (this one included) have carried `layout: 'column'` back to the
  // nearest card that doesn't - style.css multiplies its one per-step
  // offset by this count, so depth 2 lands exactly one more step below
  // depth 1, same step size, chained by arithmetic instead of by flow.
  // D129: ONE layout for every pile. A pile is a row of `Stack`s, each
  // running in its OWN direction (`pile.stacks[stackId].direction`,
  // falling back to the kind's default), and every pileable is
  // positioned from its own index within its stack. This replaced four
  // hand-written CSS overlap formulas plus a `--column-depth` counter
  // that existed only because cross-axis flex margins do not chain.
  const stacks = stacksOf({
    cards: pileView.cards,
    stacks: pileView.stacks,
    direction: PILE_TYPES[pileView.kind]?.stackDirection,
    spread: effectiveSpread(pileView),
  });
  const renderedStacks = [];
  for (const stack of stacks) {
    const stackElement = stackElementFor(stack);
    container.append(stackElement);
    stackElement.append(...[stackGearFor(stack, pileView, options)].filter(Boolean));
    const positions = stack.layout();
    renderedStacks.push({ stack, element: stackElement });

  for (const [index, card] of stack.pileables.entries()) {
    const wrapper = document.createElement('div');
    // *nit (2026-08-26): `pile-hover-host` used to arrive via the now-
    // deleted `attachActionRow` (the popup mechanism) as a side effect
    // of wiring hover - it was never really ABOUT the popup, it drives
    // the shared hover-raise visual (`style.css`, `.pile-hover-host:
    // hover`) independent of it, so it's added directly here now that
    // nothing else adds it. Same for `tabIndex` - a keyboard-focusable
    // wrapper is what makes `:focus-within` reachable at all for a
    // face-down card (`cardBackEl` is a plain `<div>`, not naturally
    // focusable the way `cardEl`'s `<button>` face already is).
    wrapper.className = 'middle-card pile-hover-host';
    wrapper.tabIndex = 0;
    // US-32/33: `data-pileable-id` makes the wrapper hit-testable for
    // drop-region detection.
    wrapper.dataset.pileableId = card.id;
    // D129: where this pileable sits in its stack, as unitless stride
    // multipliers. One CSS rule turns them into lengths; nothing here
    // knows a pixel, which is what keeps the rem-based sizing (and its
    // per-preset runtime overrides) working.
    wrapper.style.setProperty('--stack-x', String(positions[index].x));
    wrapper.style.setProperty('--stack-y', String(positions[index].y));
    // A fan's lean comes from the same layout call as its position -
    // `applyFanOffset` and the `options.fan` flag it needed are gone.
    // Written unconditionally (0deg for the two layouts that do not
    // rotate) so there is one path, not a branch that has to agree
    // with the CSS fallback.
    wrapper.style.setProperty('--stack-rotate', `${positions[index].rotate ?? 0}deg`);
    // Depth within the stack - a decorative lean for tray stacks
    // (style.css), deliberately separate from the overlap geometry so
    // the two can be tuned apart.
    wrapper.style.setProperty('--stack-index', String(index));
    // D48/D40: same "state drives the visual" reasoning as `layout` -
    // style.css rotates the card face when this is 'landscape'.
    if (card.orientation) wrapper.dataset.orientation = card.orientation;

    // Card-lift cue (US-22, D13): press-and-hold broadcasts motion.
    // Safe for redacted cards too - only the id (already known to every
    // viewer, even in redacted form) is broadcast, never rank/suit.
    // Smith Gate 2 #1: mouse only. On touch this same binding fired the
    // instant a finger landed, so the table saw you lift a card before
    // you saw it yourself, and a finger brushing past on its way to a
    // scroll broadcast a lift that never happened. Touch gets the cue
    // from the recognizer's `lift` instead - see `attachTouchDrag`.
    wireCardLiftCue(wrapper, card, onCardLift);

    // US-28: draggable exactly where MOVE's own authorization would
    // allow a drop to succeed - a visible card (already face-up, or my
    // own still-hidden private one) or a redacted-but-unowned card
    // (shared face-down, movable by anyone per US-19 "put or take").
    // Someone else's still-hidden private card gets no controls at all
    // today (see below) and stays non-draggable to match.
    //
    // D45: was the ad-hoc `!card.faceDown || card.owner === null` check
    // - equivalent for zone cards (verified case-by-case against
    // `zonePile.pileableActions` before changing this), but it never
    // consulted the pile TYPE, so a discard pile's cards (drop-only -
    // `discardPile.pileableActions` is always `[]`) would have shown as
    // draggable even though every resulting drop is rejected
    // server-side. Reading the real offer table instead is what D34/D42
    // already promised: "the hover affordances... can't drift apart"
    // from the reducer's own authorization.
    const pileableActions = actionsForPileable(pile, card, options.viewerId);
    // UX follow-up (direct user request): a hand pile is a real,
    // addressable entry in `allPiles` now - no more synthetic
    // `HAND_PILE_ID` stand-in needed. Hoisted above the drag-only block
    // below so the context menu (US-100/D101) can reuse the same list for
    // its own targeted-action click-to-commit step.
    const piles = allPiles.map((p) => ({ id: p.id, kind: p.kind, ownerId: p.ownerId ?? null }));
    // D51: every pile (and the hand, if this card is pickup-eligible)
    // that could legally receive this SPECIFIC card lights up for the
    // whole drag - not just whichever one the pointer happens to be over
    // mid-drag (`showPileDragOver`'s existing per-hover cue, unchanged,
    // still layers on top of this once you're over one). D102: 'play'
    // used to be listed here alongside these two - a hand card offers
    // plain 'move' now, so the hand needs no entry of its own in this
    // list at all. US-29/D19: live position while dragging - a redacted
    // placeholder (`card.faceDown: true`) has no `faceUp` field either,
    // so `cardDragPayload` correctly treats it the same as hidden, even
    // for a blind "put or take" move of a shared face-down card.
    wireCardDrag(wrapper, card, pileableActions, piles, pileView, options);

    // D25: one hover-revealed action row, built from `pileActions.js`,
    // replacing the per-card Turn over / Pick up / Move to… buttons that
    // used to render unconditionally. Those made every zone about twice
    // the height of the cards in it, and each site re-derived its own
    // "may this card do this" condition inline.
    // Phase 55 (T55.1): tap the card itself to reveal it - joining
    // tap-to-play's vocabulary instead of a separate hover button. Same
    // authorization `actionMenuEl` already used (`actionsForPileable`).
    // `pile` is the one hoisted to the top of this function (D45).
    const canReveal = Boolean(options.onReveal) && actionsForPileable(pile, card, options.viewerId).includes('reveal');
    // *nit (2026-08-26), direct user request: "cards are Movable not
    // Actionable" - the hover-popup action row (`attachActionRow`) is
    // gone entirely. `pickup`/`move` already had a real trigger
    // beyond the popup (native drag, below) - `rotate` didn't, so it
    // gets the same "tap the card itself" pattern `reveal` already
    // established (Phase 55), applied to the FACE-UP case specifically
    // (`reveal` only ever offers on a still-hidden card, so the two
    // never compete for the same tap).
    const canRotate = Boolean(options.onRotate) && actionsForPileable(pile, card, options.viewerId).includes('rotate');

    // *nit (real bug, found live, D84: "remove card redaction entirely
    // ... TOTAL PERMISSIVE"): the `card.faceDown` branch this used to
    // dispatch on is dead code now - `faceDown` was NEVER a real
    // game-state field, only a marker `Pile.redactCard` (now deleted
    // everywhere) stamped onto a card it was hiding. Every card reaching
    // this renderer is the real thing now, always - the DATA is never
    // hidden from anyone (D84). The VISUAL is a separate, per-pile-TYPE
    // question D84 never touched, so it's answered polymorphically
    // through the Pile hierarchy (`pileInstanceFor`, `Pile.showsFace`)
    // instead of branching on `pile.kind` here - `PlayerHandPile` is
    // what makes a hand still show its own owner's cards face-up despite
    // `faceUp: false` (`toHandCard`); every other pile follows the
    // card's own real `faceUp` for the first time (previously always
    // the real face plus a redundant "face-down" text label - a
    // face-down card should look face-down, not show its content
    // captioned "you shouldn't be able to see this").
    const pileInstance = pileInstanceFor(pile, options.viewerId);
    const isBack = !pileInstance.showsFace(card, options.viewerId);
    // *nit (show/hide): the TAP gesture stays one-way on purpose. A
    // face-up card's tap is already spoken for by `rotate` (the *nit
    // that removed the hover action row gave rotate this tap because it
    // had no other trigger), and `reveal`/`rotate` never competed only
    // because reveal was offered on face-down cards alone. Making the
    // tap a toggle would take that tap away from rotate. `hide` gets
    // the right-click menu, which is where the *nit asked for it - a
    // cardAction, not a gesture.
    const face = cardElement(card, faceOptionsFor(canReveal, canRotate, isBack, card, options));
    if (canReveal) face.classList.add('revealable');
    if (canRotate) face.classList.add('rotatable');
    wrapper.append(face);

    // US-100/D101: right-click menu, additive to (not a replacement for)
    // the tap/drag gestures already wired above. Lists every id
    // `actionsForPileable` offers - in-place ones (rotate/reveal/conceal) fire
    // directly; targeted ones (move/pickup) start the destination
    // pick (`beginCardTargetPick`).
    attachCardContextMenu(wrapper, card, pileableActions, piles, pileView.id, options);

    stackElement.append(wrapper);
  }
  }
  return renderedStacks;
}

/**
 * US-100/D101: wires a card's right-click menu, covering every id
 * `actionsForPileable` offers for it - in-place (rotate, reveal, conceal) and targeted
 * (move, pickup) alike. A card offering none of those keeps the
 * native OS context menu untouched (Smith Gate 1 condition 1 - no
 * dead-end custom menu on a card with nothing to offer at all).
 *
 * Each item carries the action's icon AND its name, plus the same
 * tooltip/aria-label and destructive-confirm gate `<header-actions>`
 * uses - one contract for "here is a button for this action id", not a
 * second one invented for menus. It used `applyIconButton` (icon only,
 * name in the tooltip) until the *nit below; that helper is for the
 * pile header's compact button row, where the icons sit in a labelled
 * row and space is tight. A popup menu is neither.
 */
function attachCardContextMenu(wrapper, card, pileableActions, piles, fromPileId, options) {
  if (pileableActions.length === 0) return;

  wrapper.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    openCardContextMenu(event.clientX, event.clientY, pileableActions, card, piles, fromPileId, options);
  });
}

/**
 * One stack's own action menu, opened by its gear emblem: rows and range
 * sliders handed to `<action-menu>`, which owns everything else about a
 * popup (where it sits, how it closes, that there is only one). What
 * differs from the card menu is only WHAT it acts on: a stack, addressed
 * by its key, rather than a card.
 */
function openStackActionMenu(clientX, clientY, actionIds, disabled, pileId, stackKey, rangeOptions, enumOptions, options) {
  const items = actionIds.map((id) => {
    const spec = ACTION_SPECS[id];
    // US-145/D167: this used to duplicate `buildSpecialActionControl`'s
    // own range-only branch inline instead of calling it - which is
    // exactly why an `enum` action (Flip) could never have rendered as
    // a stack menu item before. `spreadStack` (`spec.range`) renders as
    // a `<spread-slider>`; it does NOT close the menu on interaction
    // the way a plain button does, since a slider is meant to be
    // dragged repeatedly, not clicked once and dismissed - same for the
    // enum's own `<details>` disclosure.
    const control = buildSpecialActionControl(id, spec, {
      rangeOptions,
      enumOptions,
      onAction: (actionId, value) => options.onStackAction?.(pileId, stackKey, actionId, value),
    });
    if (control) return { node: control };
    return { id, text: `${spec.icon} ${spec.label}`, title: spec.hint, label: spec.label, disabled: disabled.includes(id) };
  });
  document.createElement('action-menu').open({
    x: clientX,
    y: clientY,
    items,
    className: 'stack-action-menu',
    onSelect: (id) => options.onStackAction?.(pileId, stackKey, id),
  });
}

/**
 * A card's context menu. Every decision about these rows - what each
 * says, which ones need a destination picked, which need a confirm - is
 * `pileableMenuItems` (`pileActions.js`), unit-tested there; `<action-menu>`
 * draws them. What is left here is what each ACTION means for a card.
 */
function openCardContextMenu(clientX, clientY, actionIds, card, piles, fromPileId, options) {
  const rows = pileableMenuItems(actionIds);
  const items = rows.map(({ id, text, label, destructive }) => ({
    id, text, title: label, label, destructive, confirm: destructive ? ACTION_SPECS[id].hint : undefined,
  }));
  document.createElement('action-menu').open({
    x: clientX,
    y: clientY,
    items,
    onSelect: (id) => {
      // *nit (show/hide): `conceal` dispatches the same `onReveal`
      // callback - one `FLIP` reducer action, whichever direction
      // the card is going - but skips `performReveal`'s confirm, which
      // exists to warn before EXPOSING a card. Concealing exposes
      // nothing, so there is nothing to warn about.
      switch (id) {
        case 'reveal': {
          performReveal(card, options.viewerId, options.onReveal);
          break;
        }
        case 'conceal': {
          clearPileTargets();
          options.onReveal?.(card.id);
          break;
        }
        case 'rotate': {
          options.onRotate?.(card.id);
          break;
        }
        // Phase 2 (D101): a targeted action (move/pickup) has no
        // in-place effect - it needs a destination, chosen next.
        default: {
          if (rows.find((row) => row.id === id)?.targeted) beginCardTargetPick(id, card, piles, fromPileId, options);
        }
      }
    },
  });
}
