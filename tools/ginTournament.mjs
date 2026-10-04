#!/usr/bin/env node
// A real round-robin Gin Rummy tournament over a roster of named
// strategies - every pairing plays real games (`tools/gin/match.mjs`),
// a leaderboard at the end. Real cost: every game is a real table, real
// WebRTC, real bot processes, real Jev where a strategy uses one -
// ROSTER/GAMES control how much of that you're asking for.
//
//   bobp make gin-tournament ROSTER=knock-early,gin-hunter,equilibrium,defensive
//   bobp make gin-tournament ROSTER=knock-early,jev-balanced,jev-cagey GAMES=2
//   node tools/ginTournament.mjs --roster knock-early,gin-hunter --games 2
//
// Defaults to every rule-list strategy (no Jev, no API cost) - the free
// track this sprint's own scoping asked to prove first; naming any
// `jev-*` player in --roster opts that cost in explicitly, never by
// default.
import { parseArgs } from 'node:util';
import { runTournament } from './gin/tournament.mjs';
import { DEFAULT_TARGET, DEFAULT_MAX_HANDS } from './gin/match.mjs';
import { STRATEGIES } from './gin/strategies.mjs';

const { values: options } = parseArgs({
  options: {
    roster: { type: 'string' }, // comma-separated; defaults to every rule-list (free) strategy
    games: { type: 'string', default: '1' }, // games PER PAIRING
    target: { type: 'string', default: String(DEFAULT_TARGET) },
    'max-hands': { type: 'string', default: String(DEFAULT_MAX_HANDS) },
  },
});

function fail(message) {
  process.stderr.write(`gin-tournament: ${message}\n`);
  process.exit(2);
}

const roster = options.roster ? options.roster.split(',').map((each) => each.trim()).filter(Boolean) : Object.keys(STRATEGIES);
if (roster.length < 2) fail(`need at least 2 strategies, got: ${roster.join(', ') || '(none)'}`);

const note = (line) => process.stderr.write(`gin-tournament: ${line}\n`);

try {
  const { standings, results } = await runTournament({
    roster, gamesPerPairing: Number(options.games), target: Number(options.target), maxHands: Number(options['max-hands']), note,
  });
  note('');
  note('=== leaderboard ===');
  for (const row of standings) note(`${row.strategy}: ${row.wins}-${row.losses} (${(row.winRate * 100).toFixed(0)}% win rate, ${row.games} games)`);
  process.stdout.write(`${JSON.stringify({ standings, results })}\n`);
} catch (error) {
  fail(error.message);
}
