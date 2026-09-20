// US-122/D143: the app side of "add a Jev bot" - what the table offers,
// and how it learns what happened. Pure; the control that renders it is
// `<add-bot>`, the process spawning is `tools/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { botOffers, spawnResult, spawnRequestLine } from '../src/botOffers.js';

const STRATEGIES = [{ name: 'equilibrium', description: 'balanced' }, { name: 'defensive', description: 'blocks' }];
const ready = (from, name = from) => ({ seq: 1, from, name, text: 'ready', data: { kind: 'jev-ready', games: ['gin'], strategies: STRATEGIES } });
const connected = (...ids) => ids.map((id) => ({ id, connection: 'connected' }));

test('a running Jev player is offered, with its strategies and their descriptions', () => {
  assert.deepEqual(botOffers([ready('k1', 'equilibrium')], connected('k1')), [
    { from: 'k1', name: 'equilibrium', games: ['gin'], strategies: STRATEGIES },
  ]);
});

test('no Jev player at the table means nothing to offer', () => {
  assert.deepEqual(botOffers([{ seq: 1, from: 'k1', name: 'Alice', text: 'hello' }], connected('k1')), []);
});

test('a Jev player that has left takes its offer with it', () => {
  const players = [{ id: 'k1', connection: 'disconnected' }];
  assert.deepEqual(botOffers([ready('k1')], players), []);
});

test('the newest announcement from a sender wins, and each sender is offered once', () => {
  const older = ready('k1');
  const newer = { ...ready('k1'), seq: 5, data: { kind: 'jev-ready', games: ['gin'], strategies: [{ name: 'knock-early', description: 'fast' }] } };
  const offers = botOffers([older, newer], connected('k1'));
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0].strategies, [{ name: 'knock-early', description: 'fast' }]);
});

test('an announcement with no usable strategies is not an offer', () => {
  const empty = { ...ready('k1'), data: { kind: 'jev-ready', games: ['gin'], strategies: [] } };
  assert.deepEqual(botOffers([empty], connected('k1')), []);
});

test('a request is in flight until its own result arrives', () => {
  const talk = [{ seq: 1, from: 'k1', name: 'me', text: 'add', data: { kind: 'spawn-bot', requestId: 'r1', strategy: 'defensive' } }];
  assert.equal(spawnResult(talk, 'r1'), null);
  const answered = [...talk, { seq: 2, from: 'k2', name: 'bot', text: 'ok', data: { kind: 'spawn-bot-result', requestId: 'r1', ok: true } }];
  assert.deepEqual(spawnResult(answered, 'r1'), { ok: true });
  assert.equal(spawnResult(answered, 'other'), null, 'someone else\'s answer is not mine');
});

test('a failure carries its reason, so the control can show it', () => {
  const talk = [{ seq: 1, from: 'k2', name: 'bot', text: 'no', data: { kind: 'spawn-bot-result', requestId: 'r1', ok: false, error: 'TYPESAFE_API_KEY is not set' } }];
  assert.deepEqual(spawnResult(talk, 'r1'), { ok: false, error: 'TYPESAFE_API_KEY is not set' });
});

test('the request line reads as a sentence and carries the structured ask', () => {
  const { text, data } = spawnRequestLine({ game: 'gin', strategy: 'defensive', requestId: 'r1' });
  assert.match(text, /defensive/);
  assert.deepEqual(data, { kind: 'spawn-bot', game: 'gin', strategy: 'defensive', requestId: 'r1' });
});
