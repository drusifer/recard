// US-127: a decided move becomes ordinary table mechanics plus a line
// saying what was done - the table hears, it does not detect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor } from '../tools/rtg/moves.mjs';

const ids = { library: 'deck-green', lands: 'lands:me', stack: 'stack' };
// Bear costs {1}{G} - a real cost, not omitted, so casting it actually
// exercises `landsToTap` (D157: casting used to tap NOTHING at all).
const state = {
  me: {
    hand: [{ card: 'Forest', id: 'f1', type: 'Land', tapped: false }, { card: 'Bear', id: 'b1', type: 'Creature', cost: '{1}{G}', tapped: false }],
    battlefield: [{ card: 'Wolf', id: 'w1', type: 'Creature', tapped: true }],
    lands: [
      { card: 'Forest1', id: 'l1', type: 'Land', produces: ['G'], tapped: true },
      { card: 'Forest2', id: 'l2', type: 'Land', produces: ['G'], tapped: false },
      { card: 'Island', id: 'l3', type: 'Land', produces: ['U'], tapped: false },
    ],
  },
};

test('untapping rotates only what is tapped, and says so', () => {
  const { actions, say } = actionsFor({ id: 'untap_all' }, state, ids);
  assert.deepEqual(actions.map((a) => a.pileableId).toSorted(), ['l1', 'w1']);
  assert.ok(actions.every((a) => a.type === 'ROTATE'));
  assert.match(say, /untapping/i);
});

test('playing a land moves that card to the lands pile', () => {
  const { actions, say, tracks } = actionsFor({ id: 'play_land:Forest', card: 'Forest' }, state, ids);
  assert.deepEqual(actions, [{ type: 'MOVE', pileableId: 'f1', toPileId: 'lands:me' }]);
  assert.match(say, /Playing Forest/);
  assert.equal(tracks.land_played, true);
});

test('BUG (live, D157): casting TAPS the lands that pay for it - one land no longer pays for every spell', () => {
  const { actions, say } = actionsFor({ id: 'cast:Bear', card: 'Bear' }, state, ids);
  // {1}{G}: the untapped Forest (colour pip) plus one more untapped
  // land (generic) - l1 is already tapped and never chosen again, and
  // the spell itself moves to the stack last.
  assert.deepEqual(actions, [
    { type: 'ROTATE', pileableId: 'l2' },
    { type: 'ROTATE', pileableId: 'l3' },
    { type: 'MOVE', pileableId: 'b1', toPileId: 'stack' },
  ]);
  assert.match(say, /Casting Bear/);
});

test('casting a free spell taps no lands', () => {
  const { actions } = actionsFor({ id: 'cast:Trinket', card: 'Trinket' }, {
    ...state, me: { ...state.me, hand: [...state.me.hand, { card: 'Trinket', id: 't1', type: 'Artifact', cost: '', tapped: false }] },
  }, ids);
  assert.deepEqual(actions, [{ type: 'MOVE', pileableId: 't1', toPileId: 'stack' }]);
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
