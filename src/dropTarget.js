/**
 * Pure drop-region geometry for card stacking/overlapping (US-32/US-33,
 * D21). No DOM dependency — the caller collects `getBoundingClientRect()`
 * boxes and passes them in — for the same reason `seating.js` (D18) and
 * `handOrder.js` (D14) are separate: the interesting part is the maths,
 * and the maths is only directly testable if it isn't tangled up with
 * element lookups. (Sprint 4 retro item 13: give new pure logic its own
 * home *before* writing it, not after someone asks.)
 *
 * Smith's Gate 1 mechanism, expressed as geometry:
 * - inside a card's own box            -> stack onto that card
 * - in the halo beside a card          -> overlap, before or after it
 * - anywhere else                      -> plain append, no layout
 *
 * The halo is one card-width, so the reachable area for "overlap" is as
 * generous as the card itself rather than a cramped sub-strip — Smith
 * chose the on-card/beside-card split over bisecting each card
 * specifically to keep both targets comfortably large.
 */

/**
How far above/below the row still counts as aiming at it.
*/
const VERTICAL_SLACK = 0.5;

/** Is `point` still vertically within reach of `box`'s halo? Extracted
 * (US-107, cognitive-complexity) purely to get its `||` pair out of
 * `resolveDropTarget`'s own count - same comparison, unchanged. */
function withinVerticalReach(box, point) {
  const slack = box.height ?? (box.bottom - box.top);
  return point.y >= box.top - slack * VERTICAL_SLACK && point.y <= box.bottom + slack * VERTICAL_SLACK;
}

/**
 * Ties are broken by card id rather than by array position, so the same
 * point always resolves the same way regardless of the order the caller
 * happened to collect boxes in. Extracted (US-107) with the same
 * unchanged three-way comparison `resolveDropTarget` used inline.
 */
function isBetterMatch(distance, pileableId, nearest) {
  if (nearest === null || distance < nearest.distance) return true;
  return distance === nearest.distance && pileableId < nearest.targetCardId;
}

/**
Is `point` inside `box` itself - the "stack onto this card" region?
*/
function isStackHit(box, point) {
  return point.y >= box.top && point.y <= box.bottom && point.x >= box.left && point.x <= box.right;
}

/**
 * One box's verdict against `point`, given the best `nearest` overlap
 * candidate found so far: `{stack: true, targetCardId}` if this box is a
 * direct hit, or `{nearest}` (unchanged, or replaced by this box) if
 * not. Extracted (US-107) so the loop in `resolveDropTarget` carries
 * none of the per-box branching itself - same rules, unchanged.
 */
function evaluateBox(box, point, nearest) {
  if (isStackHit(box, point)) return { stack: true, targetCardId: box.pileableId };
  if (!withinVerticalReach(box, point)) return { nearest };

  const isBefore = point.x < box.left;
  const distance = isBefore ? box.left - point.x : point.x - box.right;
  if (distance > box.width) return { nearest };

  return isBetterMatch(distance, box.pileableId, nearest)
    ? { nearest: { distance, targetCardId: box.pileableId, side: isBefore ? 'before' : 'after' } }
    : { nearest };
}

/**
 * @param {{pileableId: string, left: number, right: number, top: number,
 *          bottom: number, width: number}[]} cardBoxes cards currently
 *   rendered in the zone, in any order.
 * @param {{x: number, y: number}} point the drop/dragover point.
 * @returns {{targetCardId?: string, side?: 'before'|'after',
 *            layout?: 'stack'|'overlap'}} empty when the point is open
 *   space — which the reducer reads as "append, and clear any layout".
 */
export function resolveDropTarget(cardBoxes, point) {
  let nearest = null;
  for (const box of cardBoxes) {
    const verdict = evaluateBox(box, point, nearest);
    if (verdict.stack) return { targetCardId: verdict.targetCardId, side: 'after', layout: 'stack' };
    nearest = verdict.nearest;
  }

  if (!nearest) return {};
  return { targetCardId: nearest.targetCardId, side: nearest.side, layout: 'overlap' };
}
