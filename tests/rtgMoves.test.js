// US-127: a decided move becomes ordinary table mechanics plus a line
// saying what was done - the table hears, it does not detect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor } from '../tools/rtg/moves.mjs';

const ids = { library: 'deck-green', lands: 'lands:me', stack: 'stack' };
const state = {
  me: {
    hand: [{ card: 'Forest', id: 'f1', type: 'Land', tapped: false }, { card: 'Bear', id: 'b1', type: 'Creature', tapped: false }],
    battlefield: [{ card: 'Wolf', id: 'w1', type: 'Creature', tapped: true }],
    lands: [{ card: 'Forest1', id: 'l1', type: 'Land', tapped: true }, { card: 'Forest2', id: 'l2', type: 'Land', tapped: false }],
  },
};

test('untapping rotates only what is tapped, and says so', () => {
  const { actions, say } = actionsFor({ id: 'untap_all' }, state, ids);
  assert.deepEqual(actions.map((a) => a.pileableId).sort(), ['l1', 'w1']);
  assert.ok(actions.every((a) => a.type === 'ROTATE'));
  assert.match(say, /untapping/i);
});

test('playing a land moves that card to the lands pile', () => {
  const { actions, say, tracks } = actionsFor({ id: 'play_land:Forest', card: 'Forest' }, state, ids);
  assert.deepEqual(actions, [{ type: 'MOVE', pileableId: 'f1', toPileId: 'lands:me' }]);
  assert.match(say, /Playing Forest/);
  assert.equal(tracks.land_played, true);
});

test('casting puts the card on the shared stack and announces it', () => {
  const { actions, say } = actionsFor({ id: 'cast:Bear', card: 'Bear' }, state, ids);
  assert.deepEqual(actions, [{ type: 'MOVE', pileableId: 'b1', toPileId: 'stack' }]);
  assert.match(say, /Casting Bear/);
});

test('attacking taps the creature and says which one', () => {
  const { actions, say } = actionsFor({ id: 'attack:Wolf', card: 'Wolf' }, state, ids);
  assert.deepEqual(actions, [{ type: 'ROTATE', pileableId: 'w1' }]);
  assert.match(say, /Attacking with Wolf/);
});

test('every move that changes nothing mechanically still SAYS something', () => {
  for (const move of [{ id: 'block:Wolf', card: 'Wolf' }, { id: 'take_damage' }]) {
    const { actions, say } = actionsFor(move, state, ids);
    assert.deepEqual(actions, [], 'the table settles these between players');
    assert.ok(say, `${move.id} must still be announced - a silent bot is indistinguishable from a stuck one`);
  }
});
