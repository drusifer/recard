/**
 * Pure drop-region geometry for card stacking/overlapping (US-32/US-33,
 * D21). No DOM dependency — the caller collects `getBoundingClientRect()`
 * boxes and passes them in — for the same reason `seating.js` (D18) and
 * `handOrder.js` (D14) are separate: the interesting part is the maths,
 * and the maths is only directly testable if it isn't tangled up with
 * element lookups. (Sprint 4 retro item 13: give new pure logic its own
 * home *before* writing it, not after someone asks.)
 *
 * Smith's Gate 1 mechanism, expressed as geometry - four distinct
 * targets per card (direct user request: "clear drop targets that work
 * consistently... overlap on the side, overlap from below, exactly on
 * top, or next to the target card with a little space in between"):
 * - upper half of a card's own box       -> stack ONTO it (exactly on
 *   top - Smith's original "on top" region, unchanged)
 * - lower half of a card's own box       -> column BELOW it (D-nit,
 *   "like how lands are normally arranged in a game of mtg")
 * - near half of the halo beside a card  -> overlap ON that side
 * - far half of the halo beside a card   -> ADJACENT to that side (a
 *   plain, un-overlapped placement, but still targeted at a specific
 *   card+side rather than only reachable by missing every other zone)
 * - anywhere else                        -> plain append, no target
 *
 * The halo is one card-width (as generous as the card itself, not a
 * cramped sub-strip - Smith's original reasoning for the on-card/
 * beside-card split, still true of the halo as a whole). Adjacent's
 * own split is the SAME halving idea `isLowerHalf` already uses for
 * stack/column, applied to the halo instead of the card: near half
 * overlaps, far half doesn't - one consistent rule (bisect the
 * reachable region) instead of a different fraction for every zone.
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

  // Near half of the halo overlaps; the far half is ADJACENT instead -
  // a real, deliberately-targeted placement (still this card, still
  // this side) that just doesn't overlap. Ties keep the SAME distance-
  // then-id comparison `isBetterMatch` already uses regardless of
  // which half either candidate falls in - "closest card wins" doesn't
  // change just because one candidate would overlap and another
  // wouldn't.
  const layout = distance <= box.width / 2 ? 'overlap' : undefined;
  return isBetterMatch(distance, box.pileableId, nearest)
    ? { nearest: { distance, targetCardId: box.pileableId, side: isBefore ? 'before' : 'after', layout } }
    : { nearest };
}

/**
 * @param {{pileableId: string, left: number, right: number, top: number,
 *          bottom: number, width: number, height?: number}[]} cardBoxes
 *   cards currently rendered in the zone, in any order.
 * @param {{x: number, y: number}} point the drop/dragover point.
 * @returns {{targetCardId?: string, side?: 'before'|'after',
 *            layout?: 'stack'|'overlap'|'column'}} `layout` is absent
 *   for the adjacent case (a real target, just no overlap) and the
 *   whole result is empty when the point is open space with no nearby
 *   card at all - which the reducer reads as "append, and clear any
 *   layout" either way.
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
  const { targetCardId, side, layout } = nearest;
  return layout ? { targetCardId, side, layout } : { targetCardId, side };
}
