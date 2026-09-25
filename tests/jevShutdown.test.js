// D159: the two rules that keep a Ctrl-C shutdown honest, pure so they
// need no browser and no clock. Found by `tests/jevTable.browser.mjs`
// going red intermittently once shutdown genuinely ran: the "every bot
// finished" path and the SIGINT handler both called `shutdown()` at once,
// and the wait after SIGTERM slept its whole limit even when the bot had
// died in milliseconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once, waitUntilDead } from '../tools/jev/shutdown.mjs';

test('once: runs the function once however often it is asked, and everyone gets the same promise', async () => {
  let runs = 0;
  const stop = once(async () => { runs += 1; return 'done'; });
  const first = stop();
  const second = stop();
  assert.equal(first, second);
  assert.equal(await first, 'done');
  assert.equal(runs, 1);
  await stop();
  assert.equal(runs, 1, 'asked again after it finished, it still does not run twice');
});

test('once: says whether it has been asked yet, without asking', () => {
  let runs = 0;
  const stop = once(async () => { runs += 1; });
  assert.equal(stop.started(), false);
  assert.equal(runs, 0, 'asking whether it started does not start it');
  stop();
  assert.equal(stop.started(), true);
});

test('waitUntilDead: returns as soon as nothing is alive - it does not sit out the whole limit', async () => {
  const alive = new Set([1, 2]);
  let slept = 0;
  const sleep = async (ms) => { slept += ms; alive.delete([...alive][0]); }; // one dies per poll
  const left = await waitUntilDead({ pids: [1, 2], isAlive: (pid) => alive.has(pid), sleep, ms: 5000, pollMs: 100 });
  assert.deepEqual(left, []);
  assert.equal(slept, 200, 'two polls, not fifty');
});

test('waitUntilDead: gives up at the limit and says who is still standing', async () => {
  let slept = 0;
  const left = await waitUntilDead({ pids: [7], isAlive: () => true, sleep: async (ms) => { slept += ms; }, ms: 500, pollMs: 100 });
  assert.deepEqual(left, [7]);
  assert.equal(slept, 500);
});

test('waitUntilDead: nothing to wait for is not a wait', async () => {
  let slept = 0;
  const left = await waitUntilDead({ pids: [], isAlive: () => true, sleep: async (ms) => { slept += ms; }, ms: 5000 });
  assert.deepEqual(left, []);
  assert.equal(slept, 0);
});

test('waitUntilDead: a pid that is already gone is not waited for', async () => {
  let slept = 0;
  const left = await waitUntilDead({ pids: [3], isAlive: () => false, sleep: async (ms) => { slept += ms; }, ms: 5000 });
  assert.deepEqual(left, []);
  assert.equal(slept, 0);
});
