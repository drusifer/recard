// US-127/D151/AC8: the option set comes from resources, shrinks as they
// are spent, and ends at "pass" - no budget, no counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { legalOptions, onlyPassing } from '../tools/rtg/options.mjs';

const base = (over = {}) => ({
  me: {
    hand: [], battlefield: [], lands: [], graveyard: [], exile: [], life: 20,
    untapped_lands: { total: 2, by_color: { G: 2 } },
    ...over.me,
  },
  opponent: { hand_size: 7, battlefield: [], lands: [], graveyard: [], life: 20, ...over.opponent },
  stack: [],
  turn: { is_mine: true, phase: 'main', land_played: false, attackers: [], ...over.turn },
});
const card = (name, type, cost = '', cmc = 0, extra = {}) => ({ card: name, type, cost, cmc, colors: cost.includes('G') ? ['G'] : [], tapped: false, ...extra });
const ids = (state, tracked) => legalOptions(state, tracked).map((option) => option.id);

test('a land in hand is playable once, and not at all once the drop is spent', () => {
  const state = base({ me: { hand: [card('Forest', 'Land')] } });
  assert.ok(ids(state).includes('play_land:Forest'));
  assert.equal(ids({ ...state, turn: { ...state.turn, land_played: true } }).includes('play_land:Forest'), false);
});

test('only spells the untapped lands cover are castable - the arithmetic is code', () => {
  const state = base({ me: { hand: [card('Bear', 'Creature', '{1}{G}', 2), card('Dragon', 'Creature', '{5}{G}{G}', 7)] } });
  assert.ok(ids(state).includes('cast:Bear'));
  assert.equal(ids(state).includes('cast:Dragon'), false, 'two lands cannot cast a seven-drop');
});

test('a creature that arrived this turn cannot attack', () => {
  const state = base({ me: { battlefield: [card('Wolf', 'Creature'), card('Cub', 'Creature')] }, turn: { phase: 'combat' } });
  const available = ids(state, { arrivedThisTurn: ['Cub'] });
  assert.ok(available.includes('attack:Wolf'));
  assert.equal(available.includes('attack:Cub'), false);
});

test('a tapped creature neither attacks nor blocks', () => {
  const attacking = base({ me: { battlefield: [card('Wolf', 'Creature', '', 0, { tapped: true })] }, turn: { phase: 'combat' } });
  assert.equal(ids(attacking).includes('attack:Wolf'), false);
  const defending = base({ me: { battlefield: [card('Wolf', 'Creature', '', 0, { tapped: true })] }, turn: { is_mine: false, attackers: ['Ogre'] } });
  assert.equal(ids(defending).includes('block:Wolf'), false);
});

test('on the opponent\'s turn there is nothing to do until they attack', () => {
  const quiet = base({ me: { battlefield: [card('Wolf', 'Creature')] }, turn: { is_mine: false } });
  assert.deepEqual(ids(quiet), ['pass']);
  const attacked = base({ me: { battlefield: [card('Wolf', 'Creature')] }, turn: { is_mine: false, attackers: ['Ogre'] } });
  assert.deepEqual(ids(attacked), ['block:Wolf', 'take_damage', 'pass']);
});

test('the turn ends by running out of resources, not by a counter', () => {
  // Land played, nothing affordable, no untapped creature: only pass.
  const spent = base({
    me: { hand: [card('Dragon', 'Creature', '{5}{G}{G}', 7)], battlefield: [card('Wolf', 'Creature', '', 0, { tapped: true })], untapped_lands: { total: 0, by_color: {} } },
    turn: { land_played: true },
  });
  assert.deepEqual(ids(spent), ['pass']);
  assert.equal(onlyPassing(legalOptions(spent)), true);
});

test('passing is always offered, so the bot is never cornered', () => {
  for (const phase of ['untap', 'draw', 'main', 'combat', 'unknown']) {
    assert.ok(ids(base({ turn: { phase } })).includes('pass'), phase);
  }
});
