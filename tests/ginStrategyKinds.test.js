import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStrategy, allStrategyNames } from '../tools/gin/strategyKinds.mjs';

afterEach(() => { delete process.env.GIN_VARIANT; });

test('a rule-list strategy resolves from the static registry, kind "rules"', () => {
  const strategy = resolveStrategy('knock-early');
  assert.equal(strategy.kind, 'rules');
  assert.equal(strategy.usesJev, false);
});

test('a question-file strategy resolves from the players directory, kind "questions"', () => {
  const strategy = resolveStrategy('jev-balanced');
  assert.equal(strategy.kind, 'questions');
  assert.equal(strategy.usesJev, true);
});

test('an unknown name with no GIN_VARIANT set is refused, naming real choices', () => {
  assert.throws(() => resolveStrategy('nope'), /unknown gin strategy "nope"/);
});

// --- tools/gin/evolve.mjs's own channel: a generated variant with no
// registry entry, reached only via GIN_VARIANT (set on a spawned bot's
// OWN env, never process-wide) - an ordinary run never touches this.

test('GIN_VARIANT resolves a named variant of a base strategy, with its own params applied', () => {
  process.env.GIN_VARIANT = JSON.stringify({ base: 'gin-hunter', params: { chaseChance: 0.5 } });
  const strategy = resolveStrategy('gin-hunter-gen2-x7f3');
  assert.equal(strategy.kind, 'rules');
  assert.equal(strategy.usesJev, true);
  assert.match(strategy.description, /50%/, 'the overridden chaseChance reached the real factory');
});

test('a registry hit is still checked FIRST - GIN_VARIANT never shadows a real strategy name', () => {
  process.env.GIN_VARIANT = JSON.stringify({ base: 'defensive', params: {} });
  const strategy = resolveStrategy('knock-early'); // a REAL name, present regardless of the env var
  assert.equal(strategy.name, 'knock-early');
  assert.equal(strategy.usesJev, false, 'resolved the real knock-early, not a defensive variant wearing its name');
});

test('GIN_VARIANT naming an unknown base strategy is refused, not silently ignored', () => {
  process.env.GIN_VARIANT = JSON.stringify({ base: 'nope', params: {} });
  assert.throws(() => resolveStrategy('some-variant'), /GIN_VARIANT names an unknown base strategy "nope"/);
});

test('allStrategyNames never lists a variant - only the real, resolvable-without-env names', () => {
  process.env.GIN_VARIANT = JSON.stringify({ base: 'gin-hunter', params: {} });
  assert.ok(!allStrategyNames().includes('gin-hunter-gen2-x7f3'));
});
