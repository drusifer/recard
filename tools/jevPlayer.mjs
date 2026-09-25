#!/usr/bin/env node
// A Jev-backed player that joins a table YOU are hosting (direct user
// request, 2026-09-19):
//
//   bobp make jev-player GAME=gin|rtg STRATEGY=<player> CODE=ABC123 [FIRST=bot|opponent] [HANDS=1]
//
// STRATEGY is a player: a file name in games/<game>/players/ (US-129),
// or one of Gin's D137 rule lists. `bobp make jev-library` lists what a
// game's turn file may use.
//   node tools/jevPlayer.mjs --game gin --strategy equilibrium --code ABC123
//
// Picks the game's adapter and hands it to the shared runner
// (`jev/runner.mjs`); the strategy names belong to the game. A new game is
// one more entry in `jev/games.mjs`.
import { parseArgs } from 'node:util';
import { GAMES } from './jev/games.mjs';


const { values: options } = parseArgs({
  options: {
    game: { type: 'string' },
    strategy: { type: 'string' },
    code: { type: 'string' },
    first: { type: 'string', default: 'bot' },
    hands: { type: 'string', default: '1' },
    name: { type: 'string' },
    url: { type: 'string' },
    port: { type: 'string', default: '8230' },
    deck: { type: 'string' }, // RtG: which shared deck pile is my library
    steps: { type: 'string' }, // RtG: how many decisions this RUN may take
  },
});

function fail(message, exitCode = 2) {
  process.stderr.write(`jev-player: ${message}\n`);
  process.exit(exitCode);
}

const games = Object.keys(GAMES).join(', ');
if (!options.game) fail(`pass the game to play: GAME=<${games}> (node: --game)`);
if (!Object.hasOwn(GAMES, options.game)) fail(`unknown game "${options.game}" - choose one of: ${games}`);
if (!options.strategy) fail('pass the player to seat: STRATEGY=<player file name> (node: --strategy)');
if (!options.code) fail('pass the table code you are hosting: CODE=ABC123 (node: --code)');

const { run, UsageError } = await import('./jev/runner.mjs');
const { adapter } = await GAMES[options.game]();
process.on('SIGINT', () => process.exit(130));
try {
  await run(adapter, options);
} catch (error) {
  fail(error.message, error instanceof UsageError ? 2 : 1);
}
