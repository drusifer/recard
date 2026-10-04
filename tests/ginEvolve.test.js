// Pure logic (mutation, crossover, selection, generation cap) - the
// real tournament/match path is already proven live elsewhere
// (tests/ginMatch.browser.mjs). `runTournament` is injected as a
// scripted fake, deterministic given a fixed seed, so this runs in
// milliseconds with no browser and no API cost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEvolution } from '../tools/gin/evolve.mjs';
import { STRATEGY_FACTORIES } from '../tools/gin/strategies.mjs';

/**
 * A fake `runTournament` whose standings always rank by `scoreOf(spec)`
 * - deterministic given the specs it was handed (via `specOf`), so
 * tests can assert exactly who survives.
 */
function fakeRunTournament(scoreOf) {
  return async ({ roster, specOf }) => {
    const standings = roster
      .map((name) => ({ strategy: name, wins: 0, losses: 0, games: 0, winRate: scoreOf(specOf(name)) }))
      .toSorted((a, b) => b.winRate - a.winRate);
    return { standings, results: [] };
  };
}

test('refuses more than 10 generations (direct user confirmation)', async () => {
  await assert.rejects(
    () => runEvolution({ bases: ['knock-early', 'defensive'], generations: 11, runTournament: fakeRunTournament(() => 0) }),
    /capped at 10 generations/,
  );
});

test('refuses fewer than 2 base strategies', async () => {
  await assert.rejects(
    () => runEvolution({ bases: ['knock-early'], runTournament: fakeRunTournament(() => 0) }),
    /at least 2 base strategies/,
  );
});

test('refuses an unknown base strategy, naming real choices', async () => {
  await assert.rejects(
    () => runEvolution({ bases: ['knock-early', 'nope'], runTournament: fakeRunTournament(() => 0) }),
    /unknown base strategy "nope"/,
  );
});

test('generation 0 is every base strategy, at its own defaults (empty params)', async () => {
  const seen = [];
  const runTournament = async ({ roster, specOf }) => {
    seen.push(roster.map((name) => specOf(name)));
    return { standings: roster.map((name) => ({ strategy: name, wins: 0, losses: 0, games: 0, winRate: 0 })), results: [] };
  };
  await runEvolution({ bases: ['knock-early', 'gin-hunter'], generations: 1, runTournament });
  assert.deepEqual(seen[0].map((spec) => ({ base: spec.base, params: spec.params })), [
    { base: 'knock-early', params: {} },
    { base: 'gin-hunter', params: {} },
  ]);
});

test('deterministic: the same seed produces the exact same generations end to end', async () => {
  const run = () => runEvolution({
    bases: ['knock-early', 'gin-hunter', 'equilibrium'], generations: 3, seed: 42,
    runTournament: fakeRunTournament((spec) => (spec.params.minGain ?? spec.params.chaseChance ?? spec.params.weight ?? 0)),
  });
  const first = await run();
  const second = await run();
  assert.deepEqual(first.champion, second.champion);
  assert.deepEqual(
    first.generations.map((g) => g.roster.map((individual) => individual.params)),
    second.generations.map((g) => g.roster.map((individual) => individual.params)),
  );
});

test('elitism: the top survivor\'s params carry forward UNCHANGED into the next generation (not remutated)', async () => {
  // knock-early always "wins" (highest score); its exact params must
  // reappear, verbatim, in generation 2's roster.
  const result = await runEvolution({
    bases: ['knock-early', 'defensive'], generations: 2, keepTop: 1,
    runTournament: fakeRunTournament((spec) => (spec.base === 'knock-early' ? 1 : 0)),
  });
  const gen1Winner = result.generations[0].roster.find((individual) => individual.base === 'knock-early');
  const gen2Roster = result.generations[1].roster;
  assert.ok(gen2Roster.some((individual) => individual.base === 'knock-early' && JSON.stringify(individual.params) === JSON.stringify(gen1Winner.params)),
    'the elite survivor\'s own params reappear unmutated');
});

test('mutation stays within each param\'s own declared bounds, every generation', async () => {
  const result = await runEvolution({
    bases: ['gin-hunter', 'equilibrium'], generations: 10, stepFraction: 5, // an absurdly large step - proves clamping, not luck
    runTournament: fakeRunTournament(() => Math.random()),
  });
  const ranges = STRATEGY_FACTORIES['gin-hunter'].params;
  for (const { roster } of result.generations) {
    for (const individual of roster) {
      if (individual.base !== 'gin-hunter') continue;
      for (const [name, value] of Object.entries(individual.params)) {
        assert.ok(value >= ranges[name].min && value <= ranges[name].max, `${name}=${value} outside [${ranges[name].min}, ${ranges[name].max}]`);
      }
    }
  }
});

test('a base with no tunable params (defensive) is never mutated - every child stays {}', async () => {
  const result = await runEvolution({
    bases: ['defensive', 'knock-early'], generations: 3,
    runTournament: fakeRunTournament(() => Math.random()),
  });
  for (const { roster } of result.generations) {
    for (const individual of roster) if (individual.base === 'defensive') assert.deepEqual(individual.params, {});
  }
});

test('the champion is the FINAL generation\'s own top standing', async () => {
  const result = await runEvolution({
    bases: ['knock-early', 'defensive'], generations: 2,
    runTournament: fakeRunTournament((spec) => (spec.base === 'knock-early' ? 1 : 0)),
  });
  assert.equal(result.champion.base, 'knock-early');
  assert.equal(result.generations.length, 2);
});

test('every individual within one generation\'s own roster has a unique name', async () => {
  // NOT unique across generations - elitism deliberately carries a kept
  // survivor's name (and params) forward unchanged (see the elitism
  // test above); the real invariant is no COLLISION within one roster.
  const result = await runEvolution({
    bases: ['knock-early', 'gin-hunter', 'equilibrium'], generations: 4,
    runTournament: fakeRunTournament(() => Math.random()),
  });
  for (const { roster } of result.generations) {
    const names = roster.map((individual) => individual.name);
    assert.equal(new Set(names).size, names.length, `duplicate name within one generation: ${names.join(', ')}`);
  }
});

