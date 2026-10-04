#!/usr/bin/env node
// Evolves a roster of Gin strategies over real, capped generations -
// mutates bounded numeric thresholds, recombines existing named
// strategies' rule lists/thresholds (direct user request), 10-
// generation cap (confirmed). Every generation's fitness is a REAL
// round-robin tournament - real table, real WebRTC, real bot
// processes, real Jev where a base strategy uses one. Real cost:
// BASES/GENERATIONS/GAMES control how much of that you're asking for.
//
//   bobp make gin-evolve BASES=knock-early,gin-hunter,equilibrium GENERATIONS=5
//
// Prints each generation's leaderboard as it completes, then the final
// champion's exact params - copy-pasteable into a new named strategy in
// tools/gin/strategies.mjs if you want to keep it.
import { parseArgs } from 'node:util';
import { runEvolution } from './gin/evolve.mjs';
import { DEFAULT_TARGET, DEFAULT_MAX_HANDS } from './gin/match.mjs';

const { values: options } = parseArgs({
  options: {
    bases: { type: 'string' }, // comma-separated STRATEGY_FACTORIES keys
    generations: { type: 'string', default: '5' }, // capped at 10
    'roster-size': { type: 'string' },
    games: { type: 'string', default: '1' }, // games PER PAIRING, per generation
    'keep-top': { type: 'string' },
    'step-fraction': { type: 'string', default: '0.2' },
    seed: { type: 'string', default: '1' },
    target: { type: 'string', default: String(DEFAULT_TARGET) },
    'max-hands': { type: 'string', default: String(DEFAULT_MAX_HANDS) },
  },
});

function fail(message) {
  process.stderr.write(`gin-evolve: ${message}\n`);
  process.exit(2);
}

if (!options.bases) fail('pass at least 2 base strategies: --bases knock-early,gin-hunter');
const bases = options.bases.split(',').map((each) => each.trim()).filter(Boolean);
const note = (line) => process.stderr.write(`gin-evolve: ${line}\n`);

try {
  const { generations, champion } = await runEvolution({
    bases,
    generations: Number(options.generations),
    rosterSize: options['roster-size'] ? Number(options['roster-size']) : undefined,
    gamesPerPairing: Number(options.games),
    keepTop: options['keep-top'] ? Number(options['keep-top']) : undefined,
    stepFraction: Number(options['step-fraction']),
    seed: Number(options.seed),
    target: Number(options.target),
    maxHands: Number(options['max-hands']),
    note,
  });

  for (const { generation, standings } of generations) {
    note('');
    note(`=== generation ${generation}/${generations.length} ===`);
    for (const row of standings) note(`${row.strategy}: ${row.wins}-${row.losses} (${(row.winRate * 100).toFixed(0)}% win rate)`);
  }
  note('');
  note(`=== champion: ${champion.base} with ${JSON.stringify(champion.params)} (${(champion.winRate * 100).toFixed(0)}% win rate) ===`);
  process.stdout.write(`${JSON.stringify({ generations, champion })}\n`);
} catch (error) {
  fail(error.message);
}
