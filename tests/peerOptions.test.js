import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { peerOptionsFromSearch, withPeerConfig } from '../src/peerOptions.js';

// Local WebRTC signaling path (`tools/localPeerServer.mjs` writes the
// query string this reads): `session.js`'s only non-default input, split
// out as a pure function so it is unit-tested directly - session.js's own
// header comment explains why the Peer/DataConnection wiring itself isn't.

test('peerOptionsFromSearch: no peerHost param -> undefined (public broker, unchanged default)', () => {
  assert.equal(peerOptionsFromSearch(''), undefined);
  assert.equal(peerOptionsFromSearch('?join=ABC123'), undefined);
});

test('peerOptionsFromSearch: full params -> PeerJS options object', () => {
  assert.deepEqual(
    peerOptionsFromSearch('?peerHost=127.0.0.1&peerPort=9001&peerPath=%2Frecard&peerKey=recard'),
    { host: '127.0.0.1', port: 9001, path: '/recard', key: 'recard', secure: false, config: { iceServers: [] } },
  );
});

test('peerOptionsFromSearch: peerHost alone -> sensible defaults for the rest', () => {
  assert.deepEqual(
    peerOptionsFromSearch('?peerHost=127.0.0.1'),
    { host: '127.0.0.1', port: 443, path: '/', key: 'peerjs', secure: false, config: { iceServers: [] } },
  );
});

test('peerOptionsFromSearch: no public STUN server - two peers on one machine need no NAT traversal, and a local override must never reach the public internet for ANY part of the connection, signaling included', () => {
  const options = peerOptionsFromSearch('?peerHost=127.0.0.1&peerPort=9000');
  assert.deepEqual(options.config.iceServers, []);
});

// US-151/D176: a relayed game master's pages get their RTCConfiguration
// (Cloudflare TURN servers, relay-only) through the same URL channel.
const RELAY = {
  iceServers: [{ urls: ['turns:turn.example.com:443?transport=tcp'], username: 'u', credential: 'p&w=?' }],
  iceTransportPolicy: 'relay',
};

test('withPeerConfig -> peerOptionsFromSearch round-trips the RTCConfiguration as PeerJS config, public broker kept', () => {
  const url = new URL(withPeerConfig('http://localhost:8230', RELAY));
  assert.deepEqual(peerOptionsFromSearch(url.search), { config: RELAY });
});

test('withPeerConfig keeps the local-broker parameters already on the URL; peerConfig replaces the empty ICE list', () => {
  const url = new URL(withPeerConfig('http://localhost:8230/?peerHost=127.0.0.1&peerPort=9000', RELAY));
  assert.deepEqual(peerOptionsFromSearch(url.search), { host: '127.0.0.1', port: 9000, path: '/', key: 'peerjs', secure: false, config: RELAY });
});

test('withPeerConfig with no config leaves the URL exactly as it was', () => {
  assert.equal(withPeerConfig('http://localhost:8230'), 'http://localhost:8230');
  assert.equal(withPeerConfig('http://localhost:8230/?peerHost=127.0.0.1', null), 'http://localhost:8230/?peerHost=127.0.0.1');
});
