// US-125/D147: the runner. Project, ask once, act - with nothing in
// between. The move comes from Jev's Choice over the candidate slots,
// never from a rule list; code only filters to what is legal and
// carries the answer out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideByQuestions, questionsFor } from '../tools/gin/jevStrategy.mjs';
import { loadStrategy } from '../tools/gin/strategyFile.mjs';
import { buildPlayState } from '../tools/gin/playState.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';
import { EXAMPLES } from '../tools/gin/exampleStates.mjs';

const strategy = loadStrategy('jev-balanced');
const discardObs = (EXAMPLES.find((e) => e.obs.phase === 'discard') ?? EXAMPLES[0]).obs;
const drawObs = EXAMPLES.find((e) => e.obs.phase === 'draw')?.obs;

/** A judge that answers whatever the test says, and records what it was asked. */
function scriptedJudge(answers) {
  const seen = [];
  return {
    seen,
    async systemOne(request) {
      seen.push(request);
      return { model: 'scripted', answers };
    },
  };
}

const choice = (slot, probabilities) => ({ type: 'choice', choice: String(slot), confidence: 0.8, probabilities });
const noul = (value) => ({ type: 'noul', noul: value });
const score = (value) => ({ type: 'score', score: value, confidence: 0.7 });

test('a discard turn asks only the questions that apply, and never about an empty slot', () => {
  // A hand of 11 fills every slot, so shorten the candidate list to see
  // the empty-slot behaviour: late in a hand there are fewer cards.
  const full = computeFacts(discardObs);
  const facts = { ...full, discards: full.discards.slice(0, 3) };
  const state = buildPlayState(discardObs, facts);
  const asked = questionsFor(strategy, state);
  const filled = state.candidates.filter(Boolean).length;
  assert.equal(filled, 3, 'three real candidates, eight empty slots');
  assert.equal(Object.keys(asked).some((id) => id.startsWith(`candidate_${filled}_`)), false,
    'a question about an empty slot would be asked about nothing');
  assert.ok(asked.discard_choice, 'the move question is there');
  assert.equal(Object.keys(asked.discard_choice.criteria).length, filled, 'only real slots are offered as options');
});

test('the move is the slot Jev chose - code does not re-rank it', async () => {
  const facts = computeFacts(discardObs);
  const state = buildPlayState(discardObs, facts);
  const cheapest = state.candidates.findIndex((slot) => slot && slot.deadwood_after === Math.min(
    ...state.candidates.filter(Boolean).map((s) => s.deadwood_after)));
  const other = state.candidates.findIndex((slot, index) => slot && index !== cheapest);
  const judge = scriptedJudge({
    discard_choice: choice(other, { [String(other)]: 0.7, [String(cheapest)]: 0.3 }),
    knock_now: noul(0.1), opponent_is_close: score(1.2),
  });
  const { decision, record } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(decision.type, 'discard');
  assert.equal(decision.cardId, facts.discards[other].card.id, 'it threw the card Jev picked, not the cheapest');
  assert.equal(decision.declare, 'none');
  assert.equal(record.slot, other);
  assert.deepEqual(record.distribution, { [String(other)]: 0.7, [String(cheapest)]: 0.3 }, 'Gate 1: the bubble can explain the choice');
});

test('knock_now above a half knocks; below it plays on', async () => {
  const facts = computeFacts(discardObs);
  assert.equal(facts.canKnock, true, 'this example can legally knock');
  const ask = (value) => decideByQuestions({
    strategy, obs: discardObs, facts,
    judge: scriptedJudge({ discard_choice: choice(0, { 0: 1 }), knock_now: noul(value), opponent_is_close: score(2) }),
  });
  assert.equal((await ask(0.9)).decision.declare, 'knock');
  assert.equal((await ask(0.2)).decision.declare, 'none');
});

test('an illegal knock is never asked about, and never happens', async () => {
  const facts = { ...computeFacts(discardObs), canKnock: false, isGin: false };
  const state = buildPlayState(discardObs, facts);
  assert.equal(questionsFor(strategy, state).knock_now, undefined, 'not asked when it would be illegal');
  const { decision } = await decideByQuestions({
    strategy, obs: discardObs, facts,
    judge: scriptedJudge({ discard_choice: choice(0, { 0: 1 }), knock_now: noul(0.99), opponent_is_close: score(4) }),
  });
  assert.equal(decision.declare, 'none', 'even a confident yes cannot produce an illegal knock');
});

test('gin is declared from the facts, not from a judgment', async () => {
  const facts = { ...computeFacts(discardObs), isGin: true, canKnock: true };
  const { decision } = await decideByQuestions({
    strategy, obs: discardObs, facts,
    judge: scriptedJudge({ discard_choice: choice(0, { 0: 1 }), knock_now: noul(0.0), opponent_is_close: score(0) }),
  });
  assert.equal(decision.declare, 'gin');
});

test('a draw turn asks the upcard question and yields a draw', async () => {
  if (!drawObs) return;
  const facts = computeFacts(drawObs);
  const judge = scriptedJudge({ take_upcard: noul(0.8), opponent_is_close: score(1) });
  const { decision, record } = await decideByQuestions({ strategy, obs: drawObs, facts, judge });
  assert.equal(decision.type, 'draw');
  assert.equal(decision.source, facts.upcard ? 'discard' : 'stock');
  assert.equal(record.questions.discard_choice, undefined, 'no discard is chosen on a draw turn');
});

test('one request per decision, carrying the projected state', async () => {
  const facts = computeFacts(discardObs);
  const judge = scriptedJudge({ discard_choice: choice(0, { 0: 1 }), knock_now: noul(0.1), opponent_is_close: score(1) });
  await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(judge.seen.length, 1);
  assert.deepEqual(Object.keys(judge.seen[0].state).sort(), ['candidates', 'me', 'opponent', 'rules', 'stock', 'upcard']);
});

// ---- US-125 phase 4: the bot plays a file-strategy exactly like a rule-list one ----

import { GinBot } from '../tools/gin/bot.mjs';
import { resolveStrategy } from '../tools/gin/strategyKinds.mjs';
import { FakeTable } from './helpers/ginFakeTable.mjs';

test('a strategy name resolves to either kind, and says which it is', () => {
  const file = resolveStrategy('jev-balanced');
  assert.equal(file.kind, 'questions');
  const rules = resolveStrategy('equilibrium');
  assert.equal(rules.kind, 'rules');
  assert.throws(() => resolveStrategy('nope'), /jev-balanced/, 'an unknown name lists what there is, both kinds');
});

test('GinBot plays a question-file strategy: same record shape, same narration', async () => {
  const table = new FakeTable({ mine: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d', theirs: '2c 4c 6d 8d 10h Qc Ks As 3d 5c', stock: '8c 8h Qh Qd 10s 10c 4s' });
  const judge = { async systemOne() { return { model: 'scripted', answers: { take_upcard: { type: 'noul', noul: 0.1 } } }; } };
  const bot = new GinBot({ peer: table, strategy: resolveStrategy('jev-balanced'), judge });

  const record = await bot.step();
  assert.equal(record.strategy, 'jev-balanced');
  assert.equal(record.decision.type, 'draw');
  assert.equal(table.talk.length, 1, 'it narrates like any other strategy (US-121)');
  assert.equal(table.talk[0].data.kind, 'bot-decision');
});

test('the record carries the same judgments shape a rule-list strategy does', async () => {
  // Found by running it live: handing the raw answers over as
  // `judgments` crashed `summaryLine`, which reads `threat.toFixed`.
  const { summaryLine } = await import('../tools/gin/bot.mjs');
  const facts = computeFacts(discardObs);
  const judge = scriptedJudge({
    discard_choice: choice(1, { 1: 0.6, 0: 0.4 }),
    knock_now: noul(0.1),
    opponent_is_close: score(2.4),
    candidate_0_helps_opponent: noul(0.3),
    candidate_1_helps_opponent: noul(0.7),
  });
  const { record } = await decideByQuestions({ strategy, obs: discardObs, facts, judge });
  assert.equal(record.judgments.threat, 2.4);
  assert.equal(record.judgments.helps[facts.discards[1].card.id], 0.7, 'helps is keyed by card id, like the rule-list shape');
  const line = summaryLine({ ...record, iteration: 1, handNumber: 1, trace: [{ rule: 'discard_choice', fired: true }],
    decision: { type: 'discard', cardId: facts.discards[1].card.id, declare: 'none' },
    observation: discardObs, facts: { deadwood: facts.deadwood } });
  assert.match(line, /threat 2\.4/);
});
