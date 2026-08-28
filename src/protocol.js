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
 *
 * *nit (D68, direct user request): `dx`/`dy` - NOT an absolute screen
 * fraction any more. Every player's `panelLayout.js` arrangement is
 * genuinely local/per-browser (deliberately, D-numbered decision) - an
 * absolute fraction of the DRAGGER's own screen has no correct meaning
 * on a receiver's differently-arranged screen. `dx`/`dy` are instead an
 * offset from the DRAGGING PLAYER's own hand-panel center (a stable
 * reference point every viewer renders somewhere), as a fraction of the
 * screen's own size - see `main.js`'s `broadcastCardDrag`/
 * `applyIncomingMotion` for where the offset is computed and re-anchored
 * against each receiver's own rendering of that same player's seat.
 */
export function cardDragPayload(card, dx, dy) {
  return { cardId: card.faceUp === true ? card.id : null, dx, dy };
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
      const due = [...pending].map(([key, data]) => ({ key, data }));
      pending.clear();
      return due;
    },
  };
}
