// US-128/D153: the runner plays a seat - it asks the seat whether there
// is a move, and records each step. It never decides on its own when to
// stop: the seat knows where its game's turn boundaries are (C4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { playSeat } from '../tools/jev/runner.mjs';

const seatOf = (...answers) => {
  let steps = 0;
  const asked = [];
  return {
    asked, get steps() { return steps; },
    async nextMove({ shouldStop }) { asked.push(shouldStop); return answers.shift() ?? 'done'; },
    async step() { steps += 1; return { step: steps }; },
  };
};

test('a step is taken for each move, none while waiting, and the seat ends it', async () => {
  const seat = seatOf('wait', 'move', 'wait', 'move', 'done', 'move');
  const recorded = [];
  await playSeat({ seat, shouldStop: () => false, record: async (entry) => { recorded.push(entry); } });
  assert.deepEqual(recorded, [{ step: 1 }, { step: 2 }]);
  assert.equal(seat.steps, 2, 'nothing after done');
});

test('the seat is handed the stop signal every time, so IT decides where leaving is safe', async () => {
  const shouldStop = () => true;
  const seat = seatOf('move', 'done');
  await playSeat({ seat, shouldStop, record: async () => {} });
  assert.equal(seat.steps, 1, 'the runner did not cut the move short');
  assert.ok(seat.asked.every((each) => each === shouldStop));
});
