import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batchToken } from '../src/decks/batchToken.js';
import { buildDeck } from '../src/deck.js';

/* eslint-disable unicorn/no-unnecessary-global-this --
   These tests REPLACE the global `crypto` to simulate an insecure
   context, so `globalThis` is the subject here, not a redundant
   qualifier. Worth noting that this same rule is what prompted the
   change from `globalThis.crypto.randomUUID()` to `crypto.randomUUID()`
   in the deck builders - harmless in itself; the actual bug was calling
   `randomUUID` UNGUARDED, which the rule has no opinion about. */

/**
 * *fix (direct user report): "when pressing create table error:
 * crypto.randomUUID is not a function".
 *
 * `crypto.randomUUID` exists only in a SECURE CONTEXT. This app is
 * played by one machine hosting and others joining over plain HTTP by
 * LAN address — which is not one — so calling it bare threw and broke
 * Create Table for every preset with a chip supply. Two callers in this
 * codebase already guarded it (`randomPileId`, `newPlayerKey`); the deck
 * builders added in D108 did not.
 */

test('batchToken returns a short token', () => {
  const token = batchToken();
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 0 && token.length <= 12, `got "${token}"`);
});

test('batchToken is unique across calls - the only property the ids need', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => batchToken()));
  assert.equal(tokens.size, 200);
});

// The regression that matters: the guard, not the happy path. Simulates
// an insecure context, where `crypto` exists but `randomUUID` does not -
// exactly the shape of the reported error.
test('batchToken works where crypto.randomUUID is missing - an insecure context, i.e. plain HTTP over LAN', () => {
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: () => {} }, configurable: true });
    assert.doesNotThrow(() => batchToken());
    assert.ok(batchToken().length > 0);
    assert.notEqual(batchToken(), batchToken(), 'and is still unique without it');
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  }
});

test('a deck still builds where crypto.randomUUID is missing - the actual Create Table path', () => {
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: () => {} }, configurable: true });
    assert.doesNotThrow(() => buildDeck({ type: 'chips', deckList: 'poker-stack' }));
    assert.doesNotThrow(() => buildDeck({ type: 'rtg', deckList: 'rtg-mono-white' }));
    const first = buildDeck({ type: 'chips', deckList: 'poker-stack' }).map((chip) => chip.id);
    const second = new Set(buildDeck({ type: 'chips', deckList: 'poker-stack' }).map((chip) => chip.id));
    assert.ok(first.every((id) => !second.has(id)), 'and two builds still share no ids');
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  }
});
