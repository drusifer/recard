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
 * - right at a card's touching edge      -> overlap ON that side (a
 *   small FIXED zone, `OVERLAP_EDGE_ZONE` - see its own comment)
 * - the rest of the halo beside a card    -> ADJACENT to that side (a
 *   plain, un-overlapped placement, but still targeted at a specific
 *   card+side rather than only reachable by missing every other zone)
 * - anywhere else                        -> plain append, no target
 *
 * The halo is one card-width (as generous as the card itself, not a
 * cramped sub-strip - Smith's original reasoning for the on-card/
 * beside-card split, still true of the halo as a whole).
 */

/**
How far above/below the row still counts as aiming at it.
*/
const VERTICAL_SLACK = 0.5;

/**
 * *fix (direct user report): "why no side by side in the battlefield
 * pile?" - splitting the halo AT its own midpoint (half the card's
 * width) assumed there'd usually be room on both sides of that split.
 * Between two cards at their default resting gap (`--card-gap`,
 * ~8px - a cosmetic breathing gap, not "room for a third card"), the
 * WHOLE gap is far narrower than half a card's width, so every point
 * in it was within the "near" half of WHICHEVER card was closer -
 * `adjacent` was only ever reachable past the very end of a row, never
 * between two already-placed cards, which is exactly where a player
 * naturally reaches for it. A small FIXED edge zone (matching
 * `--card-peek`'s own ~13.6px "how close counts as touching" scale
 * elsewhere in this app, not a fraction of the halo) fixes it: only
 * hovering genuinely close to the touching edge overlaps now: the
 * far-larger remainder of the halo - including the ordinary gap
 * between two neighbours - is adjacent instead. Capped at half the
 * halo so a card smaller than this zone never loses its overlap
 * target entirely.
 */
const OVERLAP_EDGE_ZONE = 14;

/**
 * The 14px zone above still doesn't fully solve it: a point exactly in
 * the MIDDLE of an 8px gap is only 4px from either neighbour, well
 * inside 14px either way, so it was STILL always overlap - reachable
 * targets only ever exist "past the last card" (open space, one
 * neighbour) not "between two cards" (a neighbour on BOTH sides). When
 * a point is sandwiched between two boxes, overlap shrinks to this
 * much smaller zone instead - close enough to read as "touching that
 * specific edge on purpose" - leaving the (now much larger, relative
 * to a tiny gap) remainder genuinely adjacent. The open-end case
 * (only one neighbour nearby) is unaffected; it already had room.
 */
const SANDWICHED_OVERLAP_EDGE_ZONE = 3;

/**
 * Is `point` flanked by ANOTHER box on the opposite side from `box`,
 * within one card-width (the same reach the halo itself uses)? If so,
 * `point` sits in a real gap between two neighbours, not near an open
 * row end where the wider `OVERLAP_EDGE_ZONE` still applies.
 */
function isSandwiched(cardBoxes, box, point, isBefore) {
  for (const other of cardBoxes) {
    if (other === box) continue;
    if (isBefore ? (other.right <= point.x && box.left - other.right <= box.width)
      : (other.left >= point.x && other.left - box.right <= box.width)) return true;
  }
  return false;
}

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
function evaluateBox(cardBoxes, box, point, nearest) {
  if (isStackHit(box, point)) {
    return isLowerHalf(box, point)
      ? { column: true, targetCardId: box.pileableId }
      : { stack: true, targetCardId: box.pileableId };
  }
  if (!withinVerticalReach(box, point)) return { nearest };

  const isBefore = point.x < box.left;
  const distance = isBefore ? box.left - point.x : point.x - box.right;
  if (distance > box.width) return { nearest };

  // Within the (small, and smaller still if sandwiched between two
  // neighbours - see `SANDWICHED_OVERLAP_EDGE_ZONE`'s own comment)
  // fixed edge zone, overlap; the rest of the halo is ADJACENT instead
  // - a real, deliberately-targeted placement (still this card, still
  // this side) that just doesn't overlap. Ties keep the SAME distance-
  // then-id comparison `isBetterMatch` already uses regardless of
  // which zone either candidate falls in - "closest card wins" doesn't
  // change just because one candidate would overlap and another
  // wouldn't.
  const edgeZone = isSandwiched(cardBoxes, box, point, isBefore) ? SANDWICHED_OVERLAP_EDGE_ZONE : OVERLAP_EDGE_ZONE;
  const layout = distance <= Math.min(edgeZone, box.width / 2) ? 'overlap' : undefined;
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
    const verdict = evaluateBox(cardBoxes, box, point, nearest);
    if (verdict.stack) return { targetCardId: verdict.targetCardId, side: 'after', layout: 'stack' };
    if (verdict.column) return { targetCardId: verdict.targetCardId, side: 'after', layout: 'column' };
    nearest = verdict.nearest;
  }

  if (!nearest) return {};
  const { targetCardId, side, layout } = nearest;
  return layout ? { targetCardId, side, layout } : { targetCardId, side };
}
