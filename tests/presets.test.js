import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets.js';
import { RULES_REFERENCE } from '../src/rulesReference.js';

test('every preset has a config the host UI can use directly', () => {
  for (const preset of PRESETS) {
    assert.ok(preset.name, 'preset needs a name');
    assert.ok(preset.numDecks >= 1);
    assert.ok(preset.jokers >= 0);
    assert.ok(preset.cardsPerPlayer >= 1);
    assert.equal(typeof preset.usesMiddle, 'boolean');
  }
});

test('every preset has a matching rules-reference entry (Smith Gate 1: linked, not disconnected)', () => {
  for (const preset of PRESETS) {
    assert.ok(
      RULES_REFERENCE[preset.name],
      `preset "${preset.name}" has no matching entry in RULES_REFERENCE`,
    );
  }
});

test('every rules-reference entry has the same consistent shape', () => {
  for (const [name, entry] of Object.entries(RULES_REFERENCE)) {
    assert.equal(typeof entry.goal, 'string', `${name}.goal`);
    assert.equal(typeof entry.setup, 'string', `${name}.setup`);
    assert.equal(typeof entry.turns, 'string', `${name}.turns`);
    assert.ok(entry.goal.length > 0 && entry.setup.length > 0 && entry.turns.length > 0);
  }
});
