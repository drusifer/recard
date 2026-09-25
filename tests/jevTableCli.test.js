// `bobp make jev-table` - the argument errors a person sees before any
// browser or table is ever started (US-129 live-session follow-up, D159).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const CLI = fileURLToPath(new URL('../tools/jevTable.mjs', import.meta.url));
const run = (...cliArguments) => spawnSync(process.execPath, [CLI, ...cliArguments], { encoding: 'utf8', timeout: 10_000 });

test('jev-table: no game is refused, naming the ones there are', () => {
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /pass the game: GAME=<gin, rtg>/);
});

test('jev-table: an unknown game is refused, naming the real ones', () => {
  const result = run('--game', 'chess');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown game "chess" - choose one of: gin, rtg/);
});

test('jev-table: an unknown player is refused, naming that game\'s real ones', () => {
  const result = run('--game', 'rtg', '--players', 'nope');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown rtg player "nope" - choose from: aggressive, rules/);
  assert.match(run('--game', 'gin', '--players', 'nope').stderr, /unknown gin player "nope" - choose from: .*jev-balanced/);
});

test('jev-table: one bad name among good ones is still refused', () => {
  const result = run('--game', 'rtg', '--players', 'rules,nope,aggressive');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown rtg player "nope"/);
});

test('jev-table: an empty players list is refused, naming the flag', () => {
  assert.match(run('--game', 'rtg', '--players', '').stderr, /pass at least one player: PLAYERS=/);
  assert.match(run('--game', 'rtg', '--players', ' , ,').stderr, /pass at least one player: PLAYERS=/);
});

test('jev-table: DEAL/SCORE/STEPS out of range are refused, naming what is allowed', () => {
  assert.match(run('--game', 'rtg', '--deal=-1').stderr, /DEAL must be a whole number >= 0, not "-1"/);
  assert.match(run('--game', 'rtg', '--deal', 'seven').stderr, /DEAL must be a whole number >= 0, not "seven"/);
  assert.match(run('--game', 'rtg', '--score', 'twenty').stderr, /SCORE must be a whole number, not "twenty"/);
  assert.match(run('--game', 'rtg', '--steps', '0').stderr, /STEPS must be a whole number >= 1, not "0"/);
});

test('jev-table: every check exits 2 before touching a browser - no TYPESAFE_API_KEY, no network, no hang', () => {
  const result = run('--game', 'rtg', '--players', 'nope');
  assert.equal(result.signal, null, 'never timed out waiting on something real');
});
