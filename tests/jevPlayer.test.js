// `bobp make jev-player GAME=.. STRATEGY=.. CODE=..` - the argument
// errors a person sees before any browser starts (direct user request,
// 2026-09-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const CLI = fileURLToPath(new URL('../tools/jevPlayer.mjs', import.meta.url));
const run = (...cliArguments) => spawnSync(process.execPath, [CLI, ...cliArguments], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } });

test('jev-player: an unknown game is refused, naming the games there are', () => {
  const result = run('--game', 'chess', '--strategy', 'equilibrium', '--code', 'ABC123');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown game "chess" - choose one of: gin/);
});

test('jev-player: a missing game, strategy or code is refused, naming the make variable', () => {
  assert.match(run('--strategy', 'equilibrium', '--code', 'ABC123').stderr, /GAME=/);
  assert.match(run('--game', 'gin', '--code', 'ABC123').stderr, /STRATEGY=/);
  assert.match(run('--game', 'gin', '--strategy', 'equilibrium').stderr, /CODE=/);
});

test('jev-player: an unknown strategy is refused, naming the game\'s strategies', () => {
  const result = run('--game', 'gin', '--strategy', 'nope', '--code', 'ABC123');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown gin strategy "nope" - choose one of: knock-early, gin-hunter, equilibrium, defensive/);
});

test('jev-player: a Jev strategy without TYPESAFE_API_KEY is refused, naming the variable', () => {
  const result = run('--game', 'gin', '--strategy', 'equilibrium', '--code', 'ABC123');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /TYPESAFE_API_KEY/);
});
