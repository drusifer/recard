// `make export-jev-image`'s image, run the way pi-patch runs it: the
// default command is a LISTENING game master (US-150), so this proves
// Node, the pinned packages, Playwright's Chromium and the public broker
// all work inside the container - it holds its address and says so - and
// that `docker stop` (SIGTERM, what a k8s pod stop sends) ends it cleanly
// well inside the default 10s grace period.
//
// NOT part of `npm test` - needs the image built and internet access.
// `bobp make export-jev-image` then `bobp make test-jev-image`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const IMAGE = process.env.JEV_IMAGE;
// An absolute path, like the other tests' `/bin/ps`: never whatever `PATH` finds first.
const DOCKER = process.env.DOCKER ?? '/usr/bin/docker';
const READY_MS = 90_000;
const STOP_MS = 10_000;

test('the image listens as GM_NAME and stops cleanly on SIGTERM', async (context) => {
  assert.ok(IMAGE, 'JEV_IMAGE=<image:tag> (make test-jev-image sets it)');
  // A name nobody else on the public broker is holding.
  const name = `recard-test-${randomUUID().slice(0, 8)}`;
  const container = `jev-image-test-${name}`;
  const run = spawn(DOCKER, ['run', '--rm', '--name', container, '-e', `GM_NAME=${name}`, IMAGE], { stdio: ['ignore', 'pipe', 'pipe'] });
  context.after(() => spawnSync(DOCKER, ['rm', '-f', container], { stdio: 'ignore' }));
  let log = '';
  run.stdout.on('data', (chunk) => { log += chunk; });
  run.stderr.on('data', (chunk) => { log += chunk; });
  const exited = new Promise((resolve) => run.once('exit', (status) => resolve(status)));

  const started = Date.now();
  while (!log.includes(`listening as ${name}`)) {
    assert.ok(Date.now() - started < READY_MS, `never started listening:\n${log}`);
    assert.equal(run.exitCode, null, `the container exited during startup:\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const asked = Date.now();
  spawnSync(DOCKER, ['stop', '--time', String(STOP_MS / 1000), container], { stdio: 'ignore' });
  const status = await exited;
  const took = Date.now() - asked;
  context.diagnostic(`stopped ${took}ms after SIGTERM, exit ${status}`);
  assert.equal(status, 143, `expected the SIGTERM exit, got ${status}:\n${log}`);
  assert.ok(took < STOP_MS, `took ${took}ms - it was killed at the grace period, not stopped cleanly`);
});
