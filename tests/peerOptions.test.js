import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peerOptionsFromSearch } from '../src/peerOptions.js';

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
    peerOptionsFromSearch('?peerHost=localhost&peerPort=9001&peerPath=%2Frecard&peerKey=recard'),
    { host: 'localhost', port: 9001, path: '/recard', key: 'recard', secure: false },
  );
});

test('peerOptionsFromSearch: peerHost alone -> sensible defaults for the rest', () => {
  assert.deepEqual(
    peerOptionsFromSearch('?peerHost=localhost'),
    { host: 'localhost', port: 443, path: '/', key: 'peerjs', secure: false },
  );
});
