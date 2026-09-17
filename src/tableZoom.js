/**
 * US-117 phase 111 (revised, D132): table zoom is fully player-driven,
 * not computed from content. A dial (continuous, `TABLE_ZOOM_MIN`..
 * `TABLE_ZOOM_MAX`) plus four named presets for a quick jump. Local-
 * only per player, same as every other view-only state (D130) - no
 * reducer action, no persistence.
 */
export const TABLE_ZOOM_MIN = 0.4;
export const TABLE_ZOOM_MAX = 1.6;

export const TABLE_ZOOM_PRESETS = {
  S: 0.6,
  M: 0.85,
  L: 1.1,
  XL: 1.4,
};

export const TABLE_ZOOM_DEFAULT = 'M';

export function presetScale(size) {
  const scale = TABLE_ZOOM_PRESETS[size];
  if (scale === undefined) {
    throw new Error(`Unknown table zoom preset: ${size}`);
  }
  return scale;
}

export function clampTableZoom(value) {
  return Math.min(TABLE_ZOOM_MAX, Math.max(TABLE_ZOOM_MIN, value));
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
