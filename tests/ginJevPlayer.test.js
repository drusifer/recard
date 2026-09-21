// US-126/D150: a strategy is a READ then a MOVE. Code enumerates what
// is legal and computes the numbers; the file decides everything else -
// no threshold, no rule table, and an illegal move is never an option.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideByQuestions, moveOptions, readQuestions, judgmentsFrom } from '../tools/gin/jevStrategy.mjs';
import { loadStrategy } from '../tools/gin/strategyFile.mjs';
import { buildPlayState } from '../tools/gin/playState.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';
import { EXAMPLES } from '../tools/gin/exampleStates.mjs';
import { GinBot, summaryLine } from '../tools/gin/bot.mjs';
import { resolveStrategy } from '../tools/gin/strategyKinds.mjs';
import { FakeTable } from './helpers/ginFakeTable.mjs';

const strategy = loadStrategy('jev-balanced');
const discardObs = (EXAMPLES.find((e) => e.obs.phase === 'discard') ?? EXAMPLES[0]).obs;
const drawObs = EXAMPLES.find((e) => e.obs.phase === 'draw')?.obs;

/** Answers each request in turn, and records what it was asked. */
function scriptedJudge(...responses) {
  const seen = [];
  return {
    seen,
    async systemOne(request) {
      seen.push(request);
      return { model: 'scripted', answers: responses[seen.length - 1] ?? {} };
    },
  };
}
const choice = (value, probabilities, confidence = 0.9) => ({ type: 'choice', choice: String(value), confidence, probabilities });
const score = (value) => ({ type: 'score', score: value, confidence: 0.7 });

test('two requests per decision: the read, then the move that uses it', async () => {
  const facts = computeFacts(discardObs);
  const judge = scriptedJudge(
    { opponent_is_close: score(2.4), opponent_wants: choice(1, { 0: 0.3, 1: 0.7 }) },
    { __move__: choice('discard_2', { discard_2: 0.8 }) },
  );
  const { decision, record } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });

  assert.equal(judge.seen.length, 2);
  assert.equal(judge.seen[0].state.read, undefined, 'the read step has no read yet');
  assert.deepEqual(judge.seen[1].state.read, { opponent_is_close: 2.4, opponent_wants_slot: '1' },
    'the read is STATE for the move, referenced by path like everything else');
  assert.equal(decision.cardId, facts.discards[2].card.id);
  assert.equal(record.option, 'discard_2');
});

test('the move options are the LEGAL moves, described in the strategy\'s own words', () => {
  const facts = computeFacts(discardObs);
  const state = buildPlayState(discardObs, facts);
  assert.equal(state.me.can_knock, true, 'this example can knock');
  const options = moveOptions(strategy, state);
  assert.ok(Object.keys(options).some((id) => id.startsWith('discard_')));
  assert.ok(Object.keys(options).some((id) => id.startsWith('knock_')), 'knocking is offered because it is legal');
  assert.match(options.discard_0, /balanced/i, 'the option text is the strategy talking');
});

test('an illegal knock is not an option, so it cannot be chosen at any confidence', async () => {
  const facts = { ...computeFacts(discardObs), canKnock: false, isGin: false };
  const state = buildPlayState(discardObs, facts);
  assert.equal(Object.keys(moveOptions(strategy, state)).some((id) => id.startsWith('knock_')), false);

  const judge = scriptedJudge({ opponent_is_close: score(1) }, { __move__: choice('knock_0', { knock_0: 1 }, 0.99) });
  const { decision } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(decision.declare, 'none', 'an answer naming an option that was not offered cannot take effect');
});

test('gin replaces knock as the option when the hand is gin', () => {
  const facts = { ...computeFacts(discardObs), isGin: true, canKnock: true };
  const options = moveOptions(strategy, buildPlayState(discardObs, facts));
  assert.ok(Object.keys(options).some((id) => id.startsWith('gin_')));
  assert.equal(Object.keys(options).some((id) => id.startsWith('knock_')), false);
});

test('a draw turn offers the upcard only when there is one', () => {
  if (!drawObs) return;
  const facts = computeFacts(drawObs);
  const state = buildPlayState(drawObs, facts);
  const options = moveOptions(strategy, state);
  assert.ok(options.draw_stock);
  assert.equal('take_upcard' in options, Boolean(state.upcard));
});

test('below the file\'s own confidence floor, it plays the cheapest legal card instead', async () => {
  const facts = computeFacts(discardObs);
  assert.ok(strategy.confidence_floor > 0, 'the strategy declares its own tolerance');
  const judge = scriptedJudge(
    { opponent_is_close: score(1) },
    { __move__: choice('discard_3', { discard_3: 0.2, discard_0: 0.19 }, strategy.confidence_floor - 0.01) },
  );
  const { decision, record } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(record.belowFloor, true);
  assert.equal(decision.cardId, facts.discards[0].card.id, 'the cheapest card, not the uncertain pick');
});

test('the two strategies ask the same questions and differ in their criteria', () => {
  const cagey = loadStrategy('jev-cagey');
  const state = buildPlayState(discardObs, computeFacts(discardObs));
  assert.deepEqual(Object.keys(readQuestions(strategy, state)), Object.keys(readQuestions(cagey, state)));
  assert.deepEqual(Object.keys(moveOptions(strategy, state)), Object.keys(moveOptions(cagey, state)));
  assert.notEqual(moveOptions(strategy, state).discard_0, moveOptions(cagey, state).discard_0,
    'the same option, described differently - that IS the play style');
  assert.notDeepEqual(strategy.read.opponent_is_close.criteria, cagey.read.opponent_is_close.criteria,
    'even the threat levels are the strategy talking');
});

test('the record carries the judgments shape the rest of the app already reads', async () => {
  const facts = computeFacts(discardObs);
  const judge = scriptedJudge(
    { opponent_is_close: score(2.4), opponent_wants: choice(1, { 0: 0.3, 1: 0.7 }) },
    { __move__: choice('discard_1', { discard_1: 0.6 }) },
  );
  const { record } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(record.judgments.threat, 2.4);
  assert.equal(record.judgments.helps[facts.discards[1].card.id], 0.7);
  const line = summaryLine({ ...record, iteration: 1, handNumber: 1, trace: [{ rule: '__move__', fired: true }],
    decision: { type: 'discard', cardId: facts.discards[1].card.id, declare: 'none' },
    observation: discardObs, facts: { deadwood: facts.deadwood } });
  assert.match(line, /threat 2\.4/);
});

test('GinBot plays a question-file strategy: same record shape, same narration', async () => {
  const table = new FakeTable({ mine: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d', theirs: '2c 4c 6d 8d 10h Qc Ks As 3d 5c', stock: '8c 8h Qh Qd 10s 10c 4s' });
  const judge = { async systemOne() { return { model: 'scripted', answers: { __move__: choice('draw_stock', { draw_stock: 1 }), opponent_is_close: score(1) } }; } };
  const bot = new GinBot({ peer: table, strategy: resolveStrategy('jev-balanced'), judge });

  const record = await bot.step();
  assert.equal(record.strategy, 'jev-balanced');
  assert.equal(record.decision.type, 'draw');
  assert.equal(table.talk.length, 1, 'it narrates like any other strategy');
});

test('the trace shows BOTH steps, so the bubble can explain a move', async () => {
  const table = new FakeTable({ mine: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d', theirs: '2c 4c 6d 8d 10h Qc Ks As 3d 5c', stock: '8c 8h Qh Qd 10s 10c 4s' });
  const judge = { async systemOne() { return { model: 'scripted', answers: {
    opponent_is_close: score(2.1), __move__: choice('draw_stock', { draw_stock: 0.7, take_upcard: 0.3 }) } }; } };
  const record = await new GinBot({ peer: table, strategy: resolveStrategy('jev-balanced'), judge }).step();
  assert.deepEqual(record.trace.map((step) => step.rule), ['read', '__move__']);
  assert.equal(record.trace[0].threat, 2.1);
  assert.equal(record.trace[1].option, 'draw_stock');
  assert.deepEqual(record.trace[1].distribution, { draw_stock: 0.7, take_upcard: 0.3 });
});
