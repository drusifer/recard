import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberHostSettings, recallHostSettings, HOST_SETTINGS_STORAGE } from '../src/hostSettings.js';

const store = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const SETTINGS = { name: 'Drew', presetName: 'War', allowsPlayerZones: true, expectedPlayers: 2, deckChoiceIds: null };

test('a remembered host setup round-trips', () => {
  const s = store();
  rememberHostSettings(s, SETTINGS);
  assert.deepEqual(recallHostSettings(s), SETTINGS);
});

test('deckChoiceIds round-trips as a real array, distinct from null', () => {
  const s = store();
  rememberHostSettings(s, { ...SETTINGS, presetName: 'Recard the Gathering', deckChoiceIds: ['rtg-guild-wu', 'rtg-mono-red'] });
  assert.deepEqual(recallHostSettings(s).deckChoiceIds, ['rtg-guild-wu', 'rtg-mono-red']);
});

test('no memory yet is null, not a crash', () => {
  assert.equal(recallHostSettings(store()), null);
});

test('a corrupt or half-written record means "no memory", not a broken prefill', () => {
  assert.equal(recallHostSettings(store({ [HOST_SETTINGS_STORAGE]: '{not json' })), null);
  assert.equal(recallHostSettings(store({ [HOST_SETTINGS_STORAGE]: '{"name":"Drew"}' })), null,
    'missing presetName must not produce a half-filled prefill');
});

test('a stored record only sets the fields it actually has - malformed extras fall back to safe defaults', () => {
  const s = store({ [HOST_SETTINGS_STORAGE]: JSON.stringify({ presetName: 'War', allowsPlayerZones: 'yes', expectedPlayers: 'lots', deckChoiceIds: 'not-an-array' }) });
  assert.deepEqual(recallHostSettings(s), { name: '', presetName: 'War', allowsPlayerZones: true, expectedPlayers: 0, deckChoiceIds: null });
});

test('hostile storage never throws', () => {
  const hostile = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.doesNotThrow(() => rememberHostSettings(hostile, SETTINGS));
  assert.equal(recallHostSettings(hostile), null);
});
