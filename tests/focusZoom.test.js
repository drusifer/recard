import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampOverlayPosition, clampFocusZoomScale, FOCUS_ZOOM_SCALE, HOVER_INTENT_MS } from '../src/focusZoom.js';

// US-117 phase 113 (D131): growing a Pile in place as a `position:
// fixed` overlay anchored at its own rect. `clampOverlayPosition`
// decides where that overlay's top-left corner lands - anchored at the
// pile's own position by default, nudged the MINIMUM amount needed to
// stay fully on-screen for an edge/corner pile (Smith's D131 ruling).

const viewport = { width: 800, height: 600 };

test('a pile with room on every side grows anchored exactly at its own position', () => {
  const rect = { left: 300, top: 200, width: 100, height: 60 };
  const grown = { width: 200, height: 120 };
  assert.deepEqual(clampOverlayPosition(rect, grown, viewport), { left: 300, top: 200 });
});

test('a pile near the right edge nudges left just enough to stay on-screen', () => {
  const rect = { left: 700, top: 200, width: 100, height: 60 };
  const grown = { width: 200, height: 120 }; // would span 700..900, viewport is 800 wide
  const result = clampOverlayPosition(rect, grown, viewport);
  assert.equal(result.left, 600); // 800 - 200
  assert.equal(result.top, 200); // vertical axis untouched
});

test('a pile near the bottom edge nudges up just enough to stay on-screen', () => {
  const rect = { left: 200, top: 550, width: 100, height: 60 };
  const grown = { width: 150, height: 200 }; // would span 550..750, viewport is 600 tall
  const result = clampOverlayPosition(rect, grown, viewport);
  assert.equal(result.top, 400); // 600 - 200
  assert.equal(result.left, 200);
});

test('a pile in a corner nudges on both axes at once', () => {
  const rect = { left: 750, top: 570, width: 40, height: 30 };
  const grown = { width: 200, height: 150 };
  const result = clampOverlayPosition(rect, grown, viewport);
  assert.equal(result.left, 600);
  assert.equal(result.top, 450);
});

test('an overlay too big for the viewport pins to 0 rather than going negative', () => {
  const rect = { left: 10, top: 10, width: 40, height: 30 };
  const grown = { width: 2000, height: 2000 };
  const result = clampOverlayPosition(rect, grown, viewport);
  assert.equal(result.left, 0);
  assert.equal(result.top, 0);
});

test('the scale constant grows the pile, never shrinks it', () => {
  assert.ok(FOCUS_ZOOM_SCALE > 1);
});

test('the hover-intent delay is in the 150-200ms range Smith specified', () => {
  assert.ok(HOVER_INTENT_MS >= 150 && HOVER_INTENT_MS <= 200);
});

// *fix (found live, 2026-09-16): the Tighten/Loosen slider widened
// every pile's header just enough that `FOCUS_ZOOM_SCALE` (1.6x) could
// push a grown overlay's SIZE past a small viewport - `clampOverlayPosition`
// only ever repositions, it was never asked to cap size (the existing
// "pins to 0 rather than going negative" test above already documents
// that as a known, deliberate gap). `clampFocusZoomScale` closes it:
// the effective scale never grows the pile past the viewport in either
// dimension, and never shrinks it below its own natural size either.
test('clampFocusZoomScale: uses the requested scale when there is room for it', () => {
  const natural = { width: 100, height: 60 };
  assert.equal(clampFocusZoomScale(natural, viewport), FOCUS_ZOOM_SCALE);
});

test('clampFocusZoomScale: caps to fit when the requested scale would overflow the WIDTH', () => {
  const natural = { width: 700, height: 60 }; // *1.6 = 1120, viewport is 800 wide
  assert.equal(clampFocusZoomScale(natural, viewport), 800 / 700);
});

test('clampFocusZoomScale: caps to fit when the requested scale would overflow the HEIGHT', () => {
  const natural = { width: 100, height: 500 }; // *1.6 = 800, viewport is 600 tall
  assert.equal(clampFocusZoomScale(natural, viewport), 600 / 500);
});

test('clampFocusZoomScale: never shrinks below 1x (the pile\'s own natural size), even if that still overflows', () => {
  const natural = { width: 2000, height: 2000 };
  assert.equal(clampFocusZoomScale(natural, viewport), 1);
});
