// Evolves a roster of Gin strategies over real, capped generations -
// direct user request: mutate bounded numeric thresholds, recombine
// existing named strategies' rule lists/thresholds, 10-generation cap
// (confirmed). Each generation's fitness is a real round-robin
// tournament (`tools/gin/tournament.mjs`, unchanged); survivors seed
// the next generation's mutated/recombined children.
//
// `runTournament` is injected (defaults to the real one), same "inject
// the expensive part" shape `tournament.mjs` itself uses - the
// mutation/crossover/selection LOGIC is what's actually worth proving
// without a browser.
import { runTournament as realRunTournament } from './tournament.mjs';
import { STRATEGY_FACTORIES } from './strategies.mjs';

/**
 * A seeded PRNG (mulberry32) - deterministic end to end (project
 * standard: repeatable, not flaky), never `Math.random()` directly.
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    // `| 0` is load-bearing here, not a truncation style choice:
    // mulberry32 depends on real 32-bit signed-integer WRAPAROUND on
    // overflow, which `Math.trunc` does not do (it only drops the
    // fractional part - JS numbers past 2^31 stay in float range
    // instead of wrapping). Using `Math.trunc` would silently change
    // the sequence this PRNG produces, breaking determinism against
    // any already-recorded seed/output pair.
    // eslint-disable-next-line unicorn/prefer-math-trunc
    state = (state + 0x6D_2B_79_F5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomBetween(rng, min, max) {
  return min + rng() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * One survivor's own numeric knobs, each perturbed by a bounded random
 * step (`stepFraction` of that param's own `max - min` range) and
 * clamped back into range - never a fresh random value, an evolution
 * step from where it already was.
 */
function mutateParameters(base, parameters, rng, stepFraction) {
  const ranges = STRATEGY_FACTORIES[base].params;
  const next = { ...parameters };
  for (const [name, { min, max, default: fallback, integer }] of Object.entries(ranges)) {
    const current = next[name] ?? fallback;
    const step = randomBetween(rng, -1, 1) * stepFraction * (max - min);
    const mutated = clamp(current + step, min, max);
    next[name] = integer ? Math.round(mutated) : mutated;
  }
  return next;
}

/**
 * `counter` is owned by THIS `runEvolution` call alone (created fresh
 * each time, threaded through as a plain argument - never module-level
 * state): two separate calls with the same seed must produce byte-
 * identical output, including names, with no leakage between them or
 * across whatever else ran earlier in the same process.
 */
function variantName(base, generation, counter) {
  counter.value += 1;
  return `${base}-gen${generation}-${counter.value}`;
}

/**
 * A fresh generation-0 individual per base strategy in `bases` - its
 * own default params, nothing mutated yet (generation 0 IS the
 * starting roster, evaluated once before any mutation happens).
 */
function seedGeneration(bases, generation, counter) {
  return bases.map((base) => ({ name: variantName(base, generation, counter), base, params: {} }));
}

/**
 * The next generation from this one's own tournament leaderboard: the
 * top `keepTop` survivors carry forward UNCHANGED (elitism - a real
 * improvement is never lost to a worse mutation), the rest of the
 * roster is refilled by mutating a survivor's own params, or (every
 * `crossoverEvery`th child) recombining one survivor's RULE LIST
 * (`base`) with a DIFFERENT survivor's params - "recombine existing
 * named strategies," direct user request, not a fresh rule ordering.
 */
function nextGeneration({ survivors, rosterSize, generation, rng, stepFraction, keepTop, counter }) {
  const kept = survivors.slice(0, keepTop).map((individual) => ({ ...individual }));
  const children = [];
  let index = 0;
  while (kept.length + children.length < rosterSize) {
    const parent = survivors[index % survivors.length];
    const isCrossover = survivors.length > 1 && index % 2 === 1;
    const donor = isCrossover ? survivors[(index + 1) % survivors.length] : parent;
    const base = parent.base; // the rule LIST always comes from `parent`
    const baseParameters = isCrossover ? donor.params : parent.params;
    const parameters = Object.keys(STRATEGY_FACTORIES[base].params).length === 0
      ? {} // e.g. `defensive` - no tunable knobs, crossover/mutation is a no-op on params
      : mutateParameters(base, baseParameters, rng, stepFraction);
    children.push({ name: variantName(base, generation, counter), base, params: parameters });
    index += 1;
  }
  return [...kept, ...children];
}

/**
 * @param {{ bases: string[], generations?: number, rosterSize?: number,
 *   gamesPerPairing?: number, target?: number, maxHands?: number,
 *   keepTop?: number, stepFraction?: number, seed?: number,
 *   note?: (line: string) => void, runTournament?: Function }} options
 *   `bases` are real STRATEGY_FACTORIES keys (the rule lists being
 *   evolved); `rosterSize` defaults to `bases.length` (one individual
 *   per base to start, same shape every later generation keeps).
 * @returns {Promise<{ generations: { generation: number,
 *   standings: object[], roster: object[] }[], champion: object }>}
 */
export async function runEvolution({
  bases, generations = 10, rosterSize = bases.length, gamesPerPairing = 1, target, maxHands,
  keepTop = Math.max(1, Math.floor(rosterSize / 2)), stepFraction = 0.2, seed = 1,
  note = () => {}, runTournament = realRunTournament,
}) {
  if (generations < 1) throw new Error('need at least 1 generation');
  if (generations > 10) throw new Error('capped at 10 generations (direct user confirmation) - pass fewer');
  if (bases.length < 2) throw new Error('need at least 2 base strategies to evolve');
  for (const base of bases) if (!Object.hasOwn(STRATEGY_FACTORIES, base)) throw new Error(`unknown base strategy "${base}" - choose one of: ${Object.keys(STRATEGY_FACTORIES).join(', ')}`);

  const rng = makeRng(seed);
  const counter = { value: 0 };
  const history = [];
  let roster = seedGeneration(bases, 0, counter);

  for (let generation = 0; generation < generations; generation++) {
    note(`generation ${generation + 1}/${generations}: ${roster.map((individual) => individual.name).join(', ')}`);
    const specByName = new Map(roster.map((individual) => [individual.name, individual]));
    const { standings } = await runTournament({
      roster: roster.map((individual) => individual.name), gamesPerPairing, target, maxHands, note,
      specOf: (name) => specByName.get(name),
    });
    history.push({ generation: generation + 1, standings, roster });

    const survivors = standings.map((row) => specByName.get(row.strategy));
    if (generation < generations - 1) {
      roster = nextGeneration({ survivors, rosterSize, generation: generation + 1, rng, stepFraction, keepTop, counter });
    } else {
      const championRow = standings[0];
      const champion = { ...specByName.get(championRow.strategy), winRate: championRow.winRate, wins: championRow.wins, losses: championRow.losses };
      return { generations: history, champion };
    }
  }
  throw new Error('unreachable'); // the loop above always returns on its last iteration
}
