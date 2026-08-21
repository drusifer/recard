import test from 'node:test';
import assert from 'node:assert/strict';
import { rectsOverlap, fitsViewport, meetsMinTouchTarget, pageOverflow, findOverlaps } from './designLint.mjs';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test('rectsOverlap: two genuinely overlapping rects are true', () => {
  assert.equal(rectsOverlap(rect(0, 0, 10, 10), rect(5, 5, 15, 15)), true);
});

test('rectsOverlap: separated rects are false', () => {
  assert.equal(rectsOverlap(rect(0, 0, 10, 10), rect(20, 20, 30, 30)), false);
});

test('rectsOverlap: merely touching edges is NOT an overlap', () => {
  // Matches the pre-existing D24 check this generalizes: adjacent, not
  // colliding. Getting this backwards would flag every zone next to
  // its neighbour as a regression.
  assert.equal(rectsOverlap(rect(0, 0, 10, 10), rect(10, 0, 20, 10)), false, 'sharing a right/left edge');
  assert.equal(rectsOverlap(rect(0, 0, 10, 10), rect(0, 10, 10, 20)), false, 'sharing a bottom/top edge');
});

test('rectsOverlap: one rect fully containing another is true', () => {
  assert.equal(rectsOverlap(rect(0, 0, 100, 100), rect(10, 10, 20, 20)), true);
});

test('fitsViewport: a rect inside the viewport fits', () => {
  assert.equal(fitsViewport(rect(10, 10, 100, 100), { width: 200, height: 200 }), true);
});

test('fitsViewport: a rect extending past the bottom does not fit', () => {
  // This is the exact shape of the "table too big" regression: content
  // that starts on-screen but bleeds past the fold.
  assert.equal(fitsViewport(rect(10, 10, 100, 900), { width: 200, height: 800 }), false);
});

test('fitsViewport: a negative top (scrolled above the fold) does not fit', () => {
  assert.equal(fitsViewport(rect(10, -5, 100, 100), { width: 200, height: 200 }), false);
});

test('fitsViewport: a rect flush with the exact viewport edge fits (boundary, not off-by-one)', () => {
  assert.equal(fitsViewport(rect(0, 0, 200, 200), { width: 200, height: 200 }), true);
});

test('meetsMinTouchTarget: at or above 44px in both dimensions passes', () => {
  assert.equal(meetsMinTouchTarget({ width: 44, height: 44 }), true);
  assert.equal(meetsMinTouchTarget({ width: 60, height: 50 }), true);
});

test('meetsMinTouchTarget: under 44px in EITHER dimension fails', () => {
  // The real Sprint 2 regression measured ~25x20px - narrow in both axes,
  // but a control that is tall/thin or short/wide is just as unreliable
  // to tap, so both dimensions must independently clear the floor.
  assert.equal(meetsMinTouchTarget({ width: 43, height: 60 }), false, 'narrow width, tall height');
  assert.equal(meetsMinTouchTarget({ width: 60, height: 43 }), false, 'wide width, short height');
});

test('meetsMinTouchTarget: a custom floor overrides the 44px default', () => {
  assert.equal(meetsMinTouchTarget({ width: 30, height: 30 }, 24), true);
});

test('pageOverflow: a page shorter than the viewport is negative (fits with room to spare)', () => {
  assert.equal(pageOverflow(600, 800), -200);
});

test('pageOverflow: a page taller than the viewport is positive - the exact bug this project shipped', () => {
  assert.equal(pageOverflow(1022, 900), 122);
});

test('pageOverflow: an exact match is zero, not a false positive', () => {
  assert.equal(pageOverflow(800, 800), 0);
});

test('findOverlaps: names the colliding pair, not just that a collision exists', () => {
  const entries = [
    { label: 'Alice', rect: rect(0, 0, 50, 50) },
    { label: 'Pot', rect: rect(40, 40, 90, 90) },
    { label: 'Bob', rect: rect(200, 200, 250, 250) },
  ];
  assert.deepEqual(findOverlaps(entries), [{ a: 'Alice', b: 'Pot' }]);
});

test('findOverlaps: an empty result for a fully clear layout', () => {
  const entries = [
    { label: 'Alice', rect: rect(0, 0, 10, 10) },
    { label: 'Bob', rect: rect(20, 20, 30, 30) },
  ];
  assert.deepEqual(findOverlaps(entries), []);
});

test('findOverlaps: reports EVERY colliding pair, not just the first', () => {
  // A single early-return would hide a second, unrelated collision -
  // exactly the failure mode of the ad-hoc single-assert checks this
  // module replaces.
  const entries = [
    { label: 'A', rect: rect(0, 0, 10, 10) },
    { label: 'B', rect: rect(5, 5, 15, 15) },
    { label: 'C', rect: rect(100, 100, 110, 110) },
    { label: 'D', rect: rect(105, 105, 115, 115) },
  ];
  assert.deepEqual(findOverlaps(entries), [
    { a: 'A', b: 'B' },
    { a: 'C', b: 'D' },
  ]);
});
