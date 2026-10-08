// `make dist`'s `dist/jev/` is a Jev package that runs on its own: the
// PACKAGED jev-table (not the repo's) hosts a real table, seats two real
// bots from the package's own jevPlayer.mjs, serves the app to anyone
// watching on its port, and Ctrl-C still ends it cleanly. Gin's
// `knock-early` is a rule-list strategy, so no TYPESAFE_API_KEY is needed.
//
// `npm install` in the package is stood in for by linking the repo's own
// node_modules - what this proves is that the package's layout and files
// are complete, which the unit test's import-graph check can't see for
// files reached at runtime (games/, the served app, the spawned bots).
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:jevpackage` / `bobp make test-jevpackage`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { buildDistribution } from '../tools/buildDistribution.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8235; // not 8211-8234 / 8243 (every other browser test file)
const STARTUP_MS = 60_000;
const EXIT_MS = 8000;

test('the packaged jev-table hosts, seats bots, serves spectators, and Ctrl-C ends it', async (context) => {
  const jev = path.join(await buildDistribution(), 'jev');
  await symlink(path.join(ROOT, 'node_modules'), path.join(jev, 'node_modules'), 'dir');

  const launcher = spawn(process.execPath, ['tools/jevTable.mjs', '--game', 'gin', '--players', 'knock-early,knock-early', '--port', String(PORT)],
    { cwd: jev, stdio: ['ignore', 'ignore', 'pipe'] });
  context.after(() => launcher.kill('SIGKILL'));
  let log = '';
  launcher.stderr.on('data', (chunk) => { log += chunk; });
  const exited = new Promise((resolve) => launcher.once('exit', (status, signal) => resolve({ status, signal })));

  const started = Date.now();
  while (!log.includes('ready:')) {
    assert.ok(Date.now() - started < STARTUP_MS, `never got ready:\n${log}`);
    assert.equal(launcher.exitCode, null, `the packaged launcher died during setup:\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const page = await fetch(`http://localhost:${PORT}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /src\/main\.js/, 'a spectator on the port gets the app');

  launcher.kill('SIGINT');
  const result = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timed out'), EXIT_MS))]);
  assert.notEqual(result, 'timed out', `still running ${EXIT_MS}ms after Ctrl-C:\n${log}`);
  assert.equal(result.status, 130, `exited ${result.status}/${result.signal}:\n${log}`);
  assert.match(log, /closing the table/);
});
