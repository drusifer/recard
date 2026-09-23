// US-125/US-126/D147/D150: a strategy is a static file - a read step, a
// move step, and a confidence floor. The loader keeps it static: an
// instruction or an option description that names a card or carries a
// number has put a VALUE where a path belongs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { loadStrategy, listStrategies } from '../tools/gin/strategyFile.mjs';
import { checkInstruction, resolvePath } from '../tools/jev/strategyFile.mjs';
import { buildPlayState, CANDIDATE_SLOTS } from '../tools/gin/playState.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';
import { EXAMPLES } from '../tools/gin/exampleStates.mjs';

const sampleState = () => {
  const { obs } = EXAMPLES.find((example) => example.obs.phase === 'discard') ?? EXAMPLES[0];
  return buildPlayState(obs, computeFacts(obs));
};
const prose = (strategy) => [
  ...Object.values(strategy.read).flatMap((q) => [q.instructions, ...Object.values(q.criteria ?? {})]),
  strategy.move.instructions, ...Object.values(strategy.move.criteria),
].filter((text) => typeof text === 'string');

test('every shipped strategy loads, and there is more than one', () => {
  const names = listStrategies();
  assert.ok(names.length >= 2, `expected at least two strategies, got ${names}`);
  for (const name of names) {
    const strategy = loadStrategy(name);
    assert.ok(strategy.read.opponent_is_close, 'a read step');
    assert.ok(strategy.move.instructions, 'a move step');
    assert.ok(strategy.confidence_floor > 0, 'its own confidence floor');
  }
});

test('two strategies ask the same questions and differ in how they describe the options', () => {
  const [first, second] = listStrategies().map((name) => loadStrategy(name));
  assert.deepEqual(Object.keys(first.read).toSorted(), Object.keys(second.read).toSorted());
  assert.deepEqual(Object.keys(first.move.criteria).toSorted(), Object.keys(second.move.criteria).toSorted());
  assert.notDeepEqual(first.move.criteria, second.move.criteria, 'two strategies describing options identically are one strategy');
});

test('an OPTION description is held to the same rule as an instruction', () => {
  // An option's text shapes the answer as much as the question does,
  // so "Leaves 5 deadwood" is the same mistake there.
  assert.throws(() => {
    const strategy = JSON.parse(readFileSync(new URL('../tools/gin/strategies/jev-balanced.json', import.meta.url), 'utf8'));
    strategy.move.criteria.discard = 'Throw the 5 of hearts.';
    const complaint = checkInstruction(strategy.move.criteria.discard);
    if (complaint) throw new Error(complaint);
  }, /card/i);
});

test('every path in every shipped strategy resolves against a real projected state', () => {
  const state = { ...sampleState(), read: { opponent_is_close: 2, opponent_wants_slot: '0' } };
  for (const name of listStrategies()) {
    const texts = prose(loadStrategy(name));
    for (const text of texts) {
      const paths = text.match(/`([^`]+)`/g) ?? [];
      for (const backticked of paths) {
        const path = backticked.replaceAll('`', '');
        assert.notEqual(resolvePath(state, path), undefined, `${name} refers to ${path}, which is not in the state`);
      }
    }
  }
});

test('a slot question is ONE question over the candidates, never one per card', () => {
  for (const name of listStrategies()) {
    const strategy = loadStrategy(name);
    assert.ok(Object.keys(strategy.read).length <= 3,
      `${name} has ${Object.keys(strategy.read).length} read questions - a file this repetitive is a template`);
    for (const id of Object.keys(strategy.read)) {
      assert.doesNotMatch(id, /_\d+$/, `${id} is a per-card copy; ask one Choice over the slots instead`);
    }
    assert.equal(Object.keys(strategy.read.opponent_wants.criteria).length, CANDIDATE_SLOTS, 'every slot is an option');
  }
});

test('question ids read as play, not as plumbing (Smith, Gate 2)', () => {
  for (const name of listStrategies()) {
    for (const id of [...Object.keys(loadStrategy(name).read), ...Object.keys(loadStrategy(name).move.criteria)]) {
      assert.doesNotMatch(id, /^(q\d|question\d|slot_\d+)/, `${name}.${id} reads as plumbing`);
    }
  }
});
