// US-129/D154: a game directory - questions, optional rules, players - is
// loaded and checked as a whole. Mistakes name the file and where in it
// (Smith Gate 1 C1); a player without a description is refused (note 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGameFiles, questionsFor } from '../tools/jev/gameFiles.mjs';

const QUESTIONS = `
step:
  type: choice
  instructions: Given \`rules.goal\`, what next?
  criteria: { build: build something, pass: stop }
their_turn_is_over:
  type: noul
  instructions: Given \`table_talk\`, is their turn over?
`;
const RULES = 'rules:\n  goal: Build the most.\n';
const PLAYER = 'description: builds whenever it can\nescalation: ask_table\n';

function gameDirectory(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'jev-game-'));
  mkdirSync(path.join(directory, 'players'));
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(directory, name), text);
  return directory;
}
const good = (over = {}) => gameDirectory({ 'questions.yaml': QUESTIONS, 'rules.yaml': RULES, 'turn.yaml': 'x', 'players/builder.yaml': PLAYER, ...over });

test('a game directory loads its questions, rules and players', () => {
  const files = loadGameFiles(good());
  assert.deepEqual(Object.keys(files.questions), ['step', 'their_turn_is_over']);
  assert.equal(files.rules.goal, 'Build the most.');
  assert.deepEqual(files.players.builder, { name: 'builder', description: 'builds whenever it can', escalation: 'ask_table', floor: 0, wording: {} });
});

test('a question carrying a card name is refused, naming the file and the key (D147)', () => {
  const directory = good({ 'questions.yaml': QUESTIONS.replace('build something', 'throw the 5 of hearts') });
  assert.throws(() => loadGameFiles(directory), /questions\.yaml: step\.criteria\.build names a card/);
});

test('a question citing a rule the rules file does not state is refused', () => {
  const directory = good({ 'questions.yaml': QUESTIONS.replace('rules.goal', 'rules.gaol') });
  assert.throws(() => loadGameFiles(directory), /questions\.yaml: step cites rules\.gaol - no such rule; did you mean rules\.goal\?/);
});

test('a player needs a description - it is what a person picks from (Gate 1 note 4)', () => {
  const directory = good({ 'players/builder.yaml': 'escalation: ask_table\n' });
  assert.throws(() => loadGameFiles(directory), /players\/builder\.yaml: description: a player needs a one-line description/);
});

test('a player\'s escalation is one the library has', () => {
  const directory = good({ 'players/builder.yaml': 'description: x\nescalation: ask_the_table\n' });
  assert.throws(() => loadGameFiles(directory), /players\/builder\.yaml: escalation: no escalation "ask_the_table" - did you mean "ask_table"\?/);
});

test('a player may reword a question it asks, and the rewording is held to the same rule', () => {
  const reworded = `${PLAYER}wording:\n  step:\n    criteria: { build: only when it is clearly worth it }\n`;
  const files = loadGameFiles(good({ 'players/builder.yaml': reworded }));
  const asked = questionsFor(files, files.players.builder);
  assert.equal(asked.step.criteria.build, 'only when it is clearly worth it');
  assert.equal(asked.step.criteria.pass, 'stop', 'what it does not reword is the game\'s own');
  assert.throws(() => loadGameFiles(good({ 'players/builder.yaml': `${PLAYER}wording:\n  stpe: { instructions: x }\n` })),
    /players\/builder\.yaml: wording\.stpe: no question "stpe" - did you mean "step"\?/);
  assert.throws(() => loadGameFiles(good({ 'players/builder.yaml': `${PLAYER}wording:\n  step: { instructions: Build 3 things. }\n` })),
    /players\/builder\.yaml: wording\.step\.instructions carries a number/);
});

test('rewording a Score\'s levels replaces the list whole - it stays a list, in order', () => {
  const scored = `${QUESTIONS}close:\n  type: score\n  instructions: How close?\n  criteria: [far, near, very near]\n`;
  const player = `${PLAYER}wording:\n  close:\n    criteria: [nowhere near, getting there, about to]\n`;
  const files = loadGameFiles(good({ 'questions.yaml': scored, 'players/builder.yaml': player }));
  assert.deepEqual(questionsFor(files, files.players.builder).close.criteria, ['nowhere near', 'getting there', 'about to']);
});
