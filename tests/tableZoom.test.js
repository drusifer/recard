import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_ZOOM_PRESETS, TABLE_ZOOM_DEFAULT, TABLE_ZOOM_MIN, TABLE_ZOOM_MAX, clampTableZoom, presetScale } from '../src/tableZoom.js';

// US-117 phase 111 (revised, D132, direct user correction): no
// auto-fit-to-content - the table zoom is fully player-driven, a dial
// (continuous) plus S/M/L/XL quick presets, with a sane default. Pure
// math only; the dial's own DOM wiring lives in main.js.

test('the default preset is a real preset value', () => {
  assert.ok(Object.hasOwn(TABLE_ZOOM_PRESETS, TABLE_ZOOM_DEFAULT));
});

test('presets are ordered S < M < L < XL', () => {
  const { S, M, L, XL } = TABLE_ZOOM_PRESETS;
  assert.ok(S < M && M < L && L < XL);
});

test('every preset is within the dial range', () => {
  for (const value of Object.values(TABLE_ZOOM_PRESETS)) {
    assert.ok(value >= TABLE_ZOOM_MIN && value <= TABLE_ZOOM_MAX);
  }
});

test('presetScale looks up a known preset', () => {
  assert.equal(presetScale('M'), TABLE_ZOOM_PRESETS.M);
});

test('presetScale rejects an unknown preset rather than returning undefined', () => {
  assert.throws(() => presetScale('XXL'));
});

test('clampTableZoom passes through an in-range value unchanged', () => {
  const mid = (TABLE_ZOOM_MIN + TABLE_ZOOM_MAX) / 2;
  assert.equal(clampTableZoom(mid), mid);
});

test('clampTableZoom clamps below the floor', () => {
  assert.equal(clampTableZoom(TABLE_ZOOM_MIN - 1), TABLE_ZOOM_MIN);
});

test('clampTableZoom clamps above the ceiling', () => {
  assert.equal(clampTableZoom(TABLE_ZOOM_MAX + 1), TABLE_ZOOM_MAX);
});
