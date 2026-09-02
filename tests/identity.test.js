import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPlayerKey, resolvePlayer, peerFor } from '../src/identity.js';

test('a first-time client with no key gets a fresh identity', () => {
  const r = resolvePlayer(null, []);
  assert.equal(r.returning, false);
  assert.ok(r.playerKey);
});

test('a returning client presenting a known key reclaims that identity', () => {
  const key = newPlayerKey();
  const r = resolvePlayer(key, [{ id: key }]);
  assert.deepEqual(r, { playerKey: key, returning: true });
});

test('an unknown key is not trusted - it gets a fresh identity', () => {
  const r = resolvePlayer('made-up-key', [{ id: 'someone-else' }]);
  assert.equal(r.returning, false);
  assert.notEqual(r.playerKey, 'made-up-key',
    'accepting an arbitrary key would let anyone name themselves into a seat');
});

// *fix (direct user report + decision): a known key ALWAYS reclaims its
// seat now, even if some other peer id still appears to hold it live -
// WebRTC disconnect detection is unreliable enough that the old "refuse
// while the first is still on it" guard false-positived on ordinary
// reconnects far more than it ever caught a real second tab. The caller
// (main.js) is responsible for actively evicting whatever connection
// used to hold this key, so it can't be silently duplicated OR leaked.
test('a returning key reclaims its seat unconditionally, even if another peer id still appears to hold it', () => {
  const key = newPlayerKey();
  const r = resolvePlayer(key, [{ id: key }]);
  assert.deepEqual(r, { playerKey: key, returning: true });
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
