import test from 'node:test';
import assert from 'node:assert/strict';
import { step, HOLD_MS, SLOP_PX } from '../src/touchDrag.js';

/**
Feeds a sequence of samples through the reducer, collecting every event.
*/
/**
Idle is represented as `null`, so name it rather than asserting on null.
*/
const phaseOf = (state) => state?.phase ?? 'idle';

function run(samples, state = null) {
  const events = [];
  for (const s of samples) {
    const out = step(state, s);
    state = out.state;
    events.push(...out.events);
  }
  return { state, events };
}

const down = (t, x = 100, y = 100) => ({ type: 'down', x, y, t });
const move = (t, x, y) => ({ type: 'move', x, y, t });
const up = (t, x = 100, y = 100) => ({ type: 'up', x, y, t });

test('a still finger held past HOLD_MS lifts, even with no move events at all', () => {
  // A stationary finger fires no pointermove, so the timer tick is the
  // only thing that can start the drag. Without this the gesture would
  // require a wiggle to begin.
  const { state, events } = run([down(0), { type: 'tick', t: HOLD_MS }]);
  assert.equal(phaseOf(state), 'dragging');
  assert.deepEqual(events.map((e) => e.type), ['lift']);
  assert.deepEqual([events[0].x, events[0].y], [100, 100]);
});

test('a scroll can never become a drag: moving past the slop before the hold abandons', () => {
  // This is the rule the whole story rests on - the page has to keep
  // scrolling, and Smith ruled out any direction-based test because
  // neither axis is free in either region (#hand-area scrolls
  // horizontally AND reorder is horizontal; playing is vertical AND
  // #table-area scrolls vertically).
  const { state, events } = run([
    down(0),
    move(20, 100, 100 + SLOP_PX + 1),
    { type: 'tick', t: HOLD_MS },
    move(300, 100, 400),
    up(320, 100, 400),
  ]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, [], 'a scroll must produce no drag events whatsoever');
});

test('slop is measured from the origin, not from the previous sample', () => {
  // Many small steps that each stay under the slop still add up to a
  // scroll. Comparing against the previous sample would let a slow drag
  // of the page creep arbitrarily far and then be treated as a hold.
  const stepsOut = [];
  for (let index = 1; index <= 5; index++) stepsOut.push(move(index * 10, 100, 100 + index * 3));
  const { state, events } = run([down(0), ...stepsOut]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, []);
});

test('a finger that stays within the slop for the whole hold lifts', () => {
  const { state, events } = run([
    down(0),
    move(50, 100, 100 + SLOP_PX - 1),
    move(HOLD_MS + 10, 102, 103),
  ]);
  assert.equal(phaseOf(state), 'dragging');
  assert.deepEqual(events.map((e) => e.type), ['lift', 'move']);
});

test('a first move that arrives late AND far still lifts - time is checked before distance', () => {
  // Pointer samples are not guaranteed to be dense: a busy main thread
  // can coalesce them, so the first `move` after a genuine 250ms hold
  // may already be 100px away. Testing distance first would read that
  // as a scroll and silently cancel a drag the user had correctly
  // started - and the failure would be intermittent, which is the worst
  // kind. The hold has elapsed, so the finger is free to have moved.
  const { state, events } = run([down(0), move(HOLD_MS + 40, 100, 220)]);
  assert.equal(phaseOf(state), 'dragging');
  assert.deepEqual(events.map((e) => e.type), ['lift', 'move']);
  assert.deepEqual([events[0].x, events[0].y], [100, 100], 'the lift is reported at the origin, where the card actually is');
  assert.deepEqual([events[1].x, events[1].y], [100, 220]);
});

test('once lifted, the slop no longer applies - a drag may go anywhere', () => {
  const { state, events } = run([
    down(0),
    { type: 'tick', t: HOLD_MS },
    move(300, 900, 900),
    move(320, 20, 20),
  ]);
  assert.equal(phaseOf(state), 'dragging');
  assert.deepEqual(events.map((e) => e.type), ['lift', 'move', 'move']);
  assert.deepEqual([events[2].x, events[2].y], [20, 20]);
});

test('lifting the finger while dragging drops at the final point', () => {
  const { state, events } = run([
    down(0),
    { type: 'tick', t: HOLD_MS },
    move(300, 400, 500),
    up(310, 400, 500),
  ]);
  assert.equal(phaseOf(state), 'idle');
  const drop = events.at(-1);
  assert.equal(drop.type, 'drop');
  assert.deepEqual([drop.x, drop.y], [400, 500]);
});

test('a tap - down and up before the hold - is not a drag and emits nothing', () => {
  // Tap-to-play is an existing, deliberately-kept path (Smith Gate 1 on
  // US-28). The recognizer must stay out of its way entirely.
  const { state, events } = run([down(0), up(80)]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, []);
});

test('pointercancel while dragging emits cancel, so the ghost and the broadcast cue both clear', () => {
  // Smith Gate 1 amendment 5: ending a gesture properly, rather than
  // leaving the 2s motion TTL to mop up.
  const { state, events } = run([
    down(0),
    { type: 'tick', t: HOLD_MS },
    move(300, 400, 500),
    { type: 'cancel', t: 310 },
  ]);
  assert.equal(phaseOf(state), 'idle');
  assert.equal(events.at(-1).type, 'cancel');
});

test('pointercancel before the hold - the browser stealing the gesture to scroll - emits nothing', () => {
  // The browser starting a scroll first and the slop rule are the same
  // outcome reached from two directions; they must agree, not race.
  const { state, events } = run([down(0), { type: 'cancel', t: 40 }]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, []);
});

test('a tick after the gesture already ended does nothing', () => {
  // The binder arms a real timer; it can fire after a fast tap. It must
  // not resurrect a finished gesture into a phantom lift.
  const { state, events } = run([down(0), up(80), { type: 'tick', t: HOLD_MS }]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, []);
});

test('a move with no preceding down is ignored rather than starting a drag', () => {
  const { state, events } = run([move(10, 100, 100), up(20)]);
  assert.equal(phaseOf(state), 'idle');
  assert.deepEqual(events, []);
});

test('the drop event carries the origin, so a caller can tell where the card came from', () => {
  const { events } = run([down(0, 30, 40), { type: 'tick', t: HOLD_MS }, up(300, 400, 500)]);
  assert.deepEqual([events[0].originX, events[0].originY], [30, 40]);
  assert.deepEqual([events.at(-1).originX, events.at(-1).originY], [30, 40]);
});
