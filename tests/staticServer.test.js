import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { URL } from 'node:url';
import { startStaticServer } from './harness/multiplayer.mjs';

// US-152: the harness's static server is what a pod exposes on 8230, so
// it must serve the repo and nothing outside it - without relying on a
// proxy in front of it.

const fixture = { server: undefined };
before(async () => { fixture.server = await startStaticServer(0); });
after(() => fixture.server.close());

// Raw request paths: `fetch` would normalize `..` away before sending.
function get(rawPath) {
  const { port } = new URL(fixture.server.baseUrl);
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: rawPath }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
}

test('serves app files as before', async () => {
  const { status, body } = await get('/index.html');
  assert.equal(status, 200);
  assert.match(body, /<html/i);
  assert.equal((await get('/')).status, 200);
});

// Deep enough to reach `/` from wherever the repo is checked out
// (resolving clamps at the filesystem root), so each one names a file
// that really exists if the guard is missing.
const UP = 16;
for (const rawPath of [
  `/${'../'.repeat(UP)}etc/passwd`,
  `/${'..%2f'.repeat(UP)}etc%2fpasswd`,
  `/${'%2e%2e/'.repeat(UP)}etc/passwd`,
  `/src/${'..%2F'.repeat(UP)}etc%2Fpasswd`,
]) {
  test(`refuses a path that escapes the root: ${rawPath}`, async () => {
    const { status, body } = await get(rawPath);
    assert.equal(status, 404);
    assert.equal(body, 'not found');
  });
}

test('malformed percent-encoding answers 400 and the server keeps serving', async () => {
  assert.equal((await get('/%E0%A4%A')).status, 400);
  assert.equal((await get('/index.html')).status, 200);
});
