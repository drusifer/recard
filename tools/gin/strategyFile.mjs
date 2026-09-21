// US-125/D147: loading a strategy. A strategy is a static JSON file of
// questions over the fixed play-state schema (`playState.mjs`), so this
// file's real job is to keep it static: an instruction that names a
// card or carries a number has put a VALUE in the question, where it
// can drift from the state that holds the same value by path.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./strategies', import.meta.url));

const RANKS = '(?:ace|jack|queen|king|[2-9]|10)';
const CARD_NAMED = new RegExp(`\\b${RANKS} of (?:clubs|diamonds|hearts|spades)\\b`, 'i');
const NUMBER = /(?<![\w.[])\d+(?![\w\]])/;

/**
 * Why this instruction may not ship, or `null` when it is fine. Text
 * inside backticks is a state path, so it is exempt - `candidates[0]`
 * is a reference, not a value.
 * @param {string} instructions
 */
export function checkInstruction(instructions) {
  const prose = instructions.replaceAll(/`[^`]*`/g, ' ');
  if (CARD_NAMED.test(prose)) return 'names a card in the question; put the card in state and refer to it by path';
  if (NUMBER.test(prose)) return 'carries a number in the question; put the number in state and refer to it by path';
  return null;
}

/**
 * The value at `path` in `state`, or `undefined`. Supports the two
 * forms the strategy files use: `me.deadwood` and `candidates[0].card`.
 */
export function resolvePath(state, path) {
  return path.split('.').reduce((value, part) => {
    if (value === undefined || value === null) return undefined;
    const indexed = part.match(/^([^[]+)\[(\d+)\]$/);
    if (!indexed) return value[part];
    const inner = value[indexed[1]];
    return inner === undefined ? undefined : inner[Number(indexed[2])];
  }, state);
}

/** The strategy names that ship, in file order. */
export function listStrategies() {
  return readdirSync(DIR).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, ''));
}

/**
 * Loads and validates one strategy file.
 * @param {string} name
 * @returns {{ name: string, description: string, questions: Record<string, object> }}
 */
export function loadStrategy(name) {
  let raw;
  try {
    raw = readFileSync(path.join(DIR, `${name}.json`), 'utf8');
  } catch {
    throw new Error(`unknown gin strategy "${name}" - choose one of: ${listStrategies().join(', ')}`);
  }
  const strategy = JSON.parse(raw);
  for (const [id, question] of Object.entries(strategy.questions ?? {})) {
    const complaint = checkInstruction(question.instructions ?? '');
    if (complaint) throw new Error(`${name}.${id} ${complaint}`);
  }
  return { name, description: strategy.description ?? '', questions: strategy.questions ?? {} };
}
