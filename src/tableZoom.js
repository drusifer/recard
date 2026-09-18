/**
 * US-117 phase 111 (revised, D132): table zoom is fully player-driven,
 * not computed from content. A continuous range (`TABLE_ZOOM_MIN`..
 * `TABLE_ZOOM_MAX`), driven by the zoom wheel (`zoomFromWheelDrag`
 * below). Local-only per player, same as every other view-only state
 * (D130) - no reducer action, no persistence.
 *
 * *fix (direct user request, 2026-09-17): "get rid of the preset
 * buttons entirely" - the old S/M/L/XL quick-jump presets are gone, no
 * back-compat shim. `TABLE_ZOOM_DEFAULT_SCALE` is the one starting
 * value left, same number the old 'M' preset used.
 */
export const TABLE_ZOOM_MIN = 0.4;
export const TABLE_ZOOM_MAX = 1.6;
export const TABLE_ZOOM_DEFAULT_SCALE = 0.85;

export function clampTableZoom(value) {
  return Math.min(TABLE_ZOOM_MAX, Math.max(TABLE_ZOOM_MIN, value));
}

/**
 * D132 revised (direct user request, 2026-09-17): the fixed LOCAL
 * reference size `#zones` is now given (`style.css`), matching the
 * size the seat ring (`seating.js`, percentage-based) and every
 * preset's fixed-pixel shared-panel coordinates (`presets.js`) were
 * actually calibrated/verified overlap-free against. Never resize this
 * without re-running `npm run lint:design` at all three viewports -
 * it's the one number both coordinate systems agree on.
 */
export const TABLE_CANVAS_SIZE = { width: 1280, height: 1050 };

/**
 * The DEFAULT zoom (main.js applies it once at table-creation and
 * again on every resize, unless the player has since dragged the wheel
 * themselves): scales `TABLE_CANVAS_SIZE` down to fit whatever
 * `.table-surface` box is actually available, never up past 1x
 * uninvited (a bigger-than-calibrated screen should show the table at
 * its real size, not artificially enlarged). Uniform scale from one
 * origin can never change whether two rects intersect - only shrink
 * the intersection - so this only works because the CANVAS itself is
 * collision-free at `TABLE_CANVAS_SIZE`; it is not a substitute for
 * that.
 */
export function computeFitZoom(canvasSize, availableSize) {
  const fit = Math.min(1, availableSize.width / canvasSize.width, availableSize.height / canvasSize.height);
  return clampTableZoom(fit);
}

/**
 * The zoom wheel (direct user request, 2026-09-16): "like the zoom
 * wheel on a mouse" but as its own manual control - explicitly NOT the
 * real scroll wheel, which the user wants left alone for ordinary page
 * scrolling. A vertical drag control instead: its "tread" spins UP to
 * zoom in, DOWN to zoom out, same rotary-wheel feel without hijacking
 * an actual `wheel` event anywhere.
 *
 * `WHEEL_DRAG_RANGE_PX` is how many pixels of vertical drag span the
 * FULL zoom range - a tuning constant, same "player-driven, not
 * computed" spirit the zoom range itself already follows (D132).
 */
export const WHEEL_DRAG_RANGE_PX = 200;

// `deltaY` is screen-space (down is positive) - dragging UP is a
// NEGATIVE deltaY, and "spin up to zoom in" means that must INCREASE
// zoom, hence the negation.
export function zoomFromWheelDrag(startZoom, deltaY) {
  const change = (-deltaY / WHEEL_DRAG_RANGE_PX) * (TABLE_ZOOM_MAX - TABLE_ZOOM_MIN);
  return clampTableZoom(startZoom + change);
}

/**
 * Pinch-to-zoom (direct user request, 2026-09-16): the touch-screen
 * equivalent of the wheel control, not a replacement for it - two
 * fingers spreading apart (`distanceRatio` > 1, current/starting
 * two-finger distance) zooms in, pinching together zooms out.
 */
export function zoomFromPinch(startZoom, distanceRatio) {
  return clampTableZoom(startZoom * distanceRatio);
}

/**
 * Drag-to-pan (direct user request, 2026-09-16): "we'll also need to
 * pan with drag on table." No pan/camera mechanism existed anywhere in
 * this codebase before this - `maxPan` is a deliberately simple
 * heuristic (the further past 1x the table is zoomed in, the more
 * there plausibly IS to pan to), not derived from measuring real
 * content, same "tune it live" spirit as the zoom range itself. At 1x
 * zoom or below, the table already fits the surface, so there is
 * nothing worth panning to reveal - the bound is exactly 0 there.
 */
export const PAN_RANGE_PER_ZOOM = 400;

export function maxPan(zoom) {
  return Math.max(0, (zoom - 1) * PAN_RANGE_PER_ZOOM);
}

export function clampPan({ x, y }, zoom) {
  const bound = maxPan(zoom);
  // `+ 0` normalizes a `-0` result (e.g. `Math.max(-0, -5)`) to `0` -
  // numerically identical but `assert.deepEqual` (and any consumer
  // comparing against a plain `{x: 0, y: 0}`) sees them as different.
  return {
    x: Math.min(bound, Math.max(-bound, x)) + 0,
    y: Math.min(bound, Math.max(-bound, y)) + 0,
  };
}

/**
 * *fix (direct user request, 2026-09-17): "drag alignment is still off
 * it needs to readjust when the table zoom changes" - then, once the
 * real culprit (panel move/resize, not card drag) was found: "we
 * already have working drag-math code - don't fix - reuse... we need a
 * unifying domain object."
 *
 * `#zones` renders with `transform: translate(pan) scale(zoom)` -
 * `scale` means one LOCAL pixel (the coordinate space a panel's own
 * `left`/`top` are set in, since `position: absolute` inside a
 * transformed ancestor is measured pre-transform) renders as `zoom`
 * SCREEN pixels. A pointer event's `clientX`/`clientY` are always
 * SCREEN pixels. Any drag that reads a screen-space pointer delta and
 * assigns it directly to a LOCAL `left`/`top` is correct only at
 * exactly 1x zoom - found live in `ui.js`'s `attachPanelDrag` and
 * `attachPanelResize`, both of which did exactly that.
 *
 * `TableCamera` is the ONE object that owns the current zoom/pan state
 * (`main.js` creates a single instance, threaded through the render
 * `options` bag the same way every other shared piece of view state
 * already is) and knows how to convert a screen-space delta into the
 * equivalent local-space delta - so that conversion is written and
 * tested exactly once, not re-derived per drag call site. Card drag/
 * drop-target code never needed this: it stays in screen space
 * throughout, comparing `getBoundingClientRect()` results on both
 * sides of every check, which is why it was never affected by zoom in
 * the first place.
 */
export class TableCamera {
  constructor() {
    this.zoom = TABLE_ZOOM_DEFAULT_SCALE;
    this.pan = { x: 0, y: 0 };
  }

  /** Sets zoom, clamped to the wheel's own range - and re-clamps the
   * CURRENT pan against the new zoom, so zooming back out pulls an
   * out-of-bounds pan back in rather than leaving it stuck past the
   * new (tighter) limit (same behavior `main.js`'s own `applyZoom`
   * already had before this class existed). */
  setZoom(value) {
    this.zoom = clampTableZoom(value);
    this.pan = clampPan(this.pan, this.zoom);
    return this.zoom;
  }

  /**
   * Sets pan, clamped against the CURRENT zoom.
   */
  setPan(pan) {
    this.pan = clampPan(pan, this.zoom);
    return this.pan;
  }

  /**
   * A SCREEN-space delta (e.g. how far the real mouse cursor moved)
   * converted to the equivalent LOCAL delta for positioning something
   * whose `left`/`top` live inside this camera's own transformed
   * container - `local * zoom = screen`, so `screen / zoom = local`.
   */
  toLocalDelta(screenDx, screenDy) {
    return { x: screenDx / this.zoom, y: screenDy / this.zoom };
  }
}
