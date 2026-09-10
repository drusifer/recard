/**
 * Pure drop-region geometry for card stacking/overlapping (US-32/US-33,
 * D21). No DOM dependency — the caller collects `getBoundingClientRect()`
 * boxes and passes them in — for the same reason `seating.js` (D18) and
 * `handOrder.js` (D14) are separate: the interesting part is the maths,
 * and the maths is only directly testable if it isn't tangled up with
 * element lookups. (Sprint 4 retro item 13: give new pure logic its own
 * home *before* writing it, not after someone asks.)
 *
 * Smith's Gate 1 mechanism, expressed as geometry - three overlap
 * SHAPES (direct user request, resuming after two false starts: "can
 * we collapse the overlap css? we just need 3 (full, part-vertical,
 * and part-horizontal) and we can adjust the %overlap with tighten/
 * loosen"):
 * - upper half of a card's own box   -> stack ONTO it ("full" - always
 *   completely overlapped, not tighten/loosen-adjustable, there's
 *   nothing left to tighten)
 * - lower half of a card's own box   -> column BELOW it ("part-
 *   vertical" - D-nit, "like how lands are normally arranged in a game
 *   of mtg" - `--pile-spread`-driven, see style.css)
 * - anywhere in the halo beside it   -> overlap ON that side ("part-
 *   horizontal" - also `--pile-spread`-driven; what used to be a
 *   separate `adjacent` outcome, reached only by hovering a fixed
 *   distance from the edge, is just this at low/zero spread now, not a
 *   fourth concept a player has to discover a precise pixel band for)
 * - anywhere else                    -> plain append, no target
 *
 * The halo is one card-width (as generous as the card itself, not a
 * cramped sub-strip - Smith's original reasoning for the on-card/
 * beside-card split, still true of the halo as a whole).
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

  // Anywhere in the halo is `overlap` now - a single "part-horizontal"
  // outcome, no near/far split. HOW MUCH it visually overlaps is
  // `--pile-spread` (Tighten/Loosen)'s job, not this geometry's -
  // style.css's own `[data-layout='overlap']` rule falls back to 0
  // (no overlap at all) until a player actually tightens the pile, so
  // an un-adjusted pile still reads as plain adjacent placement without
  // this function needing a separate concept for it.
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
 *   is open space with no nearby card at all - which the reducer reads
 *   as "append, and clear any layout".
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
