// US-127/D151: loading a game's own rules.
//
// A game file is three parts: `rules` (the game written out in full,
// authored once so a person can argue with it), `constraints` (one
// named Noul each, judging a PROPOSED move against those rules by
// path), and `step` (the emergent flow - one Choice over the legal
// next actions).
//
// Validation is the same rule the Gin strategy files live by: prose
// refers to state by path, never by value. Plus one more that only
// applies here - a constraint must cite a rule that actually exists,
// because "which rule rejected my move" has to have an answer.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkInstruction } from '../gin/strategyFile.mjs';

export const RTG = fileURLToPath(new URL('./game.json', import.meta.url));

/** @param {string} path a game file */
export function loadGame(path) {
  const game = JSON.parse(readFileSync(path, 'utf8'));
  const prose = [
    ...Object.entries(game.constraints ?? {}).map(([name, c]) => [`constraints.${name}`, c.instructions ?? '']),
    ['step', game.step?.instructions ?? ''],
    ...Object.entries(game.step?.criteria ?? {}).map(([name, text]) => [`step.criteria.${name}`, text]),
  ];
  for (const [where, text] of prose) {
    const complaint = checkInstruction(text);
    if (complaint) throw new Error(`${where} ${complaint}`);
  }
  for (const [name, constraint] of Object.entries(game.constraints ?? {})) {
    for (const cited of constraint.instructions.match(/`rules\.([a-z_]+)`/g) ?? []) {
      const key = cited.replaceAll('`', '').replace('rules.', '');
      if (!(key in (game.rules ?? {}))) throw new Error(`constraints.${name} cites rules.${key}, which this game does not state`);
    }
  }
  return game;
}
