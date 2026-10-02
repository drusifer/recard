// A local PeerJS signaling server, so real WebRTC/data-channel tests and
// jev-tool experiments can run without touching the public PeerJS
// broker. ONE place - `tests/harness/multiplayer.mjs` (every browser
// test, by default) and the jev tools (`jevTable.mjs`, `jev/runner.mjs`,
// opt-in only) both import this rather than each standing up their own.
//
// Runs the package's own `peerjs` CLI as a CHILD PROCESS rather than
// calling its `PeerServer()` API in-process: checked live, that API
// starts two `setInterval`s (expired-message sweep, broken-connection
// check) with no public stop, and its own `http.Server.close()` was
// still not enough to let a `node --test` process (or `jev-table`) ever
// exit - confirmed hanging indefinitely even with the server's own
// handle already closed. A child process sidesteps the question of
// which internal handle leaks: SIGTERM shuts the real binary down
// cleanly (its own "Http server closed." + a normal exit, checked live).
//
// `src/peerOptions.js` is the other half: it reads the query string this
// writes and redirects `session.js`'s `new Peer()` calls here instead of
// the public broker.
import { spawn } from 'node:child_process';
import { URL, fileURLToPath } from 'node:url';

const PEERJS_BIN = fileURLToPath(new URL('../node_modules/peer/dist/bin/peerjs.js', import.meta.url));
const PATH = '/recard';
const KEY = 'recard';
const READY_TIMEOUT_MS = 10_000;
const KILL_GRACE_MS = 3000;

/**
 * The query string that sends a browser tab at this server instead of
 * the public broker - append it to whatever `baseUrl` a caller was
 * already going to `page.goto()`.
 */
export function localPeerQueryString(port) {
  const parameters = new URLSearchParams({ peerHost: 'localhost', peerPort: String(port), peerPath: PATH, peerKey: KEY });
  return `?${parameters}`;
}

/**
 * Resolves once `child`'s stdout reports it is listening, or rejects if
 * it exits/errors first.
 */
function waitUntilListening(child) {
  return new Promise((resolve, reject) => {
    let out = '';
    const cleanup = () => {
      child.stdout.off('data', onData);
      child.off('error', onError);
      child.off('exit', onExit);
      clearTimeout(timer);
    };
    const onData = (chunk) => {
      out += chunk;
      if (/Started PeerServer/.test(out)) { cleanup(); resolve(); }
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onExit = (code) => { cleanup(); reject(new Error(`peerjs exited before it was ready (code ${code}): ${out}`)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`peerjs never reported ready within ${READY_TIMEOUT_MS}ms: ${out}`)); }, READY_TIMEOUT_MS);
    child.stdout.on('data', onData);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

/**
 * Starts a local signaling server on `port`. Resolves once it is
 * actually listening. Resolves `{ queryString, close() }`.
 */
export async function startLocalPeerServer(port) {
  const child = spawn(process.execPath, [PEERJS_BIN, '--port', String(port), '--path', PATH, '--key', KEY], { stdio: 'pipe' });
  await waitUntilListening(child);
  return {
    queryString: localPeerQueryString(port),
    close: () => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
      const killer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      child.once('exit', () => { clearTimeout(killer); resolve(); });
      child.kill('SIGTERM');
    }),
  };
}
