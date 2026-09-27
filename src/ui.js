import {
  ACTION_SPECS, pileableMenuItems, actionsForPileable, pileLevelActions,
  disabledPileActionsFor,
} from './pileActions.js';
import { seatPosition } from './seating.js';
import { stacksOf, stackKeyFor } from './piles/Stack.js';
import { MAX_SPREAD, MIN_SPREAD } from './piles/Pile.js';
import { PILE_TYPES } from './piles/pileTypes.js';
import {
  attachTouchDrag,
  beginCardTargetPick,
  clearPileDragOver,
  clearPileTargets,
  performPileDrop,
  pileDragFromDrop,
  pileDragToken,
  showPileDragOver,
  wireCardDrag,
  wireCardLiftCue,
} from './dragDrop.js';
import { ZONE_TYPES } from './zones/zoneTypes.js';
import { pileableFor } from './pileables/pileableTypes.js';
import { convertibleKindsFor, pileKindLabel, pileInstanceFor } from './piles/pileTypes.js';

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
function cardElement(card, { onClick, disabled, back = false } = {}) {
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
function cardBackElement(card) {
  const element = document.createElement('div');
  const extraClass = pileableFor(card).className();
  element.className = 'card card-back' + (extraClass ? ` ${extraClass}` : '');
  element.textContent = '🂠';
  if (card?.id) element.dataset.pileableId = card.id;
  return element;
}

/**
 * UX follow-up (direct user request, 2026-08-24): "small square icons
 * ... with tool tip style hover text ... keep each button the same
 * size." The button's visible content is just `spec.icon` now - the
 * full name (an override from `labels`, or `spec.label`) moves to
 * `title` (a native tooltip) and `aria-label` (so the icon-only button
 * still has a real accessible name, not just a glyph). Shared by both
 * `renderActionHeader` (piles/zones) and `attachActionRow` (cards) so
 * the icon-button contract can't drift between the two.
 */
function applyIconButton(button, spec, labelOverride) {
  const label = labelOverride ?? spec.label;
  button.textContent = spec.icon;
  button.title = label;
  button.setAttribute('aria-label', label);
}

/**
 * UX follow-up (direct user request, 2026-08-24): "the radials are not
 * working... use a header on Piles and Zones to display the actions
 * ... as a set of buttons next to the title." Retires D52's pointer-
 * centered radial menu entirely for pile/zone-level actions - the
 * heading itself IS the action row now, always visible, no hover state
 * to get wrong. Dispatch keeps D51/D36's split: an in-place action or a
 * STATIC `singleTarget` action (Draw) fires the moment it's clicked;
 * every pile-level action today is one of those two shapes (none needs
 * a "choose a destination" step - see `renderPileAnchor`'s own note),
 * so no targeting-mode branch is needed here at all.
 *
 * UX follow-up (continuing the Web Components pass): takes `container`
 * instead of creating its own `<div>`, same shape as `renderDeck`/
 * `renderPileCards` - so `<header-actions>` (`src/components/
 * HeaderActions.js`) can call this against `this`, the same "thin
 * adapter around proven logic" every other component in this pass uses.
 *
 * @param {HTMLElement} container
 * @param {string} titleText e.g. "Hand (7)"
 * @param {string[]} actionIds
 * @param {{labels?: Record<string,string>, disabled?: string[],
 *   onAction: (actionId: string, value?: string) => void, draggable?: boolean,
 *   headingId?: string, headingClass?: string, rawName?: string,
 *   onRename?: (name: string) => void,
 *   enumOptions?: Record<string, {value: string, choices: {value: string, label: string}[]}>}} opts
 *   `enumOptions[id]` supplies an EnumAction id's current value and full
 *   choice list (`buildEnumActionMenu`) - `onAction`'s second arg is only
 *   ever populated for one of those ids.
 */
/**
 * An action id that isn't a plain single-click button: an EnumAction
 * (`spec.enum`, e.g. `changePileType`, `buildEnumActionMenu`) or a
 * RangeAction (`spec.range`, e.g. `spread`, `buildRangeAction` -
 * Tighten/Loosen slider, 2026-09-13). Extracted out of
 * `renderActionHeader`'s own action loop so that loop stays under its
 * cognitive-complexity budget as more of these special cases join
 * plain buttons - each one is a self-contained "does this id need
 * something other than a button, and if so what" check.
 *
 * @returns {HTMLElement|undefined} the control to render instead of a
 *   button, or `undefined` for a plain action.
 */
function buildSpecialActionControl(id, spec, options) {
  const enumInfo = spec.enum ? options.enumOptions?.[id] : undefined;
  if (enumInfo) return buildEnumActionMenu(id, spec, enumInfo, options);
  const rangeInfo = spec.range ? options.rangeOptions?.[id] : undefined;
  if (rangeInfo) return buildRangeAction(id, spec, rangeInfo, options);
}

export function renderActionHeader(container, titleText, actionIds, options = {}) {
  container.replaceChildren();
  const extraClass = options.headingClass ? ` ${options.headingClass}` : '';
  container.className = `zone-name pile-action-header${extraClass}`;
  if (options.headingId) container.id = options.headingId;

  const label = document.createElement('span');
  label.className = 'zone-name-text';
  label.textContent = titleText;
  container.append(label);

  // *nit (2026-08-26): "allow user to rename zones and piles - any user
  // can edit". `titleText` often carries a derived suffix a pile's own
  // heading appends ("Hand (7)") that isn't part of the actual stored
  // name, so editing needs the RAW name (`options.rawName`) as its
  // starting value, not `titleText` itself - only wired when a caller
  // supplies `onRename` (a Zone with no name, e.g. the common
  // single-pile case, never gets this at all, matching how it already
  // renders no heading there).
  if (options.onRename) {
    label.title = 'Double-click to rename';
    label.classList.add('renamable');
    label.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'zone-name-edit';
      input.value = options.rawName ?? titleText;
      label.replaceWith(input);
      input.focus();
      input.select();

      let isSettled = false;
      const commit = () => {
        if (isSettled) return;
        isSettled = true;
        const name = input.value.trim();
        // A blank/unchanged edit reverts silently rather than round-
        // tripping a no-op (or a reducer throw the user never asked
        // for) through the network - same "cancel is a valid outcome"
        // spirit as the split/take confirm dialogs' Cancel button.
        if (name && name !== (options.rawName ?? titleText)) options.onRename(name);
        input.replaceWith(label);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.blur(); }
        else if (ke.key === 'Escape') { isSettled = true; input.replaceWith(label); }
      });
      // A drag on the containing heading (Zone move, D24) shouldn't
      // start while the input has focus - the same class this heading
      // uses as a drag handle would otherwise steal the mousedown.
      input.addEventListener('mousedown', (me) => me.stopPropagation());
    });
  }

  // (bloop: piles/zones/cards are all Movable) - a reparentable pile's
  // own title bar IS its drag handle for moving it between zones (or
  // reordering within one), native HTML5 DnD (same mechanism a card's
  // own drag already uses). A Zone's OWN heading deliberately does NOT
  // get this - it uses real pointer-drag (`attachPanelDrag`,
  // `wirePanelLayout`) instead, for genuine free anywhere-on-the-table
  // positioning, which a discrete native-drop-target model can't give.
  // Two different Movable mechanisms for two different entities, not
  // one shared one - see `wirePanelLayout`'s own comment.
  if (options.pileDraggable) {
    container.draggable = true;
    container.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', pileDragToken(options.pileId));
    });
  }

  for (const id of actionIds) {
    if (options.disabled?.includes(id)) continue;
    const spec = ACTION_SPECS[id];
    const specialControl = buildSpecialActionControl(id, spec, options);
    if (specialControl) {
      container.append(specialControl);
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pile-action-btn' + (spec.destructive ? ' btn-danger' : '');
    applyIconButton(button, spec, options.labels?.[id]);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      // US-61 (Sprint 23), Smith's ruling (Phase 70): each spec's own
      // `hint` already states its real consequence (reshuffleDeal's own
      // hint says it deals a fresh hand to each player; take's says it
      // takes every card) - a second, hardcoded "every player's hand
      // will be cleared" sentence bolted on here was WRONG for every
      // destructive action except reshuffleDeal, silently inherited by
      // `take` the moment it became destructive (Phase 68). One prompt,
      // built from the actual action's own hint, for all of them.
      // `options.noConfirm` (a 1-card `take`, Smith's ruling) skips the
      // dialog entirely - identical in effect to that card's own
      // un-confirmed single-card `pickup`.
      if (spec.destructive && !options.noConfirm?.includes(id) &&
        !globalThis.confirm(`${spec.hint}\n\nContinue?`)) return;
      options.onAction(id);
    });
    // D67: the `spec.target`-driven action-token drag protocol (D34/
    // D35, fixed D65) is retired - direct user correction: "drop isn't
    // triggering an action it's moving cards around." An action that
    // always resolved to the SAME fixed destination (Draw -> your own
    // hand) regardless of where you actually released the drag was
    // never real drop semantics, just a click wearing a drag costume.
    // Draw stays available as a plain click (`onAction` above); the
    // deck's own real drag-to-anywhere entry point is now
    // `renderDeckStack`'s single card visual, using the exact same
    // generic card-move mechanism (`onDropCard`) every other pile's
    // cards already use - see its own comment for why a synthetic
    // token stands in for a real card id there.
    container.append(button);
  }
}

/**
 * *nit (direct user request): "a menu for the change pile action and
 * give me an indication of the currently selected pile type." Builds an
 * EnumAction's header control: a native `<details>/<summary>` disclosure
 * (open/close, keyboard, click-outside-to-close all free from the
 * browser - no bespoke show/hide state to get wrong, same "reach for the
 * platform first" instinct as this file's native HTML5 drag) rather than
 * a plain `pile-action-btn`. The summary itself IS the indicator - it
 * shows the CURRENT choice's label, not just a generic icon, so a
 * glance at the header says what this pile is right now, not only what
 * it could become. Not a `<button>`, so it's naturally outside the
 * design-lint 44px-floor check's selector (same as `.pile-action-btn`
 * is deliberately exempted) - the small habitual header-control sizing
 * this whole row already uses, not a new exemption to add. The MENU
 * ITEMS below it, though, are real `<button>`s a viewer taps to commit
 * to - sized to the 44px floor on purpose (`style.css`'s
 * `.pile-action-menu-item`), unlike the compact toggle, since these ARE
 * the primary target once the menu is open.
 *
 * @param {string} id the action id (e.g. `'changePileType'`)
 * @param {{label: string, icon: string}} spec
 * @param {{value: string, choices: {value: string, label: string}[]}} enumInfo
 * @param {{onAction: (id: string, value: string) => void}} options
 */
function buildEnumActionMenu(id, spec, { value, choices }, options) {
  const details = document.createElement('details');
  details.className = 'pile-action-enum';

  const current = choices.find((c) => c.value === value);
  const summary = document.createElement('summary');
  summary.className = 'pile-action-enum-btn';
  summary.textContent = `${spec.icon} ${current?.label ?? value}`;
  summary.title = spec.label;
  summary.setAttribute('aria-label', `${spec.label}: ${current?.label ?? value}`);
  details.append(summary);

  const menu = document.createElement('div');
  menu.className = 'pile-action-menu';
  for (const choice of choices) {
    const item = document.createElement('button');
    item.type = 'button';
    const isCurrent = choice.value === value;
    item.className = 'pile-action-menu-item' + (isCurrent ? ' pile-action-menu-item-current' : '');
    item.textContent = choice.label;
    if (isCurrent) item.setAttribute('aria-current', 'true');
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      details.open = false;
      if (!isCurrent) options.onAction(id, choice.value);
    });
    menu.append(item);
  }
  details.append(menu);
  return details;
}

/**
 * Tighten/Loosen slider (direct user request, 2026-09-13): a
 * RangeAction (`spec.range`, e.g. `spread`/`spreadStack`) renders as
 * one `<spread-slider>` (`components/SpreadSlider.js`) instead of a
 * button - the same "static spec + per-instance value/bounds at the
 * render call site" split `buildEnumActionMenu` above already uses
 * (`rangeOptions` here, `enumOptions` there).
 *
 * The slider fires live on every drag tick (the user's own answer at
 * Smith's gate) via its `spread-input` event, forwarded straight to
 * `options.onAction(id, value)` - the same second-argument shape
 * `buildEnumActionMenu`'s choice buttons already use.
 *
 * @param {string} id the action id (e.g. `'spread'`)
 * @param {{label: string}} spec
 * @param {{value: number, min: number, max: number}} rangeInfo
 * @param {{onAction: (id: string, value: number) => void}} options
 */
function buildRangeAction(id, spec, { value, min, max }, options) {
  const slider = document.createElement('spread-slider');
  slider.className = 'pile-action-range';
  slider.setAttribute('min', String(min));
  slider.setAttribute('max', String(max));
  // `step="any"`, not `0.1`: `SET_STACK_SPREAD` rounds to 3 decimal
  // places, not to a 0.1 grid, and a fixed 0.1 step from `min` (0) can
  // never actually LAND on a kind's own ceiling when it isn't a clean
  // multiple of 0.1 - a card pile's own 0.85 is exactly this case,
  // found live: the browser refuses a `step`-misaligned value outright
  // (a stack could drag to 0.8 but never reach its true maximum).
  slider.setAttribute('step', 'any');
  slider.title = spec.label;
  slider.setAttribute('aria-label', spec.label);
  // A completed drag on a native range input fires a real `click` that
  // bubbles - inside `openStackActionMenu`'s popup, that click would
  // otherwise reach the document-level outside-click listener that
  // closes the menu (`<action-menu>`'s own), dismissing it the instant
  // a drag finishes. Every button in these menus already stops this
  // same propagation in its own click handler for the same reason.
  slider.addEventListener('click', (event) => event.stopPropagation());
  slider.addEventListener('spread-input', (event) => {
    options.onAction(id, event.detail.value);
  });
  // Set as a property, not just the initial attribute: `connectedCallback`
  // reads the attribute once on first connection, but a later external
  // update (this pile's spread changed - by this viewer's own drag once
  // it round-trips through replicated state, or by someone else's) has
  // to go through the property setter's own drag-guard
  // (`shouldApplyExternalValue`, `SpreadSlider.js`) to avoid fighting an
  // in-progress drag.
  slider.value = value;
  return slider;
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
function effectiveSpread(pileView) {
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
    // `rangeOptions.spread` (see the `renderPile` call site).
    const rangeOptions = { spreadStack: { value: stack.spread, min: MIN_SPREAD, max: maxSpread } };
    openStackActionMenu(at.left, at.bottom, ids, disabled, pileView.id, stackKeyFor(stack.id), rangeOptions, options);
  });
  return gear;
}

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
 * tooltip/aria-label and destructive-confirm gate `renderActionHeader`
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
function openStackActionMenu(clientX, clientY, actionIds, disabled, pileId, stackKey, rangeOptions, options) {
  const items = actionIds.map((id) => {
    const spec = ACTION_SPECS[id];
    // Tighten/Loosen slider (2026-09-13): `spreadStack` (`spec.range`)
    // renders as a `<spread-slider>`, same as the pile-level menu's own
    // `spread` action (`buildRangeAction`) - it does NOT close the menu
    // on interaction the way a plain button does, since a slider is
    // meant to be dragged repeatedly, not clicked once and dismissed.
    const rangeInfo = spec.range ? rangeOptions?.[id] : undefined;
    if (rangeInfo) {
      return {
        node: buildRangeAction(id, spec, rangeInfo, {
          onAction: (actionId, value) => options.onStackAction?.(pileId, stackKey, actionId, value),
        }),
      };
    }
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

/**
 * UX follow-up (direct user request): "pile-panel and header-actions
 * should be internalized in the fan-pile webcomponent... same for all
 * Pile type components." A specialized row shape (`<fan-pile>`,
 * `<deck-stack>`) is a COMPLETE Pile on its own now, not a "row"
 * `renderPile` wraps with a separately-built header - each one calls
 * this shell directly against itself. `renderPileShell` is what's
 * actually shared: the "Actionable" title bar (`<header-actions>`,
 * pile-level actions), the addressability (`data-pile-id`/`data-kind`),
 * and the drop-target wiring every Pile needs REGARDLESS of how its
 * cards are drawn - `buildRow(container)` is the one thing that
 * differs, building whatever content sits below the header and
 * returning the element drop hit-testing should measure against.
 *
 * Never draws a Zone's own box (border/padding/background) and never
 * wires its own move/resize - a Pile always lives inside a Zone
 * (`renderZonePanel`, below), which owns both of those exactly once for
 * everything inside it.
 */
export function renderPileShell(container, pile, allPiles, options, buildRow) {
  container.replaceChildren();
  container.className = 'pile-section';
  container.dataset.pileId = pile.id; // D25: addressable as a drop target
  // D45/D53: the kind travels with the element so the touch-drag path
  // (which only has the DOM node, not the view object, at drop time)
  // can resolve its own drop-target geometry too - see
  // touchTargetAt/attachTouchDrag.
  container.dataset.kind = pile.kind;

  // D95 (direct user request: "make card counts a feature for all
  // Piles... upper left corner... like a badge") - universal now, no
  // per-kind opt-in: every pile gets the same corner-stamped count,
  // here in `renderPileShell` because it's the ONE function every pile
  // component (`<pile-panel>`/`<fan-pile>`/`<deck-stack>`) actually
  // funnels through - one append, not three copies. Absolutely
  // positioned (`.pile-count-badge`, style.css) against `.pile-section`
  // itself, not any one card - the same corner regardless of whether
  // the pile renders as a flat row, a fan, or a stack. `pile.count ??
  // pile.cards.length` matches every other place a possibly-redacted
  // pile's true size is read (a hidden `deck` pile's view carries
  // `count` explicitly; every other kind's is just its real array).
  const countBadge = document.createElement('span');
  countBadge.className = 'pile-count-badge';
  // *nit: what the badge SAYS is the pile kind's own business now - a
  // chip tray stamps its total value, everything else its count.
  countBadge.textContent = (PILE_TYPES[pile.kind] ?? PILE_TYPES.plain).badge(pile);
  container.append(countBadge);

  // UX follow-up (direct user request): "like zones, Piles are
  // Actionable and should have a title bar with action buttons for
  // that pile type" - every pile's own heading is a real
  // `renderActionHeader` now (the same builder the deck's own title bar
  // already used), not a plain text div. `pileLevelActions(pile.kind,
  // ...)` returns `[]` for every kind with nothing pile-level to offer
  // (plain/discard/foundation/cascade/rankAdjacent today), so this is a
  // pure superset of the old plain-text heading for those - no visual
  // change unless a kind actually has pile-level actions.
  //
  // D91: `sortRank`/`sortSuit` used to be filtered out here - they'd
  // offered from `handPile.pileActions` since D14 with nothing behind
  // them (D14's own client-only `handOrder.js` overlay had no home left
  // once a hand became a real state-level pile). `SORT_PILE` (state.js)
  // is that real reducer action now, so the buttons are a real
  // affordance and no longer need hiding.
  const heading = document.createElement('header-actions');
  container.append(heading);
  heading.render(
    // *nit (2026-08-26), direct user request: the card count no longer
    // appears in a pile's own title text ("Deck (32)" -> "Deck") - D95
    // (below, `renderPileShell`'s own corner-badge append) is where
    // every pile's count actually shows now, not the title.
    pile.name,
    pileLevelActions(pile.kind, {
      // *fix (queued 2026-09-10, "All players have access to all pile
      // actions no matter what"): `isOwner`/`isHost`/`isShared` used to
      // gate which actions a pile OFFERED per viewer - removed along
      // with the pile classes' own gates that read them.
      // US-62 (Sprint 23): hide/show are mutually exclusive, keyed off
      // the pile's OWN current orientation (`Pile`/`DiscardPile`'s
      // `orientationActions`) - needs the actual cards, not just counts.
      cards: pile.cards,
    })
      // Found live while smoke-testing Phase 84 (US-71/D62): `remove`
      // is a KIND-level offer (`Pile.pileActions`), but the default
      // Table pile (`id: 'table'`) is exempt from REMOVE_PILE by ID,
      // not kind - offering the button there would be a guaranteed
      // confirm-then-fail (Gate 1/Gate 2's whole point was avoiding
      // exactly this). Same known-id exemption `renderZonePanel`
      // already hardcodes for the Table Zone, just for its pile
      // counterpart.
      .filter((id) => !(id === 'remove' && pile.id === 'table')),
    {
      // `pile-title`, not `panel-title` - visually/semantically distinct
      // from a Zone's own heading class, and the selector
      // `.pile-title[draggable="true"]`'s cursor affordance (style.css)
      // keys off it specifically.
      headingClass: 'pile-title',
      draggable: true,
      // UX follow-up (direct user request): "a Deck is a specific kind
      // of Pile" - which of ITS OWN offered actions are disabled (Deal,
      // at zero cards) is now read polymorphically per pile type
      // (`disabledPileActionsFor`), not a `pile.kind === 'deck'` check
      // hardcoded here.
      disabled: disabledPileActionsFor(pile.kind, pile.count ?? pile.cards.length, { cards: pile.cards }),
      // US-61 (Sprint 23), Smith's ruling (Phase 70): `take` confirms
      // unconditionally EXCEPT a 1-card pile, where it's identical in
      // effect to that card's own un-confirmed single-card `pickup`.
      // `remove` (direct user request, 2026-08-27): "it's already empty
      // so stop asking" - `disabledPileActionsFor` only ever ENABLES
      // this button when the pile is already empty, so the confirm was
      // asking about a consequence (losing cards) that can't happen.
      noConfirm: [...((pile.cards?.length ?? pile.count) === 1 ? ['take'] : []), 'remove'],
      onAction: (id, value) => options.onPileAction?.(pile.id, id, value),
      // *nit (direct user request): "a menu for the change pile action
      // and give me an indication of the currently selected pile type" -
      // `changePileType`'s current value (this pile's own `kind`) and
      // its full choice list (`CHANGE_PILE_TYPE_KINDS`, D87: every
      // registered kind, symmetrically - any pile can become any other
      // kind, deck/hand included on both ends now) live here, not in
      // `ACTION_SPECS` - the spec only knows this action IS an enum
      // (`enum: true`), never which pile it's rendering for.
      enumOptions: {
        changePileType: {
          value: pile.kind,
          // *fix (direct user request): "dont show non-chip piletypes in
          // the menu" - the choices are the PILE'S own, not every kind
          // that exists (`convertibleKindsFor`, D87 unchanged for cards).
          choices: convertibleKindsFor(pile.kind).map((kind) => ({ value: kind, label: pileKindLabel(kind) })),
        },
      },
      // Tighten/Loosen slider (2026-09-13): `spread`'s current value and
      // bounds, the RangeAction sibling of `changePileType`'s enumOptions
      // above - `ACTION_SPECS.spread` only knows this action IS a range
      // (`range: true`), never which pile or pile KIND it's rendering
      // for (the ceiling is per-kind, `Pile.js`'s own `maxSpread`).
      rangeOptions: {
        spread: {
          value: effectiveSpread(pile),
          min: MIN_SPREAD,
          max: PILE_TYPES[pile.kind]?.maxSpread ?? MAX_SPREAD,
        },
      },
      // *nit (2026-08-26): rename affordance, any player.
      rawName: pile.name,
      onRename: options.onRenamePile ? (name) => options.onRenamePile(pile.id, name) : undefined,
      // *nit (2026-08-26), direct user request: "All Movables can be
      // drag/drop" - every pile's title is a drag source now (was
      // gated to `isReparentable` kinds only). A non-reparentable kind
      // (hand/foundation/cascade/rankAdjacent - deck reversed by a
      // later *nit, see DeckPile.js) still can't change ZONES (the
      // drop handler below rejects that, matching `MOVE_PILE`'s own
      // game-rule eligibility) but CAN still be dropped onto another
      // pile to merge (below) - that's never a game-rule concern.
      pileDraggable: Boolean(options.onMovePile) || Boolean(options.onMergePile),
      pileId: pile.id,
    },
  );

  const row = buildRow(container);

  if (options.onDropCard) {
    container.addEventListener('dragover', (event) => {
      event.preventDefault();
      showPileDragOver(container, row, { x: event.clientX, y: event.clientY }, pile.kind);
    });
    container.addEventListener('dragleave', () => clearPileDragOver(container));
    container.addEventListener('drop', (event) => {
      event.preventDefault();
      // (direct user request) - "all piles can be dropped into any other
      // pile... cards added to the target, dropped pile removed once
      // empty." Direct user correction: "remove the weird zone
      // distinction, KISS" - ANY pile dropped directly onto another pile
      // merges, full stop, no same-zone/cross-zone split. A drop onto a
      // pile in a DIFFERENT zone used to bubble up to the containing
      // Zone's own drop handler (`onMovePile` - reparent as a sibling
      // there) - that reparent-as-sibling behavior still exists for a
      // pile dropped on a zone's own EMPTY space (Smith's Gate 1 ruling,
      // D55, unchanged), but landing directly ON another pile always
      // merges now, `stopPropagation()`'d here so it no longer reaches
      // that handler.
      const draggedPileId = pileDragFromDrop(event.dataTransfer);
      if (draggedPileId) {
        if (draggedPileId === pile.id) return;
        event.stopPropagation();
        options.onMergePile?.(draggedPileId, pile.id);
        return;
      }
      // An ordinary card drop DOES belong to this specific pile - stop
      // it here so the Zone's own drop handler doesn't ALSO fire and
      // spawn a redundant new pile for the same drop.
      event.stopPropagation();
      performPileDrop(container, row, pile.id, event.dataTransfer.getData('text/plain'),
        { x: event.clientX, y: event.clientY }, options.onDropCard, pile.kind);
    });
  }
}

/**
 * The FLAT row shape (`componentFor(kind) === 'pile-panel'` - every kind
 * except a hand's fan or a deck's stack) - `<pile-panel>`'s own thin
 * wrapper around `renderPileShell`, same shape `<fan-pile>`/
 * `<deck-stack>` now have for their own row shapes.
 */
/**
 * The Split picker (D91, direct user request: "we're missing... split
 * pile" - `SPLIT_PILE` (state.js) has been a real, tested reducer
 * action since long before this; there was simply never a way to
 * trigger it, on the standing "no false affordance" discipline
 * (`Pile.pileActions`'s own comment). Spec: raise the cards into a
 * tight fan and KEEP them raised until toggled off; hovering
 * highlights the nearest gap between cards, with guide marks at the
 * 25/50/75% marks along the row; clicking that gap commits.
 *
 * D92 (direct user request: "split should always fan the pile to allow
 * the guided picker" - deck included, no instant-shortcut carve-out):
 * called from `<deck-stack>` (`DeckStack.js`) exactly the same way
 * `<pile-panel>` calls it - a deck's card array is real and full in
 * the view (D84, "TOTAL PERMISSIVE" - the DATA was never redacted),
 * `DeckPile.showsFace` (always `false`) is what keeps the fan showing
 * real backs, not real faces, for a pile whose whole point is staying
 * hidden. No pile-kind branch here at all - the picker doesn't know or
 * care that a deck is any different from any other pile.
 *
 * Every card renders inert (`disabled: true`) while picking - the
 * normal drag/click affordances would fight the hover-to-choose-a-gap
 * gesture this row exists for. `pileInstanceFor`'s `showsFace` still
 * decides face-vs-back per card (same rule as the normal row) - picking
 * a split point is not a special "peek" mode.
 */
export function renderSplitPicker(container, pile, options) {
  // `fan-row` reuses the exact raise (`--raise-base`, below) and
  // overlap-margin rules the hand's own fan already established (
  // `.fan-row .middle-card`/`.fan-row .middle-card + .middle-card`,
  // style.css) - a tight fan is a tight fan, no reason to duplicate the
  // formula for a second row shape.
  const row = document.createElement('div');
  row.className = 'card-row split-picker-row fan-row';
  // Same single source as any other row - the picker fans the pile it is
  // splitting, at that pile's own spread, not at a duplicated constant.
  row.style.setProperty('--pile-spread', String(effectiveSpread(pile)));
  container.append(row);

  const pileInstance = pileInstanceFor(pile, options.viewerId);
  const wrappers = pile.cards.map((card, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card split-picker-card';
    // A shallow rotate+raise per card, pivoting off-center - just
    // enough to read as "lifted into a fan", not the full hand-fan
    // curve (`renderPileCards`' own `--raise-base`, a wider spread
    // that would push a long pile off the panel).
    const center = (pile.cards.length - 1) / 2;
    const offset = index - center;
    wrapper.style.setProperty('--raise-base', `rotate(${offset * 3}deg) translateY(${-4 - Math.abs(offset) * 1.5}px)`);
    const isBack = !pileInstance.showsFace(card, options.viewerId);
    wrapper.append(cardElement(card, { disabled: true, back: isBack }));
    row.append(wrapper);
    return wrapper;
  });

  // Anchored to `row` itself, not `container` (the whole pile-section,
  // header included) - a real bug caught before the user ever hit it
  // live: `container`'s own height spans the title bar too, so a guide
  // positioned against IT stretched from behind the header down through
  // the cards, reading as a stray line with no relationship to what was
  // under the pointer. `row` is exactly the cards' own box.
  const guides = document.createElement('div');
  guides.className = 'split-picker-guides';
  for (const pct of [25, 50, 75]) {
    const guide = document.createElement('div');
    guide.className = 'split-picker-guide';
    guide.style.left = `${pct}%`;
    guides.append(guide);
  }
  row.append(guides);

  const highlight = document.createElement('div');
  highlight.className = 'split-picker-highlight';
  highlight.hidden = true;
  row.append(highlight);

  // The x-coordinate of gap `index` (`cards[0..index)` stay, `cards
  // [index..]` move - the same convention `splitPileAt`, state.js,
  // uses) - the midpoint between the card just before it and the card
  // just after, in viewport coordinates so it can be compared straight
  // against a pointer event's own `clientX`.
  function gapX(index) {
    const before = wrappers[index - 1].getBoundingClientRect();
    const after = wrappers[index].getBoundingClientRect();
    return (before.right + after.left) / 2;
  }

  function nearestGap(clientX) {
    let nearest = 1;
    let nearestDistance = Infinity;
    for (let index = 1; index < wrappers.length; index++) {
      const distance = Math.abs(clientX - gapX(index));
      if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
    }
    return nearest;
  }

  if (wrappers.length >= 2) {
    row.addEventListener('pointermove', (event) => {
      const index = nearestGap(event.clientX);
      const rowRect = row.getBoundingClientRect();
      highlight.hidden = false;
      highlight.style.left = `${gapX(index) - rowRect.left}px`;
      highlight.dataset.index = String(index);
    });
    row.addEventListener('pointerleave', () => { highlight.hidden = true; });
    row.addEventListener('click', () => {
      if (highlight.hidden) return;
      options.onSplitCommit?.(Number(highlight.dataset.index));
    });
  }

  return row;
}

export function renderPile(container, pile, allPiles, options = {}) {
  // D91-follow-up: a pile toggled into Split/Pickup picking mode
  // (`options.splitPicker`, set by `main.js`'s local-only UI state -
  // this never reaches the reducer until a gap is actually clicked)
  // renders the picker row instead of the normal card row. Nothing
  // else about the shell (heading/actions/drop wiring) changes.
  if (options.splitPicker?.pileId === pile.id) {
    renderPileShell(container, pile, allPiles, options, (c) => renderSplitPicker(c, pile, options));
    return;
  }
  renderPileShell(container, pile, allPiles, options, (c) => {
    const row = document.createElement('div');
    row.className = 'card-row';
    c.append(row);
    renderPileCards(row, pile, allPiles, options);
    return row;
  });
}

/**
 * D55 (Sprint 23): Zone is a real, independently-declared entity -
 * `zoneRecords` (`state.zones`, `viewFor`'s `zones`) is the real
 * registry a pile's own `zoneId` points into, and each record's own
 * `type` (`'shared'`/`'perPlayer'`, `src/zones/zoneTypes.js`) drives
 * its default class/position - the same one-module-per-type dispatch
 * `PILE_TYPES` already uses for Piles, instead of `ui.js` branching on
 * whether `ownerId` happens to be truthy. This function has zero
 * opinion about which Zone a pile starts in or how it got there
 * (`state.js`'s `GameConfig.zones`/`buildPiles`/`MOVE_PILE` own that
 * entirely) - it just groups `piles` by `zoneId` and renders one
 * generic `<zone-panel>` per group.
 *
 * A `perPlayer`-type Zone renders "in front of" its owner's seat by
 * default (its own type module's `defaultPosition`); a `shared`-type
 * Zone defaults to normal flex-wrap flow (`#zones`'s own CSS). Either
 * kind switches to an absolutely-positioned, plain top-left
 * `panel-moved` panel the first time it's dragged/resized
 * (`wirePanelLayout`, `opts.layout` - a LOCAL, per-browser preference,
 * `panelLayout.js`, not replicated game state).
 *
 * `seatedPlayers` must be in the same seat order used to render the
 * roster (viewer first, D18), so a personal Zone lands at the SAME
 * seat its owner's roster entry is drawn at; one with no seated owner
 * (shouldn't happen) is skipped defensively.
 */
/**
 * One Zone group's own render (US-107, cognitive-complexity extraction
 * from `renderZones` - unchanged, including its skip-defensively `return`
 * where the loop used to `continue`).
 *
 * `zoneId`/`record` is a validated reference (`state.js`'s `buildPiles`
 * throws at table-creation time on anything that isn't) - every group
 * here has a real record, no defensive fallback needed.
 */
function renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options) {
  const record = zoneRecords.find((z) => z.id === zoneId);
  const zoneType = ZONE_TYPES[record.type];

  let seatIndex = -1;
  if (record.ownerId) {
    seatIndex = seatedPlayers.findIndex((p) => p.id === record.ownerId);
    if (seatIndex === -1) return; // owner not in the current roster (shouldn't happen) - skip defensively
  }

  const zoneElement = document.createElement('zone-panel');
  container.append(zoneElement);

  if (!record.ownerId) {
    // *nit fix (direct user request, "don't hide zone headings
    // ever"): previously suppressed for a single-pile zone (the
    // reasoning being "the lone pile's own heading already says the
    // same thing") - reversed. The suppression is exactly what made
    // an ungrouped pile (`MOVE_PILE`'s own "drop on open table space"
    // case, `zoneId` freshly minted to the pile's own id) look
    // parentless: no visible Zone heading at all, only the pile's -
    // indistinguishable from a pile that was never grouped into a
    // real Zone at all. Always render it now, `record.name` as-is.
    zoneElement.render(record.id, record.name, pilesInZone, piles, options);
    return;
  }

  const ownerName = options.resolveOwnerName?.(record.ownerId) ?? record.ownerId;
  zoneElement.render(record.id, ownerName, pilesInZone, piles, options);
  // US-121/D142: a bot's thought bubble belongs on its SEAT - which is
  // this panel, since the in-game roster ring was retired. The
  // decisions come from the talk log (`decisionsBySpeaker`); which
  // bubble is open is client-local state `main.js` holds across the
  // re-render every broadcast causes.
  const thoughts = options.thoughts?.get(record.ownerId);
  if (thoughts?.decisions.length) {
    const bubble = document.createElement('thought-bubble');
    bubble.dataset.who = ownerName;
    bubble.dataset.playerId = record.ownerId;
    zoneElement.append(bubble);
    bubble.render({ decisions: thoughts.decisions, open: options.openThoughtId === record.ownerId });
  }
  // AFTER `.render()`, not before - `renderZonePanel`'s own first
  // line (`zoneEl.className = 'zone'`) would otherwise wipe this
  // class out.
  if (zoneType.className) zoneElement.classList.add(zoneType.className);
  // `wirePanelLayout` (called inside `render` above) only ever sets
  // `left`/`top` once a REAL stored position exists - a player zone
  // with none yet still needs its ring-position default, same as it
  // always has.
  if (!zoneElement.classList.contains('panel-moved')) {
    const pos = zoneType.defaultPosition(seatIndex, seatedPlayers.length);
    if (pos) {
      zoneElement.style.left = `${pos.leftPct}%`;
      zoneElement.style.top = `${pos.topPct}%`;
    }
  }
}

export function renderZones(container, piles, seatedPlayers, zoneRecords, options = {}) {
  container.replaceChildren();

  const byZoneId = new Map();
  for (const pile of piles) {
    if (!byZoneId.has(pile.zoneId)) byZoneId.set(pile.zoneId, []);
    byZoneId.get(pile.zoneId).push(pile);
  }

  for (const [zoneId, pilesInZone] of byZoneId) {
    renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options);
  }
}

/**
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter, plus (when relevant) the
 * always-visible Deal count input - purely presentational, draw
 * mechanics (US-7) are unchanged.
 *
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - this is now ONLY the deck's row
 * content (the stack + count input), the same role `<fan-pile>` plays
 * for a hand - the heading (title + Draw/Deal/Reshuffle/Shuffle/Split
 * buttons) is built generically by `renderPile` now, via
 * `pileLevelActions('deck', ...)`, same as any other pile's heading.
 * Used both as `<deck-stack>`'s row inside `renderPile` (`opts.isHost`
 * set) and directly by the pre-game preview screen (`#host-deck-area`,
 * no opts - no host controls exist on that screen at all).
 */
/**
 * How many decorative layers sit under the deck's top card - purely a
 * visual sense of thickness, capped so a 52-card deck doesn't render 51
 * elements nobody can see. One layer per ~8 cards reads as "thick",
 * "half", "nearly gone" without anyone counting them.
 */
function deckDepth(count) {
  return Math.min(5, Math.floor((count - 1) / 8));
}

export function renderDeckStack(container, count, options = {}) {
  container.replaceChildren();
  // `classList.add`, not `className =` - `#host-deck-area` (the pre-game
  // preview screen) already carries `.deck-area` from static markup and
  // must keep it; `<deck-stack>` (inside `renderPile`) starts with none,
  // so adding is equivalent to setting there.
  container.classList.add('deck-area-row');

  // D29: the stack and the controls are SIBLINGS. The empty-deck
  // short-circuit below therefore hides the cards only - it used to hide
  // the whole container, which would have taken the deal controls with it
  // exactly when a host most needs them (Smith Gate 1 blocker). The fix
  // is the structure, not a special case inside it.
  const stack = document.createElement('div');
  stack.className = 'deck-stack';
  if (count > 0) {
    // D66/D67, direct user correction: "I should only see 1 card" -
    // was up to 3 purely decorative stacked backs; now exactly one
    // real card element, same as any other pile ever renders for a
    // single card. `options.topCard` (D67: `viewFor` now exposes a
    // hidden pile's own top card, redacted to `{id, faceDown: true}`)
    // carries the real id this needs to be a genuine drag source -
    // absent on the pre-game preview screen (`#host-deck-area`, no
    // game running yet), which stays a plain inert visual exactly as
    // before.
    // *nit (direct user request): "show the stacking for the deck of
    // cards. right now it looks like there's only 1 card there."
    //
    // This REVERSES D66/D67, which removed decorative backs on an
    // earlier direct correction ("I should only see 1 card"). Both are
    // recorded because the reason differs: that removal was about there
    // being three DRAGGABLE cards where one card should be; these layers
    // are inert (`pointer-events: none`, `aria-hidden`) and exist only
    // to give the deck depth. Exactly one real, draggable card still
    // sits on top, which is the part that correction was protecting.
    //
    // Depth scales with the deck so a thick one looks thick and the last
    // few cards visibly thin out - the count badge says the number, this
    // says "a lot" or "nearly gone" at a glance.
    // *nit: the box has to grow with the stack, or a full deck's lowest
    // layers are clipped ("a full deck needs a little more room then an
    // empty one"). Set from the real layer count so it shrinks back too.
    const depth = deckDepth(count);
    stack.style.setProperty('--deck-depth', `calc(${depth} * var(--stack-step))`);
    stack.style.setProperty('--deck-drift', `calc(${depth} * var(--stack-step-x))`);
    for (let layer = depth; layer > 0; layer--) {
      const shim = document.createElement('div');
      shim.className = 'deck-stack-layer';
      shim.style.setProperty('--layer', String(layer));
      shim.setAttribute('aria-hidden', 'true');
      stack.append(shim);
    }
    const back = cardBackElement(options.topCard);
    back.classList.add('deck-stack-card');
    stack.append(back);
    // D95 (direct user request: "make card counts a feature for all
    // Piles... like a badge"): every real pile now gets a universal
    // corner badge from `renderPileShell` itself - `<deck-stack>`'s OWN
    // badge here would double up with it. `options.pileId` is only ever
    // set by `DeckStackElement` (a real pile, wrapped in
    // `renderPileShell`); the pre-game preview screen (`#host-deck-area`)
    // calls this directly with no `pileId` and no `renderPileShell`
    // wrapper at all, so it still needs this one to show anything.
    if (!options.pileId) {
      const badge = document.createElement('span');
      badge.className = 'deck-count-badge';
      badge.textContent = count;
      stack.append(badge);
    }
    // D67, direct user correction ("drop isn't triggering an action
    // it's moving cards around... use the same mechanism as all the
    // other piles, this is a generic pile behavior for all piles"):
    // wired exactly like `renderPileCards`'s own per-card drag - a
    // real card id in `dataTransfer`, the same `onDropCard`/
    // `onCardDrag`/`attachTouchDrag` plumbing every other pile's cards
    // already use. No new mechanism, no pile-specific special case -
    // dropping this wherever it lands dispatches the ordinary MOVE/
    // PICKUP/MOVE path (`dropCardOnPile`, main.js) unchanged, because
    // it now carries a real, findable card id.
    if (options.topCard && options.onDropCard) {
      back.draggable = true;
      back.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', options.topCard.id);
      });
      back.addEventListener('drag', (event) => options.onCardDrag?.(options.topCard, event.clientX, event.clientY));
      back.addEventListener('dragend', () => options.onCardDrag?.(null, 0, 0));
      attachTouchDrag(back, options.topCard, {
        onDropCard: options.onDropCard,
        onCardDrag: options.onCardDrag,
        onCardLift: options.onCardLift,
      });
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'deck-empty';
    empty.textContent = 'Deck empty';
    stack.append(empty);
  }
  container.append(stack);

  // Deal's count input stays persistent/always-visible - unchanged from
  // D52. UX follow-up (direct user request): "just make the split action
  // always split in half" - no count input for split any more, it's a
  // one-click action like every other deck action now.
  // *fix (queued 2026-09-10, "All players have access to all pile
  // actions no matter what"): `deal`/`reshuffleDeal` are no longer
  // host-only, so this input shows for every viewer now.
  const actions = pileLevelActions('deck', {});
  if (actions.includes('deal') || actions.includes('reshuffleDeal')) {
    container.append(pileCountInput({
      value: options.dealCount ?? 1, onChange: options.onDealCountChange,
      min: 1, max: 20, ariaLabel: 'Cards to deal each player', inputId: 'deck-deal-count',
    }));
  }
}

/** D52: a small, always-visible number input for a pile-level action's
 * count setting (Deal's cards-per-player) - see `renderDeck`'s own
 * comment for why this lives outside the radial menu now. UX follow-up:
 * Split no longer has one - it always splits into 2, no count to set. */
function pileCountInput({ value, onChange, min, max, ariaLabel, inputId }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min ?? 1);
  input.max = String(max ?? 20);
  input.value = String(value ?? min ?? 1);
  input.className = 'pile-anchor-count';
  if (inputId) input.id = inputId;
  input.setAttribute('aria-label', ariaLabel ?? 'Count');
  input.addEventListener('input', () => onChange?.(Number(input.value)));
  return input;
}

/**
 * A compact fan of face-down mini-cards representing another player's
 * hand (US-21) - capped at a handful of visible backs regardless of
 * actual hand size, so this stays compact even with 3+ players holding
 * 10+ cards each (Smith Gate 1). No count badge here - the roster row's
 * own `(N cards)` text is already the exact count (Smith Sprint 3
 * close-out finding: a second badge repeating the same number ran
 * together with the row text, redundant and visually squished).
 */
function renderMiniHand(container, count) {
  container.className = 'mini-hand';
  const shown = Math.min(count, 5);
  for (let index = 0; index < shown; index++) {
    const back = document.createElement('div');
    back.className = 'mini-card-back';
    back.style.marginLeft = index === 0 ? '0' : '-0.85rem';
    container.append(back);
  }
}


/**
 * `seated: true` (US-26, D18) positions each player absolutely around
 * the table surface instead of stacking them in a plain list - same
 * per-player info as before (Smith Gate 1: this redesign changes WHERE
 * it's drawn, not what it shows), plus an explicit "You" marker on the
 * viewer's own seat (Smith Gate 1: position alone is ambiguous).
 * `players` must already be in seat order (viewer first) when seated.
 */
/**
 * One roster row (US-107, cognitive-complexity extraction from
 * `renderRoster` - unchanged). A seat is one horizontal row:
 * [-] [who they are + score] [+]. The score buttons used to be appended
 * *after* the text inside the card, which on a narrow seat pushed them
 * out past its own edge and over whatever sat next to it. Flanking the
 * info keeps both 44px targets inside the card and makes the seat
 * wider-than-taller, which is what the table has room for.
 */
/**
 * The words on a roster entry: name, connection, and whatever else is
 * true of this player right now.
 */
function rosterLabel(p, { movingIds, myId, seated, isSpectator }) {
  const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
  const moving = movingIds?.has(p.id) ? ' \u{270B} organizing hand' : '';
  const youTag = seated && p.id === myId ? ' \u{1F9D1} You' : '';
  const spectatorTag = isSpectator ? ' \u{1F440} spectating' : '';
  return `${p.name} - ${p.connection}${count}${moving}${youTag}${spectatorTag}`;
}

function scoreButton(text, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'score-btn';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function renderRosterEntry(container, p, index, players, { movingIds, scores, onAdjustScore, myId, seated } = {}) {
  const li = document.createElement('li');
  li.className = `roster-player roster-${p.connection}`;
  // US-124: a spectator is on the same roster as everyone else (D141),
  // marked rather than hidden - people need to know who is watching.
  const isSpectator = p.role === 'spectator';
  if (isSpectator) li.classList.add('roster-spectator');
  if (seated) {
    const { leftPct, topPct } = seatPosition(index, players.length);
    li.style.left = `${leftPct}%`;
    li.style.top = `${topPct}%`;
    li.classList.add('seat');
    if (p.id === myId) li.classList.add('seat-you');
  }
  const info = document.createElement('span');
  info.className = 'seat-info';
  info.append(rosterLabel(p, { movingIds, myId, seated, isSpectator }));

  if (p.id !== myId && typeof p.handCount === 'number') {
    const miniHandElement = document.createElement('div');
    renderMiniHand(miniHandElement, p.handCount);
    info.append(miniHandElement);
  }

  const hasScore = scores && Object.hasOwn(scores, p.id);
  if (hasScore) {
    const scoreElement = document.createElement('span');
    scoreElement.className = 'score-row';
    scoreElement.append(`Score: ${scores[p.id]}`);
    info.append(scoreElement);
  }

  if (hasScore && onAdjustScore) {
    li.append(scoreButton('-', () => onAdjustScore(p.id, -1)), info, scoreButton('+', () => onAdjustScore(p.id, 1)));
  } else {
    li.append(info);
  }

  container.append(li);
}

export function renderRoster(container, players, options = {}) {
  container.replaceChildren();
  // US-124/D141: spectators have no seat, so they take no place in the
  // ring - seat index and angle are computed against the SEATED players
  // only, and a spectator is drawn as a plain row instead.
  const seatedPlayers = players.filter((p) => p.role !== 'spectator');
  for (const p of players) {
    if (p.role !== 'spectator' || p.id === options.hideId) continue;
    renderRosterEntry(container, p, 0, seatedPlayers, { ...options, seated: false });
  }
  for (const [index, p] of seatedPlayers.entries()) {
    // UX follow-up: the viewer's own seat now lives in the merged
    // hand+zone panel (`renderSeatZones`'s `opts.own`), not the ring -
    // skipping the `<li>` here (not filtering `players` itself) keeps
    // everyone ELSE's seat index/angle math unchanged, since it's still
    // computed against the real roster length and position.
    if (p.id === options.hideId) continue;
    renderRosterEntry(container, p, index, seatedPlayers, options);
  }
}

/**
 * Renders the static rules-reference content (US-18) into a container.
 * One consistent block per game (goal/setup/turns), per Smith's Gate 1 AC.
 */
export function renderRulesPanel(container, rulesReference) {
  container.replaceChildren();
  for (const [name, entry] of Object.entries(rulesReference)) {
    const block = document.createElement('div');
    block.className = 'rules-entry';
    const heading = document.createElement('h3');
    heading.textContent = name;
    block.append(heading);

    const dl = document.createElement('dl');
    for (const [label, value] of [['Goal', entry.goal], ['Setup', entry.setup], ['Turns', entry.turns]]) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
    block.append(dl);
    container.append(block);
  }
}

/**
 * Toggles the "lifted" visual state on every rendered instance of a card
 * (a card can appear once per zone it's currently in - normally just
 * one place, but this stays correct regardless). Cosmetic only.
 */
export function setCardLifted(pileableId, active) {
  const els = document.querySelectorAll(`[data-pileable-id="${CSS.escape(pileableId)}"]`);
  for (const element of els) element.classList.toggle('card-lifted', active);
}

/**
 * Live remote cursor (US-22, D13): a small labeled dot positioned via
 * normalized (0-1) coordinates within `container` (the caller passes the
 * game screen element, matching how the position was captured).
 */
export function updateRemoteCursor(container, playerId, name, x, y) {
  let element = container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`);
  if (!element) {
    element = document.createElement('div');
    element.className = 'remote-cursor';
    element.dataset.cursorId = playerId;
    const label = document.createElement('span');
    label.className = 'remote-cursor-label';
    label.textContent = name;
    element.append(label);
    container.append(element);
  }
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
}

export function removeRemoteCursor(container, playerId) {
  container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`)?.remove();
}

/**
 * Live card-drag ghost (US-29, D19): same normalized-position pattern as
 * the remote cursor, but shows an actual card - its real face if `card`
 * is given (already resolved by the caller to a full `{id,rank,suit}`
 * object, only ever done for a card that's genuinely public), or a
 * generic anonymous back if `card` is `null` (still-hidden to this
 * viewer - D19's privacy rule, enforced by the sender never including a
 * resolvable id in the first place, not by this function).
 */
export function updateDragGhost(container, playerId, card, x, y) {
  let element = container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`);
  if (!element) {
    element = document.createElement('div');
    element.className = 'card-drag-ghost';
    element.dataset.cardDragId = playerId;
    container.append(element);
  }
  element.replaceChildren();
  element.append(card ? cardElement(card, { disabled: true }) : cardBackElement(null));
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
}

export function removeDragGhost(container, playerId) {
  container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`)?.remove();
}

/**
 * @param {{tone?: 'danger'|'info'}} [options] Smith HCI finding (live,
 * US-116): every prior caller is a real problem (lost host, session
 * ended) - the shared `.banner` styling (red, `--danger`) fits those.
 * The New Game notice is neutral status, not a problem, so it opts into
 * `.banner-info` instead of inheriting the alarming default - existing
 * callers are unaffected (`tone` defaults to the original look).
 */
export function renderBanner(container, message, { tone = 'danger' } = {}) {
  container.textContent = message ?? '';
  container.hidden = !message;
  container.classList.toggle('banner-info', tone === 'info');
}

export function showScreen(screens, name) {
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
}

/**
 * *fix (direct user report): "rtg deck pile's cards too small and don't
 * match the top card" - the root cause was RtG cards being sized
 * through their OWN separate `.card-rtg`-scoped constants while the
 * deck stack's decorative depth layers (and its outer box) stayed sized
 * from the global `--card-w`/`--card-h`, so the two drifted apart.
 * Direct user correction: don't special-case RtG - every card
 * measurement (`.card`, `.deck-stack`, `.deck-stack-layer`,
 * `.deck-stack-card`, hand fan spread, ...) already reads `--card-w`/
 * `--card-h` from `style.css`'s `:root`; this just makes those two
 * tokens CONFIGURABLE per running game instead of fixed, since every
 * card in one game is the same size (`preset.cardSize` in
 * `presets.js`, threaded through `gameConfig.cardSize` - see
 * `configsForPreset`/`renderGameFromView` in `main.js`). A preset that
 * doesn't declare one (every preset but RtG) leaves the stylesheet's
 * own default in place - `size` absent clears any previous override
 * rather than leaving a stale one from whatever game ran before it.
 * @param {{w: string, h: string}|null|undefined} size
 */
export function applyCardSize(size) {
  const root = document.documentElement.style;
  if (size) {
    root.setProperty('--card-w', size.w);
    root.setProperty('--card-h', size.h);
    // `--card-aspect` (style.css's `.rtg-inspect-art`) needs a plain
    // number ratio, not lengths - `aspect-ratio` can't consume
    // `--card-w`/`--card-h` directly, so this derives the same ratio
    // numerically alongside them rather than leaving it to drift.
    // eslint-disable-next-line unicorn/prefer-number-coercion -- sizes carry units ('4.4rem'); Number() would be NaN
    root.setProperty('--card-aspect', `${Number.parseFloat(size.w)} / ${Number.parseFloat(size.h)}`);
  } else {
    root.removeProperty('--card-w');
    root.removeProperty('--card-h');
    root.removeProperty('--card-aspect');
  }
}
