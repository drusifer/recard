/**
 * The `perPlayer` Zone type (D56 - real subclass, was
 * `perPlayerZone.js`'s flat module). One per joined player (their hand,
 * plus any personal declared pile a GameConfig entry adds). Renders "in
 * front of" its owner's seat by default - `seatPosition()`'s ring
 * geometry, the same the roster's own seats use, at a smaller radius so
 * it sits toward the table's center rather than its edge.
 */
import { Zone } from './Zone.js';
import { seatPosition } from '../seating.js';

export class PerPlayerZone extends Zone {
  static className = 'seat-zone';

  static defaultPosition(seatIndex, seatedCount) {
    return seatPosition(seatIndex, seatedCount, 26);
  }
}
