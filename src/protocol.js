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
