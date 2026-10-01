import { PILE_MENU_OPENED_EVENT } from './ActionMenu.js';
import {
  TABLE_ZOOM_MIN, TABLE_ZOOM_MAX, TABLE_CANVAS_SIZE, TableCamera, zoomFromWheelDrag, computeFitZoom,
} from '../tableZoom.js';
import { clampOverlayPosition, clampFocusZoomScale, HOVER_INTENT_MS } from '../focusZoom.js';
import { pileElement } from '../dragDrop.js';

/**
 * US-150 (found live, fixing "move pile action buttons to a corner gear
 * icon menu"): a pile's own action menu (`<action-menu>`, `HeaderActions
 * .js`'s `buildHeaderGear`) is deliberately appended to `document.body`,
 * same as every other such popup, NOT inside the pile's own DOM subtree
 * - the whole reason being so an overflowing/clipping ancestor can never
 * cut it off. That means a plain `overlay.contains(event.target)` check
 * reads clicking a MENU ROW as "outside the focused pile" even though it
 * is visually anchored to a control inside it, which a `pointerup` (does
 * not stop propagating just because the row's own `click` handler called
 * `stopPropagation` - a DIFFERENT event) then reads as "released outside
 * the pile" and shrinks it mid-interaction, before the action it opened
 * the menu FOR even finishes. `target.closest('action-menu')` folds an
 * open popup into "still part of this pile" everywhere that containment
 * check happens, the same way `overlay.contains` already does for the
 * overlay itself.
 */
function isPartOfFocusedPile(target, overlay) {
  return Boolean(overlay?.contains(target) || target?.closest?.('action-menu'));
}

/**
 * US-1xx: the table surface itself - `#zones`, the one element that is
 * BOTH the container every `<zone-panel>` renders into (`renderZones`,
 * unchanged, still just appends children) AND the table's own UX: the
 * zoom wheel/pan camera and hover-to-grow-a-pile focus-zoom, moved out
 * of `main.js`'s module-scope `let`s into instance state - the table
 * is a real thing now, not a bag of closures main.js happened to own.
 *
 * `camera` (a `TableCamera`) is the one piece of state read from
 * outside (`buildZoneOptions`/`renderScoreZone` convert screen deltas
 * against it) - everything else here (focus-zoom's `focusedPileId` and
 * friends) is nobody else's business, which is what made owning it
 * internally possible without D161's explicit-param plumbing: the only
 * other code that ever touched it was this same cluster.
 */
export class TableViewElement extends HTMLElement {
  camera = new TableCamera();
  #canvasSize = TABLE_CANVAS_SIZE;
  #hasUserSetZoom = false;
  #wheelElement = null;
  #tableSurface = null;

  #focusedPileId = null;
  #isDragInProgress = false;
  #hoverIntentTimer = null;
  #clearFocusPointerWatchers = null;

  connectedCallback() {
    this.#wireCamera();
    this.#wireFocusZoom();
  }

  /**
   * The table just became visible, or a preset declared a different
   * canvas size (`setCanvasSize`) - re-fit unless the player has since
   * dragged/keyed the wheel themselves (`#hasUserSetZoom`).
   */
  applyFitZoom = () => {
    this.style.setProperty('--table-canvas-w', `${this.#canvasSize.width}px`);
    this.style.setProperty('--table-canvas-h', `${this.#canvasSize.height}px`);
    if (this.#hasUserSetZoom || !this.#tableSurface) return;
    const { width, height } = this.#tableSurface.getBoundingClientRect();
    if (width === 0 || height === 0) return; // not yet laid out (e.g. still on the host/join screen)
    this.#applyZoom(computeFitZoom(this.#canvasSize, { width, height }));
  };

  setCanvasSize(size) {
    this.#canvasSize = size;
    this.applyFitZoom();
  }

  #applyPan(pan) {
    this.camera.setPan(pan);
    this.style.setProperty('--table-pan-x', `${this.camera.pan.x}px`);
    this.style.setProperty('--table-pan-y', `${this.camera.pan.y}px`);
  }

  #applyZoom(value) {
    this.camera.setZoom(value);
    this.#wheelElement?.setAttribute('aria-valuenow', String(this.camera.zoom));
    this.style.setProperty('--table-zoom', String(this.camera.zoom));
    this.#applyPan(this.camera.pan);
  }

  #wireCamera() {
    const wheelElement = document.querySelector('#table-zoom-wheel');
    this.#tableSurface = this.closest('.table-surface');
    this.#wheelElement = wheelElement;
    if (!wheelElement) return;
    wheelElement.setAttribute('aria-valuemin', String(TABLE_ZOOM_MIN));
    wheelElement.setAttribute('aria-valuemax', String(TABLE_ZOOM_MAX));

    // D132/D134: the DEFAULT canvas size, set once for whatever renders
    // before a real table exists (style.css's own fallbacks are below
    // even this). `applyFitZoom` re-sets both vars from `#canvasSize`
    // on every call, once a preset's own size is known.
    this.style.setProperty('--table-canvas-w', `${TABLE_CANVAS_SIZE.width}px`);
    this.style.setProperty('--table-canvas-h', `${TABLE_CANVAS_SIZE.height}px`);

    this.applyFitZoom();
    window.addEventListener('resize', this.applyFitZoom);

    let panStart = null;
    this.#tableSurface?.addEventListener('pointerdown', (event) => {
      // Only the empty table background starts a pan - a pointerdown on
      // any pile/zone/card/button inside it (a descendant target) must
      // reach ITS OWN handler untouched. `.table-surface`/`this` are the
      // only two valid targets, since `this` is the direct, otherwise-
      // empty flex container every pile/zone panel lives inside.
      if (event.target !== this.#tableSurface && event.target !== this) return;
      panStart = { x: event.clientX - this.camera.pan.x, y: event.clientY - this.camera.pan.y };
      this.#tableSurface.setPointerCapture(event.pointerId);
    });
    this.#tableSurface?.addEventListener('pointermove', (event) => {
      if (!panStart) return;
      this.#applyPan({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
    });
    this.#tableSurface?.addEventListener('pointerup', () => { panStart = null; });
    this.#tableSurface?.addEventListener('pointercancel', () => { panStart = null; });

    let dragStartY = null;
    let zoomAtDragStart = this.camera.zoom;
    wheelElement.addEventListener('pointerdown', (event) => {
      this.#hasUserSetZoom = true;
      dragStartY = event.clientY;
      zoomAtDragStart = this.camera.zoom;
      wheelElement.setPointerCapture(event.pointerId);
    });
    wheelElement.addEventListener('pointermove', (event) => {
      if (dragStartY === null) return;
      this.#applyZoom(zoomFromWheelDrag(zoomAtDragStart, event.clientY - dragStartY));
    });
    wheelElement.addEventListener('pointerup', () => { dragStartY = null; });
    wheelElement.addEventListener('pointercancel', () => { dragStartY = null; });
    // Keyboard equivalent (`role="slider"` implies arrow-key support) -
    // one `WHEEL_DRAG_RANGE_PX`-scaled "notch" per press, same direction
    // convention as the drag (up arrow zooms in).
    wheelElement.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') { this.#hasUserSetZoom = true; this.#applyZoom(zoomFromWheelDrag(this.camera.zoom, -20)); }
      else if (event.key === 'ArrowDown') { this.#hasUserSetZoom = true; this.#applyZoom(zoomFromWheelDrag(this.camera.zoom, 20)); }
      else return;
      event.preventDefault();
    });
  }

  // US-117 phase 113 (D131): hover/click a Pile to grow it in place as a
  // `position: fixed` overlay anchored at its own rect - table underneath
  // untouched. Tracked by PILE ID, not a DOM reference: `renderZones`
  // rebuilds `this` wholesale on every state-driven render, which would
  // silently orphan a direct element reference the moment an unrelated
  // player's move triggers a re-render while a pile is focus-zoomed.
  // `reapplyFocusZoom` (called after every `renderZones`) discards
  // whatever stale overlay survived from the OLD render and re-grows the
  // pile fresh from the NEW one, so the visible state never drifts from
  // what `#focusedPileId` says is true.

  #focusZoomOverlay(pileId) {
    return document.querySelector(`body > .pile-section.focus-zoomed[data-pile-id="${CSS.escape(pileId)}"]`);
  }

  #focusZoomPlaceholder(pileId) {
    return document.querySelector(`.focus-zoom-placeholder[data-pile-id="${CSS.escape(pileId)}"]`);
  }

  // Does the actual DOM work, unconditionally - both a fresh user-
  // triggered grow AND a post-render reapplication go through here.
  #applyFocusZoom(pileElementToGrow) {
    const pileId = pileElementToGrow.dataset.pileId;
    const rect = pileElementToGrow.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'focus-zoom-placeholder';
    placeholder.dataset.pileId = pileId;
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    pileElementToGrow.before(placeholder);

    // Reparent FIRST, pinned at its EXACT original screen position and
    // scale 1 - a pure DOM move with no visual change yet, not a guess.
    // This is required, not a two-pass correction: a pile can render at
    // a genuinely different NATURAL size once it's no longer squeezed by
    // its old flex siblings in `this` (found live, on a small viewport -
    // a hand's real unconstrained width differs from its flex-item
    // width), so `rect` above cannot be trusted for the GROWN size, only
    // for the anchor position. Measuring the true natural size only
    // AFTER the move, before growing, is what makes the clamp math
    // correct instead of approximately correct.
    document.body.append(pileElementToGrow);
    pileElementToGrow.classList.add('focus-zoomed');
    pileElementToGrow.style.setProperty('--focus-left', `${rect.left}px`);
    pileElementToGrow.style.setProperty('--focus-top', `${rect.top}px`);
    pileElementToGrow.style.setProperty('--focus-scale', '1');

    const naturalRect = pileElementToGrow.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // *fix (found live, 2026-09-16): a wider pile header (the Tighten/
    // Loosen slider) can push the FIXED `FOCUS_ZOOM_SCALE` past a small
    // viewport - `clampFocusZoomScale` caps the EFFECTIVE scale so the
    // grown box always fits, before `clampOverlayPosition` even runs.
    const scale = clampFocusZoomScale(naturalRect, viewport);
    const grownSize = { width: naturalRect.width * scale, height: naturalRect.height * scale };
    const { left, top } = clampOverlayPosition(rect, grownSize, viewport);
    pileElementToGrow.style.setProperty('--focus-left', `${left}px`);
    pileElementToGrow.style.setProperty('--focus-top', `${top}px`);
    pileElementToGrow.style.setProperty('--focus-scale', String(scale));

    // Reparented out of `this`, so its pointer events no longer bubble
    // to this element's own delegated listeners below - attached
    // directly here instead, a fresh pair every time this runs
    // (including a post-render reapplication).
    //
    // *fix (direct user bug report, 2026-09-16): "interact with the
    // [Tighten/Loosen] slider [and it] goes bonkers." Dragging the
    // slider can carry the pointer briefly outside the pile's own
    // (enlarged, fixed-position) box - a plain `pointerleave` shrank the
    // pile mid-drag, reparenting it back into `this` while the slider
    // was still being dragged. `event.buttons !== 0` means a button is
    // still held (something inside the pile is still being interacted
    // with) - wait for release instead of shrinking immediately. Once
    // the pointer HAS left, though, a later `pointerleave` won't fire
    // again on its own (the pointer isn't re-crossing the boundary), so
    // a `pointerup` on the document catches "released while already
    // outside" and shrinks then. `#clearFocusPointerWatchers` is how
    // EVERY shrink path - not just these two listeners - tears them
    // down; see `#shrinkFocusedPile`.
    // US-150 (found live): the pointer leaving the overlay's own box with
    // no button held used to mean "wandered away, shrink" unconditionally
    // - but moving from the gear to ITS OWN popup menu (appended to
    // `document.body`, outside the overlay's box by construction) is
    // exactly that gesture with nothing actually held. `relatedTarget` is
    // where the pointer is GOING; `isPartOfFocusedPile` already treats an
    // open `<action-menu>` as part of this pile everywhere else.
    const onPileLeave = (event) => {
      if (event.buttons !== 0) return;
      if (isPartOfFocusedPile(event.relatedTarget, this.#focusZoomOverlay(pileId))) return;
      this.#shrinkFocusedPile();
    };
    // US-150 (found live): a native `<input type=range>` (the Tighten/
    // Loosen slider) implicitly captures the pointer while dragged, so
    // `event.target` here is ALWAYS the slider itself, no matter where
    // on screen the button is actually released - `isPartOfFocusedPile`
    // would then always say "yes, part of the pile" (true - the slider
    // lives in the pile's own gear menu) and this listener could never
    // detect "released far away," the one case it exists to catch.
    // `elementFromPoint` reads the REAL element under the cursor, which
    // capture does not affect - a true spatial check, same intent the
    // original 2026-09-16 fix already had, now proof against capture.
    const onPointerUpAnywhere = (event) => {
      const overlay = this.#focusZoomOverlay(pileId);
      const real = document.elementFromPoint(event.clientX, event.clientY);
      if (overlay && !isPartOfFocusedPile(real, overlay)) this.#shrinkFocusedPile();
    };
    pileElementToGrow.addEventListener('pointerleave', onPileLeave);
    document.addEventListener('pointerup', onPointerUpAnywhere);
    this.#clearFocusPointerWatchers = () => {
      pileElementToGrow.removeEventListener('pointerleave', onPileLeave);
      document.removeEventListener('pointerup', onPointerUpAnywhere);
    };
    this.#focusedPileId = pileId;
  }

  // The user-facing entry point (hover-intent/click) - a no-op if this
  // pile is already the focused one, unlike `#applyFocusZoom` itself.
  // `isConnected` guards a delayed hover-intent callback whose captured
  // element got detached by an unrelated render finishing during the
  // wait (rare - a state broadcast landing inside the ~180ms window) -
  // without it this would reparent a dead, detached node into `<body>`
  // as an invisible ghost while the real pile renders normally elsewhere.
  #growPileInPlace(pileElementToGrow) {
    if (this.#isDragInProgress || !pileElementToGrow.isConnected) return;
    const pileId = pileElementToGrow.dataset.pileId;
    if (this.#focusedPileId === pileId) return;
    this.#shrinkFocusedPile();
    this.#applyFocusZoom(pileElementToGrow);
  }

  #shrinkFocusedPile() {
    if (!this.#focusedPileId) return;
    // *fix (2026-09-16): tear down `#applyFocusZoom`'s pointer watchers
    // here, unconditionally - this is the ONE function every shrink path
    // (natural pointerleave, click-outside, a drag starting elsewhere,
    // `reapplyFocusZoom`) already funnels through, so it is the one place
    // that can guarantee they never outlive the pile they watched.
    this.#clearFocusPointerWatchers?.();
    this.#clearFocusPointerWatchers = null;
    const overlay = this.#focusZoomOverlay(this.#focusedPileId);
    const placeholder = this.#focusZoomPlaceholder(this.#focusedPileId);
    if (overlay) {
      overlay.classList.remove('focus-zoomed');
      overlay.style.removeProperty('--focus-left');
      overlay.style.removeProperty('--focus-top');
      overlay.style.removeProperty('--focus-scale');
      if (placeholder) placeholder.replaceWith(overlay);
      else overlay.remove(); // its zone is gone too - nowhere to put it back
    } else {
      placeholder?.remove();
    }
    this.#focusedPileId = null;
  }

  /**
   * Called after every `renderZones` (same call sites as before): a
   * fresh render just discarded the DOM the current focus-zoom was
   * built on. Drop whatever's stale and re-grow the same pile ID from
   * the new render, or drop focus entirely if that pile no longer
   * exists (e.g. it emptied and was removed).
   */
  reapplyFocusZoom() {
    if (!this.#focusedPileId) return;
    // *fix (2026-09-16): same pointer-watcher teardown `#shrinkFocusedPile`
    // does - this path discards the OLD overlay directly rather than
    // calling that function, so it needs its own copy of the same
    // cleanup, or the old watchers (particularly the document-level
    // `pointerup` one) leak forever, one more per re-render while a pile
    // stays focus-zoomed.
    this.#clearFocusPointerWatchers?.();
    this.#clearFocusPointerWatchers = null;
    this.#focusZoomOverlay(this.#focusedPileId)?.remove();
    this.#focusZoomPlaceholder(this.#focusedPileId)?.remove();
    const fresh = pileElement(this.#focusedPileId);
    if (fresh) this.#applyFocusZoom(fresh);
    else this.#focusedPileId = null;
  }

  #wireFocusZoom() {
    // *fix (standing backlog bug, filed 2026-09-13, root-caused
    // 2026-09-17): right-clicking a card/stack to open its menu ALSO
    // satisfies this hover-intent trigger. The menu opens and closes well
    // within `HOVER_INTENT_MS`, but nothing cancelled the timer THAT
    // hover armed - it fired later, unrelated to anything still open,
    // growing an orphaned pile mid a later interaction. `<action-menu>`
    // dispatches `PILE_MENU_OPENED_EVENT` whenever it opens, specifically
    // so this file - the one that owns `#hoverIntentTimer` - can cancel it.
    document.addEventListener(PILE_MENU_OPENED_EVENT, () => clearTimeout(this.#hoverIntentTimer));

    document.addEventListener('dragstart', (event) => {
      this.#isDragInProgress = true;
      clearTimeout(this.#hoverIntentTimer);
      // *fix (direct user bug report, 2026-09-16): "drag a card out [of a
      // zoomed pile] goes bonkers." A drag starting FROM INSIDE the
      // currently-focused pile must NOT shrink it - `#shrinkFocusedPile`
      // reparents the pile back into `this`, which moves the dragged
      // card's own ancestor chain while native HTML5 DnD has already
      // captured that exact node as the drag source. Only shrink an
      // UNRELATED already-focused pile.
      const overlay = this.#focusedPileId ? this.#focusZoomOverlay(this.#focusedPileId) : null;
      if (!isPartOfFocusedPile(event.target, overlay)) this.#shrinkFocusedPile();
    });
    document.addEventListener('dragend', () => {
      this.#isDragInProgress = false;
    });

    this.addEventListener('pointerover', (event) => {
      const target = event.target.closest('.pile-section[data-pile-id]');
      if (!target || this.#isDragInProgress) return;
      clearTimeout(this.#hoverIntentTimer);
      this.#hoverIntentTimer = setTimeout(() => this.#growPileInPlace(target), HOVER_INTENT_MS);
    });
    // Only cancels a PENDING hover-intent timer for a pile that has not
    // grown yet - an already-focused pile is reparented out of `this` by
    // the time this could fire for it, so shrinking it is handled by the
    // `pointerleave` listener `#applyFocusZoom` attaches directly to the
    // overlay, not here. Unconditionally calling `#shrinkFocusedPile` in
    // this handler would fire for ANY pile's pointerout, including one
    // unrelated to whichever pile (if any) is actually focused right now.
    this.addEventListener('pointerout', (event) => {
      const target = event.target.closest('.pile-section[data-pile-id]');
      if (!target) return;
      if (!target.contains(event.relatedTarget)) clearTimeout(this.#hoverIntentTimer);
    });
    this.addEventListener('click', (event) => {
      const target = event.target.closest('.pile-section[data-pile-id]');
      if (!target || this.#isDragInProgress) return;
      clearTimeout(this.#hoverIntentTimer);
      this.#growPileInPlace(target);
    });
    document.addEventListener('click', (event) => {
      if (!this.#focusedPileId) return;
      const overlay = this.#focusZoomOverlay(this.#focusedPileId);
      if (overlay && !isPartOfFocusedPile(event.target, overlay)) this.#shrinkFocusedPile();
    });
  }
}

customElements.define('table-view', TableViewElement);
