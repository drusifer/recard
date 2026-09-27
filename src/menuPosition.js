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
