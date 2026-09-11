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
