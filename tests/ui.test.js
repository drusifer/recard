import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMenuPosition, scaledDragImageAnchor } from '../src/ui.js';

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
*fix (direct user bug report, 2026-09-17): "drag is weird, not scaled
right so the dragged items fall behind the mouse pointer." `setDragImage`
anchors the drag ghost at (x, y) into the ACTUAL ON-SCREEN drag image the
browser renders - which reflects every ancestor CSS transform, including
`--table-zoom`'s `scale()` on `#zones`. `face.offsetWidth`/`offsetHeight`
are the element's UNSCALED layout size, so anchoring at half of those
(the old code) only centers the ghost when the table happens to be at
exactly 1x zoom - at any other zoom the anchor point drifts away from
center by exactly the zoom deviation, which is "falls behind the mouse"
at zoom > 1 (the real image is bigger than the anchor math assumes).
*/
test('scaledDragImageAnchor: at 1x zoom, matches the old plain-half-of-offset math', () => {
  assert.deepEqual(scaledDragImageAnchor(100, 60, 1), { x: 50, y: 30 });
});

test('scaledDragImageAnchor: zoomed in, the anchor grows with the real (bigger) rendered image', () => {
  assert.deepEqual(scaledDragImageAnchor(100, 60, 1.6), { x: 80, y: 48 });
});

test('scaledDragImageAnchor: zoomed out, the anchor shrinks with the real (smaller) rendered image', () => {
  assert.deepEqual(scaledDragImageAnchor(100, 60, 0.4), { x: 20, y: 12 });
});
