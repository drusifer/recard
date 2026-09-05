import { step as touchDragStep, HOLD_MS } from './touchDrag.js';
import {
  ACTION_SPECS, pileableMenuItems, actionsForPileable, pileLevelActions, targetsForAction, resolveDropTargetFor,
  disabledPileActionsFor, componentFor,
} from './pileActions.js';
import { seatPosition } from './seating.js';
import { PILE_TYPES } from './piles/pileTypes.js';
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
 * How far above the finger the drag ghost floats (Smith Gate 2 #2). A
 * ghost centred on the touch point is under the hand holding the phone,
 * and so is the `drop-onto`/`drop-before` hint beneath it — the feedback
 * this whole story exists to deliver would arrive exactly where it can't
 * be seen. There is no mouse equivalent of this problem, which is why a
 * design derived from the mouse path misses it.
 */
const GHOST_LIFT_PX = 28;

/**
 * Finds what a touch point is over. `setPointerCapture` stops events
 * retargeting, so hit-testing has to be explicit — and the ghost is
 * `pointer-events: none` precisely so it never hit-tests as itself.
 */
function touchTargetAt(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  // UX follow-up (direct user request): the hand's own local reorder
  // (`performHandReorder`, the old `.hand-card`-specific 'hand' target
  // kind) is gone along with `renderHand`/`#hand-area` - the hand pile
  // is a plain `.pile-section[data-pile-id]` now, same as any other
  // pile, so the generic branch below already finds it.
  const pile = element.closest('.pile-section[data-pile-id]');
  if (pile) return { kind: 'pile', el: pile, row: pile.querySelector('.card-row') };
  return null;
}

/** Clone of the *rendered* card face, never a re-render from card data:
 *  a redacted card is only redacted in the DOM, so cloning is safe by
 *  construction where rebuilding would not be. The face is cloned rather
 *  than the wrapper because the wrapper also holds the action row. */
function makeDragGhost(sourceElement) {
  const face = sourceElement.querySelector('.card') ?? sourceElement;
  const rect = face.getBoundingClientRect();
  const ghost = face.cloneNode(true);
  ghost.classList.add('touch-drag-ghost');
  delete ghost.dataset.pileableId; // never hit-testable, never queryable as the real card
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);
  return ghost;
}

/**
 * Positions the ghost with `left`/`top`, NOT a `transform` translate.
 * Smith found the ghost landing 38px *below* the finger despite code that
 * reads as if it floats it above: the `scale` property composes outside
 * the `transform` property, so a translate written here is itself
 * multiplied by the scale (and taken about the transform origin) - the
 * ghost drifted 12% further down the page the further it travelled.
 * `left`/`top` don't participate in that composition at all, so the pop
 * animation and the positioning stop having any relationship to argue
 * about. Same trap as the earlier animation-vs-inline-transform one, from
 * the other side: two ways to move an element are not interchangeable.
 */
function moveDragGhost(ghost, x, y) {
  ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${y - ghost.offsetHeight - GHOST_LIFT_PX}px`;
}

/**
 * Touch drag for one card (US-40, D28). The recognizer in `touchDrag.js`
 * decides *when* a drag exists; everything DOM-shaped — capture,
 * hit-testing, the ghost — lives here. Crucially, the drop itself is
 * `performHandReorder` / `performPileDrop`, the same functions the
 * native `drop` listeners call: there is one implementation of what a
 * drop means, so touch and mouse cannot drift apart.
 *
 * Mouse pointers are ignored outright — native HTML5 DnD still owns
 * them, and it gives us the drag image, Escape-to-cancel and cursor
 * feedback for free.
 */

/**
 * Wires the 5 pointer/touch events every touch-drag attachment needs
 * onto `feed` (the caller's own `touchDragStep` state-machine driver) -
 * used by every `attachTouchDrag` call (D67: including the deck's own
 * single top-card visual now, same as any other pile's cards - the
 * pile-ACTION-specific touch-drag variant this comment used to also
 * describe was retired the same commit, no longer a second caller to
 * keep in sync with). Returns a timer ref so the caller's own
 * `teardown()` can clear the same hold-timer this wiring starts.
 */
function wireTouchDragEvents(sourceElement, feed, isDragging) {
  const timerReference = { id: null };
  sourceElement.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    feed({ type: 'down', x: event.clientX, y: event.clientY, t: performance.now() });
    clearTimeout(timerReference.id);
    // A finger that never moves fires no pointermove, so the timer is
    // the only thing that can start the drag.
    timerReference.id = setTimeout(() => feed({ type: 'tick', t: performance.now() }), HOLD_MS);
    sourceElement.setPointerCapture(event.pointerId);
  });
  sourceElement.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') return;
    feed({ type: 'move', x: event.clientX, y: event.clientY, t: performance.now() });
  });
  sourceElement.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;
    clearTimeout(timerReference.id);
    feed({ type: 'up', x: event.clientX, y: event.clientY, t: performance.now() });
  });
  sourceElement.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'mouse') return;
    clearTimeout(timerReference.id);
    feed({ type: 'cancel', t: performance.now() });
  });
  // `touch-action` is resolved when the touch STARTS, so switching it to
  // `none` at lift time does nothing for the gesture already in flight —
  // and setting it up front would kill scrolling on every card forever,
  // which is the exact failure the AC forbids. Cancelling `touchmove`
  // instead works mid-gesture, and is safe here because a drag only
  // exists after 250ms of stillness, by which point the browser has not
  // begun scrolling and will still honour preventDefault.
  sourceElement.addEventListener('touchmove', (event) => {
    if (isDragging()) event.preventDefault();
  }, { passive: false });
  return timerReference;
}
function attachTouchDrag(sourceElement, card, context) {
  let state = null;
  let ghost = null;
  let hinted = null; // the pile currently showing drop feedback

  const clearHint = () => {
    if (hinted) clearPileDragOver(hinted.el, hinted.row);
    hinted = null;
  };

  const teardown = () => {
    clearTimeout(timerReference.id);
    ghost?.remove();
    ghost = null;
    sourceElement.classList.remove('card-dragging');
    clearHint();
  };

  const handle = {
    lift: (event) => {
      // Morpheus, Phase 43 review: every state broadcast rebuilds the
      // cards, and a broadcast mid-hold is routine - any other player
      // drawing causes one. That detaches `sourceEl` while the 250ms
      // timer is still armed. Removal during pointer capture *should*
      // fire `pointercancel` and clear it, but leaning on that leaves a
      // ghost cloned from a zero-sized rect, appended to `body`, with no
      // surviving handler to remove it. Checking the DOM directly costs
      // nothing and doesn't depend on a browser being well-behaved.
      if (!sourceElement.isConnected) {
        state = null;
        return;
      }
      ghost = makeDragGhost(sourceElement);
      moveDragGhost(ghost, event.x, event.y);
      sourceElement.classList.add('card-dragging');
      // Smith Gate 2 #1: the D13 cue fires HERE, not on raw pointerdown.
      // Bound to pointerdown it announced a lift the instant a finger
      // landed — so the rest of the table saw you pick a card up before
      // you did, and a finger merely brushing a card on its way to
      // scrolling broadcast a lift that never happened.
      context.onCardLift?.(card.id, true);
      context.onHandMotion?.(true);
    },
    move: (event) => {
      if (!ghost) return; // the lift was refused above; there is nothing in flight
      moveDragGhost(ghost, event.x, event.y);
      context.onCardDrag?.(card, event.x, event.y);
      const target = touchTargetAt(event.x, event.y);
      if (hinted && (target?.kind !== 'pile' || target.el !== hinted.el)) clearHint();
      if (target?.kind === 'pile') {
        showPileDragOver(target.el, target.row, { x: event.x, y: event.y }, target.el.dataset.kind);
        hinted = target;
      }
    },
    drop: (event) => {
      if (!ghost) return;
      const target = touchTargetAt(event.x, event.y);
      teardown();
      context.onCardLift?.(card.id, false);
      context.onHandMotion?.(false);
      context.onCardDrag?.(null, 0, 0);
      if (!target) return; // dropped in dead space: a no-op, same as mouse
      if (context.onDropCard) {
        performPileDrop(target.el, target.row, target.el.dataset.pileId, card.id,
          { x: event.x, y: event.y }, context.onDropCard, target.el.dataset.kind);
      }
    },
    cancel: () => {
      if (!ghost) return;
      teardown();
      // Smith Gate 1 #5: end the gesture properly. The 2s motion TTL is
      // a backstop for dropped packets, not a way to finish a drag.
      context.onCardLift?.(card.id, false);
      context.onHandMotion?.(false);
      context.onCardDrag?.(null, 0, 0);
    },
  };

  const feed = (sample) => {
    const out = touchDragStep(state, sample);
    state = out.state;
    for (const event of out.events) handle[event.type](event);
  };

  const timerReference = wireTouchDragEvents(sourceElement, feed, () => state?.phase === 'dragging');
}

// NOTE (flagged, not yet done): `renderHand`/`performHandReorder` (the
// fanned, drag-reorderable own-hand rendering) are retired along with
// the merged own-zone panel - a hand pile's cards render through the
// exact same generic `renderPileCards` every other pile's do now (`<seat-
// zone>`, `src/components/SeatZone.js`). Direct instruction was to get
// that working first; the fan/reorder/sort/pass polish this drops is a
// deliberate, temporary gap, not an oversight.

/**
 * Renders one zone's cards. Each entry is either a full card (visible to
 * this viewer) or a redacted `{id, owner, faceDown: true}` placeholder
 * (state.js's viewFor — see ARCHITECTURE.md D7). `resolveOwnerName` maps
 * an owner id to a display name (the caller already has the roster).
 */

// --- Card actions (D25) ------------------------------------------------
// Hovering a card reveals what it can do; choosing an action lights up
// every pile that can receive it, and clicking one completes the move.
// Which actions exist, and which piles qualify, both come from
// `pileActions.js` rather than being re-derived here - so the offer can
// never disagree with the rule.

/**
 * US-100/D101: where a cursor-anchored popup (the card context menu) should
 * actually render so it never spills off-screen - pure and DOM-free like
 * `pileActions.js`, so it's directly testable without a browser
 * (`tests/ui.test.js`). Shifts left/up just enough to fit; if the menu is
 * bigger than the viewport itself, pins to the origin rather than going
 * negative (a popup partly off the TOP-left is worse than one that simply
 * can't fully fit).
 *
 * @param {number} x cursor x (where the menu would naively open)
 * @param {number} y cursor y
 * @param {{width: number, height: number}} size the menu's own footprint
 * @param {{width: number, height: number}} viewport
 * @returns {{x: number, y: number}}
 */
export function clampMenuPosition(x, y, size, viewport) {
  return {
    x: Math.max(0, Math.min(x, viewport.width - size.width)),
    y: Math.max(0, Math.min(y, viewport.height - size.height)),
  };
}

/**
Drops any in-progress drag-target highlighting.
*/
export function clearPileTargets() {
  for (const element of document.querySelectorAll('.pile-target')) {
    element.classList.remove('pile-target');
  }
}

/** The element standing in for a pile id, for highlighting/clicking.
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another" - a Pile (`renderPile`, above) is what's addressable by pile
 * id, never the Zone it lives in (a Zone can hold several piles, so it
 * has no single pile id of its own to be found by). */
function pileElement(pileId) {
  return document.querySelector(`.pile-section[data-pile-id="${CSS.escape(pileId)}"]`);
}

/**
 * D51: highlights every pile a card COULD go to for the duration of a
 * native drag, mirroring `beginTargeting`'s click-flow highlighting
 * (same `.pile-target` class, same `pileElement` lookup) but for the
 * drag gesture itself rather than a click-then-choose menu - "every
 * compatible drop target must appear droppable while holding a card"
 * (the user's own wording). `actionIds` is usually more than one: a
 * zone card being dragged is a legal `move` AND, if it's pickup-
 * eligible, a legal `pickup` too - both light up together, since a
 * native drag doesn't commit to which action until the drop.
 */
function highlightDragTargets(actionIds, piles, context) {
  const ids = new Set();
  for (const action of actionIds) {
    for (const id of targetsForAction(action, piles, context)) ids.add(id);
  }
  for (const id of ids) pileElement(id)?.classList.add('pile-target');
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
    // *nit (direct user request): an EnumAction (`spec.enum`, e.g.
    // `changePileType`) renders as a menu button showing the CURRENT
    // value, not a plain single-click icon - see `buildEnumActionMenu`'s
    // own doc comment.
    const enumInfo = spec.enum ? options.enumOptions?.[id] : undefined;
    if (enumInfo) {
      container.append(buildEnumActionMenu(id, spec, enumInfo, options));
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

export function renderPileCards(container, pileView, allPiles, options = {}) {
  const { onMoveCard, onCardLift, onCardDrag } = options;
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
  for (const [index, card] of pileView.cards.entries()) {
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
    if (options.fan) {
      // UX follow-up (direct user request): "lower the peak a bit so
      // it's a more gradual curve" - then, immediately after: "it still
      // looks triangular rather than a steady curve." The rotation
      // (5deg/card) was already linear in `offset`, which is correct - a
      // real fanned hand's cards ARE spaced at roughly equal angles. The
      // droop wasn't: `Math.abs(offset) * k` is linear too, and a linear
      // vertical drop paired with a pivot around each card's OWN
      // bottom-center reads as a sharp V (two straight edges meeting at
      // the center card), not a rounded arc. Squaring `offset` instead
      // is what actually curves it - small offsets near the center barely
      // droop, larger ones toward the ends droop increasingly more,
      // tracing a parabola instead of two lines. `.fan-row`'s own bottom
      // padding (style.css) is sized to this exact formula's max droop,
      // not just eyeballed - see that rule's own comment if this changes
      // again.
      const center = (pileView.cards.length - 1) / 2;
      const offset = index - center;
      wrapper.style.setProperty('--raise-base', `rotate(${offset * 5}deg) translateY(${offset * offset * 0.08}rem)`);
    }
    // US-32/33: `data-pileable-id` makes the wrapper hit-testable for
    // drop-region detection; `data-layout` is what style.css keys the
    // stacked/overlapped rendering off, so the visual is driven straight
    // from authoritative state rather than a separate UI-side flag that
    // could drift out of sync with it.
    wrapper.dataset.pileableId = card.id;
    if (card.layout) wrapper.dataset.layout = card.layout;
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
    if (onCardLift) {
      wrapper.addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, true); });
      wrapper.addEventListener('pointerup', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, false); });
      wrapper.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, false); });
    }

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
    if (onMoveCard && pileableActions.length > 0) {
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', card.id);
        // D51: every pile (and the hand, if this card is pickup-eligible)
        // that could legally receive this SPECIFIC card lights up for the
        // whole drag - not just whichever one the pointer happens to be
        // over mid-drag (`showPileDragOver`'s existing per-hover cue,
        // unchanged, still layers on top of this once you're over one).
        // D102: 'play' used to be listed here alongside these two - a
        // hand card offers plain 'move' now, so the hand needs no entry
        // of its own in this list at all.
        highlightDragTargets(
          pileableActions.filter((a) => ['move', 'pickup'].includes(a)),
          piles,
          { viewerId: options.viewerId, fromPileId: pileView.id },
        );
      });
      wrapper.addEventListener('dragend', clearPileTargets);
      // US-29/D19: live position while dragging. A redacted placeholder
      // (`card.faceDown: true`) has no `faceUp` field either, so
      // `cardDragPayload` correctly treats it the same as hidden - even
      // a blind "put or take" move of a shared face-down card never
      // reveals its identity mid-drag.
      wrapper.addEventListener('drag', (event) => onCardDrag?.(card, event.clientX, event.clientY));
      wrapper.addEventListener('dragend', () => onCardDrag?.(null, 0, 0));
      attachTouchDrag(wrapper, card, { onDropCard: options.onDropCard, onCardDrag, onCardLift });
    }

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
    let cardOptions;
    // *nit (show/hide): the TAP gesture stays one-way on purpose. A
    // face-up card's tap is already spoken for by `rotate` (the *nit
    // that removed the hover action row gave rotate this tap because it
    // had no other trigger), and `reveal`/`rotate` never competed only
    // because reveal was offered on face-down cards alone. Making the
    // tap a toggle would take that tap away from rotate. `hide` gets
    // the right-click menu, which is where the *nit asked for it - a
    // cardAction, not a gesture.
    if (canReveal) cardOptions = { onClick: () => performReveal(card, options.viewerId, options.onReveal), back: isBack };
    else if (canRotate) cardOptions = { onClick: () => options.onRotate(card.id), back: isBack };
    else cardOptions = { disabled: true, back: isBack };
    const face = cardElement(card, cardOptions);
    if (canReveal) face.classList.add('revealable');
    if (canRotate) face.classList.add('rotatable');
    wrapper.append(face);

    // US-100/D101: right-click menu, additive to (not a replacement for)
    // the tap/drag gestures already wired above. Lists every id
    // `actionsForPileable` offers - in-place ones (rotate/reveal/conceal) fire
    // directly; targeted ones (move/pickup) start the destination
    // pick (`beginCardTargetPick`).
    attachCardContextMenu(wrapper, card, pileableActions, piles, pileView.id, options);

    container.append(wrapper);
  }
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
 * Builds and shows the actual popup, positioned at the cursor and clamped
 * on-screen (`clampMenuPosition`). Appended to `document.body` rather than
 * the card's own wrapper so it's never clipped by a pile's overflow, same
 * reasoning `pileElement` lookups already rely on for cross-cutting UI.
 */
function openCardContextMenu(clientX, clientY, actionIds, card, piles, fromPileId, options) {
  closeCardContextMenu();

  // Reuses `.pile-action-menu`/`.pile-action-menu-item` (`style.css`) -
  // the SAME visual list style.js already gives the EnumAction menu
  // (`buildEnumActionMenu`) - and layers `.card-context-menu` on top only
  // to override the anchoring (fixed at the cursor, not `absolute` under
  // a `<details>`). Direct user ask: card actions should reuse existing
  // *Actions classes, not invent a parallel look.
  const menu = document.createElement('div');
  menu.className = 'pile-action-menu card-context-menu';
  // Every decision about these rows - what each says, which ones need a
  // destination picked, which need a confirm - is `pileableMenuItems`
  // (`pileActions.js`), unit-tested there. This loop is plumbing only:
  // turn each row into a `<button>` and wire its click.
  for (const { id, text, label, destructive, targeted } of pileableMenuItems(actionIds)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pile-action-menu-item' + (destructive ? ' btn-danger' : '');
    // Icon THEN name. *nit (direct user request): "put the name of the
    // action in the card action menu" - D101 built these with
    // `applyIconButton`, the pile header's COMPACT button helper, so
    // the name was only ever a tooltip. `title`/`aria-label` keep the
    // bare name; the visible text carries both.
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    // `data-action` is what a browser test clicks by (`tests/
    // uiActions.browser.mjs`) - the row's own identity, stable across
    // relabelling, rather than matching on the text a *nit may change.
    button.dataset.action = id;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeCardContextMenu();
      if (destructive && !globalThis.confirm(`${ACTION_SPECS[id].hint}\n\nContinue?`)) return;
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
          if (targeted) beginCardTargetPick(id, card, piles, fromPileId, options);
        }
      }
    });
    menu.append(button);
  }
  document.body.append(menu);

  const rect = menu.getBoundingClientRect();
  const pos = clampMenuPosition(clientX, clientY, { width: rect.width, height: rect.height },
    { width: globalThis.innerWidth, height: globalThis.innerHeight });
  menu.style.left = `${pos.x}px`;
  menu.style.top = `${pos.y}px`;

  // Dismiss on Escape or a click anywhere outside the menu. Listeners are
  // added on the NEXT tick (not synchronously) so the `contextmenu` event
  // that opened this menu doesn't itself get read as the "outside click"
  // that closes it.
  setTimeout(() => {
    document.addEventListener('click', closeCardContextMenu, { once: true });
    document.addEventListener('keydown', onContextMenuKeydown);
  }, 0);
}

function onContextMenuKeydown(event) {
  if (event.key === 'Escape') closeCardContextMenu();
}

/**
 * Phase 2 (D101): the destination-choice step a targeted menu action
 * (move/pickup) needs, which no click-based mechanism provided
 * before this (D52's radial targeting was retired for pile/zone actions,
 * and cards only ever had native drag). Reuses the SAME
 * `highlightDragTargets` a native drag already calls on `dragstart` -
 * one lit-pile vocabulary for "where can this go", not a second one for
 * clicks - and completes through `options.onMoveCard(pileableId, pileId)`,
 * the exact callback `dragstart`'s own presence-check already gates on.
 * No new reducer/commit path.
 *
 * The commit listener runs in the CAPTURE phase and calls
 * `stopPropagation` when the click lands on a lit pile - otherwise a
 * click that both picks a destination AND happens to land on one of ITS
 * cards would also fire that other card's own tap gesture (reveal/
 * rotate) in the same click. A click that misses every lit pile just
 * cancels silently, same as dismissing the menu by clicking outside it.
 */
function beginCardTargetPick(actionId, card, piles, fromPileId, options) {
  highlightDragTargets([actionId], piles, { viewerId: options.viewerId, fromPileId });

  const cancelOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    document.removeEventListener('click', commit, true);
    clearPileTargets();
  };
  const commit = (event) => {
    document.removeEventListener('keydown', cancelOnEscape);
    const pileEl = event.target.closest?.('.pile-section.pile-target[data-pile-id]');
    if (pileEl) {
      event.stopPropagation();
      event.preventDefault();
    }
    clearPileTargets();
    if (pileEl) options.onMoveCard?.(card.id, pileEl.dataset.pileId);
  };
  // Same next-tick deferral as the menu's own dismiss listener - the
  // click that closed the menu (or the escape-hatch from a `contextmenu`
  // event on some platforms) must not double as this pick's own commit.
  setTimeout(() => {
    document.addEventListener('click', commit, { once: true, capture: true });
    document.addEventListener('keydown', cancelOnEscape, { once: true });
  }, 0);
}

function closeCardContextMenu() {
  document.querySelector('.card-context-menu')?.remove();
  document.removeEventListener('click', closeCardContextMenu);
  document.removeEventListener('keydown', onContextMenuKeydown);
}

/**
 * Boxes for drop hit-testing (US-32/33). Measures the `.card` face
 * rather than its wrapper: the wrapper also contains the Pick up / Move
 * to… controls below the card, so wrapper rects would make the "on the
 * card body" region reach well under the card into its own buttons.
 */
function cardBoxesIn(rowElement) {
  return [...rowElement.querySelectorAll('.middle-card[data-pileable-id]')].flatMap((wrapper) => {
    const face = wrapper.querySelector('.card');
    if (!face) return [];
    const r = face.getBoundingClientRect();
    return [{
      pileableId: wrapper.dataset.pileableId,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      width: r.width, height: r.height,
    }];
  });
}

const DROP_HINTS = ['drop-onto', 'drop-before', 'drop-after'];

function clearDropHints(rowElement) {
  for (const element of rowElement.querySelectorAll('.middle-card')) element.classList.remove(...DROP_HINTS);
}

/**
 * Smith Gate 1 (Nielsen #1/#6): native drag-and-drop gives no feedback
 * until release, so the *mode* a drop is about to use has to be visible
 * during the drag or it isn't discoverable at all. A glow on the card
 * body reads "will stack here"; an insertion line beside it reads "will
 * slot in here".
 */
function showDropHint(rowElement, placement) {
  clearDropHints(rowElement);
  if (!placement.targetCardId) return;
  const target = rowElement.querySelector(`.middle-card[data-pileable-id="${CSS.escape(placement.targetCardId)}"]`);
  if (!target) return;
  if (placement.layout === 'stack') target.classList.add('drop-onto');
  else target.classList.add(placement.side === 'before' ? 'drop-before' : 'drop-after');
}

/**
 * D28: the drag-over feedback and the drop itself, extracted from the
 * native listeners so the touch recognizer can call exactly the same
 * code. See `performHandReorder` for why this matters more than it
 * looks: if touch computed placement separately it would drift from
 * mouse, and only mouse is covered by the e2e suite.
 *
 * D53 (Sprint 22, replaces D45's `dropRule` string): the pile TYPE's
 * own `resolveDropTarget` (`resolveDropTargetFor`, `pileActions.js`)
 * decides the geometry - `ui.js` makes one polymorphic call, no
 * kind-branching left here at all. `plain` still resolves real
 * before/onto/after halo geometry (delegated to `dropTarget.js`
 * internally by `Pile.js`); `deck`/`hand`/`discard` still resolve
 * to `{}` (plain append, no positional choice) - same outcomes as
 * before, just owned by each module instead of switched on centrally.
 */
function showPileDragOver(pileElement, row, point, kind) {
  pileElement.classList.add('drag-over');
  showDropHint(row, resolveDropTargetFor(kind, cardBoxesIn(row), point));
}

function clearPileDragOver(pileElement, row) {
  pileElement.classList.remove('drag-over');
  clearDropHints(row);
}

function performPileDrop(pileElement, row, pileId, pileableId, point, onDropCard, kind) {
  clearPileDragOver(pileElement, row);
  if (!pileableId) return;
  // US-32/33: the drop point decides stack vs. overlap vs. plain
  // append. Aiming at the card being dragged itself is meaningless
  // (it's about to leave that position), so it's treated as open
  // space rather than a self-referential placement.
  const placement = resolveDropTargetFor(kind, cardBoxesIn(row).filter((b) => b.pileableId !== pileableId), point);
  onDropCard(pileableId, pileId, placement);
}

/**
 * Builds one zone's sub-panel (name/count heading + its cards) - shared
 * by `renderZones` (shared zones) and `renderSeatZones` (personal zones)
 * so the drop-target wiring below only needs to exist once.
 *
 * US-28: dropping a dragged card here plays it (from hand) or moves it
 * (from another pile) - `opts.onDropCard(pileableId, pile.id)` does the
 * MOVE dispatch (main.js knows where the card currently
 * lives, this file doesn't need to). Additive: tap-to-play and the
 * "Move to…" dropdown are untouched, this is one more way in, not a
 * replacement (Smith Gate 1). The zone highlights while a drag is over
 * it (Smith Gate 1: Nielsen #1, drag needs a droppable-here affordance)
 * and reverts on drop/dragleave; dropping somewhere invalid is naturally
 * a no-op since nothing here ever moves a DOM node directly - only a
 * successful `onDropCard` dispatch (and the resulting re-render) changes
 * what's on screen.
 */
/**
 * UX follow-up (direct user request): move + resize as one shared,
 * "normalized" wiring pass - EVERY zone panel calls this exact
 * function (`renderZonePanel` below, and `renderDeck`'s own caller in
 * main.js), so the deck offers the identical resize/move interface a
 * zone does rather than a bespoke copy. `id` keys `opts.layout`
 * (`panelLayout.js`, local per-browser storage). `headingEl` is the
 * drag handle for repositioning - `null` is fine, `attachPanelDrag`
 * no-ops.
 *
 * *nit (2026-08-26) history: briefly deleted ("remove pointer-based
 * panel behavior"), then DIRECTLY RESTORED by the user: "zone movement
 * is still broken, it was working great until you broke it - Zones can
 * be moved anywhere on the table." Piles use a DIFFERENT mechanism -
 * native HTML5 drag, `renderPileShell`'s `pileDraggable` - for their
 * own different capability (reparent into another Zone, or reorder
 * among siblings, both discrete target-based operations). A Zone
 * needs genuine free, continuous, anywhere-on-the-table placement,
 * which only real pointer-tracking gives - the two were never
 * actually the same capability wearing two names, despite both being
 * "drag this panel."
 */
export function wirePanelLayout(panelElement, id, headingElement, options) {
  if (options.onResizePanel) {
    panelElement.classList.add('panel-resizable');
    const stored = options.layout?.[id];
    // *nit (2026-08-26), real bug found live: a Zone's own `flex-grow:
    // 1` (`#zones > .zone`, every shared/standalone panel) OUTRANKS an
    // explicit `style.width` - the resize handle set the width
    // correctly, but the browser grew the panel right back past it to
    // fill the row anyway. `panel-sized` (style.css) sets `flex-grow: 0`
    // once a panel has a real stored width, so an explicit size actually
    // sticks. Applied here for a STORED width (page load / preset);
    // `attachPanelResize` applies the same class live, for a resize
    // that just happened this session.
    if (typeof stored?.w === 'number') {
      panelElement.style.width = `${stored.w}px`;
      panelElement.classList.add('panel-sized');
    }
    if (typeof stored?.h === 'number') {
      panelElement.style.height = `${stored.h}px`;
      // A resized-short panel needs somewhere for overflow to go rather
      // than spilling past its own border - scroll, not clip, so cards
      // already in it are never simply hidden.
      panelElement.style.overflowY = 'auto';
    }
    attachPanelResize(panelElement, id, options.onResizePanel);
  }
  if (options.onMovePanel) {
    const stored = options.layout?.[id];
    if (typeof stored?.x === 'number' && typeof stored?.y === 'number') {
      panelElement.classList.add('panel-moved');
      panelElement.style.left = `${stored.x}px`;
      panelElement.style.top = `${stored.y}px`;
    }
    attachPanelDrag(headingElement, panelElement, id, options.onMovePanel);
  }
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
      isOwner: pile.ownerId === options.viewerId,
      isHost: options.isHost,
      // US-60/61 (Sprint 23): a shared (ownerless) plain/discard pile's
      // split/take are open to any player - `Pile`/`DiscardPile`'s
      // own `pileActions` can't tell "shared" from "someone else's
      // personal pile" from `isOwner` alone (both are simply `false`).
      isShared: pile.ownerId == undefined,
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
      // *nit (Tighten/Loosen): the pile's CURRENT effective spread goes
      // in too, so Tighten is disabled at maximum and Loosen at minimum
      // rather than being a dead click there. `?? defaultSpread` is
      // resolved here because only this layer knows whether this pile
      // has ever been adjusted; the class only knows its type's default.
      disabled: disabledPileActionsFor(pile.kind, pile.count ?? pile.cards.length,
        { spread: effectiveSpread(pile), cards: pile.cards }),
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
    container.addEventListener('dragleave', () => clearPileDragOver(container, row));
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
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another." Renders a ZONE: the bordered/padded/positioned box, ONE
 * title bar (`title` - the ZONE'S OWN name, distinct from any pile
 * inside it - `null` for the common single-pile case, where the lone
 * pile's own heading doubles as the drag handle instead of adding a
 * redundant second one), and every Pile it holds as its own
 * `<pile-panel>` child (`piles`, always a non-empty array - even a
 * "plain" shared zone like a CREATE_ZONE'd one or a Solitaire
 * foundation is a Zone holding exactly one Pile now, not a Zone/Pile
 * hybrid). `id` keys `opts.layout` (`panelLayout.js`) - the STABLE
 * identity of this Zone, independent of which/how many piles it holds.
 *
 * Move/resize (`wirePanelLayout`) is wired EXACTLY ONCE, here, for the
 * whole Zone - "Piles move with their containing Zone." A Pile
 * (`renderPile`, above) never wires its own.
 */
export function renderZonePanel(zoneElement, id, title, piles, allPiles, options) {
  zoneElement.replaceChildren();
  zoneElement.className = 'zone';
  // The Zone's own stable identity (`opts.layout` key) - distinct from
  // any one pile's own `data-pile-id` (`renderPile`), since a Zone can
  // hold several piles and so has no single pile id of its own.
  zoneElement.dataset.groupId = id;

  // *nit fix (direct user request, "don't hide zone headings ever"):
  // previously conditional on `title` being truthy - a standalone
  // 1-pile zone's heading was suppressed on the reasoning that the
  // lone pile's own title already said the same thing. Reversed: every
  // Zone renders its own heading now, unconditionally, consistent
  // regardless of pile count or whether it has a name yet - this is
  // also the pointer-drag handle (`wirePanelLayout`'s own comment has
  // the full "zones need free positioning" reasoning).
  const heading = document.createElement('header-actions');
  zoneElement.append(heading);
  // US-71 (D62): `remove` offered on every Zone with its own heading
  // EXCEPT the Table Zone - the one exemption checkable here without
  // new plumbing (a fixed, known id); everything else the reducer
  // itself is the real gate for (preset-declared, non-empty), same
  // "offer generically, reducer authorizes" discipline every other
  // action in this table already follows (D43).
  const zoneActionIds = id === 'table-zone' ? [] : ['remove'];
  heading.render(title, zoneActionIds, {
    headingClass: 'panel-title',
    // *nit (2026-08-26): rename affordance, any player.
    rawName: title,
    onRename: options.onRenameZone ? (name) => options.onRenameZone(id, name) : undefined,
    onAction: (actionId) => { if (actionId === 'remove') options.onRemoveZone?.(id); },
    // *nit (direct user request, "don't enable X unless empty"): same
    // Nielsen #5 reasoning as the pile-level `remove`/`changePileType`
    // disabling (`Pile.disabledActions`) - REMOVE_ZONE is empty-only
    // at the reducer (D62) too; a Zone is "empty" when it has no
    // piles left in it, `piles` (this function's own param) already
    // says exactly that.
    disabled: piles.length > 0 ? ['remove'] : [],
  });
  const dragHandle = heading;

  const body = document.createElement('div');
  body.className = 'zone-body';
  zoneElement.append(body);

  // (bloop: piles/zones/cards are all Movable) - a card dropped on the
  // Zone's own EMPTY space (not onto any pile inside it) spawns a
  // brand-new pile here, seeded with that card. Wired on `body`, not
  // `zoneEl` itself - `zoneEl` also contains the heading/pile-panel
  // children, and a drop landing on one of THOSE is handled by that
  // pile's own listener (`renderPileShell`, which now stops
  // propagation so it never also reaches this one).
  // (bloop) also handles a dragged PILE dropped here - reparenting it
  // into THIS zone as a sibling (Smith's Gate 1 ruling, D55: always a
  // sibling, never a merge). `renderPileShell`'s own per-pile drop
  // handler ignores a pile-drag-token and lets it bubble up here
  // unhandled (rather than misreading it as a card id) - a pile
  // reparents into the ZONE it lands in, not specifically the other
  // pile pixel it happened to land on top of.
  if (options.onDropCardOnZone || options.onMovePile) {
    // D35 note (unchanged reasoning): real browsers don't expose
    // `dataTransfer` values during `dragover`, only `.types` - so the
    // pile-action/pile-drag/card distinction only happens at DROP time,
    // same as every other drop target in this file. `dragover` always
    // just previews "something droppable" unconditionally.
    body.addEventListener('dragover', (event) => {
      event.preventDefault();
      // `zoneElement` (`.zone`), not `body` (`.zone-body`) - matches the
      // existing `.zone.drag-over` CSS rule (Phase 72's task.md AC:
      // "reuses the drag-over highlight"); toggling it on `body` alone
      // wouldn't match either that rule or `.pile-section.drag-over`,
      // so nothing would actually render.
      zoneElement.classList.add('drag-over');
    });
    body.addEventListener('dragleave', (event) => {
      if (event.target === body) zoneElement.classList.remove('drag-over');
    });
    body.addEventListener('drop', (event) => {
      event.preventDefault();
      zoneElement.classList.remove('drag-over');
      // Stop here, whichever branch below actually applies - otherwise
      // this would ALSO bubble to `#zones`'s own "drop on open table
      // space ungroups" handler (`main.js`), double-dispatching a
      // reparent-into-this-zone AND an ungroup for the same drop.
      event.stopPropagation();
      const pileId = pileDragFromDrop(event.dataTransfer);
      if (pileId) { options.onMovePile?.(pileId, id); return; }
      const pileableId = event.dataTransfer.getData('text/plain');
      if (pileableId) options.onDropCardOnZone?.(pileableId, id);
    });
  }

  // UX follow-up (direct user request): "a Deck is a specific kind of
  // Pile... it is not a Zone at all" / "pile-panel and header-actions
  // should be internalized in the fan-pile webcomponent, same for all
  // Pile type components" - which ELEMENT renders a pile is decided
  // here, off the pile CLASS's own `static component` (D56, `componentFor`,
  // `pileActions.js`), never a `pile.kind === 'hand'` check inside any
  // one component. `<fan-pile>`/`<deck-stack>` are now fully self-
  // contained Piles (their own header+row+drop wiring, via
  // `renderPileShell`) - `<pile-panel>` is just the flat-row case's own
  // equally-thin wrapper, not a generic container the other two nest
  // inside any more.
  for (const pile of piles) {
    const element = document.createElement(componentFor(pile.kind));
    body.append(element);
    element.render(pile, allPiles, options);
  }

  // Bug fix (direct user request): a card dropped on a Zone's own empty
  // space spawns a new pile there (the `body` listener above) - but a
  // Zone whose box shrinks exactly to its piles' content (`.seat-zone`,
  // `width: max-content`) has NO empty space to land on once its one
  // pile (the hand) fills the whole body; a Table Zone only "just
  // works" because `.zone:not(.seat-zone)` flex-grows into its row's
  // leftover width for free. Confirmed live: a `.seat-zone`'s
  // `.zone-body` bounding box was pixel-identical to its lone
  // `.pile-section`'s. One reserved, always-present flex child (sized
  // to one card slot) restores real droppable space generically, for
  // every zone type - not just `.seat-zone` - so laying down a meld
  // beside a hand works the same way dropping onto the Table Zone does.
  if (options.onDropCardOnZone || options.onMovePile) {
    const gutter = document.createElement('div');
    gutter.className = 'zone-drop-gutter';
    body.append(gutter);
  }

  wirePanelLayout(zoneElement, id, dragHandle, options);
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
export function renderZones(container, piles, seatedPlayers, zoneRecords, options = {}) {
  container.replaceChildren();

  const byZoneId = new Map();
  for (const pile of piles) {
    if (!byZoneId.has(pile.zoneId)) byZoneId.set(pile.zoneId, []);
    byZoneId.get(pile.zoneId).push(pile);
  }

  for (const [zoneId, pilesInZone] of byZoneId) {
    // `zoneId` is a validated reference (`state.js`'s `buildPiles`
    // throws at table-creation time on anything that isn't) - every
    // group here has a real record, no defensive fallback needed.
    const record = zoneRecords.find((z) => z.id === zoneId);
    const zoneType = ZONE_TYPES[record.type];

    let seatIndex = -1;
    if (record.ownerId) {
      seatIndex = seatedPlayers.findIndex((p) => p.id === record.ownerId);
      if (seatIndex === -1) continue; // owner not in the current roster (shouldn't happen) - skip defensively
    }

    const zoneElement = document.createElement('zone-panel');
    container.append(zoneElement);

    if (record.ownerId) {
      const ownerName = options.resolveOwnerName?.(record.ownerId) ?? record.ownerId;
      zoneElement.render(record.id, ownerName, pilesInZone, piles, options);
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
    } else {
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
    }
  }
}

/** Never let a resize shrink a panel past the point its own content
 * (a card, a heading) stops fitting - matches `.seat-zone`'s own CSS
 * `min-width` floor for the un-resized case, just enforced here too so
 * a resize can't undercut it. */
const MIN_PANEL_WIDTH_PX = 160;
/** Same idea for height - tall enough for the heading plus one row of
 * cards, so a vertical resize can't collapse a zone to an unusable
 * sliver (the `overflow-y: auto` `renderZonePanel` sets handles a
 * SHORTER-than-content panel gracefully; this stops it going shorter
 * than makes sense at all). */
const MIN_PANEL_HEIGHT_PX = 90;

/**
 * UX follow-up (direct user request): "grab bars and click title...
 * grabbing the title to move the panel to a different place on the
 * table." `headingEl` (a panel's own `.zone-name`) is the drag handle;
 * `panelEl` is what actually moves (`left`/`top`, percentages of
 * `#table-surface` - the same coordinate convention `seating.js`'s
 * `seatPosition()` already uses for everything absolutely positioned
 * there). Mouse-only (`e.pointerType`), matching this whole redesign
 * pass's established desktop-only scope. Dispatches `onMove(id, x, y)`
 * ONCE, on release, not on every pointermove - the position only needs
 * to persist to `localStorage` (`panelLayout.js`) once the gesture is
 * done, not on every intermediate pixel; the live drag itself is purely
 * a local style update until then.
 *
 * *nit (2026-08-26): restored after a same-day round trip (deleted,
 * then the user directly corrected that "zones can be moved anywhere
 * on the table" - this is a Zone-only capability now, wired onto a
 * Zone's own separate heading, never onto a Pile's title, which uses
 * native drag for its own different, discrete-target capability
 * instead - see `wirePanelLayout`'s own comment for the full reasoning.
 */
function attachPanelDrag(headingElement, panelElement, id, onMove) {
  if (!headingElement) return;
  headingElement.classList.add('panel-drag-handle');
  headingElement.addEventListener('pointerdown', (event) => {
    // Buttons in the header (pile-action-btn, score +/-) must keep
    // working as plain clicks, not become a drag's starting point.
    if (event.pointerType !== 'mouse' || event.target.closest('button')) return;
    event.preventDefault();
    // `offsetParent`, not a hardcoded `#table-surface`: every panel is a
    // direct child of `#zones` now, but this still generalizes correctly
    // regardless of what any panel's positioning ancestor actually is.
    const parentRect = (panelElement.offsetParent || document.querySelector('#table-surface')).getBoundingClientRect();
    const startRect = panelElement.getBoundingClientRect();
    // Offset from the pointer to the panel's own top-left, so the panel
    // doesn't jump to re-center itself on the cursor the instant the
    // drag starts - it moves exactly as far as the pointer does.
    const grabDx = event.clientX - startRect.left;
    const grabDy = event.clientY - startRect.top;
    // UX follow-up (real bug, found live): a panel that has never been
    // moved is still positioned by its OWN default mechanism (a personal
    // zone's seatPosition ring math + centering transform, a shared
    // zone's normal flex-wrap flow) - taking it out of that flow onto a
    // plain top-left `position: absolute` needs an anchor computed from
    // where it's ACTUALLY sitting right now, or it jumps the instant the
    // drag starts. Idempotent for a panel already in `panel-moved` mode
    // (a second drag, or a personal zone whose position was already
    // stored) - this produces the same left/top it already had.
    panelElement.classList.add('panel-moved');
    panelElement.style.left = `${startRect.left - parentRect.left}px`;
    panelElement.style.top = `${startRect.top - parentRect.top}px`;

    panelElement.classList.add('panel-dragging');
    document.body.classList.add('panel-drag-active');

    const onPointerMove = (event) => {
      const x = event.clientX - grabDx - parentRect.left;
      const y = event.clientY - grabDy - parentRect.top;
      panelElement.style.left = `${x}px`;
      panelElement.style.top = `${y}px`;
      panelElement.dataset.dragX = x;
      panelElement.dataset.dragY = y;
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      panelElement.classList.remove('panel-dragging');
      document.body.classList.remove('panel-drag-active');
      const x = Number(panelElement.dataset.dragX);
      const y = Number(panelElement.dataset.dragY);
      delete panelElement.dataset.dragX;
      delete panelElement.dataset.dragY;
      if (Number.isFinite(x) && Number.isFinite(y)) onMove(id, x, y);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
}

/**
 * UX follow-up (direct user request): a resize handle in the panel's
 * own bottom-right corner, alongside the title-bar move handle
 * (`attachPanelDrag`) - and, per a follow-up ask, BOTH axes, not just
 * width, from the one corner handle (matching its own `nwse-resize`
 * cursor, which already implied two-way). Same local, dispatch-once-
 * on-release shape as `attachPanelDrag` - `onResize(id, w, h)` fires on
 * pointerup, not on every pointermove. `w`/`h` are PLAIN PIXELS, not a
 * percentage - real bug, found live: a shared (`#table-area`) zone is
 * still in normal flex flow, whose own height is intrinsic/content-
 * driven, and CSS only resolves a percentage `height` against a
 * DEFINITE ancestor height (a well-known quirk - percentage widths
 * mostly "just work" against auto-width containers, percentage heights
 * do not). That silently no-opped every vertical resize on a shared
 * zone while width (and personal zones, already `position: absolute`
 * either way) looked fine. Plain pixels sidestep the whole question.
 */
function attachPanelResize(panelElement, id, onResize) {
  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  handle.title = 'Drag to resize';
  panelElement.append(handle);

  handle.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return;
    event.preventDefault();
    event.stopPropagation(); // don't also let this bubble into a move-drag
    // `offsetParent`, not a hardcoded `#table-surface`: a personal zone's
    // is `#seat-zones` (which exactly overlays `#table-surface`, so the
    // numbers agree either way), but a shared zone's is `#table-area` -
    // a smaller, offset box within it. The clamp below only needs SOME
    // stable outer bound to avoid an unbounded resize, not that specific
    // element.
    const bound = (panelElement.offsetParent || document.querySelector('#table-surface')).getBoundingClientRect();
    const startRect = panelElement.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    // *nit (2026-08-26): `flex-grow: 1` would otherwise grow the panel
    // right back past whatever width this drag is about to set - see
    // `wirePanelLayout`'s own comment on `.panel-sized`. Added the
    // instant the drag STARTS (not just on the next full render from
    // stored layout), so even a first-ever resize actually holds.
    panelElement.classList.add('panel-resizing', 'panel-sized');
    document.body.classList.add('panel-resize-active');

    const onPointerMove = (event) => {
      const w = Math.min(
        Math.max(startRect.width + (event.clientX - startX), MIN_PANEL_WIDTH_PX),
        bound.width * 0.9,
      );
      const h = Math.min(
        Math.max(startRect.height + (event.clientY - startY), MIN_PANEL_HEIGHT_PX),
        bound.height * 0.9,
      );
      panelElement.style.width = `${w}px`;
      panelElement.style.height = `${h}px`;
      panelElement.style.overflowY = 'auto';
      panelElement.dataset.resizeW = w;
      panelElement.dataset.resizeH = h;
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      panelElement.classList.remove('panel-resizing');
      document.body.classList.remove('panel-resize-active');
      const w = Number(panelElement.dataset.resizeW);
      const h = Number(panelElement.dataset.resizeH);
      delete panelElement.dataset.resizeW;
      delete panelElement.dataset.resizeH;
      if (Number.isFinite(w) && Number.isFinite(h)) onResize(id, w, h);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
}

// positionHandZone (D51) retired, UX follow-up: the hand no longer has
// its own separately-positioned element - it renders inside the
// viewer's own zone panel now (`renderSeatZones`'s `opts.own`, above),
// which is already positioned by that same function. Nothing left to
// position separately.

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
  const actions = pileLevelActions('deck', { isHost: options.isHost === true });
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

// (bloop: piles/zones/cards are all Movable) - a dragged PILE (its own
// title bar is the handle, `renderPileShell`) carries its id the same
// tagged-string way a pile-ACTION token does, so every drop target's
// existing "is this actually a plain card?" check can tell the three
// payload shapes apart with one string prefix test each, no new
// `dataTransfer` MIME type needed (browsers only reliably round-trip
// `text/plain` through a real drag, D35's own standing note).
const PILE_DRAG_TOKEN_PREFIX = 'pile-drag:';

function pileDragToken(pileId) {
  return `${PILE_DRAG_TOKEN_PREFIX}${pileId}`;
}

/**
Same shape as `pileActionFromDrop` - only meaningful at `drop` time.
*/
export function pileDragFromDrop(dataTransfer) {
  const raw = dataTransfer.getData('text/plain');
  return raw.startsWith(PILE_DRAG_TOKEN_PREFIX) ? raw.slice(PILE_DRAG_TOKEN_PREFIX.length) : null;
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
export function renderRoster(container, players, { movingIds, scores, onAdjustScore, myId, seated, hideId } = {}) {
  container.replaceChildren();
  for (const [index, p] of players.entries()) {
    // UX follow-up: the viewer's own seat now lives in the merged
    // hand+zone panel (`renderSeatZones`'s `opts.own`), not the ring -
    // skipping the `<li>` here (not filtering `players` itself) keeps
    // everyone ELSE's seat index/angle math unchanged, since it's still
    // computed against the real roster length and position.
    if (p.id === hideId) continue;
    const li = document.createElement('li');
    li.className = `roster-player roster-${p.connection}`;
    if (seated) {
      const { leftPct, topPct } = seatPosition(index, players.length);
      li.style.left = `${leftPct}%`;
      li.style.top = `${topPct}%`;
      li.classList.add('seat');
      if (p.id === myId) li.classList.add('seat-you');
    }
    const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
    const moving = movingIds?.has(p.id) ? ' \u{270B} organizing hand' : '';
    const youTag = seated && p.id === myId ? ' \u{1F9D1} You' : '';

    // A seat is one horizontal row: [-] [who they are + score] [+].
    // The score buttons used to be appended *after* the text inside the
    // card, which on a narrow seat pushed them out past its own edge and
    // over whatever sat next to it. Flanking the info keeps both 44px
    // targets inside the card and makes the seat wider-than-taller,
    // which is what the table has room for.
    const info = document.createElement('span');
    info.className = 'seat-info';
    info.append(`${p.name} - ${p.connection}${count}${moving}${youTag}`);

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
      const minusButton = document.createElement('button');
      minusButton.type = 'button';
      minusButton.className = 'score-btn';
      minusButton.textContent = '-';
      minusButton.addEventListener('click', () => onAdjustScore(p.id, -1));

      const plusButton = document.createElement('button');
      plusButton.type = 'button';
      plusButton.className = 'score-btn';
      plusButton.textContent = '+';
      plusButton.addEventListener('click', () => onAdjustScore(p.id, 1));

      li.append(minusButton, info, plusButton);
    } else {
      li.append(info);
    }

    container.append(li);
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

export function renderBanner(container, message) {
  container.textContent = message ?? '';
  container.hidden = !message;
}

export function showScreen(screens, name) {
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
}
