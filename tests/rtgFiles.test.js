// US-127/D151, moved to files by US-129/D154: RtG's rules and questions
// are a person-arguable document. The LOADER enforces the mechanical
// rules (no literals, every cited rule exists - jevGameFiles.test.js);
// these tests hold the CONTENT to what the game needs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGameFiles } from '../tools/jev/gameFiles.mjs';
import { criteriaFor } from '../tools/jev/library.mjs';
import { legalOptions } from '../tools/rtg/options.mjs';
import { GAME_DIR } from '../tools/rtg/adapter.mjs';

const files = loadGameFiles(GAME_DIR);
const { rules, questions } = files;
const constraints = Object.entries(questions).filter(([name]) => name !== 'step');

test('the rules are written out, not summarised - every part of a turn is stated', () => {
  for (const key of ['turn_sequence', 'land_drop', 'mana', 'casting', 'summoning_sickness', 'attacking', 'blocking', 'damage']) {
    assert.ok(rules[key], `${key} is missing - a convention nobody stated is a convention nobody can check`);
    assert.ok(rules[key].length > 40, `${key} reads as a label, not a rule`);
  }
});

test('a constraint is a yes/no judgment that names a rule, so a rejection can say which', () => {
  for (const [name, question] of constraints) {
    assert.equal(question.type, 'noul', `${name} must be a yes/no judgment`);
    assert.match(question.instructions, /`rules\.[a-z_]+`/, `${name} cites no rule`);
  }
});

test('constraint names read as rules, not as checks (Smith, US-127 Gate 2)', () => {
  for (const [name] of constraints) {
    assert.doesNotMatch(name, /^(check|validate|rule)_?\d*$/, `${name} reads as plumbing`);
    assert.match(name, /^[a-z]+(_[a-z]+)+$/, `${name} should read as a sentence fragment`);
  }
});

test('only the rules that bear on a move are asked about it (applies_to)', () => {
  const about = (kind) => constraints.filter(([, question]) => question.applies_to?.includes(kind)).map(([name]) => name);
  assert.deepEqual(about('play_land'), ['one_land_per_turn', 'timing_is_right']);
  assert.deepEqual(about('block'), ['block_is_legal']);
  assert.deepEqual(about('pass'), [], 'passing has nothing to judge');
});

test('the step offers exactly the legal options, in the game file\'s own words, always including a pass', () => {
  const state = {
    me: { hand: [{ card: 'Forest', type: 'Land', cost: '', tapped: false }], battlefield: [], lands: [], untapped_lands: { total: 0, by_color: {} } },
    turn: { is_mine: true, phase: 'main', land_played: false, attackers: [] },
  };
  const criteria = criteriaFor(questions.step, legalOptions(state));
  assert.match(criteria['play_land:Forest'], /one land I get this turn/);
  assert.ok(criteria.pass, 'the bot is never cornered');
});

test('an attack that was never declared reads as already resolved, not as pending', () => {
  assert.match(questions.attack_phase_complete.instructions, /no attack was declared at all/);
});

test('the rules do not defer to another game at play time', () => {
  // Magic was used to AUTHOR these files (US-127 AC6); naming it would
  // make play depend on what a model remembers. This game's OWN name is
  // "Recard the Gathering", so look for the other game, not a shared word.
  const prose = JSON.stringify(rules) + JSON.stringify(questions);
  assert.doesNotMatch(prose, /\bmagic\b|\bmtg\b|magic: ?the ?gathering/i);
});
