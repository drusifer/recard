import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDeckConfig, describeConfiguredZones, groupDeckChoicesByColor, configsForPreset } from '../src/hostSetup.js';

// US-144/D166: the pure/derivation half of main.js's host-setup cluster,
// unit-tested for the first time (moved unchanged from main.js).

test('describeDeckConfig: standard type is unnamed', () => {
  assert.equal(describeDeckConfig({ type: 'standard', numDecks: 1, jokers: 0 }), '1 deck, 0 jokers');
});

test('describeDeckConfig: non-standard type is named, plurals follow count', () => {
  assert.equal(describeDeckConfig({ type: 'rtg', numDecks: 2, jokers: 1 }), '2 rtg decks, 1 joker');
});

test('describeConfiguredZones: empty/absent declarations render as nothing', () => {
  assert.equal(describeConfiguredZones(null), '');
  assert.equal(describeConfiguredZones([]), '');
});

test('describeConfiguredZones: totals grouped by kind and scope, not one clause per declaration', () => {
  const piles = [
    { kind: 'foundation', count: 4 },
    { kind: 'cascade', count: 7 },
    { kind: 'stock', ownerId: 'perPlayer' },
  ];
  assert.equal(describeConfiguredZones(piles), '4 foundations + 7 cascades + 1 stock/player');
});

test('describeConfiguredZones: same kind+scope across multiple declarations sums, not concatenates', () => {
  const piles = [
    { kind: 'deck', ownerId: 'perPlayer' },
    { kind: 'deck', ownerId: 'perPlayer' },
    { kind: 'deck', ownerId: 'perPlayer' },
  ];
  assert.equal(describeConfiguredZones(piles), '3 decks/player');
});

test('groupDeckChoicesByColor: grouped by first colour, WUBRG order, colourless last', () => {
  const decks = [
    { name: 'Zeta', colors: ['G'] },
    { name: 'Alpha', colors: ['W'] },
    { name: 'Beta', colors: ['W', 'U'] },
    { name: 'Gamma', colors: [] },
  ];
  const groups = groupDeckChoicesByColor(decks);
  assert.deepEqual(groups.map((g) => g.color), ['W', 'G', null]);
  // Sorted by name within a group, not declaration order.
  assert.deepEqual(groups[0].decks.map((d) => d.name), ['Alpha', 'Beta']);
});

test('groupDeckChoicesByColor: a guild deck groups by its FIRST colour, not as its own pair', () => {
  const decks = [{ name: 'Azorius', colors: ['W', 'U'] }, { name: 'Selesnya', colors: ['G', 'W'] }];
  const groups = groupDeckChoicesByColor(decks);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.color), ['W', 'G']);
});

test('configsForPreset: deckConfig carries type/numDecks/jokers, deckList only when the preset declares one', () => {
  const preset = { name: 'War', numDecks: 1, jokers: 0 };
  const { deckConfig } = configsForPreset(preset, null, false);
  assert.deepEqual(deckConfig, { type: 'standard', numDecks: 1, jokers: 0 });
});

test('configsForPreset: gameConfig carries every declared field through unchanged', () => {
  const preset = {
    name: 'Gin Rummy', cardsPerPlayer: 10, cardSize: 'lg', tableCanvasSize: 2000,
    tableSpread: 0.5, playerLimit: 2, zones: [{ id: 'discard' }],
  };
  const { gameConfig } = configsForPreset(preset, null, true);
  assert.equal(gameConfig.allowsPlayerZones, true);
  assert.equal(gameConfig.presetName, 'Gin Rummy');
  assert.equal(gameConfig.cardsPerPlayer, 10);
  assert.equal(gameConfig.cardSize, 'lg');
  assert.equal(gameConfig.tableCanvasSize, 2000);
  assert.equal(gameConfig.tableSpread, 0.5);
  assert.equal(gameConfig.playerLimit, 2);
  assert.deepEqual(gameConfig.zones, [{ id: 'discard' }]);
});

test('configsForPreset: tableZone defaults true, deckIds filters piles via filterDeckChoicePiles', () => {
  const preset = { name: 'RtG', deckChoices: [{ id: 'a' }, { id: 'b' }], piles: [{ id: 'a', kind: 'deck' }, { id: 'b', kind: 'deck' }] };
  const { gameConfig } = configsForPreset(preset, ['a'], false);
  assert.equal(gameConfig.tableZone, true);
  assert.deepEqual(gameConfig.piles, [{ id: 'a', kind: 'deck' }]);
});
