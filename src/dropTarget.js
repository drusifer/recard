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

/**
 * @param {{cardId: string, left: number, right: number, top: number,
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
    const isWithinRow = point.y >= box.top && point.y <= box.bottom;
    if (isWithinRow && point.x >= box.left && point.x <= box.right) {
      return { targetCardId: box.cardId, side: 'after', layout: 'stack' };
    }

    const slack = box.height ?? (box.bottom - box.top);
    if (point.y < box.top - slack * VERTICAL_SLACK || point.y > box.bottom + slack * VERTICAL_SLACK) {
      continue;
    }

    const isBefore = point.x < box.left;
    const distance = isBefore ? box.left - point.x : point.x - box.right;
    if (distance > box.width) continue;

    // Ties are broken by card id rather than by array position, so the
    // same point always resolves the same way regardless of the order
    // the caller happened to collect boxes in.
    const isBetter =
      nearest === null ||
      distance < nearest.distance ||
      (distance === nearest.distance && box.cardId < nearest.targetCardId);
    if (isBetter) {
      nearest = { distance, targetCardId: box.cardId, side: isBefore ? 'before' : 'after' };
    }
  }

  if (!nearest) return {};
  return { targetCardId: nearest.targetCardId, side: nearest.side, layout: 'overlap' };
}
