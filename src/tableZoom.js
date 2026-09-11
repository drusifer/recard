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
