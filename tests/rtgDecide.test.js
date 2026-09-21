// US-127/D151: what next, and is it allowed? The step is a Choice over
// the legal options; the constraints judge the move that was picked;
// an unconvinced constraint is ASKED at the table, not thresholded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideStep, constraintsFor, stepQuestion } from '../tools/rtg/decide.mjs';
import { legalOptions } from '../tools/rtg/options.mjs';
import { loadGame, RTG } from '../tools/rtg/gameFile.mjs';

const game = loadGame(RTG);
const card = (name, type, cost = '', cmc = 0) => ({ card: name, type, cost, cmc, colors: cost.includes('G') ? ['G'] : [], tapped: false });
const state = (over = {}) => ({
  me: { hand: [card('Forest', 'Land'), card('Bear', 'Creature', '{1}{G}', 2)], battlefield: [], lands: [], graveyard: [], exile: [], life: 20,
    untapped_lands: { total: 2, by_color: { G: 2 } }, ...over.me },
  opponent: { hand_size: 7, battlefield: [], lands: [], graveyard: [], life: 20 },
  stack: [],
  turn: { is_mine: true, phase: 'main', land_played: false, attackers: [], ...over.turn },
});

const judgeOf = (...responses) => {
  const seen = [];
  return { seen, async systemOne(request) { seen.push(request); return { model: 'scripted', answers: responses[seen.length - 1] ?? {} }; } };
};
const pick = (id, confidence = 0.9) => ({ __step__: { type: 'choice', choice: id, confidence, probabilities: { [id]: confidence } } });
const yes = (names) => Object.fromEntries(names.map((name) => [name, { type: 'noul', noul: 0.95 }]));
const no = (names) => Object.fromEntries(names.map((name) => [name, { type: 'noul', noul: 0.02 }]));
const unsure = (names) => Object.fromEntries(names.map((name) => [name, { type: 'noul', noul: 0.5 }]));

test('the step offers exactly the legal options, described by the GAME file', () => {
  const question = stepQuestion(game, legalOptions(state()));
  assert.ok(question.criteria['play_land:Forest'], 'a real option');
  assert.match(question.criteria['play_land:Forest'], /one land I get this turn/, "the game's own words");
  assert.ok(question.criteria.pass);
});

test('only the constraints that bear on the move are asked', () => {
  assert.deepEqual(Object.keys(constraintsFor(game, 'play_land')), ['one_land_per_turn', 'timing_is_right']);
  assert.deepEqual(Object.keys(constraintsFor(game, 'block')), ['block_is_legal']);
  assert.deepEqual(Object.keys(constraintsFor(game, 'pass')), []);
});

test('a move nobody objects to is played, and every check is recorded', async () => {
  const judge = judgeOf(pick('play_land:Forest'), yes(['one_land_per_turn', 'timing_is_right']));
  const { move, record } = await decideStep({ game, state: state(), judge });
  assert.equal(move.id, 'play_land:Forest');
  assert.deepEqual(Object.keys(record.checks), ['one_land_per_turn', 'timing_is_right']);
  assert.equal(record.blocked, undefined);
});

test('a rule that says no blocks the move, and the record names the rule', async () => {
  const judge = judgeOf(pick('play_land:Forest'), no(['one_land_per_turn']));
  const { move, record } = await decideStep({ game, state: state(), judge });
  assert.equal(move.id, 'pass', 'it passes rather than play something the rules reject');
  assert.equal(record.blocked.rule, 'one_land_per_turn');
  assert.equal(record.blocked.move, 'play_land:Forest');
});

test('an unconvinced constraint is ASKED at the table, and a yes lets the move through', async () => {
  const judge = judgeOf(pick('cast:Bear'), unsure(['can_pay_for_it', 'timing_is_right']));
  const asked = [];
  const { move, record } = await decideStep({ game, state: state(), judge, ask: async (q) => { asked.push(q); return true; } });
  assert.equal(asked.length, 1, 'it asked once, in words');
  assert.match(asked[0], /Can I cast a spell/);
  assert.equal(move.id, 'cast:Bear');
  assert.equal(record.asked.answered, true);
  assert.deepEqual(record.asked.rules, ['can_pay_for_it', 'timing_is_right'], 'one question covering both unsure rules');
});

test('told no by the table, the move is dropped', async () => {
  const judge = judgeOf(pick('cast:Bear'), unsure(['can_pay_for_it']));
  const { move, record } = await decideStep({ game, state: state(), judge, ask: async () => false });
  assert.equal(move.id, 'pass');
  assert.equal(record.blocked.rule, 'can_pay_for_it');
  assert.equal(record.blocked.why, 'the table said no');
});

test('nobody answers: it passes and says so, rather than guessing', async () => {
  const judge = judgeOf(pick('cast:Bear'), unsure(['can_pay_for_it']));
  const { move, record } = await decideStep({ game, state: state(), judge, ask: async () => null });
  assert.equal(move.id, 'pass');
  assert.equal(record.blocked.why, 'nobody answered');
  assert.equal(record.asked.answered, null);
});

test('an answer naming an option that was not offered cannot take effect', async () => {
  const judge = judgeOf(pick('attack:Nonexistent', 0.99));
  const { move } = await decideStep({ game, state: state(), judge });
  assert.equal(move.id, 'pass', 'unknown option falls back to passing, never to acting');
});

test('passing asks no constraints - there is nothing to judge', async () => {
  const judge = judgeOf(pick('pass'));
  const { move, record } = await decideStep({ game, state: state(), judge });
  assert.equal(move.id, 'pass');
  assert.equal(judge.seen.length, 1, 'one request, not two');
  assert.deepEqual(record.checks, {});
});
