// US-129/D154: War's turn is `games/war/turn.yaml`, run by the generic
// seat over a fake table - the same level `ginTurn.test.js` checks Gin
// at (the statechart wiring, not `WarBot`'s own logic - see warBot.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warSeat } from '../tools/war/adapter.mjs';
import { FakeWarTable } from './helpers/warFakeTable.mjs';

function seatAt(table) {
  const peer = {
    myId: () => table.myId(), view: () => table.view(), act: (action) => table.act(action),
    waitForView: (predicate, argument) => table.waitForView(predicate, argument),
    say: (text, data) => table.say(text, data), talk: async () => [...table.talk],
  };
  return warSeat({ peer, name: 'mechanical', pollMs: 0 });
}
const isNever = () => false;

test('flips on its own, waits once ahead, collects once it wins, and ends once a deck empties', async () => {
  const table = new FakeWarTable({ mine: 'Kc', theirs: '5h' });
  const seat = seatAt(table);

  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move', 'nobody has flipped yet - my move');
  const flip = await seat.step();
  assert.equal(flip.phase, 'flip');
  assert.equal(table.piles.table.length, 1);

  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'ahead; waiting on the opponent');

  table.act({ type: 'MOVE', pileableId: '5-hearts-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: '5-hearts-0' }, 'HOST');

  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move', 'King beats 5 - my collect');
  const collect = await seat.step();
  assert.equal(collect.phase, 'collect');
  assert.equal(table.piles['deck:ME'].length, 2);

  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'done', 'both decks empty - the run ends');
});

test('a bot asked to leave while safely waiting stops without acting', async () => {
  const table = new FakeWarTable({ mine: 'Kc 2c', theirs: '5h 3h' });
  const seat = seatAt(table);
  await seat.nextMove({ shouldStop: isNever });
  await seat.step(); // flips my top card (2c)
  assert.equal(await seat.nextMove({ shouldStop: () => true }), 'done', '"waiting" is safe - it leaves at once');
  assert.equal(table.piles.table.length, 1, 'it took no further action on the way out');
});
