import test from 'node:test';
import assert from 'node:assert/strict';
import { clampMenuPosition } from '../src/ui.js';

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
