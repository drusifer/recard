import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlayerKey, resolvePlayer, peerFor } from '../src/identity.js';

test('a first-time client with no key gets a fresh identity', () => {
  const r = resolvePlayer(null, [], new Map());
  assert.equal(r.returning, false);
  assert.ok(r.playerKey);
});

test('a returning client presenting a known key reclaims that identity', () => {
  const key = newPlayerKey();
  const r = resolvePlayer(key, [{ id: key }], new Map());
  assert.deepEqual(r, { playerKey: key, returning: true });
});

test('an unknown key is not trusted - it gets a fresh identity', () => {
  const r = resolvePlayer('made-up-key', [{ id: 'someone-else' }], new Map());
  assert.equal(r.returning, false);
  assert.notEqual(r.playerKey, 'made-up-key',
    'accepting an arbitrary key would let anyone name themselves into a seat');
});

test('a key already in use by a live peer does not hijack that seat', () => {
  const key = newPlayerKey();
  const live = new Map([['peer-1', key]]);
  const r = resolvePlayer(key, [{ id: key }], live);
  assert.equal(r.returning, false,
    'the original player is still connected, so the newcomer must not take their hand');
  assert.notEqual(r.playerKey, key);
});

test('the same key IS reusable once the original peer has gone', () => {
  const key = newPlayerKey();
  const r = resolvePlayer(key, [{ id: key }], new Map());
  assert.equal(r.returning, true, 'this is the whole point: refresh, come back, get your seat');
});

test('newPlayerKey does not collide across calls', () => {
  const keys = new Set(Array.from({ length: 500 }, newPlayerKey));
  assert.equal(keys.size, 500);
});

test('peerFor finds the live address for an identity, or null when away', () => {
  const map = new Map([['peer-1', 'key-a'], ['peer-2', 'key-b']]);
  assert.equal(peerFor('key-b', map), 'peer-2');
  assert.equal(peerFor('key-gone', map), null);
});

// --- Remembering the table (US-39) ---
import { rememberSession, recallSession, forgetSession, CLIENT_SESSION_STORAGE } from '../src/identity.js';

const store = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('a remembered table round-trips', () => {
  const s = store();
  rememberSession(s, { code: 'ABC123', name: 'Drew' });
  assert.deepEqual(recallSession(s), { code: 'ABC123', name: 'Drew' });
});

test('no memory yet is null, not a crash', () => {
  assert.equal(recallSession(store()), null);
});

test('a corrupt or half-written record means "no memory", not a broken rejoin', () => {
  assert.equal(recallSession(store({ [CLIENT_SESSION_STORAGE]: '{not json' })), null);
  assert.equal(recallSession(store({ [CLIENT_SESSION_STORAGE]: '{"code":"X"}' })), null,
    'missing name must not produce a half-filled auto-rejoin');
});

test('forgetting clears it', () => {
  const s = store();
  rememberSession(s, { code: 'ABC123', name: 'Drew' });
  forgetSession(s);
  assert.equal(recallSession(s), null);
});

test('hostile storage never throws', () => {
  const hostile = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.doesNotThrow(() => rememberSession(hostile, { code: 'A', name: 'B' }));
  assert.equal(recallSession(hostile), null);
  assert.doesNotThrow(() => forgetSession(hostile));
});
