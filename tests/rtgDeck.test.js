import test from 'node:test';
import assert from 'node:assert/strict';

import {
  landColorSources, deckStats, validateDeck, ARCHETYPE_LAND_BANDS,
} from '../tools/rtg/deckSchema.mjs';

// --- fixtures ----------------------------------------------------------
//
// A pool builder rather than literal decks: a balance rule is only
// meaningfully tested by perturbing ONE dimension of an otherwise-legal
// deck, which needs a legal deck that's cheap to vary.

function card(id, overrides = {}) {
  return {
    id, name: id, cost: '{1}{W}', cmc: 2, colors: ['W'], type: 'Creature',
    rarity: 'common', power: 2, toughness: 2, text: '', art: 'x'.repeat(40),
    flavor: 'y'.repeat(20), ...overrides,
  };
}

const plains = card('plains', {
  cost: '', cmc: 0, colors: [], type: 'Land', subtype: 'Basic Land — Plains',
  text: '{T}: Add {W}.', power: undefined, toughness: undefined,
});
const island = card('island', {
  cost: '', cmc: 0, colors: [], type: 'Land', subtype: 'Basic Land — Island',
  text: '{T}: Add {U}.', power: undefined, toughness: undefined,
});
const dual = card('dual-wu', {
  cost: '', cmc: 0, colors: [], type: 'Land', subtype: 'Land',
  text: '{T}: Add {W} or {U}. This land enters tapped.',
  power: undefined, toughness: undefined,
});

/** A legal 60-card mono-white midrange deck: 24 lands + 36 spells, with
 * a left-skewed curve (16 one/two-drops, 4 five-drops). */
function legalDeck(overrides = {}) {
  return {
    id: 'mono-white', name: 'Dawnbreak Legion', colors: ['W'], archetype: 'midrange',
    cards: [
      { id: 'plains', count: 24 },
      { id: 'w-1', count: 4 }, { id: 'w-2', count: 4 }, { id: 'w-3', count: 4 },
      { id: 'w-4', count: 4 }, { id: 'w-5', count: 4 }, { id: 'w-6', count: 4 },
      { id: 'w-7', count: 4 }, { id: 'w-8', count: 4 },
      { id: 'w-big', count: 4 },
    ],
    ...overrides,
  };
}

const pool = new Map([
  [plains.id, plains], [island.id, island], [dual.id, dual],
  ...[1, 2, 3, 4].map((n) => [`w-${n}`, card(`w-${n}`, { cost: '{W}', cmc: 1 })]),
  ...[5, 6, 7, 8].map((n) => [`w-${n}`, card(`w-${n}`, { cost: '{1}{W}', cmc: 2 })]),
  ['w-mid', card('w-mid', { cost: '{2}{W}', cmc: 3 })],
  ['w-big', card('w-big', { cost: '{4}{W}', cmc: 5 })],
  ['u-1', card('u-1', { cost: '{U}', cmc: 1, colors: ['U'] })],
]);

// --- landColorSources --------------------------------------------------
//
// Parsed from the land's own rules text, not from its subtype - that
// keeps ONE source of truth and makes duals work without a second
// mechanism.

test('landColorSources: reads the produced color out of a basic land\'s text', () => {
  assert.deepEqual(landColorSources(plains), ['W']);
  assert.deepEqual(landColorSources(island), ['U']);
});

test('landColorSources: a dual land produces both of its colors', () => {
  assert.deepEqual(landColorSources(dual), ['W', 'U']);
});

test('landColorSources: a nonland produces nothing, even if its text mentions mana', () => {
  const ritual = card('ritual', { type: 'Instant', text: 'Add {R}{R}.', power: undefined, toughness: undefined });
  assert.deepEqual(landColorSources(ritual), []);
});

// --- deckStats ---------------------------------------------------------

test('deckStats: counts size, lands and spells', () => {
  const stats = deckStats(legalDeck(), pool);
  assert.equal(stats.size, 60);
  assert.equal(stats.lands, 24);
  assert.equal(stats.spells, 36);
});

test('deckStats: buckets the mana curve by cmc, lands excluded', () => {
  const stats = deckStats(legalDeck(), pool);
  // Lands are cmc 0 but are not spells - counting them would make every
  // deck look like it had a superb early curve.
  assert.equal(stats.curve[0] ?? 0, 0, 'no cmc-0 spells');
  assert.equal(stats.curve[1], 16);
  assert.equal(stats.curve[2], 16);
  assert.equal(stats.curve[5], 4);
});

test('deckStats: counts color sources, duals counting for both colors', () => {
  const twoColor = legalDeck({
    colors: ['W', 'U'],
    cards: [{ id: 'plains', count: 12 }, { id: 'dual-wu', count: 12 }, { id: 'w-1', count: 4 }],
  });
  const stats = deckStats(twoColor, pool);
  assert.equal(stats.sources.W, 24, '12 plains + 12 duals');
  assert.equal(stats.sources.U, 12, 'duals only');
});

// --- validateDeck ------------------------------------------------------

test('validateDeck: a legal deck reports nothing', () => {
  assert.deepEqual(validateDeck(legalDeck(), pool), []);
});

test('validateDeck: deck must be exactly 60 cards', () => {
  const short = legalDeck({ cards: [{ id: 'plains', count: 24 }, { id: 'w-1', count: 4 }] });
  assert.ok(validateDeck(short, pool).some((error) => /60/.test(error)));
});

test('validateDeck: at most 4 copies of a nonland card', () => {
  const greedy = legalDeck({
    cards: [{ id: 'plains', count: 24 }, { id: 'w-1', count: 5 }, { id: 'w-2', count: 31 }],
  });
  assert.ok(validateDeck(greedy, pool).some((error) => /4 copies|w-1/.test(error)));
});

test('validateDeck: basic lands are exempt from the 4-copy limit', () => {
  // 24 Plains is legal and universal; the copy limit must not catch it.
  assert.deepEqual(validateDeck(legalDeck(), pool), []);
});

test('validateDeck: land count must sit in the archetype band', () => {
  // Same 60 cards, only the archetype LABEL changes - so this asserts the
  // band is really being applied, not that some other rule tripped.
  const asAggro = legalDeck({ archetype: 'control' });
  const errors = validateDeck(asAggro, pool);
  assert.ok(errors.some((error) => /land/i.test(error)), '24 lands is below the control band');
});

test('validateDeck: rejects an unknown archetype rather than skipping the land check', () => {
  assert.ok(validateDeck(legalDeck({ archetype: 'combo' }), pool).some((error) => /archetype/.test(error)));
});

test('validateDeck: curve must be left-skewed — too few cheap spells fails', () => {
  // All 36 spells at cmc 3: not expensive enough to trip the cmc>=5
  // rule, so this isolates the "too few cheap spells" rule specifically.
  const topHeavy = legalDeck({
    cards: [{ id: 'plains', count: 24 }, { id: 'w-mid', count: 36 }],
  });
  const errors = validateDeck(topHeavy, pool);
  assert.ok(errors.some((error) => /cheap/i.test(error)), errors.join('; '));
  assert.ok(errors.every((error) => !/expensive/i.test(error)), 'must not also trip the expensive rule');
});

test('validateDeck: curve must be left-skewed — too many expensive spells fails', () => {
  const bloated = legalDeck({
    cards: [{ id: 'plains', count: 24 }, { id: 'w-1', count: 16 }, { id: 'w-big', count: 20 }],
  });
  assert.ok(validateDeck(bloated, pool).some((error) => /curve|expensive/i.test(error)));
});

test('validateDeck: every card colour must be inside the deck colours', () => {
  const splashed = legalDeck({
    cards: [{ id: 'plains', count: 24 }, { id: 'w-1', count: 4 }, { id: 'u-1', count: 4 }, { id: 'w-2', count: 28 }],
  });
  assert.ok(validateDeck(splashed, pool).some((error) => /colou?r/i.test(error) && /u-1/.test(error)));
});

test('validateDeck: a two-colour deck needs enough sources of each colour', () => {
  const starved = {
    id: 'wu', name: 'Concord Oath', colors: ['W', 'U'], archetype: 'midrange',
    cards: [
      { id: 'plains', count: 22 }, { id: 'island', count: 2 },
      { id: 'w-1', count: 4 }, { id: 'w-2', count: 4 }, { id: 'w-3', count: 4 },
      { id: 'w-4', count: 4 }, { id: 'w-5', count: 4 }, { id: 'w-6', count: 4 },
      { id: 'w-7', count: 4 }, { id: 'w-8', count: 4 }, { id: 'u-1', count: 4 },
    ],
  };
  assert.ok(validateDeck(starved, pool).some((error) => /source/i.test(error) && /U/.test(error)));
});

test('validateDeck: an unknown card id is reported, not silently skipped', () => {
  const typo = legalDeck({ cards: [{ id: 'plains', count: 24 }, { id: 'w-nope', count: 36 }] });
  assert.ok(validateDeck(typo, pool).some((error) => /w-nope/.test(error)));
});

test('ARCHETYPE_LAND_BANDS: the published bands match the researched guidance', () => {
  // Guarding the numbers themselves - they are the whole basis of the
  // land check and are easy to "tidy" into something unsourced.
  assert.deepEqual(ARCHETYPE_LAND_BANDS.aggro, [20, 23]);
  assert.deepEqual(ARCHETYPE_LAND_BANDS.midrange, [24, 25]);
  assert.deepEqual(ARCHETYPE_LAND_BANDS.control, [25, 27]);
});
