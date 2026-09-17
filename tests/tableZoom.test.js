import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLE_ZOOM_PRESETS, TABLE_ZOOM_DEFAULT, TABLE_ZOOM_MIN, TABLE_ZOOM_MAX, clampTableZoom, presetScale,
  WHEEL_DRAG_RANGE_PX, zoomFromWheelDrag, zoomFromPinch, maxPan, clampPan,
} from '../src/tableZoom.js';

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

// --- The zoom wheel (direct user request, 2026-09-16): "like the zoom
// wheel on a mouse" but as its own manual control, not real scroll-wheel
// hijacking - a vertical drag control whose "tread" spins up to zoom in,
// down to zoom out. ---

test('zoomFromWheelDrag: spinning UP (negative deltaY) zooms IN', () => {
  const start = (TABLE_ZOOM_MIN + TABLE_ZOOM_MAX) / 2;
  assert.ok(zoomFromWheelDrag(start, -10) > start);
});

test('zoomFromWheelDrag: spinning DOWN (positive deltaY) zooms OUT', () => {
  const start = (TABLE_ZOOM_MIN + TABLE_ZOOM_MAX) / 2;
  assert.ok(zoomFromWheelDrag(start, 10) < start);
});

test('zoomFromWheelDrag: a full-range drag spans exactly MIN to MAX', () => {
  assert.equal(zoomFromWheelDrag(TABLE_ZOOM_MIN, -WHEEL_DRAG_RANGE_PX), TABLE_ZOOM_MAX);
  assert.equal(zoomFromWheelDrag(TABLE_ZOOM_MAX, WHEEL_DRAG_RANGE_PX), TABLE_ZOOM_MIN);
});

test('zoomFromWheelDrag: clamps past either end rather than overshooting', () => {
  assert.equal(zoomFromWheelDrag(TABLE_ZOOM_MAX, -9999), TABLE_ZOOM_MAX);
  assert.equal(zoomFromWheelDrag(TABLE_ZOOM_MIN, 9999), TABLE_ZOOM_MIN);
});

test('zoomFromWheelDrag: no movement is a no-op', () => {
  const start = (TABLE_ZOOM_MIN + TABLE_ZOOM_MAX) / 2;
  assert.equal(zoomFromWheelDrag(start, 0), start);
});

// --- Pinch-to-zoom (touch screens) -----------------------------------

test('zoomFromPinch: fingers spreading apart (ratio > 1) zooms in', () => {
  assert.ok(zoomFromPinch(TABLE_ZOOM_DEFAULT_VALUE(), 1.5) > TABLE_ZOOM_DEFAULT_VALUE());
});

test('zoomFromPinch: fingers pinching together (ratio < 1) zooms out', () => {
  assert.ok(zoomFromPinch(TABLE_ZOOM_DEFAULT_VALUE(), 0.5) < TABLE_ZOOM_DEFAULT_VALUE());
});

test('zoomFromPinch: ratio of exactly 1 (no change in finger distance) is a no-op', () => {
  const start = TABLE_ZOOM_DEFAULT_VALUE();
  assert.equal(zoomFromPinch(start, 1), start);
});

test('zoomFromPinch: clamps at the ceiling/floor same as any other zoom input', () => {
  assert.equal(zoomFromPinch(TABLE_ZOOM_MAX, 10), TABLE_ZOOM_MAX);
  assert.equal(zoomFromPinch(TABLE_ZOOM_MIN, 0.01), TABLE_ZOOM_MIN);
});

function TABLE_ZOOM_DEFAULT_VALUE() {
  return TABLE_ZOOM_PRESETS[TABLE_ZOOM_DEFAULT];
}

// --- Drag-to-pan (direct user request, 2026-09-16): "we'll also need
// to pan with drag on table". No pan mechanism existed anywhere in this
// codebase before this - `maxPan` is a deliberately simple heuristic
// (bound grows linearly with how far past 1x the table is zoomed in),
// tuned live rather than derived from real content measurement, same
// spirit as the zoom range itself being player-driven, not computed. ---

test('maxPan: zero at 1x or below - nothing to pan to when the table already fits', () => {
  assert.equal(maxPan(1), 0);
  assert.equal(maxPan(TABLE_ZOOM_MIN), 0);
});

test('maxPan: grows as zoom increases past 1x', () => {
  assert.ok(maxPan(TABLE_ZOOM_MAX) > maxPan(1.2));
  assert.ok(maxPan(1.2) > maxPan(1));
});

test('clampPan: passes an in-bounds offset through unchanged', () => {
  const bound = maxPan(TABLE_ZOOM_MAX);
  assert.deepEqual(clampPan({ x: bound / 2, y: -bound / 2 }, TABLE_ZOOM_MAX), { x: bound / 2, y: -bound / 2 });
});

test('clampPan: clamps past the bound in either direction, on either axis', () => {
  const bound = maxPan(TABLE_ZOOM_MAX);
  assert.deepEqual(clampPan({ x: bound + 500, y: -bound - 500 }, TABLE_ZOOM_MAX), { x: bound, y: -bound });
});

test('clampPan: at 1x zoom, any pan collapses to the origin', () => {
  assert.deepEqual(clampPan({ x: 200, y: -200 }, 1), { x: 0, y: 0 });
});
