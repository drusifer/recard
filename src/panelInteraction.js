// US-133/D160, cluster 3: how a panel is moved and resized - moved out of
// `ui.js` unchanged. A zone is moved by its title bar and resized by its
// corner; the score panel does the same, which is why this is a plain module
// both `<zone-panel>` and `main.js` call rather than part of either. Positions
// are LOCAL, per-browser preferences (`panelLayout.js`), in table coordinates
// (`camera` undoes the table zoom). Touches `document` only when called.

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
 * native HTML5 drag, `PileElement`'s `pileDraggable` - for their
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
    attachPanelResize(panelElement, id, options.onResizePanel, options.camera);
  }
  if (options.onMovePanel) {
    const stored = options.layout?.[id];
    if (typeof stored?.x === 'number' && typeof stored?.y === 'number') {
      panelElement.classList.add('panel-moved');
      panelElement.style.left = `${stored.x}px`;
      panelElement.style.top = `${stored.y}px`;
    }
    attachPanelDrag(headingElement, panelElement, id, options.onMovePanel, options.camera);
  }
}

/** `options.camera` (a `TableCamera`, `tableZoom.js`) is optional here -
 * every real caller supplies one (`main.js`'s `buildZoneOptions`), but
 * a missing one degrades to "1x zoom, no conversion" rather than
 * throwing, so a future caller that genuinely has no camera concept
 * (a test harness, a future non-table panel) isn't forced to fake one. */
function localDelta(camera, screenDx, screenDy) {
  return camera ? camera.toLocalDelta(screenDx, screenDy) : { x: screenDx, y: screenDy };
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
function attachPanelDrag(headingElement, panelElement, id, onMove, camera) {
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
    // *fix (direct user bug report, 2026-09-17): "drag alignment is
    // still off, it needs to readjust when the table zoom changes...
    // you need to scale the movement." `parentRect`/`startRect` are
    // SCREEN-space (`getBoundingClientRect`), but `panelElement.style.
    // left/top` are LOCAL-space (the panel's own containing block,
    // `#zones`, is transformed by `--table-zoom`'s `scale()`) - every
    // screen-space delta below goes through `localDelta`/`camera` to
    // convert, or it's only correct at exactly 1x zoom.
    //
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
    const anchor = localDelta(camera, startRect.left - parentRect.left, startRect.top - parentRect.top);
    panelElement.style.left = `${anchor.x}px`;
    panelElement.style.top = `${anchor.y}px`;

    panelElement.classList.add('panel-dragging');
    document.body.classList.add('panel-drag-active');

    const onPointerMove = (event) => {
      const { x, y } = localDelta(camera, event.clientX - grabDx - parentRect.left, event.clientY - grabDy - parentRect.top);
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
function attachPanelResize(panelElement, id, onResize, camera) {
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
    // *fix (direct user bug report, 2026-09-17): "you need to scale the
    // movement" - `panelElement.style.width/height` are LOCAL-space,
    // same as `left`/`top` in `attachPanelDrag` above (see its own
    // comment). `offsetWidth`/`offsetHeight` give the panel's CURRENT
    // size already in that same local space, so the starting size
    // needs no conversion - only the ongoing SCREEN-space pointer
    // delta does (`localDelta`), and the outer `bound` (screen-space,
    // from `getBoundingClientRect`) needs converting the other way to
    // compare against a local `w`/`h`.
    const startWidth = panelElement.offsetWidth;
    const startHeight = panelElement.offsetHeight;
    const boundLocal = localDelta(camera, bound.width, bound.height);
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
      const { x: dx, y: dy } = localDelta(camera, event.clientX - startX, event.clientY - startY);
      const w = Math.min(Math.max(startWidth + dx, MIN_PANEL_WIDTH_PX), boundLocal.x * 0.9);
      const h = Math.min(Math.max(startHeight + dy, MIN_PANEL_HEIGHT_PX), boundLocal.y * 0.9);
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
