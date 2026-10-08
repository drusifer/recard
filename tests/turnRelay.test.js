import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnKeyFromEnvironment, mintIceServers, startTurnRelay, TURN_TTL_SECONDS } from '../tools/turnRelay.mjs';

// US-151/D176: the game master's ICE credentials, minted from Cloudflare
// Realtime TURN. Network and timers are injected, so nothing here leaves
// the process or waits.

const KEY = { keyId: 'key-1', token: 'secret-token' };

function cloudflareAnswer(username) {
  return {
    iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:53?transport=udp',
          'turns:turn.cloudflare.com:443?transport=tcp',
        ],
        username,
        credential: `${username}-pw`,
      },
    ],
  };
}

function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === undefined, status: next.status ?? 201, json: async () => next.body ?? next, text: async () => next.text ?? '' };
  };
  return { fetch, calls };
}

function fakeTimers() {
  const pending = [];
  return {
    pending,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timer.unref = () => { timer.unrefd = true; };
      pending.push(timer);
      return timer;
    },
    clearTimeout: (timer) => { const at = pending.indexOf(timer); if (at !== -1) pending.splice(at, 1); },
    fire: async () => { const timer = pending.shift(); await timer.callback(); return timer; },
  };
}

test('turnKeyFromEnvironment: neither variable -> null (no relay, today\'s behaviour)', () => {
  assert.equal(turnKeyFromEnvironment({}), null);
});

test('turnKeyFromEnvironment: both variables -> the key', () => {
  assert.deepEqual(turnKeyFromEnvironment({ CLOUDFLARE_TURN_KEY_ID: 'key-1', CLOUDFLARE_TURN_KEY_API_TOKEN: 'secret-token' }), KEY);
});

test('turnKeyFromEnvironment: only one set -> error naming the missing one', () => {
  assert.throws(() => turnKeyFromEnvironment({ CLOUDFLARE_TURN_KEY_ID: 'key-1' }), /CLOUDFLARE_TURN_KEY_API_TOKEN/);
  assert.throws(() => turnKeyFromEnvironment({ CLOUDFLARE_TURN_KEY_API_TOKEN: 'secret-token' }), /CLOUDFLARE_TURN_KEY_ID/);
});

test('mintIceServers: POSTs the key\'s generate-ice-servers endpoint with a bearer token and the TTL', async () => {
  const { fetch, calls } = fakeFetch([cloudflareAnswer('u1')]);
  await mintIceServers({ ...KEY, fetch });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ttl: TURN_TTL_SECONDS });
});

test('mintIceServers: drops port-53 URLs (browsers block them and time out), keeps the rest and the credentials', async () => {
  const { fetch } = fakeFetch([cloudflareAnswer('u1')]);
  assert.deepEqual(await mintIceServers({ ...KEY, fetch }), [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'u1-pw' },
  ]);
});

test('mintIceServers: a refusal surfaces Cloudflare\'s status and answer, never the token', async () => {
  const { fetch } = fakeFetch([{ status: 401, text: 'invalid key' }]);
  await assert.rejects(mintIceServers({ ...KEY, fetch }), (error) => {
    assert.match(error.message, /401/);
    assert.match(error.message, /invalid key/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test('startTurnRelay: mints at start; config() is the relay-only RTCConfiguration', async () => {
  const { fetch } = fakeFetch([cloudflareAnswer('u1')]);
  const timers = fakeTimers();
  const relay = await startTurnRelay({ key: KEY, fetch, ...timers });
  assert.equal(relay.config().iceTransportPolicy, 'relay');
  assert.equal(relay.config().iceServers[1].username, 'u1');
});

test('startTurnRelay: refreshes at 80% of the TTL, unref\'d; listeners and config() get the fresh set', async () => {
  const { fetch, calls } = fakeFetch([cloudflareAnswer('u1'), cloudflareAnswer('u2')]);
  const timers = fakeTimers();
  const relay = await startTurnRelay({ key: KEY, fetch, ...timers });
  const seen = [];
  relay.onRefresh((config) => { seen.push(config.iceServers[1].username); });
  const timer = await timers.fire();
  assert.equal(timer.delay, TURN_TTL_SECONDS * 1000 * 0.8);
  assert.ok(timer.unrefd);
  assert.equal(calls.length, 2);
  assert.deepEqual(seen, ['u2']);
  assert.equal(relay.config().iceServers[1].username, 'u2');
  assert.equal(timers.pending.length, 1, 'the next refresh is scheduled');
});

test('startTurnRelay: a failed refresh keeps the current set, reports it, and retries in 60s', async () => {
  const { fetch } = fakeFetch([cloudflareAnswer('u1'), new Error('network down')]);
  const timers = fakeTimers();
  const errors = [];
  const relay = await startTurnRelay({ key: KEY, fetch, ...timers, onError: (error) => { errors.push(error.message); } });
  await timers.fire();
  assert.equal(relay.config().iceServers[1].username, 'u1');
  assert.deepEqual(errors, ['network down']);
  assert.equal(timers.pending[0].delay, 60_000);
});

test('startTurnRelay: a failed FIRST mint rejects (startup fails fast)', async () => {
  const { fetch } = fakeFetch([{ status: 403, text: 'forbidden' }]);
  await assert.rejects(startTurnRelay({ key: KEY, fetch, ...fakeTimers() }), /403/);
});

test('startTurnRelay: stop() cancels the pending refresh', async () => {
  const { fetch } = fakeFetch([cloudflareAnswer('u1')]);
  const timers = fakeTimers();
  const relay = await startTurnRelay({ key: KEY, fetch, ...timers });
  relay.stop();
  assert.equal(timers.pending.length, 0);
});
