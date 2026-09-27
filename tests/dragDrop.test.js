// US-133/D160 cluster 2: the token a pile drag carries from dragstart to drop.
// It is the one thing that tells a dropped PILE from a dropped card or a
// dropped card-action, so it must round-trip and must not mistake other text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pileDragToken, pileDragFromDrop } from '../src/dragDrop.js';

const carrying = (text) => ({ getData: (type) => (type === 'text/plain' ? text : '') });

test('a pile drag token comes back as the pile id it carried', () => {
  const dragged = carrying(pileDragToken('hand-alice'));
  assert.equal(pileDragFromDrop(dragged), 'hand-alice');
});

test('anything that is not a pile drag token is not a pile drag', () => {
  assert.equal(pileDragFromDrop(carrying('some other dragged text')), null);
  assert.equal(pileDragFromDrop(carrying('')), null);
});
