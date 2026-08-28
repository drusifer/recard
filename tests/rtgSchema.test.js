import test from 'node:test';
import assert from 'node:assert/strict';

import { parseManaCost, validateCard, validateCardPool } from '../tools/rtg/cardSchema.mjs';

// --- parseManaCost -----------------------------------------------------
//
// `cmc` and `colors` are DERIVED from the cost string, never authored
// (US-75/D77). Authoring them by hand is how a card pool drifts: a
// card's cost says one thing and its own `cmc` field says another, and
// the balance linter (US-76) then measures a curve that isn't real.

test('parseManaCost: generic-only cost', () => {
  assert.deepEqual(parseManaCost('{3}'), { cmc: 3, colors: [], symbols: ['3'] });
});

test('parseManaCost: single colored symbol costs 1 and contributes its color', () => {
  assert.deepEqual(parseManaCost('{W}'), { cmc: 1, colors: ['W'], symbols: ['W'] });
});

test('parseManaCost: generic + repeated colored symbols', () => {
  const result = parseManaCost('{2}{W}{W}');
  assert.equal(result.cmc, 4, '2 generic + 1 + 1');
  assert.deepEqual(result.colors, ['W'], 'a repeated color is listed once');
});

test('parseManaCost: multicolor cost lists colors in WUBRG order regardless of written order', () => {
  // WUBRG is Magic's own canonical color order - fixing it here means two
  // cards with the same colors always compare equal, which the balance
  // linter's colour-identity check depends on.
  assert.deepEqual(parseManaCost('{G}{W}').colors, ['W', 'G']);
  assert.deepEqual(parseManaCost('{B}{U}').colors, ['U', 'B']);
});

test('parseManaCost: {X} contributes 0 to cmc, per the real rule', () => {
  assert.equal(parseManaCost('{X}{R}').cmc, 1);
});

test('parseManaCost: a land has an empty cost, cmc 0, no colors', () => {
  assert.deepEqual(parseManaCost(''), { cmc: 0, colors: [], symbols: [] });
});

test('parseManaCost: rejects a malformed cost rather than silently scoring it 0', () => {
  assert.throws(() => parseManaCost('2W'), /mana cost/i, 'unbraced');
  assert.throws(() => parseManaCost('{Q}'), /mana cost/i, 'not a real symbol');
  assert.throws(() => parseManaCost('{}'), /mana cost/i, 'empty braces');
});

// --- validateCard ------------------------------------------------------

const validCreature = {
  id: 'rtg-w-001',
  name: 'Dawnbreak Vanguard',
  cost: '{1}{W}',
  type: 'Creature',
  subtype: 'Human Soldier',
  rarity: 'common',
  power: 2,
  toughness: 2,
  text: 'Vigilance',
  art: 'A dawn-lit soldier in white-gold plate raising a kite shield, heraldic banner, luminous rim light, high fantasy oil painting',
  flavor: '"The sun does not ask leave to rise. Neither do we." —Ser Calla of the Dawnbreak Legion',
};

test('validateCard: a well-formed creature has no errors', () => {
  assert.deepEqual(validateCard(validCreature), []);
});

test('validateCard: reports every missing required field, not just the first', () => {
  const errors = validateCard({ id: 'rtg-w-002' });
  // Reporting all at once matters for a 135-card pool: fixing one field
  // per compile run would be 135 round trips.
  assert.ok(errors.length > 1, `expected several errors, got ${errors.length}`);
  assert.ok(errors.some((error) => /name/.test(error)));
  assert.ok(errors.some((error) => /type/.test(error)));
  assert.ok(errors.some((error) => /art/.test(error)));
});

test('validateCard: a creature must carry power and toughness', () => {
  const { power, toughness, ...noStats } = validCreature;
  const errors = validateCard(noStats);
  assert.ok(errors.some((error) => /power/.test(error)));
  assert.ok(errors.some((error) => /toughness/.test(error)));
});

test('validateCard: a non-creature must NOT carry power or toughness', () => {
  const errors = validateCard({
    ...validCreature, id: 'rtg-w-003', type: 'Instant', subtype: undefined,
  });
  assert.ok(errors.some((error) => /power|toughness/.test(error)));
});

test('validateCard: rejects an unknown type and an unknown rarity', () => {
  assert.ok(validateCard({ ...validCreature, type: 'Vehicle' }).some((error) => /type/.test(error)));
  assert.ok(validateCard({ ...validCreature, rarity: 'legendary' }).some((error) => /rarity/.test(error)));
});

test('validateCard: a Land must have an empty cost', () => {
  const errors = validateCard({
    id: 'rtg-l-001', name: 'Plains', cost: '{W}', type: 'Land', rarity: 'common', text: '{T}: Add {W}.', art: 'rolling sunlit plains',
  });
  assert.ok(errors.some((error) => /land/i.test(error) && /cost/i.test(error)));
});

test('validateCard: surfaces a malformed cost as an error rather than throwing', () => {
  // The compiler validates a whole pool in one pass; one bad cost must
  // not abort the run and hide every other card's errors.
  const errors = validateCard({ ...validCreature, cost: '2W' });
  assert.ok(errors.some((error) => /mana cost/i.test(error)));
});

test('validateCard: every card must carry lore', () => {
  // Direct user request (2026-08-28): "add lore to the cards as well".
  // Required rather than optional so a 135-card pool can't quietly ship
  // with lore on only the cards that happened to get attention.
  const { flavor, ...noLore } = validCreature;
  assert.ok(validateCard(noLore).some((error) => /flavor/.test(error)));
});

test('validateCard: lore must be substantial, not a placeholder', () => {
  assert.ok(validateCard({ ...validCreature, flavor: 'wow' }).some((error) => /flavor/.test(error)));
});

test('validateCard: the art prompt must be substantial, not a placeholder', () => {
  // `art:` is the interface to real image generation later (D77). A
  // one-word value would compile fine and be useless as a prompt.
  const errors = validateCard({ ...validCreature, art: 'a guy' });
  assert.ok(errors.some((error) => /art/.test(error)));
});

// --- validateCardPool --------------------------------------------------

test('validateCardPool: catches duplicate ids across the pool', () => {
  const errors = validateCardPool([validCreature, { ...validCreature, name: 'Other' }]);
  assert.ok(errors.some((error) => /duplicate/i.test(error) && /rtg-w-001/.test(error)));
});

test('validateCardPool: a clean pool reports nothing', () => {
  assert.deepEqual(validateCardPool([validCreature, { ...validCreature, id: 'rtg-w-009' }]), []);
});
