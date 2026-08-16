/**
 * Two message classes on the data channel, per ARCHITECTURE.md D4:
 * - "state" messages are reliable/ordered and are the only source of
 *   truth clients render from.
 * - "motion" messages are best-effort/cosmetic (see createMotionThrottler)
 *   and never carry information not already implied by the last state
 *   message.
 */

export function makeStateMessage(payload) {
  return { type: 'state', payload };
}

export function makeMotionMessage(kind, data) {
  return { type: 'motion', kind, data };
}

/**
 * D19/US-29: builds the live card-drag broadcast payload. `cardId` is
 * included iff `card.faceUp === true` - i.e. it's already public to
 * every possible receiver. This single condition is provably sufficient
 * given MOVE_CARD's own authorization (state.js/ARCHITECTURE.md D12): a
 * card a player is allowed to drag at all is either already face-up
 * (safe to name to everyone) or a still-hidden card owned by the
 * dragger themself (visible only to the dragger, so by construction
 * invisible to every other receiver of this broadcast) - there is no
 * third case where some receiver could legitimately see a card the
 * dragger cannot. When `cardId` is omitted, every receiver renders a
 * generic anonymous back at the broadcast position instead.
 */
export function cardDragPayload(card, x, y) {
  return { cardId: card.faceUp === true ? card.id : null, x, y };
}

/**
 * Best-effort motion delivery: repeated `schedule(key, data)` calls for
 * the same key coalesce to the latest value; `drain()` (called on a
 * caller-owned interval, e.g. every ~50ms) returns the pending messages
 * and clears them. Nothing is retried or queued past a drain — dropping a
 * frame only costs smoothness because motion never carries authoritative
 * information (see module docstring).
 */
export function createMotionThrottler() {
  const pending = new Map();
  return {
    schedule(key, data) {
      pending.set(key, data);
    },
    drain() {
      const due = [...pending.entries()].map(([key, data]) => ({ key, data }));
      pending.clear();
      return due;
    },
  };
}
