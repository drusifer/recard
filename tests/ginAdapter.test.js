// `tools/gin/adapter.mjs`'s `strategies()` is what `jev/runner.mjs`
// (game-agnostic) validates `--strategy` against BEFORE anything else
// runs - a real bug, found live running `gin-evolve` for real: an
// evolved variant (tools/gin/evolve.mjs) has no entry in
// `allStrategyNames()` by design, so a perfectly real `GIN_VARIANT` run
// was refused as "unknown strategy" before `resolveStrategy` ever got
// a chance. Fixed in `adapter.mjs` specifically - the generic runner
// stays completely unaware this mechanism exists.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { adapter } from '../tools/gin/adapter.mjs';

afterEach(() => { delete process.env.GIN_VARIANT; });

test('strategies() lists every real registry name, with no GIN_VARIANT set', () => {
  const strategies = adapter.strategies();
  assert.ok(Object.hasOwn(strategies, 'knock-early'));
  assert.ok(Object.hasOwn(strategies, 'jev-balanced'));
  assert.equal(Object.keys(strategies).filter((name) => name.includes('-gen')).length, 0, 'no stray variant entry with the env var unset');
});

test('strategies() ALSO lists the current GIN_VARIANT\'s own one-off name - the real bug this pins down', () => {
  process.env.GIN_VARIANT = JSON.stringify({ name: 'gin-hunter-gen2-x7f3', base: 'gin-hunter', params: { chaseChance: 0.5 } });
  const strategies = adapter.strategies();
  assert.ok(Object.hasOwn(strategies, 'gin-hunter-gen2-x7f3'), 'the one variant this run is actually about must be a real, lookup-able key');
  assert.match(strategies['gin-hunter-gen2-x7f3'].description, /50%/);
});
