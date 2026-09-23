// US-125/D147: loading a Gin strategy - a static JSON file of questions
// over the fixed play-state schema (`playState.mjs`). What may appear
// in its prose is the shared rule in `tools/jev/strategyFile.mjs`
// (US-128); this file knows only where Gin keeps its strategies and
// which parts of one are prose.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { rejectLiterals } from '../jev/strategyFile.mjs';

const DIR = fileURLToPath(new URL('strategies', import.meta.url));

/**
The strategy names that ship, in file order.
*/
export function listStrategies() {
  return readdirSync(DIR).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, ''));
}

/**
 * Loads and validates one strategy file (D150): a read step, a move
 * step, and the confidence the file is willing to act on.
 * @param {string} name
 */
export function loadStrategy(name) {
  let raw;
  try {
    raw = readFileSync(path.join(DIR, `${name}.json`), 'utf8');
  } catch {
    throw new Error(`unknown gin strategy "${name}" - choose one of: ${listStrategies().join(', ')}`);
  }
  const strategy = JSON.parse(raw);
  rejectLiterals([...everyInstruction(strategy)].map(([id, text]) => [`${name}.${id}`, text]));
  return {
    name,
    description: strategy.description ?? '',
    confidence_floor: strategy.confidence_floor ?? 0,
    read: strategy.read ?? {},
    move: strategy.move ?? { instructions: '', criteria: {} },
  };
}

/** Every piece of prose the model will read, with a label for the
 *  error message. Criteria count: an option's description shapes the
 *  answer as much as the question does. */
function* everyInstruction(strategy) {
  const reads = Object.entries(strategy.read ?? {});
  for (const [id, question] of reads) {
    yield [`read.${id}`, question.instructions ?? ''];
    const criteria = Object.entries(question.criteria ?? {});
    for (const [key, text] of criteria) {
      if (typeof text === 'string') yield [`read.${id}.criteria.${key}`, text];
    }
  }
  yield ['move', strategy.move?.instructions ?? ''];
  const moveCriteria = Object.entries(strategy.move?.criteria ?? {});
  for (const [key, text] of moveCriteria) {
    yield [`move.criteria.${key}`, text];
  }
}
