// US-129/D154: a game directory, loaded and checked as a whole.
//
//   games/<game>/questions.yaml   what Jev is asked (TypeSafe question definitions)
//   games/<game>/rules.yaml       optional: the rules questions cite as `rules.<key>`
//   games/<game>/turn.yaml        the statechart (`machine.mjs` checks it)
//   games/<game>/players/*.yaml   one file per player
//
// Every mistake is refused here, naming the file and where in it (Smith,
// US-129 Gate 1 C1): a literal in a question (D147), a rule that is cited
// but never stated, a player with no description, an escalation or a
// reworded question that does not exist.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { checkInstruction } from './strategyFile.mjs';
import { unknown } from './machine.mjs';

const TYPES = ['noul', 'choice', 'score'];
const ESCALATIONS = ['ask_table', 'floor_fallback'];

const shown = (file) => path.relative(process.cwd(), file);

function readYaml(file) {
  return YAML.parse(readFileSync(file, 'utf8')) ?? {};
}

/**
 * The prose of one question - everything the model reads - labelled.
 */
function* proseOf(where, question) {
  if (typeof question.instructions === 'string') yield [`${where}.instructions`, question.instructions];
  const criteria = Object.entries(question.criteria ?? {});
  for (const [key, text] of criteria) {
    if (typeof text === 'string') yield [`${where}.criteria.${key}`, text];
  }
  const levels = question.levels ?? [];
  for (const [index, text] of levels.entries()) {
    if (typeof text === 'string') yield [`${where}.levels[${index}]`, text];
  }
}

function rejectLiteralsIn(file, labelled) {
  for (const [where, text] of labelled) {
    const complaint = checkInstruction(text);
    if (complaint) throw new Error(`${shown(file)}: ${where} ${complaint}`);
  }
}

function checkQuestions(file, questions, rules) {
  for (const [name, question] of Object.entries(questions)) {
    if (!TYPES.includes(question?.type)) throw new Error(`${shown(file)}: ${name}.type: ${unknown('question type', question?.type, TYPES)}`);
    rejectLiteralsIn(file, proseOf(name, question));
    const cited = (question.instructions ?? '').match(/`rules\.([a-z_]+)/g) ?? [];
    for (const citation of cited) {
      const key = citation.replace('`rules.', '');
      if (rules && Object.hasOwn(rules, key)) continue;
      const known = Object.keys(rules ?? {});
      const nearest = unknown('rule', key, known).match(/did you mean "([^"]+)"/)?.[1];
      const hint = nearest ? `; did you mean rules.${nearest}?` : '';
      throw new Error(`${shown(file)}: ${name} cites rules.${key} - no such rule${hint}`);
    }
  }
}

function loadPlayer(file, questions) {
  const raw = readYaml(file);
  const fail = (where, message) => { throw new Error(`${shown(file)}: ${where}: ${message}`); };
  if (typeof raw.description !== 'string' || raw.description.trim() === '') fail('description', 'a player needs a one-line description - it is what a person picks from');
  const escalation = raw.escalation ?? 'floor_fallback';
  if (!ESCALATIONS.includes(escalation)) fail('escalation', unknown('escalation', escalation, ESCALATIONS));
  const floor = raw.floor ?? 0;
  if (typeof floor !== 'number' || floor < 0 || floor > 1) fail('floor', `a confidence floor is a number from 0 to 1, not "${floor}"`);
  const wording = raw.wording ?? {};
  for (const [name, reworded] of Object.entries(wording)) {
    if (!Object.hasOwn(questions, name)) fail(`wording.${name}`, unknown('question', name, Object.keys(questions)));
    rejectLiteralsIn(file, proseOf(`wording.${name}`, reworded));
  }
  return { name: path.basename(file, '.yaml'), description: raw.description, escalation, floor, wording };
}

/**
 * @param {string} directory a game directory
 * @returns {{ directory: string, turnFile: string, questions: Record<string, object>,
 *   rules: Record<string, string>|null, players: Record<string, object> }}
 */
export function loadGameFiles(directory) {
  const questionsFile = path.join(directory, 'questions.yaml');
  const questions = readYaml(questionsFile);
  const rulesFile = path.join(directory, 'rules.yaml');
  const rules = existsSync(rulesFile) ? readYaml(rulesFile).rules ?? null : null;
  checkQuestions(questionsFile, questions, rules);
  const playersDirectory = path.join(directory, 'players');
  const players = {};
  const files = readdirSync(playersDirectory).filter((file) => file.endsWith('.yaml')).toSorted((a, b) => a.localeCompare(b));
  for (const file of files) {
    const player = loadPlayer(path.join(playersDirectory, file), questions);
    players[player.name] = player;
  }
  return { directory, turnFile: path.join(directory, 'turn.yaml'), questions, rules, players };
}

/**
 * The questions exactly as `player` asks them: the game's own, with the
 * player's rewording laid over them (criteria key by key).
 */
export function questionsFor(files, player) {
  const asked = structuredClone(files.questions);
  for (const [name, reworded] of Object.entries(player.wording)) {
    const question = asked[name];
    if (reworded.instructions !== undefined) question.instructions = reworded.instructions;
    // A Choice's options are named, so a player rewords them one by one; a
    // Score's levels are an ordered list, so a rewording replaces it whole.
    if (Array.isArray(reworded.criteria)) question.criteria = reworded.criteria;
    else if (reworded.criteria) question.criteria = { ...question.criteria, ...reworded.criteria };
    if (reworded.levels) question.levels = reworded.levels;
  }
  return asked;
}
