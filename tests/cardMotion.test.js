// US-123/D144: the pure half of "moved cards travel" - what moved
// between two renders, and by how much. The DOM half is browser-tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import { travels, GLOW_MS } from '../src/cardMotion.js';

const at = (entries) => new Map(entries.map(([id, left, top]) => [id, { left, top }]));

test('a card that changed place travels from where it was', () => {
  const moved = travels(at([['a', 10, 10]]), at([['a', 60, 90]]));
  assert.deepEqual(moved.get('a'), { dx: -50, dy: -80 });
});

test('a card that did not move does not animate', () => {
  assert.equal(travels(at([['a', 10, 10]]), at([['a', 10, 10]])).size, 0);
});

test('sub-pixel drift is not motion', () => {
  assert.equal(travels(at([['a', 10, 10]]), at([['a', 10.2, 10.1]])).size, 0);
});

test('every card of a deal travels in the same pass, so they move together', () => {
  const moved = travels(at([['a', 0, 0], ['b', 0, 0], ['c', 0, 0]]), at([['a', 10, 0], ['b', 20, 0], ['c', 30, 0]]));
  assert.deepEqual([...moved.keys()], ['a', 'b', 'c']);
});

test('a card that was not on screen before has nowhere to travel from - it just appears', () => {
  const moved = travels(at([]), at([['a', 10, 10]]));
  assert.equal(moved.size, 0);
});

test('a card that has left the screen is not animated out', () => {
  assert.equal(travels(at([['a', 0, 0]]), at([])).size, 0);
});

test('the glow lasts a second or two, as the user asked (US-123 AC11)', () => {
  assert.ok(GLOW_MS >= 1000 && GLOW_MS <= 2000, `${GLOW_MS}ms is within "a second or two"`);
});
