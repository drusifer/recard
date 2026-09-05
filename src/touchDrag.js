/**
 * Press-and-hold drag recognizer (US-40, D28).
 *
 * Pure and DOM-free, for the same reason `dropTarget.js` (D21),
 * `seating.js` (D18) and `handOrder.js` (D14) are: the interesting part
 * is the gesture *rules*, and rules are only directly testable when they
 * aren't tangled up with element lookups and real timers. The caller
 * feeds timestamped pointer samples in and gets drag lifecycle events
 * out; it owns capture, hit-testing and the ghost.
 *
 *   idle --down--> pending --hold elapsed, still within slop--> dragging
 *                    |                                            |
 *                    |-- moved past the slop first --> idle       |-- move --> dragging
 *                    |-- up (a tap) ----------------> idle        |-- up ----> drop, idle
 *                    `-- cancel -------------------> idle         `-- cancel -> cancel, idle
 *
 * Why press-and-hold rather than "drag once the finger commits to an
 * axis" (Smith Gate 1): neither axis is free in either region a drag
 * starts in. `#hand-area` is `overflow-x: auto`, so the hand scrolls
 * horizontally - and hand reorder (US-23) is *also* horizontal. Playing
 * a card is vertical, and `#table-area` is `overflow-y: auto`. Direction
 * cannot disambiguate anything here; time plus distance can.
 *
 * It also isn't a new gesture: `ui.js` already binds press-and-hold on a
 * card for the D13 lift cue. This gives that gesture a second, larger
 * meaning rather than introducing a rival one.
 */

/**
How long a finger must stay put before the card lifts.
*/
export const HOLD_MS = 250;

/**
 * How far a finger may wander during the hold and still count as
 * holding. Anything further is a scroll and can never become a drag —
 * this is the single rule that keeps the page scrollable, so the
 * browser's own `touch-action` never has to be disabled up front.
 */
export const SLOP_PX = 8;

/**
 * @typedef {{phase: 'pending'|'dragging', originX: number, originY: number,
 *            downAt: number}} DragState
 * @typedef {{type: 'down'|'move'|'up'|'cancel'|'tick', t: number,
 *            x?: number, y?: number}} Sample
 * @typedef {{type: 'lift'|'move'|'drop'|'cancel', x: number, y: number,
 *            originX: number, originY: number}} DragEvent
 */

const IDLE = { state: null, events: [] };

function emit(state, type, x, y) {
  return { type, x, y, originX: state.originX, originY: state.originY };
}

function beyondSlop(state, x, y, slopPx) {
  const dx = x - state.originX;
  const dy = y - state.originY;
  // Measured from the ORIGIN, not the previous sample: many small steps
  // that each stay under the slop still add up to a scroll, and
  // comparing against the last sample would let a slow page-drag creep
  // arbitrarily far and then be read as a hold.
  return dx * dx + dy * dy > slopPx * slopPx;
}

/**
 * The `pending` phase's own step (US-107, cognitive-complexity):
 * extracted unchanged, since `state.phase === 'pending'` is the one
 * branch of `step` with real internal branching of its own - the
 * `dragging` phase barely has any (see `stepDragging` below).
 *
 * A tap. Tap-to-play is a deliberately-kept path (Smith Gate 1 on
 * US-28), so the recognizer stays entirely out of its way.
 */
function stepPending(state, sample, holdMs, slopPx) {
  const { type, t, x, y } = sample;
  if (type === 'up') return IDLE;

  const isHeld = t - state.downAt >= holdMs;
  // Time is checked before distance: having held long enough, the
  // gesture is a drag and the finger is free to move. Checking
  // distance first would cancel a legitimate drag whose first sample
  // happens to arrive late and far.
  if (!isHeld) {
    return type === 'move' && beyondSlop(state, x, y, slopPx)
      ? IDLE
      : { state, events: [] };
  }

  const lifted = { ...state, phase: 'dragging' };
  const events = [emit(state, 'lift', state.originX, state.originY)];
  if (type === 'move') events.push(emit(state, 'move', x, y));
  return { state: lifted, events };
}

/** The `dragging` phase's own step (US-107) - extracted unchanged for
 * symmetry with `stepPending` above, though it has little branching of
 * its own to begin with. */
function stepDragging(state, sample) {
  const { type, x, y } = sample;
  if (type === 'move') return { state, events: [emit(state, 'move', x, y)] };
  if (type === 'up') return { state: null, events: [emit(state, 'drop', x, y)] };
  return { state, events: [] }; // a tick while already dragging
}

/**
 * One step of the recognizer.
 *
 * @param {DragState|null} state previous state (`null` = idle).
 * @param {Sample} sample
 * @param {{holdMs?: number, slopPx?: number}} [opts]
 * @returns {{state: DragState|null, events: DragEvent[]}}
 */
export function step(state, sample, { holdMs = HOLD_MS, slopPx = SLOP_PX } = {}) {
  const { type, x, y } = sample;

  if (type === 'down') {
    return { state: { phase: 'pending', originX: x, originY: y, downAt: sample.t }, events: [] };
  }

  // A stray move/up/cancel/tick with no gesture in flight. `tick`
  // specifically matters: the caller arms a real timer, which can still
  // fire after a fast tap has already finished, and must not resurrect
  // it into a phantom lift.
  if (!state) return IDLE;

  if (type === 'cancel') {
    // Only a gesture that actually became visible needs tearing down.
    // Before the lift, a cancel is the browser taking the gesture to
    // scroll with it - the same outcome the slop rule reaches from the
    // other direction, so the two agree instead of racing.
    return state.phase === 'dragging'
      ? { state: null, events: [emit(state, 'cancel', x ?? state.originX, y ?? state.originY)] }
      : IDLE;
  }

  return state.phase === 'pending'
    ? stepPending(state, sample, holdMs, slopPx)
    : stepDragging(state, sample);
}
