// US-125/D147: a strategy name resolves to one of two kinds.
//
// - `rules`: the ordered rule lists of D137 (`strategies.mjs`). They
//   remain ONLY as the benchmark the question files have to beat; when
//   they stop being that, they go (no-back-compat, standing rule).
// - `questions`: a player file in `games/gin/players/` (D147, D154).
//
// One lookup, so every caller - the runner, the MCP, the tests - offers
// both kinds and neither has to know which is which.
//
// A THIRD kind, env-var only, never listed by `allStrategyNames()`: an
// evolved VARIANT of a base rule-list strategy, with its own numeric
// params - `tools/gin/evolve.mjs`'s own generations need a way to seat
// a strategy with no entry in the static registry at all, across a
// spawned bot's real process boundary (`jevPlayer.mjs --strategy
// <variant name>`), which only ever has a NAME to go on. `GIN_VARIANT`
// (JSON: `{base, params}`, set on that ONE bot's own `env`, never
// process-wide) is that channel - checked only once `name` matches
// neither a real registry entry, so an ordinary run (no evolution
// involved) never even looks at it.

import { STRATEGIES, STRATEGY_FACTORIES } from './strategies.mjs';
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
  const variant = resolveVariant(name);
  if (variant) return variant;
  throw new Error(`unknown gin strategy "${name}" - choose one of: ${allStrategyNames().join(', ')}`);
}

function resolveVariant(name) {
  if (!process.env.GIN_VARIANT) return;
  const { base, params } = JSON.parse(process.env.GIN_VARIANT);
  const entry = STRATEGY_FACTORIES[base];
  if (!entry) throw new Error(`GIN_VARIANT names an unknown base strategy "${base}" - choose one of: ${Object.keys(STRATEGY_FACTORIES).join(', ')}`);
  return { ...entry.factory(params), name, kind: 'rules' };
}

export function allStrategyNames() {
  return [...Object.keys(STRATEGIES), ...listStrategies()];
}
