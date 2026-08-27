import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPanelLayout, savePanelPosition, savePanelSize, applyPresetLayout, PANEL_LAYOUT_KEY } from '../src/panelLayout.js';

/** Same fake as tests/persistence.test.js - no browser. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('loadPanelLayout: nothing saved yet is {}, not an error', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadPanelLayout(storage), {});
});

test('loadPanelLayout: a corrupt blob is discarded, treated as {}', () => {
  const storage = fakeStorage({ [PANEL_LAYOUT_KEY]: 'not json{{{' });
  assert.deepEqual(loadPanelLayout(storage), {});
});

test('loadPanelLayout: a blob that parses but is not an object (e.g. an array or a number) is discarded', () => {
  assert.deepEqual(loadPanelLayout(fakeStorage({ [PANEL_LAYOUT_KEY]: '[1,2,3]' })), {});
  assert.deepEqual(loadPanelLayout(fakeStorage({ [PANEL_LAYOUT_KEY]: '42' })), {});
});

test('loadPanelLayout: hostile storage (throws on read) never throws, just returns {}', () => {
  const storage = { getItem: () => { throw new Error('nope'); } };
  assert.deepEqual(loadPanelLayout(storage), {});
});

// *nit (2026-08-26) history: `savePanelPosition` was briefly deleted
// ("remove pointer-based panel behavior"), then directly restored -
// "zones can be moved anywhere on the table, it was working great
// until you broke it." Full coverage restored below, matching its
// original shape.

test('savePanelPosition: sets a panel\'s x/y, keyed by id, readable back via loadPanelLayout', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'deck', 12, 34);
  assert.deepEqual(loadPanelLayout(storage), { deck: { x: 12, y: 34 } });
});

test('savePanelSize: sets a panel\'s w/h, keyed by id', () => {
  const storage = fakeStorage();
  savePanelSize(storage, 'deck', 22, 30);
  assert.deepEqual(loadPanelLayout(storage), { deck: { w: 22, h: 30 } });
});

test('savePanelPosition then savePanelSize on the same panel: neither clobbers the other', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'deck', 12, 34);
  savePanelSize(storage, 'deck', 22, 30);
  assert.deepEqual(loadPanelLayout(storage), { deck: { x: 12, y: 34, w: 22, h: 30 } });
});

test('savePanelPosition/savePanelSize: a second panel does not disturb the first', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'deck', 12, 34);
  savePanelPosition(storage, 'score', 90, 5);
  assert.deepEqual(loadPanelLayout(storage), { deck: { x: 12, y: 34 }, score: { x: 90, y: 5 } });
});

test('savePanelPosition: moving the same panel again overwrites its old position, keeps its size', () => {
  const storage = fakeStorage();
  savePanelSize(storage, 'deck', 22, 30);
  savePanelPosition(storage, 'deck', 12, 34);
  savePanelPosition(storage, 'deck', 55, 60);
  assert.deepEqual(loadPanelLayout(storage), { deck: { w: 22, h: 30, x: 55, y: 60 } });
});

test('savePanelPosition/savePanelSize: hostile storage (throws on write) never throws', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
  };
  assert.doesNotThrow(() => savePanelPosition(storage, 'deck', 1, 2));
  assert.doesNotThrow(() => savePanelSize(storage, 'deck', 1, 2));
});

// --- applyPresetLayout (US-15 follow-up: a preset MAY seed the local
// layout for its own shared, deterministically-id'd panels) ---

test('applyPresetLayout: seeds an empty layout wholesale', () => {
  const storage = fakeStorage();
  applyPresetLayout(storage, { 'table-zone': { x: 1, y: 2, w: 3, h: 4 } });
  assert.deepEqual(loadPanelLayout(storage), { 'table-zone': { x: 1, y: 2, w: 3, h: 4 } });
});

test('applyPresetLayout: an id the preset declares REPLACES this browser\'s own prior entry for it wholesale, not a field-by-field merge', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'table-zone', 999, 999);
  savePanelSize(storage, 'table-zone', 999, 999);
  applyPresetLayout(storage, { 'table-zone': { x: 1, y: 2, w: 3, h: 4 } });
  assert.deepEqual(loadPanelLayout(storage)['table-zone'], { x: 1, y: 2, w: 3, h: 4 });
});

test('applyPresetLayout: leaves every OTHER id already in storage untouched', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'score', 10, 20);
  applyPresetLayout(storage, { 'table-zone': { x: 1, y: 2, w: 3, h: 4 } });
  assert.deepEqual(loadPanelLayout(storage), {
    score: { x: 10, y: 20 },
    'table-zone': { x: 1, y: 2, w: 3, h: 4 },
  });
});

test('applyPresetLayout: a preset with no layout at all (undefined) is a no-op, not a crash', () => {
  const storage = fakeStorage();
  savePanelPosition(storage, 'score', 10, 20);
  assert.doesNotThrow(() => applyPresetLayout(storage, undefined));
  assert.deepEqual(loadPanelLayout(storage), { score: { x: 10, y: 20 } });
});

test('applyPresetLayout: hostile storage (throws on write) never throws', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); } };
  assert.doesNotThrow(() => applyPresetLayout(storage, { 'table-zone': { x: 1, y: 2 } }));
});
