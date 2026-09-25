// D159: Ctrl-C at `jev-table` asks every bot to leave and reaps them - the
// table never leaves bots running behind it. A REAL table (browser and the
// PeerJS broker) with two real `jevPlayer.mjs` bots; Gin's `knock-early`
// is a rule-list strategy, so no Jev and no TYPESAFE_API_KEY is needed.
//
// The bug this pins down: `chromium.launch()` installs its OWN SIGINT
// handler, which closes the browser and calls `process.exit(130)` - ahead
// of the launcher's async shutdown, so it exited in ~0s with every bot
// still running. Found live, after D159 had put it down to process groups.
//
// NOT part of `npm test` - needs a browser and the PeerJS broker.
// `npm run test:jevtable` / `bobp make test-jevtable`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';

const LAUNCHER = fileURLToPath(new URL('../tools/jevTable.mjs', import.meta.url));
const PORT = 8225; // not 8211-8224 (every other browser test file)
const STARTUP_MS = 60_000;
const EXIT_MS = 8000; // the 5s quit grace is the LONGEST a responsive table waits; the rest is room to say goodbye and close

const botsAt = (code) => spawnSync('/bin/ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout
  .split('\n').filter((line) => line.includes('jevPlayer.mjs') && line.includes(`--code ${code}`))
  .map((line) => Number(line.trim().split(/\s+/, 1)[0]));

test('Ctrl-C ends the table, and leaves no bot running behind it', async (context) => {
  const launcher = spawn(process.execPath, [LAUNCHER, '--game', 'gin', '--players', 'knock-early,knock-early', '--port', String(PORT)],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  let code = null;
  context.after(() => {
    launcher.kill('SIGKILL');
    const leftovers = code ? botsAt(code) : [];
    for (const pid of leftovers) process.kill(pid, 'SIGKILL');
  });
  launcher.stderr.on('data', (chunk) => { log += chunk; code ??= /table (\w+) at/.exec(log)?.[1] ?? null; });
  const exited = new Promise((resolve) => launcher.once('exit', (status, signal) => resolve({ status, signal })));

  const started = Date.now();
  while (!log.includes('ready:')) {
    assert.ok(Date.now() - started < STARTUP_MS, `never got ready:\n${log}`);
    assert.equal(launcher.exitCode, null, `the launcher died during setup:\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(botsAt(code).length, 2, 'two bots are seated and running');

  const asked = Date.now();
  launcher.kill('SIGINT');
  const result = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timed out'), EXIT_MS))]);
  assert.notEqual(result, 'timed out', `still running ${EXIT_MS}ms after Ctrl-C:\n${log}`);
  assert.equal(result.status, 130, `exited ${result.status}/${result.signal}:\n${log}`);
  const took = Date.now() - asked;
  context.diagnostic(`exited ${took}ms after Ctrl-C`);
  assert.ok(took < EXIT_MS);
  assert.deepEqual(botsAt(code), [], `bots left running behind the table:\n${log}`);
  assert.match(log, /closing the table/);
});
