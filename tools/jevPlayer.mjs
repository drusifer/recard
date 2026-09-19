#!/usr/bin/env node
// A Jev-backed player that joins a table YOU are hosting (direct user
// request, 2026-09-19):
//
//   bobp make jev-player GAME=gin STRATEGY=equilibrium CODE=ABC123 [FIRST=bot|opponent] [HANDS=1]
//   node tools/jevPlayer.mjs --game gin --strategy equilibrium --code ABC123
//
// Picks the game's own player module; the strategy names belong to the
// game, so that module checks them. A new game is one more `GAMES` entry.
import { parseArgs } from 'node:util';

const GAMES = {
  gin: () => import('./gin/player.mjs'),
};

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
  },
});

function fail(message, exitCode = 2) {
  process.stderr.write(`jev-player: ${message}\n`);
  process.exit(exitCode);
}

const games = Object.keys(GAMES).join(', ');
if (!options.game) fail(`pass the game to play: GAME=<${games}> (node: --game)`);
if (!Object.hasOwn(GAMES, options.game)) fail(`unknown game "${options.game}" - choose one of: ${games}`);
if (!options.strategy) fail('pass the strategy to play: STRATEGY=<name> (node: --strategy)');
if (!options.code) fail('pass the table code you are hosting: CODE=ABC123 (node: --code)');

const player = await GAMES[options.game]();
process.on('SIGINT', () => process.exit(130));
try {
  await player.play(options);
} catch (error) {
  fail(error.message, error instanceof player.UsageError ? 2 : 1);
}
