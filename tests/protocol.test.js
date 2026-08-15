import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStateMessage, makeMotionMessage, createMotionThrottler } from '../src/protocol.js';

test('makeStateMessage: wraps a state payload with type "state"', () => {
  const msg = makeStateMessage({ foo: 'bar' });
  assert.equal(msg.type, 'state');
  assert.deepEqual(msg.payload, { foo: 'bar' });
});

test('makeMotionMessage: wraps cosmetic data with type "motion" and a kind', () => {
  const msg = makeMotionMessage('hand-slot', { slot: 2, x: 10, y: 20 });
  assert.equal(msg.type, 'motion');
  assert.equal(msg.kind, 'hand-slot');
  assert.deepEqual(msg.data, { slot: 2, x: 10, y: 20 });
});

test('createMotionThrottler: coalesces repeated schedules for the same key, latest wins', () => {
  const throttler = createMotionThrottler();
  throttler.schedule('slot-1', { x: 1 });
  throttler.schedule('slot-1', { x: 2 });
  throttler.schedule('slot-1', { x: 3 });
  throttler.schedule('slot-2', { x: 100 });

  const due = throttler.drain();
  assert.equal(due.length, 2);
  const slot1 = due.find((m) => m.key === 'slot-1');
  assert.deepEqual(slot1.data, { x: 3 });
});

test('createMotionThrottler: drain() clears pending state (best-effort, not replayed)', () => {
  const throttler = createMotionThrottler();
  throttler.schedule('slot-1', { x: 1 });
  throttler.drain();
  const second = throttler.drain();
  assert.equal(second.length, 0, 'nothing new scheduled since last drain');
});

test('createMotionThrottler: independent keys never overwrite each other', () => {
  const throttler = createMotionThrottler();
  for (let i = 0; i < 5; i++) throttler.schedule(`slot-${i}`, { i });
  const due = throttler.drain();
  assert.equal(due.length, 5);
});
