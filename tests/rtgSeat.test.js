// US-128/D153: RtG as a seat for the shared runner. Its "is it my
// move?" is D152's judgment - and when that does not settle it, ONE
// yes/no question the table can answer, whose answer the bot abides by
// (Smith C3). The first test is the live stall that motivated it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RtgSeat } from '../tools/rtg/seat.mjs';
import { TURN_QUESTION } from '../tools/rtg/table.mjs';
import { loadGame, RTG } from '../tools/rtg/gameFile.mjs';

const game = loadGame(RTG);

/**
 * A two-player RtG table: `reply` answers whatever the bot says.
 */
function fakeTable({ reply = () => null } = {}) {
  const table = {
    talk: [], acted: [], seq: 1,
    reply,
    view: () => ({
      players: [{ id: 'ME' }, { id: 'THEM' }], piles: [], myHand: [], scores: {}, otherHandCounts: {},
      lastTouch: { seq: table.seq },
    }),
  };
  table.peer = {
    myId: async () => 'ME',
    view: async () => table.view(),
    talk: async () => [...table.talk],
    act: async (action) => { table.acted.push(action); },
    say: async (text, data) => {
      table.talk.push({ name: 'rules', text, ...(data && { data }) });
      const answer = table.reply(text);
      if (answer) table.talk.push({ name: 'Drew', text: answer });
    },
  };
  return table;
}

/**
 * Answers the turn judgment with `over`, and picks `choice` for a step.
 */
function judgeSaying({ over = 0.1, choice = 'pass' } = {}) {
  const seen = [];
  return {
    seen,
    async systemOne(request) {
      seen.push(request);
      if (request.questions.their_turn_is_over) {
        return { answers: { their_turn_is_over: { noul: over }, attack_phase_complete: { noul: 0.5 } } };
      }
      return { answers: { __step__: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } } } };
    },
  };
}

async function seated({ table, judge, steps }) {
  let now = 0;
  const seat = new RtgSeat({
    peer: table.peer, game, judge, name: 'rules', steps,
    clock: () => now, pollMs: 0, answerMs: 50, answerPollMs: 1,
  });
  await seat.join();
  return { seat, at: (ms) => { now = ms; } };
}
const questionsAsked = (table) => table.talk.filter((entry) => entry.name === 'rules' && entry.text === TURN_QUESTION);
const isNever = () => false;

test('THE STALL: a quiet table is asked one yes/no, and "it\'s your turn, go ahead" starts the turn', async () => {
  const table = fakeTable({ reply: (text) => (text === TURN_QUESTION ? "it's your turn, go ahead" : null) });
  const judge = judgeSaying({ over: 0.1 }); // the judgment alone is NOT convinced
  const { seat, at } = await seated({ table, judge });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  table.seq = 2; at(1000); // the opponent did something, and said nothing
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'judged, and not yet my turn');
  at(10_000); // ...and the table stayed quiet
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(questionsAsked(table).length, 1, 'one question, in words a person can answer');
  const { options } = await seat.step();
  assert.ok(options.includes('untap_all'), 'the turn really started: untapping is on offer');
});

test('an UNSURE turn judgment is escalated at once, and a yes is abided by', async () => {
  const table = fakeTable({ reply: () => 'yes' });
  const { seat, at } = await seated({ table, judge: judgeSaying({ over: 0.5 }) });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(questionsAsked(table).length, 1);
});

test('a "no" settles it too: the bot knows it is not its turn, and does not keep asking', async () => {
  const table = fakeTable({ reply: () => 'no, not yet' });
  const { seat, at } = await seated({ table, judge: judgeSaying({ over: 0.5 }) });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  at(60_000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  assert.equal(questionsAsked(table).length, 1, 'asked once, not every quiet stretch');
});

test('a clear judgment needs no question', async () => {
  const table = fakeTable();
  const { seat, at } = await seated({ table, judge: judgeSaying({ over: 0.95 }) });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(questionsAsked(table).length, 0);
});

test('asked to leave, it is done at once - a step is atomic, so there is nothing half-done (C4)', async () => {
  const table = fakeTable();
  const { seat } = await seated({ table, judge: judgeSaying() });
  const said = table.talk.length;
  assert.equal(await seat.nextMove({ shouldStop: () => true }), 'done');
  assert.equal(table.talk.length, said, 'nothing more said or done');
});

test('the run\'s step budget ends it', async () => {
  const table = fakeTable();
  const { seat, at } = await seated({ table, judge: judgeSaying({ over: 0.95 }), steps: 1 });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  await seat.step();
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'done');
});
