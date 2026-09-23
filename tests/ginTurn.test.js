// US-129/D154: Gin's turn is `games/gin/turn.yaml`, run by the generic
// seat over a fake table. A turn is a draw AND a discard, so a bot asked
// to leave after drawing still discards first (C4 of US-128).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ginSeat } from '../tools/gin/adapter.mjs';
import { knockEarly } from '../tools/gin/strategies.mjs';
import { FakeTable } from './helpers/ginFakeTable.mjs';

const HEAVY = 'Ah 3c 5d 7s 9h Jc Kd 2s 4h 6c';
const THEIRS = '2c 4c 6d 8d 10h Qc Ks As 3d 5c';
const STOCK = '8c 8h Qh Qd 10s 10c 4s';

/**
 * The seat reads the talk log through `peer.talk()`; the fake table
 * keeps it as a plain array.
 */
function seatAt(table, firstPlayer = 'bot') {
  const peer = {
    myId: () => table.myId(), view: () => table.view(), act: (action) => table.act(action),
    waitForView: (...parameters) => table.waitForView(...parameters),
    say: (text, data) => table.say(text, data), talk: async () => [...table.talk],
  };
  return ginSeat({ peer, strategy: knockEarly(), name: 'knock-early', firstPlayer, pollMs: 0 });
}
const isNever = () => false;

test('it is a move once the opponent has drawn and discarded, and the step draws', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const seat = seatAt(table, 'opponent');
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  table.act({ type: 'DRAW', pileId: 'deck' }, 'HOST');
  table.act({ type: 'MOVE', pileableId: 'K-spades-0', toPileId: 'table' }, 'HOST');
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  const draw = await seat.step();
  assert.equal(draw.phase, 'draw');
  assert.deepEqual(draw.observation.opponentDiscards.map((each) => each.id), ['K-spades-0']);
});

test('a bot asked to leave at the start of its turn stops without drawing', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const seat = seatAt(table);
  assert.equal(await seat.nextMove({ shouldStop: () => true }), 'done');
  assert.equal(table.piles['hand:ME'].length, 10, 'it drew nothing on the way out');
});

test('asked to leave AFTER drawing, it still discards first - a turn is draw and discard (C4)', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const seat = seatAt(table);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  await seat.step(); // drew: 11 cards
  const isLeaving = () => true;
  assert.equal(await seat.nextMove({ shouldStop: isLeaving }), 'move', 'the discard is still owed');
  await seat.step();
  assert.equal(table.piles['hand:ME'].length, 10, 'it never walks away holding 11 cards');
  assert.equal(await seat.nextMove({ shouldStop: isLeaving }), 'done');
});
