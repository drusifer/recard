// US-127/D151: RtG's rules live in a file a person can argue with. The
// loader holds them to the same rule as a strategy's questions - a
// constraint refers to state by path, never by value - and checks that
// the rules a constraint cites actually exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, RTG } from '../tools/rtg/gameFile.mjs';
import { checkInstruction } from '../tools/jev/strategyFile.mjs';

const game = loadGame(RTG);

test('the rules are written out, not summarised - every part of a turn is stated', () => {
  for (const key of ['turn_sequence', 'land_drop', 'mana', 'casting', 'summoning_sickness', 'attacking', 'blocking', 'damage']) {
    assert.ok(game.rules[key], `${key} is missing - a convention nobody stated is a convention nobody can check`);
    assert.ok(game.rules[key].length > 40, `${key} reads as a label, not a rule`);
  }
});

test('a constraint names a rule, so a rejected move can say which rule rejected it', () => {
  for (const [name, constraint] of Object.entries(game.constraints)) {
    assert.equal(constraint.type, 'noul', `${name} must be a yes/no judgment`);
    assert.match(constraint.instructions, /`rules\.[a-z_]+`/, `${name} cites no rule`);
  }
});

test('every `rules.x` a constraint cites actually exists', () => {
  const stated = new Set(Object.keys(game.rules));
  for (const [name, constraint] of Object.entries(game.constraints)) {
    const citations = constraint.instructions.match(/`rules\.([a-z_]+)`/g) ?? [];
    for (const cited of citations) {
      const key = cited.replaceAll('`', '').replace('rules.', '');
      assert.ok(stated.has(key), `${name} cites rules.${key}, which is not in the file`);
    }
  }
});

test('constraint names read as rules, not as checks (Smith, Gate 2)', () => {
  for (const name of Object.keys(game.constraints)) {
    assert.doesNotMatch(name, /^(check|validate|rule)_?\d*$/, `${name} reads as plumbing`);
    assert.match(name, /^[a-z]+(_[a-z]+)+$/, `${name} should read as a sentence fragment`);
  }
});

test('no constraint carries a card name or a number - those live in state', () => {
  for (const [name, constraint] of Object.entries(game.constraints)) {
    assert.equal(checkInstruction(constraint.instructions), null, name);
  }
  assert.equal(checkInstruction(game.step.instructions), null, 'the step question');
  for (const [option, text] of Object.entries(game.step.criteria)) {
    assert.equal(checkInstruction(text), null, `step option ${option}`);
  }
});

test('the step offers a pass, so the bot is never cornered', () => {
  assert.ok(game.step.criteria.pass, 'passing is always an option');
});

test('the rules do not defer to another game at play time', () => {
  // Magic was used to AUTHOR this file (US-127 AC6). Naming it in the
  // rules would make play depend on what a model remembers.
  // Careful: this game's OWN name is "Recard the Gathering", so the
  // test looks for the other game, not for a word they share.
  const prose = JSON.stringify(game.rules) + JSON.stringify(game.constraints) + JSON.stringify(game.step);
  assert.doesNotMatch(prose, /\bmagic\b|\bmtg\b|magic: ?the ?gathering/i, 'the rules must stand on their own');
});
