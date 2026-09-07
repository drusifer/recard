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
 * - upper half of a card's own box     -> stack onto that card
 * - lower half of a card's own box     -> column below it (D-nit,
 *   "vertical drop targets... like how lands are normally arranged in
 *   a game of mtg")
 * - in the halo beside a card          -> overlap, before or after it
 * - anywhere else                      -> plain append, no layout
 *
 * The halo is one card-width, so the reachable area for "overlap" is as
 * generous as the card itself rather than a cramped sub-strip — Smith
 * chose the on-card/beside-card split over bisecting each card for THAT
 * choice specifically to keep both targets comfortably large. The
 * upper/lower split within the card's own box is a second, narrower
 * bisection layered on top of that first choice, not a replacement of
 * it - onto-card is still one whole target, just now two different
 * outcomes depending on which half, the same way "beside" was already
 * two outcomes (before/after) depending on which side.
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
Is `point` inside `box` itself - the "onto this card" region (either
`stack` or `column`, split further below by which half it's in)?
*/
function isStackHit(box, point) {
  return point.y >= box.top && point.y <= box.bottom && point.x >= box.left && point.x <= box.right;
}

/**
 * The lower half of `box` is the "goes below it" region (D-nit: a
 * column, like tapped lands stacking downward) - the upper half keeps
 * the existing "stack onto this card" meaning. Half, not some smaller
 * strip, for the same "keep the target comfortably large" reasoning
 * `isStackHit`'s own box already gets.
 */
function isLowerHalf(box, point) {
  const height = box.height ?? (box.bottom - box.top);
  return point.y > box.top + height / 2;
}

/**
 * One box's verdict against `point`, given the best `nearest` overlap
 * candidate found so far: `{stack: true, targetCardId}` or `{column:
 * true, targetCardId}` if this box is a direct hit (which half decides
 * which), or `{nearest}` (unchanged, or replaced by this box) if not.
 * Extracted (US-107) so the loop in `resolveDropTarget` carries none of
 * the per-box branching itself - same rules, unchanged (plus the
 * column split, D-nit).
 */
function evaluateBox(box, point, nearest) {
  if (isStackHit(box, point)) {
    return isLowerHalf(box, point)
      ? { column: true, targetCardId: box.pileableId }
      : { stack: true, targetCardId: box.pileableId };
  }
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
 *          bottom: number, width: number, height?: number}[]} cardBoxes
 *   cards currently rendered in the zone, in any order.
 * @param {{x: number, y: number}} point the drop/dragover point.
 * @returns {{targetCardId?: string, side?: 'before'|'after',
 *            layout?: 'stack'|'overlap'|'column'}} empty when the point
 *   is open space — which the reducer reads as "append, and clear any
 *   layout".
 */
export function resolveDropTarget(cardBoxes, point) {
  let nearest = null;
  for (const box of cardBoxes) {
    const verdict = evaluateBox(box, point, nearest);
    if (verdict.stack) return { targetCardId: verdict.targetCardId, side: 'after', layout: 'stack' };
    if (verdict.column) return { targetCardId: verdict.targetCardId, side: 'after', layout: 'column' };
    nearest = verdict.nearest;
  }

  if (!nearest) return {};
  return { targetCardId: nearest.targetCardId, side: nearest.side, layout: 'overlap' };
}
