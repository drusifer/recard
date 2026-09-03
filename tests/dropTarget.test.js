import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDropTarget } from '../src/dropTarget.js';

// A row of three 40px-wide cards at y 0..60, with a 10px gap between:
//   A [  0, 40]   B [ 50, 90]   C [100,140]
const box = (pileableId, left) => ({ pileableId, left, right: left + 40, top: 0, bottom: 60, width: 40 });
const ROW = [box('A', 0), box('B', 50), box('C', 100)];

test('a drop on a card body stacks onto that card', () => {
  assert.deepEqual(resolveDropTarget(ROW, { x: 20, y: 30 }), {
    targetCardId: 'A',
    side: 'after',
    layout: 'stack',
  });
  assert.deepEqual(resolveDropTarget(ROW, { x: 120, y: 5 }), {
    targetCardId: 'C',
    side: 'after',
    layout: 'stack',
  });
});

test('a drop in the halo LEFT of a card overlaps before it', () => {
  // x=45 sits in the gap: right of A, left of B, nearer B.
  assert.deepEqual(resolveDropTarget(ROW, { x: 47, y: 30 }), {
    targetCardId: 'B',
    side: 'before',
    layout: 'overlap',
  });
});

test('a drop in the halo RIGHT of a card overlaps after it', () => {
  // x=43 sits in the gap but nearer A's right edge than B's left edge.
  assert.deepEqual(resolveDropTarget(ROW, { x: 43, y: 30 }), {
    targetCardId: 'A',
    side: 'after',
    layout: 'overlap',
  });
});

test('past the last card, still within one card-width, overlaps after it', () => {
  assert.deepEqual(resolveDropTarget(ROW, { x: 170, y: 30 }), {
    targetCardId: 'C',
    side: 'after',
    layout: 'overlap',
  });
});

test('empty space beyond the halo is a plain append with no layout', () => {
  // More than one card-width (40px) past C's right edge (140).
  assert.deepEqual(resolveDropTarget(ROW, { x: 300, y: 30 }), {});
  assert.deepEqual(resolveDropTarget([], { x: 10, y: 10 }), {}, 'an empty zone always appends');
});

test('a drop far above/below the row does not latch onto a card', () => {
  assert.deepEqual(
    resolveDropTarget(ROW, { x: 20, y: 400 }),
    {},
    'vertical distance must disqualify a card, or a drop low in a tall zone would snap to the row above it',
  );
});

test('the nearer card wins when two are in range (no ambiguous double-claim)', () => {
  // Exactly between A's right (40) and B's left (50) -> tie broken
  // deterministically rather than depending on iteration order.
  const first = resolveDropTarget(ROW, { x: 44, y: 30 });
  const second = resolveDropTarget(ROW.toReversed(), { x: 44, y: 30 });
  assert.deepEqual(first, second, 'the result must not depend on the order cards are supplied in');
});

test('side is decided by which edge the point is past, not by card index', () => {
  // Left of the very first card -> before A, not "after" anything.
  assert.deepEqual(resolveDropTarget(ROW, { x: -15, y: 30 }), {
    targetCardId: 'A',
    side: 'before',
    layout: 'overlap',
  });
});
