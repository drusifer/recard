// US-133/D160, cluster 2: every way a card or a pile is dragged, and where it
// lands - moved out of `ui.js` unchanged. The pure decisions stay where they
// were (`dropTarget.js`, `touchDrag.js`, `pileActions.js`); this is the DOM
// wiring around them: making a card draggable, the touch-drag ghost, lighting
// the piles a card may go to, the live drop preview, the drop itself, and the
// menu's "pick a destination" step (which reuses the SAME lit piles and the
// SAME preview a native drag draws - one vocabulary for "where can this go").
//
// A plain module, not a component: it wires behaviour onto elements other
// components render. It touches `document` only when called, never at load,
// so node unit tests can still import it (`dragImageAnchor`).
import { step as touchDragStep, HOLD_MS } from './touchDrag.js';
import { targetsForAction, resolveDropTargetFor } from './pileActions.js';

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

export function attachTouchDrag(sourceElement, card, context) {
  let state = null;
  let ghost = null;
  let hinted = null; // the pile currently showing drop feedback

  const clearHint = () => {
    if (hinted) clearPileDragOver(hinted.el);
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
 * *fix (direct user bug report, 2026-09-17, corrected same day): "drag
 * is weird, not scaled right so the dragged items fall behind the
 * mouse pointer" - then, after a first attempt: "still off, it needs
 * to readjust when the table zoom changes."
 *
 * `DataTransfer.setDragImage(image, x, y)` anchors the drag ghost at
 * `(x, y)` into the image the browser ACTUALLY RENDERS, which reflects
 * every ancestor CSS transform - `--table-zoom`'s `scale()` on
 * `#zones`, but also anything else that ever scales/rotates a card
 * (hover-raise's own `--raise-base`, a future effect, etc.).
 *
 * The FIRST fix multiplied the element's unscaled `offsetWidth`/
 * `offsetHeight` by the table's own `--table-zoom` value read back off
 * `#zones` - correct for a plain table-zoom-only case, but it silently
 * assumed that was the ONLY transform in play, and re-deriving a scale
 * factor from a specific CSS variable is exactly the kind of thing
 * that drifts out of sync (a rotation nudge alone changes the
 * axis-aligned rendered box even at zero scale). This version instead
 * measures the card's own ACTUAL on-screen size directly
 * (`getBoundingClientRect()`, called fresh at every dragstart) -
 * correct under any combination of transforms, current or future,
 * with nothing to keep in sync.
 *
 * @param {number} renderedWidth the dragged element's actual on-screen
 *   width (`getBoundingClientRect().width`), not its unscaled layout size
 * @param {number} renderedHeight its actual on-screen height
 * @returns {{x: number, y: number}}
 */
export function dragImageAnchor(renderedWidth, renderedHeight) {
  return { x: renderedWidth / 2, y: renderedHeight / 2 };
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
export function pileElement(pileId) {
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

/** Card-lift cue wiring (US-22/D13, US-107 extraction) - mouse only,
 * unchanged; see `renderPileCards`' own call site comment for why touch
 * gets the cue from the drag recognizer instead. */
export function wireCardLiftCue(wrapper, card, onCardLift) {
  if (!onCardLift) return;
  wrapper.addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, true); });
  wrapper.addEventListener('pointerup', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, false); });
  wrapper.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') onCardLift(card.id, false); });
}

/** Native-drag wiring (US-28/US-29/D19, US-107 extraction) - unchanged;
 * see `renderPileCards`' own call site comment for the authorization
 * reasoning behind when a card is draggable at all. */
export function wireCardDrag(wrapper, card, pileableActions, piles, pileView, options) {
  const { onMoveCard, onCardLift, onCardDrag } = options;
  if (!onMoveCard || pileableActions.length === 0) return;
  wrapper.draggable = true;
  wrapper.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', card.id);
    // *nit (direct user report: "the tokens have a drag and drop shape
    // of a card"): `wrapper` (`.middle-card`, a plain flex box with no
    // shape of its own) is what `draggable` is set on, not the visual
    // `.card` child - so the browser's DEFAULT drag image is a snapshot
    // of the WRAPPER's own rectangular box, ignoring whatever shape the
    // child actually paints (a token's clip-path gem). Pointing
    // `setDragImage` at the real face directly is what makes the
    // dragged image match what's actually on screen, for every card
    // shape, not just rectangular ones.
    const face = wrapper.querySelector('.card');
    if (face) {
      const rect = face.getBoundingClientRect();
      const anchor = dragImageAnchor(rect.width, rect.height);
      event.dataTransfer.setDragImage(face, anchor.x, anchor.y);
    }
    highlightDragTargets(
      pileableActions.filter((a) => ['move', 'pickup'].includes(a)),
      piles,
      { viewerId: options.viewerId, fromPileId: pileView.id },
    );
  });
  wrapper.addEventListener('dragend', clearPileTargets);
  wrapper.addEventListener('drag', (event) => onCardDrag?.(card, event.clientX, event.clientY));
  wrapper.addEventListener('dragend', () => onCardDrag?.(null, 0, 0));
  attachTouchDrag(wrapper, card, { onDropCard: options.onDropCard, onCardDrag, onCardLift });
}

/**
 * Phase 2 (D101): the destination-choice step a targeted menu action
 * (move/pickup) needs, which no click-based mechanism provided
 * before this (D52's radial targeting was retired for pile/zone actions,
 * and cards only ever had native drag). Reuses the SAME
 * `highlightDragTargets` a native drag already calls on `dragstart` -
 * one lit-pile vocabulary for "where can this go", not a second one for
 * clicks - and completes through `options.onMoveCard(pileableId, pileId,
 * placement)`, the exact callback `dragstart`'s own presence-check
 * already gates on (`placement` added below - see the fix note further
 * down). No new reducer/commit path.
 *
 * The commit listener runs in the CAPTURE phase and calls
 * `stopPropagation` when the click lands on a lit pile - otherwise a
 * click that both picks a destination AND happens to land on one of ITS
 * cards would also fire that other card's own tap gesture (reveal/
 * rotate) in the same click. A click that misses every lit pile just
 * cancels silently, same as dismissing the menu by clicking outside it.
 *
 * *fix (direct user request): "use the Move card action to reveal the
 * ACTUAL targets within the piles" - lighting up a whole pile told you
 * WHERE you could go, but not what would actually happen once you got
 * there (onto/below/beside/adjacent a specific card - the same real
 * geometry a native drag already resolves via `resolveDropTargetFor`/
 * `showDropPreview`). A non-empty lit pile now shows that same live
 * preview as the mouse moves over it, and commits with the SAME
 * placement a drop there would have produced - one real target
 * vocabulary for both gestures, not a second, cruder one for clicks.
 */
function rowUnder(event) {
  const target = event.target.closest?.('.pile-section.pile-target[data-pile-id]');
  return target ? { pileElement: target, row: target.querySelector('.card-row') } : {};
}

function placementAt(pileElement, row, event) {
  if (!row) return {};
  return resolveDropTargetFor(pileElement.dataset.kind, cardBoxesIn(row), { x: event.clientX, y: event.clientY });
}

function previewTargetUnderPointer(event) {
  const { pileElement, row } = rowUnder(event);
  if (row) showDropPreview(row, placementAt(pileElement, row, event));
  else clearDropPreview();
}

export function beginCardTargetPick(actionId, card, piles, fromPileId, options) {
  highlightDragTargets([actionId], piles, { viewerId: options.viewerId, fromPileId });

  const cancelOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    document.removeEventListener('click', commit, true);
    document.removeEventListener('mousemove', previewTargetUnderPointer);
    clearDropPreview();
    clearPileTargets();
  };
  const commit = (event) => {
    document.removeEventListener('keydown', cancelOnEscape);
    document.removeEventListener('mousemove', previewTargetUnderPointer);
    const { pileElement, row } = rowUnder(event);
    if (pileElement) {
      event.stopPropagation();
      event.preventDefault();
    }
    const placement = pileElement ? placementAt(pileElement, row, event) : {};
    clearDropPreview();
    clearPileTargets();
    if (pileElement) options.onMoveCard?.(card.id, pileElement.dataset.pileId, placement);
  };
  // Same next-tick deferral as the menu's own dismiss listener - the
  // click that closed the menu (or the escape-hatch from a `contextmenu`
  // event on some platforms) must not double as this pick's own commit.
  setTimeout(() => {
    document.addEventListener('click', commit, { once: true, capture: true });
    document.addEventListener('keydown', cancelOnEscape, { once: true });
    document.addEventListener('mousemove', previewTargetUnderPointer);
  }, 0);
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

/**
 * Smith Gate 1 (Nielsen #1/#6): native drag-and-drop gives no feedback
 * until release, so the *mode* a drop is about to use has to be visible
 * during the drag or it isn't discoverable at all.
 *
 * *fix (direct user report): "I expect to see the overlap targets
 * ACTUALLY overlap the card so one can SEE where the card will go
 * before they select that target" - four separate decorations (a glow,
 * a bar, two kinds of line) told you WHICH zone you were in, but never
 * showed the actual outcome, so telling them apart under a moving
 * cursor was still guesswork ("it almost always overlaps" - direct
 * quote). One reusable ghost card, inserted as a REAL sibling with the
 * SAME `data-layout` a real drop would set, replaces all four: it
 * renders through the exact CSS rules (`.middle-card[data-layout=...]`)
 * an actual card would, so "will this overlap or sit beside it" is
 * answered by literally seeing a card-shaped outline do exactly that,
 * not by recognizing which decoration means which.
 *
 * D129: the ghost is POSITIONED rather than tagged. It used to copy
 * the target's `data-layout` so it rendered through whichever of the
 * four CSS overlap formulas applied; there is one formula now, driven
 * by `--stack-x`/`--stack-y`, so the ghost simply takes the target's
 * own offset plus one step in the direction the drop is asking for.
 * That also retires the `side: 'before'` special case entirely - the
 * old D21 rule put `layout` on whichever card ended up SECOND, so a
 * before-drop had to temporarily retag the TARGET and restore it
 * afterwards. Membership does not depend on which side a card landed,
 * so there is nothing to toggle and nothing to restore.
 */
// A holder, not a reassigned top-level `let` - built lazily on first
// use, since this module also loads under Node (unit tests) with no DOM.
const dropPreview = { ghost: null };

/** One step along a stack, in the same unitless stride multipliers
 * `Stackable.offsetIn` returns - `1 - spread`, read from the row's own
 * `--pile-spread` so the preview matches whatever Tighten/Loosen has
 * been set to. */
function stackStepIn(element) {
  // Unitless custom property, so `Number` is exact (`''` -> 0, same as before).
  const raw = Number(globalThis.getComputedStyle(element).getPropertyValue('--pile-spread'));
  return 1 - Math.min(1, Math.max(0, Number.isNaN(raw) ? 0 : raw));
}

function ghostElement() {
  if (dropPreview.ghost) return dropPreview.ghost;
  const ghost = document.createElement('div');
  ghost.className = 'middle-card drop-ghost';
  const face = document.createElement('div');
  face.className = 'card card-ghost';
  ghost.append(face);
  dropPreview.ghost = ghost;
  return ghost;
}

function clearDropPreview() {
  dropPreview.ghost?.remove();
}

function showDropPreview(rowElement, placement) {
  clearDropPreview();
  const ghost = ghostElement();
  ghost.style.removeProperty('--stack-x');
  ghost.style.removeProperty('--stack-y');
  if (!placement.targetCardId) {
    // No target: the card lands in the pile's own default stack, so the
    // ghost goes at the end of the row exactly as a plain drop would.
    rowElement.append(ghost);
    return;
  }
  const target = rowElement.querySelector(`.middle-card[data-pileable-id="${CSS.escape(placement.targetCardId)}"]`);
  if (!target) return;

  // The ghost joins the target's own stack, one step further along in
  // whichever direction the drop is asking for - which is exactly what
  // the real drop will do (`Pile.insertPileable`).
  // The TARGET's own stack, not the row: spread is per stack now, so a
  // preview measured against the row would be a step of the wrong size
  // in any pile whose stacks have been adjusted apart.
  const step = stackStepIn(target.parentElement) * (placement.side === 'before' ? -1 : 1);
  const at = (axis) => Number(target.style.getPropertyValue(axis)) || 0; // unitless, set by `String(n)`
  const isVertical = placement.layout === 'column';
  ghost.style.setProperty('--stack-x', String(at('--stack-x') + (isVertical ? 0 : step)));
  ghost.style.setProperty('--stack-y', String(at('--stack-y') + (isVertical ? step : 0)));
  target.parentElement.append(ghost);
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
export function showPileDragOver(pileElement, row, point, kind) {
  pileElement.classList.add('drag-over');
  showDropPreview(row, resolveDropTargetFor(kind, cardBoxesIn(row), point));
}

export function clearPileDragOver(pileElement) {
  pileElement.classList.remove('drag-over');
  clearDropPreview();
}

export function performPileDrop(pileElement, row, pileId, pileableId, point, onDropCard, kind) {
  clearPileDragOver(pileElement);
  if (!pileableId) return;
  // US-32/33: the drop point decides stack vs. overlap vs. plain
  // append. Aiming at the card being dragged itself is meaningless
  // (it's about to leave that position), so it's treated as open
  // space rather than a self-referential placement.
  const placement = resolveDropTargetFor(kind, cardBoxesIn(row).filter((b) => b.pileableId !== pileableId), point);
  onDropCard(pileableId, pileId, placement);
}

// (bloop: piles/zones/cards are all Movable) - a dragged PILE (its own
// title bar is the handle, `renderPileShell`) carries its id the same
// tagged-string way a pile-ACTION token does, so every drop target's
// existing "is this actually a plain card?" check can tell the three
// payload shapes apart with one string prefix test each, no new
// `dataTransfer` MIME type needed (browsers only reliably round-trip
// `text/plain` through a real drag, D35's own standing note).
const PILE_DRAG_TOKEN_PREFIX = 'pile-drag:';

export function pileDragToken(pileId) {
  return `${PILE_DRAG_TOKEN_PREFIX}${pileId}`;
}

/**
Same shape as `pileActionFromDrop` - only meaningful at `drop` time.
*/

export function pileDragFromDrop(dataTransfer) {
  const raw = dataTransfer.getData('text/plain');
  return raw.startsWith(PILE_DRAG_TOKEN_PREFIX) ? raw.slice(PILE_DRAG_TOKEN_PREFIX.length) : null;
}
