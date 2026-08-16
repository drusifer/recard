import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatedOrder, seatPosition } from '../src/seating.js';

// --- seatedOrder (D18) ---

test('seatedOrder: rotates the array so the viewer is first', () => {
  const players = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  const result = seatedOrder(players, 'p2');
  assert.deepEqual(result.map((p) => p.id), ['p2', 'p3', 'p1']);
});

test('seatedOrder: preserves everyone else\'s relative order', () => {
  const players = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
  const result = seatedOrder(players, 'p3');
  assert.deepEqual(result.map((p) => p.id), ['p3', 'p4', 'p1', 'p2']);
});

test('seatedOrder: viewer already first is a no-op', () => {
  const players = [{ id: 'p1' }, { id: 'p2' }];
  const result = seatedOrder(players, 'p1');
  assert.deepEqual(result.map((p) => p.id), ['p1', 'p2']);
});

test('seatedOrder: viewer not found in the roster returns the list unchanged', () => {
  const players = [{ id: 'p1' }, { id: 'p2' }];
  const result = seatedOrder(players, 'ghost');
  assert.deepEqual(result.map((p) => p.id), ['p1', 'p2']);
});

test('seatedOrder: solo player is trivially unchanged', () => {
  const players = [{ id: 'p1' }];
  const result = seatedOrder(players, 'p1');
  assert.deepEqual(result.map((p) => p.id), ['p1']);
});

// --- seatPosition (D18) ---

test('seatPosition: index 0 is bottom-center regardless of seat count', () => {
  for (const count of [1, 2, 3, 5, 8]) {
    const { leftPct, topPct } = seatPosition(0, count);
    assert.ok(Math.abs(leftPct - 50) < 1e-9, `leftPct should be 50 for count=${count}`);
    assert.ok(topPct > 50, `topPct should be below center (bottom) for count=${count}`);
  }
});

test('seatPosition: 2 seats puts the second directly opposite (top-center)', () => {
  const { leftPct, topPct } = seatPosition(1, 2);
  assert.ok(Math.abs(leftPct - 50) < 1e-9);
  assert.ok(topPct < 50, 'seat 1 of 2 should be at the top');
});

test('seatPosition: every seat in a set is at a distinct position', () => {
  const count = 5;
  const positions = Array.from({ length: count }, (_, i) => seatPosition(i, count));
  const unique = new Set(positions.map((p) => `${p.leftPct.toFixed(4)},${p.topPct.toFixed(4)}`));
  assert.equal(unique.size, count);
});

test('seatPosition: positions are symmetric around the vertical center line', () => {
  // seat 1 and seat (count-1) should mirror each other left/right at the same height.
  const count = 5;
  const a = seatPosition(1, count);
  const b = seatPosition(count - 1, count);
  assert.ok(Math.abs(a.leftPct - 50 - (50 - b.leftPct)) < 1e-9, 'mirrored horizontally');
  assert.ok(Math.abs(a.topPct - b.topPct) < 1e-9, 'same height');
});

test('seatPosition: custom radius scales distance from center without changing angle', () => {
  const wide = seatPosition(1, 4, 42);
  const narrow = seatPosition(1, 4, 21);
  assert.ok(Math.abs((wide.leftPct - 50) - 2 * (narrow.leftPct - 50)) < 1e-9);
  assert.ok(Math.abs((wide.topPct - 50) - 2 * (narrow.topPct - 50)) < 1e-9);
});

test('seatPosition: stays within a 50% radius so seats never clip the surface edge', () => {
  for (let i = 0; i < 8; i++) {
    const { leftPct, topPct } = seatPosition(i, 8);
    assert.ok(leftPct >= 0 && leftPct <= 100);
    assert.ok(topPct >= 0 && topPct <= 100);
  }
});
