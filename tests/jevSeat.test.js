// US-129/D154: one seat for every game - a statechart from a turn file,
// driven by what the table shows. Tested on a made-up two-phase game so
// nothing here leans on Gin or RtG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MachineSeat } from '../tools/jev/seat.mjs';
import { genericLibrary } from '../tools/jev/library.mjs';
import { parseTurn } from '../tools/jev/machine.mjs';

// ---- a toy game: my turn is judged; on it I "build" until I pass ----

const TURN = `
initial: watching
context: { builds: 0 }
states:
  watching:
    tags: [safe]
    on:
      TABLE:
        - { target: judging, guard: table_changed }
        - { target: asking, guard: { type: quiet_table, params: { ms: 8000 } } }
  judging:
    invoke:
      src: judge
      with: { question: their_turn_is_over }
      onDone:
        - { target: building, guard: { type: verdict, params: { is: 'yes' } } }
        - { target: asking, guard: { type: verdict, params: { is: unsure } } }
        - { target: watching }
  asking:
    invoke:
      src: ask_table
      with: { say: Is it my turn now? }
      onDone:
        - { target: building, guard: { type: verdict, params: { is: 'yes' } } }
        - { target: watching }
  building:
    tags: [move]
    on:
      STEP: stepping
  stepping:
    invoke:
      src: play
      with: { phase: build, question: step }
      onDone:
        - { target: ending, guard: { type: played, params: { move: pass } } }
        - { target: building, actions: [{ type: count, params: { field: builds } }] }
  ending:
    entry: [{ type: say, params: { text: "I'm done - your turn." } }]
    always: watching
`;

const QUESTIONS = {
  their_turn_is_over: { type: 'noul', instructions: 'Is their turn over?' },
  step: { type: 'choice', instructions: 'What next?', criteria: { build: 'build something', pass: 'stop' } },
};

const GAME = {
  project: (view) => ({ blocks: view.blocks }),
  options: (state) => [
    ...(state.blocks > 0 ? [{ id: 'build', what: 'build something' }] : []),
    { id: 'pass', what: 'stop' },
  ],
  act: (move) => ({ actions: move.id === 'build' ? [{ type: 'BUILD' }] : [], say: move.id === 'build' ? 'Building.' : null }),
};

function fakeTable({ reply = () => null, blocks = 1 } = {}) {
  const table = { talk: [], acted: [], seq: 1, blocks };
  table.peer = {
    myId: async () => 'ME',
    view: async () => ({ lastTouch: { seq: table.seq }, blocks: table.blocks }),
    talk: async () => [...table.talk],
    act: async (action) => { table.acted.push(action); table.blocks -= 1; table.seq += 1; },
    say: async (text, data) => {
      table.talk.push({ name: 'bot', text, ...(data && { data }) });
      const answer = reply(text);
      if (answer) table.talk.push({ name: 'Drew', text: answer });
    },
  };
  return table;
}

function judgeSaying({ over = 0.95, choice = 'build' } = {}) {
  const seen = [];
  return {
    seen,
    async systemOne(request) {
      seen.push(request);
      if (request.questions.their_turn_is_over) return { answers: { their_turn_is_over: { noul: over } } };
      return { answers: { step: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } } } };
    },
  };
}

const ASKS_THE_TABLE = { escalation: 'ask_table', floor: 0 };

function seatAt(table, judge, player = ASKS_THE_TABLE) {
  let now = 0;
  const services = { peer: table.peer, judge, name: 'bot', questions: QUESTIONS, player, game: GAME, answerMs: 50, answerPollMs: 1 };
  const { machine } = parseTurn(TURN, { file: 'toy/turn.yaml', library: genericLibrary(services), questions: Object.keys(QUESTIONS) });
  const seat = new MachineSeat({ machine, services, clock: () => now, pollMs: 0 });
  return { seat, at: (ms) => { now = ms; } };
}
const isNever = () => false;

test('a judged "their turn is over" makes it my move, and a step plays and says the move', async () => {
  const table = fakeTable();
  const { seat } = seatAt(table, judgeSaying());
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'nothing has changed yet');
  table.seq = 2;
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  const record = await seat.step();
  assert.equal(record.move, 'build');
  assert.deepEqual(table.acted, [{ type: 'BUILD' }]);
  assert.equal(table.talk.at(-1).text, 'Building.');
});

test('nextMove never returns while Jev or the table is still being asked (busy)', async () => {
  const table = fakeTable();
  const gate = Promise.withResolvers();
  const slow = { async systemOne() { await gate.promise; return { answers: { their_turn_is_over: { noul: 0.95 } } }; } };
  const { seat } = seatAt(table, slow);
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  let isSettled = false;
  const pending = (async () => {
    const answer = await seat.nextMove({ shouldStop: isNever });
    isSettled = true;
    return answer;
  })();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(isSettled, false, 'still judging');
  gate.resolve();
  assert.equal(await pending, 'move');
});

test('when the resources run out, the pass ENDS the turn out loud and hands it back', async () => {
  const table = fakeTable({ blocks: 1 });
  const { seat } = seatAt(table, judgeSaying());
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  await seat.step(); // builds its one block
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  const pass = await seat.step(); // only pass is left
  assert.equal(pass.move, 'pass');
  assert.equal(table.talk.at(-1).text, "I'm done - your turn.");
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'back to watching');
});

test('an unsure judgment asks the table ONE yes/no, and the bot\'s own exchange is not news', async () => {
  const table = fakeTable({ reply: (text) => (text === 'Is it my turn now?' ? 'no, not yet' : null) });
  const judge = judgeSaying({ over: 0.5 });
  const { seat, at } = seatAt(table, judge);
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  at(2000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  assert.equal(table.talk.filter((entry) => entry.text === 'Is it my turn now?').length, 1, 'asked once');
  assert.equal(judge.seen.length, 1, 'its own question and the answer did not trigger a re-judgment');
});

test('a quiet table after a change is asked, and a yes starts the move', async () => {
  const table = fakeTable({ reply: () => "it's your turn, go ahead" });
  const { seat, at } = seatAt(table, judgeSaying({ over: 0.1 }));
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'judged: not yet');
  at(10_000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
});

test('asked to leave, the seat is done at the next safe state - never mid-move', async () => {
  const table = fakeTable({ blocks: 3 });
  const { seat } = seatAt(table, judgeSaying());
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(await seat.nextMove({ shouldStop: () => true }), 'move', 'mid-turn: the move is still owed');
  const shouldStop = () => true;
  await seat.step();
  await seat.step();
  await seat.step();
  assert.equal((await seat.step()).move, 'pass');
  assert.equal(await seat.nextMove({ shouldStop }), 'done');
});
