import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Zone } from '../src/zones/Zone.js';
import { SharedZone } from '../src/zones/SharedZone.js';
import { PerPlayerZone } from '../src/zones/PerPlayerZone.js';

// Test-audit gap (2026-09-11): no test file for src/zones/* existed at
// all before this - `Zone.viewerRelation`, a small pure function that
// decides "you"/"opponent"/null for every zone every render, had never
// been exercised directly by any unit test.

test('Zone: viewerRelation is null for an ownerless (shared) zone', () => {
  assert.equal(Zone.viewerRelation({ ownerId: null }, 'me'), null);
});

test('Zone: viewerRelation is "you" when the viewer owns the zone', () => {
  assert.equal(Zone.viewerRelation({ ownerId: 'me' }, 'me'), 'you');
});

test('Zone: viewerRelation is "opponent" for someone else\'s zone', () => {
  assert.equal(Zone.viewerRelation({ ownerId: 'them' }, 'me'), 'opponent');
});

test('Zone: base defaultPosition leaves a zone in normal flex flow (null)', () => {
  assert.equal(Zone.defaultPosition(), null);
});

test('Zone: contentComponent defaults to zone-panel', () => {
  assert.equal(Zone.contentComponent, 'zone-panel');
});

test('SharedZone: registered with no overrides - same defaults as the base Zone', () => {
  assert.equal(SharedZone.className, null);
  assert.equal(SharedZone.defaultPosition(), null);
});

test('PerPlayerZone: className marks it as a seat zone', () => {
  assert.equal(PerPlayerZone.className, 'seat-zone');
});

test('PerPlayerZone: defaultPosition delegates to seatPosition with a fixed radius', () => {
  const solo = PerPlayerZone.defaultPosition(0, 1);
  // seating.js's own tests cover the geometry itself; this just proves
  // the wiring - a real {leftPct,topPct} pair, not the base Zone's null.
  assert.ok(solo && typeof solo.leftPct === 'number' && typeof solo.topPct === 'number');
});

test('PerPlayerZone: inherits viewerRelation unchanged from the base Zone', () => {
  assert.equal(PerPlayerZone.viewerRelation({ ownerId: 'me' }, 'me'), 'you');
});
