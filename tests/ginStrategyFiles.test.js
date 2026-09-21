// US-125/D147: a strategy is a static file of questions. The loader is
// what keeps it static - it rejects any instruction that names a card
// or carries a number, because those belong in state, referenced by
// path, where they exist exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStrategy, listStrategies, checkInstruction, resolvePath } from '../tools/gin/strategyFile.mjs';
import { buildPlayState, CANDIDATE_SLOTS } from '../tools/gin/playState.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';
import { EXAMPLES } from '../tools/gin/exampleStates.mjs';

const sampleState = () => {
  const { obs } = EXAMPLES.find((e) => e.obs.phase === 'discard') ?? EXAMPLES[0];
  return buildPlayState(obs, computeFacts(obs));
};

test('every shipped strategy loads, and there is more than one', () => {
  const names = listStrategies();
  assert.ok(names.length >= 2, `expected at least two strategies, got ${names}`);
  for (const name of names) assert.ok(Object.keys(loadStrategy(name).questions).length > 0);
});

test('a strategy differs from another only in its questions - same paths, same slots', () => {
  const [first, second] = listStrategies().map((name) => loadStrategy(name));
  assert.notDeepEqual(first.questions, second.questions, 'two strategies that ask the same thing are one strategy');
  assert.deepEqual(Object.keys(first.questions).sort(), Object.keys(second.questions).sort(),
    'they answer the same decisions, in different words');
});

test('an instruction naming a card is rejected - the card belongs in state', () => {
  assert.match(checkInstruction('Should I discard the 5 of hearts?'), /card/i);
  assert.match(checkInstruction('Is the Queen of spades safe?'), /card/i);
  assert.equal(checkInstruction('Would the opponent likely meld `candidates[0].card`?'), null);
});

test('an instruction carrying a number is rejected - the number belongs in state', () => {
  assert.match(checkInstruction('I can knock at 10 or fewer deadwood. Should I?'), /number/i);
  assert.equal(checkInstruction('Given `rules.knock_limit` and `me.deadwood`, should I knock?'), null);
});

test('a path that does not resolve against the real state is rejected', () => {
  const state = sampleState();
  assert.equal(resolvePath(state, 'me.deadwood') === undefined, false);
  assert.equal(resolvePath(state, 'candidates[10]') === undefined, false, 'every fixed slot resolves');
  assert.equal(resolvePath(state, 'me.deadwood_total'), undefined);
});

test('every path in every shipped strategy resolves against a real projected state', () => {
  const state = sampleState();
  for (const name of listStrategies()) {
    for (const [id, question] of Object.entries(loadStrategy(name).questions)) {
      for (const path of question.instructions.match(/`([^`]+)`/g) ?? []) {
        const clean = path.replaceAll('`', '');
        assert.notEqual(resolvePath(state, clean), undefined, `${name}.${id} refers to ${clean}, which is not in the state`);
      }
    }
  }
});

test('a slot question is ONE question over the candidates, not one per card', () => {
  for (const name of listStrategies()) {
    const { questions } = loadStrategy(name);
    assert.ok(Object.keys(questions).length <= 6,
      `${name} has ${Object.keys(questions).length} questions - a file this repetitive is a template, not a strategy`);
    for (const [id, question] of Object.entries(questions)) {
      assert.doesNotMatch(id, /_\d+$/, `${id} is a per-card copy; ask one Choice over the slots instead`);
      if (question.type !== 'choice') continue;
      // Every slot is an option, so no turn is half-judged.
      assert.equal(Object.keys(question.criteria).length, CANDIDATE_SLOTS, `${name}.${id}`);
    }
  }
});

test('question ids read as play, not as plumbing (Smith, Gate 2)', () => {
  for (const name of listStrategies()) {
    for (const id of Object.keys(loadStrategy(name).questions)) {
      assert.doesNotMatch(id, /^(q\d|question\d|slot_\d+_noul)/, `${name}.${id} reads as plumbing`);
    }
  }
});
