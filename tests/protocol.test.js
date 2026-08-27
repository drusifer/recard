import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from '../src/protocol.js';

test('makeStateMessage: wraps a state payload with type "state"', () => {
  const message = makeStateMessage({ foo: 'bar' });
  assert.equal(message.type, 'state');
  assert.deepEqual(message.payload, { foo: 'bar' });
});

test('makeMotionMessage: wraps cosmetic data with type "motion" and a kind', () => {
  const message = makeMotionMessage('hand-slot', { slot: 2, x: 10, y: 20 });
  assert.equal(message.type, 'motion');
  assert.equal(message.kind, 'hand-slot');
  assert.deepEqual(message.data, { slot: 2, x: 10, y: 20 });
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
  for (let index = 0; index < 5; index++) throttler.schedule(`slot-${index}`, { i: index });
  const due = throttler.drain();
  assert.equal(due.length, 5);
});

// --- cardDragPayload (D19, US-29): the live card-drag broadcast's
// privacy rule - cardId is included iff the card is already public
// (faceUp), since anything else could be visible to the dragger but
// invisible to a receiver (MOVE_CARD's own authorization guarantees no
// receiver could ever legitimately see a card the dragger can't). ---

test('cardDragPayload: a face-up (public) card includes its real id', () => {
  const card = { id: 'card-1', faceUp: true, owner: null };
  const payload = cardDragPayload(card, 0.4, 0.6);
  assert.equal(payload.cardId, 'card-1');
  assert.equal(payload.x, 0.4);
  assert.equal(payload.y, 0.6);
});

test('cardDragPayload: a still-hidden private card (own hand or own private zone card) omits the id', () => {
  const card = { id: 'card-2', faceUp: false, owner: 'p1' };
  const payload = cardDragPayload(card, 0.1, 0.2);
  assert.equal(payload.cardId, null, 'a receiver who cannot see this card must not learn its identity');
});

test('cardDragPayload: a still-hidden shared card (no owner yet) also omits the id', () => {
  const card = { id: 'card-3', faceUp: false, owner: null };
  const payload = cardDragPayload(card, 0.5, 0.5);
  assert.equal(payload.cardId, null);
});

test('cardDragPayload: a hand card (no faceUp/owner fields at all) omits the id', () => {
  // Hand cards are plain {id, rank, suit} - no faceUp field exists at
  // all, which must be treated the same as faceUp: false (never assume
  // visibility from an absent field).
  const card = { id: 'card-4', rank: 'A', suit: 'spades' };
  const payload = cardDragPayload(card, 0.3, 0.3);
  assert.equal(payload.cardId, null);
});

test('cardDragPayload: never leaks rank/suit even for a face-up card - only the id crosses the wire', () => {
  const card = { id: 'card-5', rank: 'K', suit: 'hearts', faceUp: true, owner: null };
  const payload = cardDragPayload(card, 0.2, 0.8);
  assert.deepEqual(Object.keys(payload).sort(), ['cardId', 'x', 'y']);
});
