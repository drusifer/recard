// US-122/D143: the pure half of "add a Jev bot from the table" - which
// spawn requests in a talk log this supervisor still has to answer, and
// whether it can honour one at all. No process spawning here; the
// wiring that does spawn lives in `tools/gin/player.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSpawnRequests, spawnRefusal, readyAnnouncement } from '../tools/botRequests.mjs';

const entry = (seq, data, name = 'Alice') => ({ seq, at: seq, from: `k${seq}`, name, text: 't', data });
const request = (seq, requestId, strategy = 'equilibrium') => entry(seq, { kind: 'spawn-bot', game: 'gin', strategy, requestId });
const result = (seq, requestId) => entry(seq, { kind: 'spawn-bot-result', requestId, ok: true }, 'equilibrium');

test('a spawn request in the log is pending', () => {
  assert.deepEqual(pendingSpawnRequests([request(1, 'r1')], new Set()), [{ requestId: 'r1', game: 'gin', strategy: 'equilibrium' }]);
});

test('plain chat and other structured lines are not requests', () => {
  const log = [entry(1, undefined), entry(2, { kind: 'jev-ready' }), entry(3, { kind: 'knock' })];
  assert.deepEqual(pendingSpawnRequests(log, new Set()), []);
});

test('a request this supervisor already handled is not pending again', () => {
  assert.deepEqual(pendingSpawnRequests([request(1, 'r1')], new Set(['r1'])), []);
});

test('a request already answered in the log is not pending - a second jev-player must not double-spawn', () => {
  assert.deepEqual(pendingSpawnRequests([request(1, 'r1'), result(2, 'r1')], new Set()), []);
});

test('a request with no strategy or no id is ignored rather than spawning something arbitrary', () => {
  const log = [entry(1, { kind: 'spawn-bot', game: 'gin', requestId: 'r1' }), entry(2, { kind: 'spawn-bot', game: 'gin', strategy: 'equilibrium' })];
  assert.deepEqual(pendingSpawnRequests(log, new Set()), []);
});

test('several requests come back in log order', () => {
  const pending = pendingSpawnRequests([request(1, 'r1', 'defensive'), request(2, 'r2')], new Set());
  assert.deepEqual(pending.map((p) => p.requestId), ['r1', 'r2']);
});

test('spawnRefusal names an unknown game or strategy, and lists what there is', () => {
  const strategies = { equilibrium: { name: 'equilibrium', description: 'balanced', usesJev: true } };
  assert.match(spawnRefusal({ game: 'chess', strategy: 'equilibrium' }, { games: ['gin'], strategies, env: {} }), /chess/);
  assert.match(spawnRefusal({ game: 'gin', strategy: 'nope' }, { games: ['gin'], strategies, env: {} }), /equilibrium/);
});

test('spawnRefusal names TYPESAFE_API_KEY when a Jev strategy is asked for without one', () => {
  const strategies = { equilibrium: { name: 'equilibrium', description: 'balanced', usesJev: true }, plain: { name: 'plain', description: 'rules only', usesJev: false } };
  const context = { games: ['gin'], strategies, env: {} };
  assert.match(spawnRefusal({ game: 'gin', strategy: 'equilibrium' }, context), /TYPESAFE_API_KEY/);
  assert.equal(spawnRefusal({ game: 'gin', strategy: 'plain' }, context), null);
  assert.equal(spawnRefusal({ game: 'gin', strategy: 'equilibrium' }, { ...context, env: { TYPESAFE_API_KEY: 'k' } }), null);
});

test('the ready announcement carries each strategy with its own description (Gate 2 condition b)', () => {
  const strategies = { equilibrium: { name: 'equilibrium', description: 'balanced', usesJev: true } };
  const { text, data } = readyAnnouncement({ game: 'gin', strategies });
  assert.match(text, /gin/);
  assert.equal(data.kind, 'jev-ready');
  assert.deepEqual(data.strategies, [{ name: 'equilibrium', description: 'balanced' }]);
  assert.deepEqual(data.games, ['gin']);
});

// ---- US-122/D143: the supervisor's request handling (no real spawning) ----

import { serveSpawnRequests } from '../tools/gin/player.mjs';

function fakePeer(talk) {
  const said = [];
  return { said, talk: async () => talk, say: async (text, data) => { said.push({ text, data }); } };
}

test('a good request spawns one bot against the same table and says so', async () => {
  const peer = fakePeer([request(1, 'r1', 'knock-early')]);
  const started = [];
  const watcher = serveSpawnRequests({ peer, code: 'ABC123', baseUrl: 'http://x', startBot: async (r) => { started.push(r); return null; } });
  watcher.stop();
  await watcher.poll();
  assert.deepEqual(started, [{ requestId: 'r1', game: 'gin', strategy: 'knock-early', code: 'ABC123', baseUrl: 'http://x' }]);
  assert.equal(peer.said.at(-1).data.ok, true);
  assert.match(peer.said.at(-1).text, /knock-early/);
});

test('an impossible request is refused in words, and nothing is spawned', async () => {
  const peer = fakePeer([request(1, 'r1', 'no-such-strategy')]);
  let spawned = 0;
  const watcher = serveSpawnRequests({ peer, code: 'ABC123', baseUrl: 'http://x', startBot: async () => { spawned += 1; return null; } });
  watcher.stop();
  await watcher.poll();
  assert.equal(spawned, 0);
  assert.equal(peer.said.at(-1).data.ok, false);
  assert.match(peer.said.at(-1).text, /Could not add/);
  assert.match(peer.said.at(-1).data.error, /knock-early/); // lists what it CAN play
});

test('a failure to start is reported with its reason, not swallowed', async () => {
  const peer = fakePeer([request(1, 'r1', 'knock-early')]);
  const watcher = serveSpawnRequests({ peer, code: 'ABC123', baseUrl: 'http://x', startBot: async () => 'node is missing' });
  watcher.stop();
  await watcher.poll();
  assert.equal(peer.said.at(-1).data.ok, false);
  assert.match(peer.said.at(-1).text, /node is missing/);
});

test('the same request is never answered twice', async () => {
  const peer = fakePeer([request(1, 'r1', 'knock-early')]);
  const watcher = serveSpawnRequests({ peer, code: 'ABC123', baseUrl: 'http://x', startBot: async () => null });
  watcher.stop();
  await watcher.poll();
  await watcher.poll();
  assert.equal(peer.said.length, 1);
});
