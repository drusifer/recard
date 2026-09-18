import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMenuPosition, dragImageAnchor } from '../src/ui.js';

/**
US-100 (right-click card action menu, D101): the menu opens at the cursor,
but Smith's own ask (Gate 2) was that it must never render off-screen when
the cursor is near a viewport edge - this is the pure clamping math behind
that, kept DOM-free so it's directly testable (same "pure logic, no DOM"
split as `pileActions.js`/`touchDrag.js`).
*/

test('menu with room on all sides stays exactly at the cursor', () => {
  const pos = clampMenuPosition(100, 100, { width: 160, height: 200 }, { width: 1000, height: 800 });
  assert.deepEqual(pos, { x: 100, y: 100 });
});

test('menu that would overflow the right edge shifts left to stay on-screen', () => {
  const pos = clampMenuPosition(950, 100, { width: 160, height: 200 }, { width: 1000, height: 800 });
  assert.equal(pos.x, 1000 - 160);
  assert.equal(pos.y, 100);
});

test('menu that would overflow the bottom edge shifts up to stay on-screen', () => {
  const pos = clampMenuPosition(100, 750, { width: 160, height: 200 }, { width: 1000, height: 800 });
  assert.equal(pos.x, 100);
  assert.equal(pos.y, 800 - 200);
});

test('menu taller/wider than the viewport itself pins to the origin rather than going negative', () => {
  const pos = clampMenuPosition(50, 50, { width: 2000, height: 2000 }, { width: 1000, height: 800 });
  assert.deepEqual(pos, { x: 0, y: 0 });
});

/**
*fix (direct user bug report, 2026-09-17, corrected same day): "drag is
weird, not scaled right so the dragged items fall behind the mouse
pointer" - then, after a first attempt read the table's `--table-zoom`
CSS variable back and multiplied by it: "still off, it needs to
readjust when the table zoom changes." `setDragImage` anchors the drag
ghost using the ACTUAL on-screen size of the dragged element, which
reflects EVERY transform in play, not just table zoom (rotation nudges,
hover effects, anything future) - re-deriving that size from one named
CSS variable is exactly the kind of thing that drifts out of sync.
Measuring the real rendered box directly (`getBoundingClientRect()`,
fresh at every drag) is correct under any transform, with nothing to
keep in sync - this is the pure "half of whatever real size you measured"
math behind that, kept DOM-free so it's directly testable.
*/
test('dragImageAnchor: centers on whatever real on-screen size it is given', () => {
  assert.deepEqual(dragImageAnchor(100, 60), { x: 50, y: 30 });
});

test('dragImageAnchor: a bigger rendered size (e.g. table zoomed in) grows the anchor with it', () => {
  assert.deepEqual(dragImageAnchor(160, 96), { x: 80, y: 48 });
});

test('dragImageAnchor: a smaller rendered size (e.g. table zoomed out) shrinks the anchor with it', () => {
  assert.deepEqual(dragImageAnchor(40, 24), { x: 20, y: 12 });
});
