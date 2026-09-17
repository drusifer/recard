/**
 * US-117 phase 113 (D131): growing a Pile in place as a `position:
 * fixed` overlay anchored at its own on-screen rect - not a camera
 * transform (D130, superseded for this interaction by D131).
 *
 * Pure math only. `clampOverlayPosition` implements Smith's D131
 * ruling: anchor the overlay exactly at the pile's own position by
 * default, nudging the MINIMUM amount needed to keep it fully
 * on-screen for a pile near a viewport edge/corner - never clip it
 * off-screen, never fully re-center it (that would break the "growing
 * from where I pointed" continuity, Heuristic #6).
 */
export const FOCUS_ZOOM_SCALE = 1.6;
export const HOVER_INTENT_MS = 180;

export function clampOverlayPosition(rect, grownSize, viewport) {
  const maxLeft = Math.max(0, viewport.width - grownSize.width);
  const maxTop = Math.max(0, viewport.height - grownSize.height);
  return {
    left: Math.min(rect.left, maxLeft),
    top: Math.min(rect.top, maxTop),
  };
}

/**
 * *fix (found live, 2026-09-16): `clampOverlayPosition` only ever
 * repositions a grown overlay - it was never asked to cap its SIZE
 * (the module doc comment above is explicit: "never clip it off-
 * screen" was about POSITION, not about a fixed scale being too big
 * for the viewport in the first place). A wider pile header (the
 * Tighten/Loosen slider) pushed one real pile's `FOCUS_ZOOM_SCALE`
 * (1.6x) result past a small viewport's own width, with no position
 * able to fix that - the box was simply too big.
 *
 * Caps the EFFECTIVE scale so the grown size fits both viewport
 * dimensions, never exceeding the requested scale and never shrinking
 * below 1x (the pile's own unscaled, natural size) - if the natural
 * size alone already overflows the viewport, that's a pre-existing,
 * separate edge case (matches `clampOverlayPosition`'s own "pins to 0
 * rather than going negative" tolerance for the same situation).
 */
export function clampFocusZoomScale(naturalSize, viewport, requestedScale = FOCUS_ZOOM_SCALE) {
  const maxByWidth = viewport.width / naturalSize.width;
  const maxByHeight = viewport.height / naturalSize.height;
  return Math.max(1, Math.min(requestedScale, maxByWidth, maxByHeight));
}
