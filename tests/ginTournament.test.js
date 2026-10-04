// Pure logic (pairing generation, standings, leaderboard) - the real
// browser/table/bot path is `tools/gin/match.mjs`'s own job, already
// proven live (tests/ginMatch.browser.mjs). `playMatch` is injected
// here as a scripted fake, so this suite runs in milliseconds, no
// browser, no API cost - same shape as this project's other
// "inject the expensive part" tests (e.g. `jev/runner.mjs`'s own).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTournament } from '../tools/gin/tournament.mjs';

/**
A fake `playMatch` that always declares `winnerOf(strategyA, strategyB)` the winner.
*/
function fakePlayMatch(winnerOf, calls = []) {
  return async ({ strategyA, strategyB, port, peerPort }) => {
    calls.push({ strategyA, strategyB, port, peerPort });
    const winner = winnerOf(strategyA, strategyB);
    return { strategyA, strategyB, hands: 1, totals: { [winner]: 25 }, winner, winnerId: winner };
  };
}

test('round robin: every unique pairing plays exactly once (not both orders)', async () => {
  const calls = [];
  await runTournament({
    roster: ['a', 'b', 'c'], playMatch: fakePlayMatch(() => 'a', calls),
  });
  assert.equal(calls.length, 3, '3 strategies -> 3 pairings (a-b, a-c, b-c)');
  const pairs = calls.map((call) => [call.strategyA, call.strategyB].toSorted().join('-'));
  assert.deepEqual(pairs.toSorted(), ['a-b', 'a-c', 'b-c']);
});

test('gamesPerPairing: each pairing plays that many real games', async () => {
  const calls = [];
  await runTournament({
    roster: ['a', 'b'], gamesPerPairing: 3, playMatch: fakePlayMatch(() => 'a', calls),
  });
  assert.equal(calls.length, 3, 'one pairing x 3 games');
});

test('each call gets a distinct port/peerPort - matches run serially, never colliding', async () => {
  const calls = [];
  await runTournament({ roster: ['a', 'b', 'c', 'd'], playMatch: fakePlayMatch(() => 'a', calls) });
  const ports = calls.map((call) => call.port);
  const peerPorts = calls.map((call) => call.peerPort);
  assert.equal(new Set(ports).size, ports.length, 'every match got its own port');
  assert.equal(new Set(peerPorts).size, peerPorts.length, 'every match got its own peer port');
});

test('standings: wins/losses/games tallied correctly, leaderboard sorted by win rate', async () => {
  // a beats everyone, b beats c only, c beats nobody.
  const winnerOf = (strategyA, strategyB) => {
    if ([strategyA, strategyB].includes('a')) return 'a';
    return 'b';
  };
  const { standings } = await runTournament({ roster: ['a', 'b', 'c'], playMatch: fakePlayMatch(winnerOf) });
  assert.deepEqual(standings.map((row) => row.strategy), ['a', 'b', 'c'], 'a (2-0) > b (1-1) > c (0-2)');
  assert.deepEqual(standings[0], { strategy: 'a', wins: 2, losses: 0, games: 2, winRate: 1 });
  assert.deepEqual(standings[1], { strategy: 'b', wins: 1, losses: 1, games: 2, winRate: 0.5 });
  assert.deepEqual(standings[2], { strategy: 'c', wins: 0, losses: 2, games: 2, winRate: 0 });
});

test('results: one entry per real game played, in order', async () => {
  const { results } = await runTournament({ roster: ['a', 'b'], gamesPerPairing: 2, playMatch: fakePlayMatch(() => 'a') });
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.winner === 'a'));
});

test('refuses a roster smaller than 2', async () => {
  await assert.rejects(() => runTournament({ roster: ['a'], playMatch: fakePlayMatch(() => 'a') }), /at least 2/);
});

test('refuses a roster with a duplicate strategy', async () => {
  await assert.rejects(() => runTournament({ roster: ['a', 'b', 'a'], playMatch: fakePlayMatch(() => 'a') }), /duplicate/);
});
