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

test('past the last card, still within the fixed overlap edge zone, overlaps after it', () => {
  // C's halo runs 140-180 (one card-width, 40px); OVERLAP_EDGE_ZONE is
  // a fixed 14px, not a fraction of it. x=150 is 10px past C's right
  // edge - inside that fixed zone regardless of card width.
  assert.deepEqual(resolveDropTarget(ROW, { x: 150, y: 30 }), {
    targetCardId: 'C',
    side: 'after',
    layout: 'overlap',
  });
});

// *fix (direct user report): "why no side by side in the battlefield
// pile?" - splitting the halo at its own MIDPOINT (half the card's
// width) meant two cards at their normal small resting gap had NO
// room for this zone at all (the whole gap was always within the
// near-half of whichever card was closer). A small FIXED edge zone
// (this ROW's 40px-wide cards would have had a 20px midpoint before;
// OVERLAP_EDGE_ZONE is 14px regardless of card width) leaves the rest
// of the halo - including an ordinary inter-card gap - genuinely
// reachable as a distinct 4th outcome from stack/column/overlap.
test('past the fixed overlap edge zone, still in the halo, is adjacent - a real target with no overlap', () => {
  // 30px past C's right edge - well past the 14px edge zone, still
  // within the one-card-width (40px) halo.
  assert.deepEqual(resolveDropTarget(ROW, { x: 170, y: 30 }), {
    targetCardId: 'C',
    side: 'after',
  }, 'no layout key at all - present as a target, not as an overlap');
});

test('the overlap edge zone\'s own boundary belongs to overlap, not adjacent', () => {
  // Exactly 14px past C's right edge - OVERLAP_EDGE_ZONE itself.
  assert.deepEqual(resolveDropTarget(ROW, { x: 154, y: 30 }), {
    targetCardId: 'C',
    side: 'after',
    layout: 'overlap',
  });
  // One pixel further - already adjacent.
  assert.deepEqual(resolveDropTarget(ROW, { x: 155, y: 30 }), {
    targetCardId: 'C',
    side: 'after',
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
  // Left of the very first card, within the overlap edge zone -> before
  // A, not "after" anything.
  assert.deepEqual(resolveDropTarget(ROW, { x: -10, y: 30 }), {
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
// pile?" - two cards at their NORMAL resting gap (`--card-gap`, ~8px
// in the real app - far smaller than this ROW fixture's own 10px gap,
// on purpose, to match the actual reported scenario) left NO room for
// adjacent at all: the whole gap sat inside the near-half of whichever
// card was closer. A tight (sandwiched) gap now gets its own much
// smaller overlap zone, so most of even an 8px gap is reachable as
// adjacent - only genuinely hovering right at one specific edge still
// overlaps it.
const TIGHT = [box('X', 0), box('Y', 52)]; // 40-wide cards, 12px gap (52 - 40)
test('a real battlefield-style TIGHT gap: the middle is adjacent, not overlap', () => {
  // Gap runs 40-52 (12px); its midpoint is 46, 6px from either edge -
  // clear of SANDWICHED_OVERLAP_EDGE_ZONE (4px) on both sides.
  assert.deepEqual(resolveDropTarget(TIGHT, { x: 46, y: 30 }), {
    targetCardId: 'X',
    side: 'after',
  }, 'no layout key - genuinely adjacent, not forced into overlapping X or Y');
});

test('a real battlefield-style TIGHT gap: right at either edge still overlaps', () => {
  assert.deepEqual(resolveDropTarget(TIGHT, { x: 42, y: 30 }), {
    targetCardId: 'X',
    side: 'after',
    layout: 'overlap',
  }, '2px past X - clearly touching X on purpose');
  assert.deepEqual(resolveDropTarget(TIGHT, { x: 50, y: 30 }), {
    targetCardId: 'Y',
    side: 'before',
    layout: 'overlap',
  }, '2px before Y - clearly touching Y on purpose');
});

test('an OPEN end (only one neighbour, not sandwiched) still gets the wider overlap zone', () => {
  // Past the LAST card (Y ends at 92) - open space, no flanking
  // neighbour on the far side - so the ordinary (wider)
  // OVERLAP_EDGE_ZONE applies, same as the non-sandwiched tests above.
  assert.deepEqual(resolveDropTarget(TIGHT, { x: 102, y: 30 }), {
    targetCardId: 'Y',
    side: 'after',
    layout: 'overlap',
  }, '10px past Y with nothing beyond it - well within the open-end zone');
});
