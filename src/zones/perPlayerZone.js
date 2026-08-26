/**
 * The `perPlayer` Zone type (D55) - one per joined player (their hand,
 * plus any personal declared pile a GameConfig entry adds), an
 * intrinsic fact of this app rather than something a preset declares.
 * Renders "in front of" its owner's seat by default - `seatPosition()`'s
 * ring geometry, the same the roster's own seats use, at a smaller
 * radius so it sits toward the table's center rather than its edge.
 */
import { seatPosition } from '../seating.js';

export const className = 'seat-zone';

export function defaultPosition(seatIndex, seatedCount) {
  return seatPosition(seatIndex, seatedCount, 26);
}
