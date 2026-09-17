import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplyExternalValue } from '../src/components/spreadSliderGuard.js';

// The user's own warning, reduced to its testable core: an external
// (replicated-state) value update must never overwrite the slider's
// displayed position while the user's own pointer is still down on it
// - that's the drag-fighting bug this guard exists to prevent.
test('shouldApplyExternalValue: true while not dragging - external updates reflect normally', () => {
  assert.equal(shouldApplyExternalValue(false), true);
});

test('shouldApplyExternalValue: false while dragging - the component owns its own displayed position', () => {
  assert.equal(shouldApplyExternalValue(true), false);
});
