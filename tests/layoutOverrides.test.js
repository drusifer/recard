import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAYOUT_OVERRIDES_KEY,
  loadLayoutOverrides,
  saveLayoutOverride,
  deleteLayoutOverride,
  overridesForPreset,
  stableLayoutSubset,
} from '../src/layoutOverrides.js';

// Same fake as tests/panelLayout.test.js - no browser.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('loadLayoutOverrides: nothing saved yet is {}, not an error', () => {
  assert.deepEqual(loadLayoutOverrides(fakeStorage()), {});
});

test('loadLayoutOverrides: a corrupt blob is discarded, treated as {}', () => {
  assert.deepEqual(loadLayoutOverrides(fakeStorage({ [LAYOUT_OVERRIDES_KEY]: 'not json{{{' })), {});
});

test('loadLayoutOverrides: hostile storage (throws on read) never throws, just returns {}', () => {
  const storage = { getItem: () => { throw new Error('nope'); } };
  assert.deepEqual(loadLayoutOverrides(storage), {});
});

test('saveLayoutOverride: writes an entry keyed by name, readable back with presetName/layout/savedAt', () => {
  const storage = fakeStorage();
  saveLayoutOverride(storage, 'War', 'War', { deck: { x: 1, y: 2 } }, () => 1000);
  const all = loadLayoutOverrides(storage);
  assert.deepEqual(all.War, { presetName: 'War', layout: { deck: { x: 1, y: 2 } }, savedAt: 1000 });
});

test('saveLayoutOverride: SaveAs under a different name does not disturb the existing one', () => {
  const storage = fakeStorage();
  saveLayoutOverride(storage, 'War', 'War', { deck: { x: 1, y: 2 } }, () => 1000);
  saveLayoutOverride(storage, 'My War Layout', 'War', { deck: { x: 9, y: 9 } }, () => 2000);
  const all = loadLayoutOverrides(storage);
  assert.equal(Object.keys(all).length, 2);
  assert.deepEqual(all.War.layout, { deck: { x: 1, y: 2 } });
  assert.deepEqual(all['My War Layout'].layout, { deck: { x: 9, y: 9 } });
});

test('saveLayoutOverride: saving under an existing name overwrites it (confirm-before-call is a UI concern, not this module\'s)', () => {
  const storage = fakeStorage();
  saveLayoutOverride(storage, 'War', 'War', { deck: { x: 1, y: 2 } }, () => 1000);
  saveLayoutOverride(storage, 'War', 'War', { deck: { x: 5, y: 5 } }, () => 2000);
  assert.deepEqual(loadLayoutOverrides(storage).War, { presetName: 'War', layout: { deck: { x: 5, y: 5 } }, savedAt: 2000 });
});

test('deleteLayoutOverride: removes only the named entry', () => {
  const storage = fakeStorage();
  saveLayoutOverride(storage, 'War', 'War', {}, () => 1000);
  saveLayoutOverride(storage, 'Solitaire', 'Solitaire', {}, () => 1000);
  deleteLayoutOverride(storage, 'War');
  const all = loadLayoutOverrides(storage);
  assert.equal('War' in all, false);
  assert.equal('Solitaire' in all, true);
});

test('deleteLayoutOverride: deleting a name that was never saved is a no-op, not an error', () => {
  const storage = fakeStorage();
  assert.doesNotThrow(() => deleteLayoutOverride(storage, 'nope'));
});

test('overridesForPreset: only returns entries whose recorded presetName matches', () => {
  const storage = fakeStorage();
  saveLayoutOverride(storage, 'War', 'War', {}, () => 1000);
  saveLayoutOverride(storage, 'Aggressive War', 'War', {}, () => 1000);
  saveLayoutOverride(storage, 'Solitaire', 'Solitaire', {}, () => 1000);
  const names = overridesForPreset(storage, 'War').map((o) => o.name).toSorted();
  assert.deepEqual(names, ['Aggressive War', 'War']);
});

test('overridesForPreset: no matches is [], not an error', () => {
  assert.deepEqual(overridesForPreset(fakeStorage(), 'Anything'), []);
});

// stableLayoutSubset (D61): a saved layout only covers the panels a
// FRESH game of this preset can reproduce by id - the shared/fixed ids
// (table-zone/score/deck) plus whatever this preset's own
// GameConfig.piles/GameConfig.zones declare. Player-created zones/piles
// get crypto.randomUUID() ids each session and are structurally
// excluded, not an oversight.

test('stableLayoutSubset: keeps the always-present shared ids', () => {
  const liveLayout = { 'table-zone': { x: 1, y: 1 }, score: { x: 2, y: 2 }, deck: { x: 3, y: 3 } };
  assert.deepEqual(stableLayoutSubset(liveLayout, {}), liveLayout);
});

test('stableLayoutSubset: keeps ids the active preset declares via GameConfig.piles/zones', () => {
  const liveLayout = { 'table-zone': { x: 1, y: 1 }, 'foundation-1': { x: 5, y: 5 } };
  const gameConfig = { piles: [{ id: 'foundation-1', kind: 'foundation' }], zones: [] };
  assert.deepEqual(stableLayoutSubset(liveLayout, gameConfig), liveLayout);
});

test('stableLayoutSubset: excludes a random-UUID id from a player-created zone/pile', () => {
  const liveLayout = {
    'table-zone': { x: 1, y: 1 },
    'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c': { x: 9, y: 9 },
  };
  assert.deepEqual(stableLayoutSubset(liveLayout, {}), { 'table-zone': { x: 1, y: 1 } });
});

test('stableLayoutSubset: excludes a per-player id (owner-id-derived, not known ahead of a new game)', () => {
  const liveLayout = { 'table-zone': { x: 1, y: 1 }, 'player-abc123': { x: 4, y: 4 }, 'hand:abc123': { x: 5, y: 5 } };
  assert.deepEqual(stableLayoutSubset(liveLayout, {}), { 'table-zone': { x: 1, y: 1 } });
});
