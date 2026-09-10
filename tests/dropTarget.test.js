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

// *nit (direct user request): "can we collapse the overlap css? we
// just need 3 (full, part-vertical, and part-horizontal) and we can
// adjust the %overlap with tighten/loosen" - the halo beside a card is
// ALWAYS `overlap` now (no near/far split, no separate `adjacent`
// outcome reached only by hovering a precise distance from the edge).
// How much it visually overlaps is style.css's `--pile-spread` job,
// not this geometry's.
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
  // C's halo runs 140-180 (one card-width, 40px). x=170 is 30px past
  // C's right edge - anywhere in the halo is `overlap` now, regardless
  // of exact distance.
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

// D-nit: "vertical drop targets... like how lands are normally arranged
// in a game of mtg" - the lower half of a card's own box is a THIRD
// on-card outcome (column), not just stack/overlap. Same ROW fixture -
// each box spans y 0..60, so its midline is y=30.
test('a drop on the LOWER half of a card body columns below it', () => {
  assert.deepEqual(resolveDropTarget(ROW, { x: 20, y: 45 }), {
    targetCardId: 'A',
    side: 'after',
    layout: 'column',
  });
  assert.deepEqual(resolveDropTarget(ROW, { x: 120, y: 59 }), {
    targetCardId: 'C',
    side: 'after',
    layout: 'column',
  });
});

test('the upper half (including exactly the midline) still stacks, not columns', () => {
  assert.deepEqual(resolveDropTarget(ROW, { x: 20, y: 0 }), {
    targetCardId: 'A',
    side: 'after',
    layout: 'stack',
  });
  // Exactly on the midline: an existing test above already asserts
  // this point (x:20, y:30) resolves to 'stack' - this just names WHY,
  // so a future off-by-one in `isLowerHalf`'s `>` vs `>=` fails loudly
  // here instead of silently flipping that other test's meaning.
  assert.deepEqual(resolveDropTarget(ROW, { x: 20, y: 30 }).layout, 'stack');
});

// *fix (direct user report): "why no side by side in the battlefield
// pile?" - the ORIGINAL report this whole simplification traces back
// to. Two cards at their real resting gap (~8px) used to leave no
// reachable "adjacent" at all under the old near/far-split model. Now
// there's nothing to reach for - the whole gap is just `overlap`,
// and it's up to the pile's OWN `--pile-spread` (not this geometry)
// whether that overlap is visually zero (looks adjacent) or tight.
test('a real battlefield-style TIGHT gap: still resolves to overlap, both sides', () => {
  const TIGHT = [box('X', 0), box('Y', 48)]; // 40-wide cards, 8px gap
  assert.deepEqual(resolveDropTarget(TIGHT, { x: 44, y: 30 }), {
    targetCardId: 'X',
    side: 'after',
    layout: 'overlap',
  }, 'the gap\'s own midpoint - no near/far split left to fall foul of');
});
