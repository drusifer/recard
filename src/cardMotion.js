/**
 * US-123/D144: moved cards travel, and what was just touched glows.
 *
 * Motion is DERIVED, not messaged: the renderer captures where every
 * Pileable was before a render and where it is after, and plays the
 * difference (FLIP - invert the change, then release it). A deal is one
 * render, so its cards travel together for free, and a bot's move
 * animates on every screen without the bot sending anything.
 *
 * Cosmetic only (PRD Principle 6 / D4): a card with no before-rect just
 * appears, an interrupted animation retargets from wherever it is, and
 * nothing here can change what the table holds.
 */

export const GLOW_MS = 1500;
const MOTION_MS = 260;
const CLOSE_ENOUGH_PX = 0.5;

/**
 * Where each Pileable is on screen right now, keyed by its id.
 * @param {ParentNode} root
 * @returns {Map<string, DOMRect>}
 */
export function captureRects(root) {
  const rects = new Map();
  for (const element of root.querySelectorAll('[data-pileable-id]')) {
    rects.set(element.dataset.pileableId, element.getBoundingClientRect());
  }
  return rects;
}

/**
 * The travel each Pileable made between two captures. Pure, so the
 * "what moved, and by how much" half is testable without a browser.
 * @param {Map<string, {left: number, top: number}>} before
 * @param {Map<string, {left: number, top: number}>} after
 * @returns {Map<string, {dx: number, dy: number}>}
 */
export function travels(before, after) {
  const moved = new Map();
  for (const [id, to] of after) {
    const from = before.get(id);
    if (!from) continue; // it wasn't on screen before - it has nowhere to travel from
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) > CLOSE_ENOUGH_PX || Math.abs(dy) > CLOSE_ENOUGH_PX) moved.set(id, { dx, dy });
  }
  return moved;
}

/**
 * Plays the captured travel: each card starts where it was and is
 * released to where it now is, in one frame, so a group moves together.
 */
export function playTravels(root, moved) {
  // Someone who has asked for less motion gets none: the card is simply
  // where it now is. Cosmetic by definition, so nothing else changes -
  // and it is why a test can measure geometry without racing a travel.
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  for (const [id, { dx, dy }] of moved) {
    const element = root.querySelector(`[data-pileable-id="${CSS.escape(id)}"]`);
    // The Web Animations API, deliberately, not an inline transform:
    // the card's own layout is never written to, so a render landing
    // mid-flight cannot leave a stale offset behind on a live card -
    // which is exactly the drift that made table geometry unstable
    // while this was built. The animation composites ON TOP of whatever
    // transform the card already carries (a fan, a rotation), so those
    // are untouched too.
    element?.animate?.(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: MOTION_MS, easing: 'ease-out', composite: 'add' },
    );
  }
}

/**
 * Glows whatever was just touched, in the colour of whoever touched it,
 * and lets it fade. The fade is LOCAL (D144): each client runs its own
 * timers, so a glow already fading is never restarted or cut short by
 * someone else's later action.
 * @param {ParentNode} root
 * @param {string[]} pileableIds
 * @param {string|null} color
 * @param {Map<string, number>} timers keyed by pileable id, owned by the caller
 */
export function glow(root, pileableIds, color, timers) {
  for (const id of pileableIds) {
    const element = root.querySelector(`[data-pileable-id="${CSS.escape(id)}"]`);
    if (!element) continue;
    element.classList.add('just-touched');
    if (color) element.style.setProperty('--touch-color', color);
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(() => {
      element.classList.remove('just-touched');
      element.style.removeProperty('--touch-color');
      timers.delete(id);
    }, GLOW_MS));
  }
}
