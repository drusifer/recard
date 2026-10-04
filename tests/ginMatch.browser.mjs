// A full, real Gin Rummy game, played to completion - `knock-early` vs
// itself, so no TYPESAFE_API_KEY is needed (same reasoning as
// `tests/jevTable.browser.mjs`'s own choice of strategy). Proves the
// whole chain: real table, real local WebRTC, two real bot processes,
// a redeal between hands, `games/gin/scoring.yaml` scoring each one,
// the game ending at target, and a clean shutdown with no bot left
// running behind it.
//
// NOT part of `npm test` - needs a browser.
// `npm run test:ginmatch` / `bobp make test-ginmatch`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const MATCH = fileURLToPath(new URL('../tools/gin/match.mjs', import.meta.url));
const PORT = 8243; // not 8211-8242 (every other browser test file)
const PEER_PORT = 9512;
const TARGET = 20; // low, so this finishes in 1-3 real hands, not a long run
const DONE_MS = 90_000;

const botsAt = (code) => spawnSync('/bin/ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout
  .split('\n').filter((line) => line.includes('jevPlayer.mjs') && line.includes(`--code ${code}`))
  .map((line) => Number(line.trim().split(/\s+/, 1)[0]));

test('a real game plays to a real target, scores correctly, and leaves no bot running behind it', async (context) => {
  const match = spawn(process.execPath, [
    MATCH, '--strategy-a', 'knock-early', '--strategy-b', 'knock-early',
    '--target', String(TARGET), '--max-hands', '10', '--port', String(PORT), '--peer-port', String(PEER_PORT),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  let code = null;
  match.stdout.on('data', (chunk) => { stdout += chunk; });
  match.stderr.on('data', (chunk) => { stderr += chunk; code ??= /table (\w+) -/.exec(stderr)?.[1] ?? null; });
  context.after(() => {
    match.kill('SIGKILL');
    const leftovers = code ? botsAt(code) : [];
    for (const pid of leftovers) process.kill(pid, 'SIGKILL');
  });

  const exited = new Promise((resolve) => match.once('exit', (status) => resolve(status)));
  const result = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timed out'), DONE_MS))]);
  assert.notEqual(result, 'timed out', `never finished within ${DONE_MS}ms:\n${stderr}`);
  assert.equal(result, 0, `exited ${result}, not 0:\n${stderr}`);

  const summary = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(summary.strategyA, 'knock-early');
  assert.equal(summary.strategyB, 'knock-early');
  assert.ok(summary.hands >= 1, 'played at least one real hand');
  const totals = Object.values(summary.totals);
  assert.ok(totals.some((points) => points >= TARGET), `winner's total should reach the target: ${JSON.stringify(summary.totals)}`);
  assert.ok(['knock-early'].includes(summary.winner), 'the reported winner is one of the two seated strategies');

  assert.deepEqual(botsAt(code), [], `a bot was left running behind the match:\n${stderr}`);
  assert.match(stderr, /game over:.*wins with/);
});
