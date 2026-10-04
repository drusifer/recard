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

const MATCH = fileURLToPath(new URL('../tools/ginMatch.mjs', import.meta.url));
const PORT = 8243; // not 8211-8242 (every other browser test file)
const PEER_PORT = 9512;
// knock-early vs ITSELF (symmetric play) produces small, evenly-spread
// margins - found live, running this test for real: hand margins of
// 3, 9, 3 points, alternating which side even knocks, needing 4+ real
// hands to cross a target of 20 and still not done past 180s. TARGET=10
// is low enough that almost any single knock crosses it; MAX_HANDS=6
// bounds the real worst case to roughly 6 * ~20s - comfortably under
// DONE_MS. Zero tolerance for a flaky test means budgeting for the
// real observed worst case, not hoping for the common one.
const TARGET = 10;
const MAX_HANDS = 6;
const DONE_MS = 240_000;

const botsAt = (code) => spawnSync('/bin/ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout
  .split('\n').filter((line) => line.includes('jevPlayer.mjs') && line.includes(`--code ${code}`))
  .map((line) => Number(line.trim().split(/\s+/, 1)[0]));

// `peerjs` (the local signaling server `playMatch` starts) is a plain
// (non-detached) child of the `match` process - killing `match` by pid
// alone does NOT reach it (only `-pid`/the process group would), so a
// hard SIGKILL of `match` orphans it. Found live: a timed-out earlier
// run of this exact test left 3 of these stuck on PEER_PORT, failing
// every run after until killed by hand. SIGINT first, always - that is
// `playMatch`'s OWN graceful path (closes the peer server itself) -
// SIGKILL only as the fallback, same escalation discipline as
// `jevTable.mjs`'s own shutdown.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const peerjsAtPort = () => spawnSync('/bin/ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout
  .split('\n').filter((line) => line.includes('peerjs.js') && line.includes(`--port ${PEER_PORT}`))
  .map((line) => Number(line.trim().split(/\s+/, 1)[0]));

async function killCleanly(match) {
  if (match.exitCode !== null) return;
  match.kill('SIGINT');
  const exited = new Promise((resolve) => match.once('exit', resolve));
  await Promise.race([exited, sleep(5000)]);
  if (match.exitCode === null) match.kill('SIGKILL');
  for (const pid of peerjsAtPort()) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
}

test('a real game plays to a real target, scores correctly, and leaves no bot running behind it', async (context) => {
  const match = spawn(process.execPath, [
    MATCH, '--strategy-a', 'knock-early', '--strategy-b', 'knock-early',
    '--target', String(TARGET), '--max-hands', String(MAX_HANDS), '--port', String(PORT), '--peer-port', String(PEER_PORT),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  let code = null;
  match.stdout.on('data', (chunk) => { stdout += chunk; });
  match.stderr.on('data', (chunk) => { stderr += chunk; code ??= /table (\w+) -/.exec(stderr)?.[1] ?? null; });
  context.after(async () => {
    await killCleanly(match);
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
