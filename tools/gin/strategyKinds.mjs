// US-125/D147: a strategy name resolves to one of two kinds.
//
// - `rules`: the ordered rule lists of D137 (`strategies.mjs`). They
//   remain ONLY as the benchmark the question files have to beat; when
//   they stop being that, they go (no-back-compat, standing rule).
// - `questions`: a player file in `games/gin/players/` (D147, D154).
//
// One lookup, so every caller - the runner, the MCP, the tests - offers
// both kinds and neither has to know which is which.

import { STRATEGIES } from './strategies.mjs';
import { listStrategies, loadStrategy } from './strategyFile.mjs';

/**
 * @param {string} name
 * @returns {{ kind: 'rules'|'questions', name: string, description: string, usesJev: boolean }}
 */
export function resolveStrategy(name) {
  const ruleSet = STRATEGIES[name];
  if (ruleSet) return { ...ruleSet, kind: 'rules' };
  if (listStrategies().includes(name)) {
    const file = loadStrategy(name);
    // A question file always calls Jev: the questions ARE the strategy.
    return { ...file, kind: 'questions', usesJev: true };
  }
  throw new Error(`unknown gin strategy "${name}" - choose one of: ${allStrategyNames().join(', ')}`);
}

export function allStrategyNames() {
  return [...Object.keys(STRATEGIES), ...listStrategies()];
}
