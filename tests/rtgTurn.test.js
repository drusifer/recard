// US-129/D154: RtG's turn is `games/rtg/turn.yaml`, run by the generic
// seat. These are the behaviours a person at the table sees: the live
// stall from D152 (C3 of US-128), and the turn bug found in review -
// a bot's own turn must reach combat and END out loud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { rtgSeat } from '../tools/rtg/adapter.mjs';
import { loadTurn } from '../tools/jev/machine.mjs';

const TURN_QUESTION = 'Is it my turn now?';
const bear = { id: 'bear-1', name: 'Bear', type: 'Creature', cost: '{1}{G}', cmc: 2, colors: ['G'], power: 2, toughness: 2 };

/**
 * A two-player RtG table; `reply` answers whatever the bot says.
 */
function fakeTable({ reply = () => null, battlefield = [] } = {}) {
  const table = { talk: [], acted: [], seq: 1, reply };
  table.peer = {
    myId: async () => 'ME',
    view: async () => ({
      players: [{ id: 'ME' }, { id: 'THEM' }], myHand: [], scores: {}, otherHandCounts: {},
      piles: [{ id: 'bf-me', kind: 'battlefield', ownerId: 'ME', cards: battlefield }, { id: 'deck', kind: 'deck', cards: [] }],
      lastTouch: { seq: table.seq },
    }),
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
 * Jev, scripted: the turn judgment says `over`; the step picks the first
 * of `picks` that is offered (else passes); every rule check says yes.
 */
function judgeSaying({ over = 0.1, picks = [], first = 0.1, begun = 0.95 } = {}) {
  const seen = [];
  return {
    seen,
    async systemOne(request) {
      seen.push(request);
      const { questions } = request;
      if (questions.i_go_first) return { answers: { i_go_first: { noul: first }, game_has_begun: { noul: begun } } };
      if (questions.their_turn_is_over) return { answers: { their_turn_is_over: { noul: over }, attack_phase_complete: { noul: 0.5 } } };
      if (questions.step) {
        const choice = picks.find((id) => Object.hasOwn(questions.step.criteria, id)) ?? 'pass';
        return { answers: { step: { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } } } };
      }
      return { answers: Object.fromEntries(Object.keys(questions).map((name) => [name, { type: 'noul', noul: 0.95 }])) };
    },
  };
}

/**
 * A seat at a game that is already under way (someone speaks, Jev judges
 * the game has begun) - or, with `pregame`, one at a table that has not
 * started yet.
 */
async function seated({ table, judge, steps, pregame = false }) {
  let now = 0;
  const seat = await rtgSeat({ peer: table.peer, judge, name: 'rules', player: 'rules', steps, clock: () => now, pollMs: 0, answerMs: 50, answerPollMs: 1 });
  await seat.nextMove({ shouldStop: () => false }); // the first look only seeds
  if (!pregame) {
    table.talk.push({ name: 'Drew', text: 'game on' });
    await seat.nextMove({ shouldStop: () => false });
    assert.equal(seat.state, 'watching', 'the game is under way');
  }
  return { seat, at: (ms) => { now = ms; } };
}
const isNever = () => false;
const said = (table, text) => table.talk.filter((entry) => entry.name === 'rules' && entry.text === text).length;

test('THE STALL: a quiet table is asked one yes/no, and "it\'s your turn, go ahead" starts the turn', async () => {
  const table = fakeTable({ reply: (text) => (text === TURN_QUESTION ? "it's your turn, go ahead" : null) });
  const { seat, at } = await seated({ table, judge: judgeSaying({ over: 0.1 }) });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait', 'judged, and not yet my turn');
  at(10_000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(said(table, TURN_QUESTION), 1);
  assert.equal(seat.state, 'untap', 'the turn really started');
});

test('an UNSURE turn judgment is asked at once, and a "no" is kept: no nagging', async () => {
  const table = fakeTable({ reply: () => 'no, not yet' });
  const judge = judgeSaying({ over: 0.5 });
  const { seat, at } = await seated({ table, judge });
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2; at(1000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  at(60_000);
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  assert.equal(said(table, TURN_QUESTION), 1, 'asked once, not every quiet stretch');
});

test('THE TURN BUG: my own turn goes untap, draw, main, combat - and ENDS out loud', async () => {
  const table = fakeTable();
  const { seat } = await seated({ table, judge: judgeSaying({ over: 0.95, picks: ['untap_all', 'draw'] }) });
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  const phases = [];
  while (await seat.nextMove({ shouldStop: isNever }) === 'move' && phases.length < 10) {
    phases.push(seat.state);
    await seat.step();
  }
  assert.deepEqual(phases, ['untap', 'draw', 'main', 'combat']);
  assert.equal(said(table, "I'm done - your turn."), 1, 'the table is TOLD the turn is over');
  assert.equal(seat.state, 'watching', 'and the turn is handed back');
});

test('combat is reachable: an untapped creature that was here all turn is offered an attack', async () => {
  const table = fakeTable({ battlefield: [bear] });
  const judge = judgeSaying({ over: 0.95, picks: ['attack:Bear'] });
  const { seat } = await seated({ table, judge });
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  while (seat.state !== 'combat' && await seat.nextMove({ shouldStop: isNever }) === 'move') await seat.step();
  const attack = await seat.step();
  assert.ok(attack.options.includes('attack:Bear'));
  assert.equal(attack.move, 'attack:Bear');
  assert.deepEqual(table.acted.at(-1), { type: 'ROTATE', pileableId: 'bear-1' }, 'attacking taps it');
});

test('an announced attack draws the bot in to defend, then back to watching', async () => {
  const table = fakeTable({ battlefield: [bear] });
  const { seat } = await seated({ table, judge: judgeSaying({ over: 0.1, picks: ['block:Bear'] }) });
  await seat.nextMove({ shouldStop: isNever });
  table.talk.push({ name: 'Drew', text: 'attacking with the Ogre' });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(seat.state, 'defending');
  const block = await seat.step();
  assert.equal(block.move, 'block:Bear');
  assert.equal(seat.state, 'watching');
});

test('asked to leave while watching, it is done - without a word more', async () => {
  const table = fakeTable();
  const { seat } = await seated({ table, judge: judgeSaying() });
  await seat.nextMove({ shouldStop: isNever });
  const before = table.talk.length;
  assert.equal(await seat.nextMove({ shouldStop: () => true }), 'done');
  assert.equal(table.talk.length, before);
});

test('the run\'s step budget ends it', async () => {
  const table = fakeTable();
  const { seat } = await seated({ table, judge: judgeSaying({ over: 0.95 }), steps: 1 });
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2;
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  await seat.step();
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'done');
});

test('a second player is only a file: same turn, its own wording reaches Jev (AC7)', async () => {
  const table = fakeTable();
  const judge = judgeSaying({ over: 0.95 });
  let now = 0;
  const seat = await rtgSeat({ peer: table.peer, judge, name: 'aggressive', player: 'aggressive', clock: () => now, pollMs: 0 });
  await seat.nextMove({ shouldStop: isNever });
  table.talk.push({ name: 'Drew', text: 'game on' });
  await seat.nextMove({ shouldStop: isNever });
  table.seq = 2; now = 1;
  await seat.nextMove({ shouldStop: isNever });
  await seat.step();
  const step = judge.seen.find((request) => request.questions.step).questions.step;
  assert.match(step.criteria.pass, /only when nothing useful is left/);
});

test('whose turn it is, is judged from the board AND the full ordered talk (D152)', async () => {
  const table = fakeTable();
  const judge = judgeSaying({ over: 0.1 });
  const { seat } = await seated({ table, judge });
  await seat.nextMove({ shouldStop: isNever });
  table.talk.push({ name: 'Drew', text: 'passing to you' });
  await seat.nextMove({ shouldStop: isNever });
  const sent = judge.seen.find((request) => request.questions.their_turn_is_over);
  assert.deepEqual(Object.keys(sent.questions), ['their_turn_is_over', 'attack_phase_complete']);
  assert.deepEqual(sent.state.table_talk.map((entry) => entry.text), table.talk.map((entry) => entry.text));
  assert.ok(sent.state.me && sent.state.opponent && sent.state.rules, 'the board and the rules are there too');
});

test('a turn-file mistake names the file as the author knows it (Smith, US-129 test)', () => {
  const directory = mkdtempSync(path.join(process.cwd(), 'build', 'turn-'));
  const file = path.join(directory, 'turn.yaml');
  writeFileSync(file, 'initial: a\nstates:\n  a: { tags: [safe], on: { X: b } }\n');
  assert.throws(() => loadTurn(file, { library: { guards: {}, actions: {}, actors: {} }, questions: [] }),
    (error) => error.message.startsWith(`${path.relative(process.cwd(), file)}: states.a.on.X: no state "b"`));
});

// ---- the first turn (live finding F2): nobody has had a turn yet ----

test('FIRST TURN: told "rules goes first", the bot starts the game', async () => {
  const table = fakeTable();
  const { seat } = await seated({ table, judge: judgeSaying({ first: 0.95, begun: 0.1 }), pregame: true });
  assert.equal(seat.state, 'pregame');
  table.talk.push({ name: 'Drew', text: 'rules goes first' });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(seat.state, 'untap');
});

test('FIRST TURN: a dice roll, and the bot\'s own name, reach the judgment', async () => {
  const table = fakeTable();
  const judge = judgeSaying({ first: 0.95, begun: 0.1 });
  const { seat } = await seated({ table, judge, pregame: true });
  table.talk.push({ name: 'Drew', text: 'rolled 1d20: 7', data: { kind: 'dice' } }, { name: 'rules', text: 'rolled 1d20: 18', data: { kind: 'dice' } });
  await seat.nextMove({ shouldStop: isNever });
  const asked = judge.seen.find((request) => request.questions.i_go_first);
  assert.deepEqual(Object.keys(asked.questions), ['i_go_first', 'game_has_begun']);
  assert.ok(asked.state.table_talk.some((entry) => entry.text === 'rolled 1d20: 18'), 'the roll is in the talk it judges');
  assert.equal(asked.state.me.name, 'rules', 'so it can tell a line meant for it');
});

test('FIRST TURN: unsure whether it goes first, it asks "Do I go first?" and a yes starts the game', async () => {
  const table = fakeTable({ reply: (text) => (text === 'Do I go first?' ? 'yes, you go first' : null) });
  const { seat } = await seated({ table, judge: judgeSaying({ first: 0.5, begun: 0.1 }), pregame: true });
  table.talk.push({ name: 'Drew', text: 'who wants to start?' });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'move');
  assert.equal(said(table, 'Do I go first?'), 1);
});

test('FIRST TURN: when someone else has begun, the bot simply waits for its turn', async () => {
  const table = fakeTable();
  const judge = judgeSaying({ first: 0.1, begun: 0.95 });
  const { seat } = await seated({ table, judge, pregame: true });
  table.talk.push({ name: 'Drew', text: 'I will go first - playing a land' });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  assert.equal(seat.state, 'watching');
});

test('FIRST TURN: nobody has begun and it is not me - it stays in pregame, never asking "has THEIR turn ended?"', async () => {
  const table = fakeTable();
  const judge = judgeSaying({ first: 0.1, begun: 0.1 });
  const { seat } = await seated({ table, judge, pregame: true });
  table.talk.push({ name: 'Drew', text: 'let us roll for it' });
  assert.equal(await seat.nextMove({ shouldStop: isNever }), 'wait');
  assert.equal(seat.state, 'pregame');
  assert.equal(judge.seen.some((request) => request.questions.their_turn_is_over), false);
});
