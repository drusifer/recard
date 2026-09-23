// US-127/D151: the RtG projection. Every number comes from code; a
// constraint may cite one by path but never derives one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRtgState, manaAvailable, canPay } from '../tools/rtg/playState.mjs';

const land = (id, colors, isTapped = false) => ({ id, name: id, type: 'Land', cost: '', cmc: 0, colors, ...(isTapped && { orientation: 'landscape' }) });
const creature = (id, cost, cmc, colors, extra = {}) => ({ id, name: id, type: 'Creature', cost, cmc, colors, power: 2, toughness: 2, ...extra });

const view = {
  myHand: [creature('Bear', '{1}{G}', 2, ['G']), land('Forest', ['G'])],
  otherHandCounts: { them: 5 },
  scores: { me: 20, them: 17 },
  players: [{ id: 'me' }, { id: 'them' }],
  piles: [
    { kind: 'lands', ownerId: 'me', cards: [land('Forest1', ['G']), land('Forest2', ['G'], true)] },
    { kind: 'battlefield', ownerId: 'me', cards: [creature('Wolf', '{2}{G}', 3, ['G'], { orientation: 'landscape' })] },
    { kind: 'discard', ownerId: 'me', cards: [] },
    { kind: 'exile', ownerId: 'me', cards: [] },
    { kind: 'battlefield', ownerId: 'them', cards: [creature('Ogre', '{3}{R}', 4, ['R'])] },
    { kind: 'lands', ownerId: 'them', cards: [land('Mountain', ['R'])] },
    { kind: 'discard', ownerId: 'them', cards: [] },
    { kind: 'stack', ownerId: null, cards: [] },
  ],
};
const turn = { is_mine: true, phase: 'main', land_played: false, attackers: [] };

test('life comes off the Score panel the app already replicates', () => {
  const state = buildRtgState(view, 'me', turn);
  assert.equal(state.me.life, 20);
  assert.equal(state.opponent.life, 17);
});

test('tapped is read from the card\'s orientation - Recard taps by rotating', () => {
  const state = buildRtgState(view, 'me', turn);
  assert.equal(state.me.lands.find((c) => c.card === 'Forest2').tapped, true);
  assert.equal(state.me.lands.find((c) => c.card === 'Forest1').tapped, false);
  assert.equal(state.me.battlefield[0].tapped, true, 'a tapped creature reads as tapped');
});

test('mana available is counted in code: one per untapped land, by colour', () => {
  assert.deepEqual(manaAvailable([land('a', ['G']), land('b', ['G'], true), land('c', ['U'])].map((c) => ({ ...c, tapped: c.orientation === 'landscape' }))),
    { total: 2, by_color: { G: 1, U: 1 } });
});

test('whether a cost can be paid is computed, never asked', () => {
  const mana = { total: 2, by_color: { G: 1, U: 1 } };
  assert.equal(canPay('{1}{G}', mana), true);
  assert.equal(canPay('{G}{G}', mana), false, 'one green land cannot pay two green pips');
  assert.equal(canPay('{3}', mana), false, 'three generic needs three lands');
  assert.equal(canPay('', mana), true, 'a land costs nothing');
});

test('the opponent has a hand SIZE, and their battlefield is public', () => {
  const state = buildRtgState(view, 'me', turn);
  assert.equal(state.opponent.hand_size, 5);
  assert.equal(state.opponent.battlefield[0].card, 'Ogre');
  assert.equal('hand' in state.opponent, false);
});

test('the turn is what the bot has been TOLD, since Recard has no turn concept', () => {
  const state = buildRtgState(view, 'me', { is_mine: false, phase: 'combat', land_played: true, attackers: ['Ogre'] });
  assert.deepEqual(state.turn, { is_mine: false, phase: 'combat', land_played: true, attackers: ['Ogre'] });
});

test('a land in the battlefield pile still counts as a land for mana', () => {
  const withLandOnBattlefield = { ...view, piles: view.piles.map((pile) => (pile.kind === 'battlefield' && pile.ownerId === 'me'
    ? { ...pile, cards: [...pile.cards, land('Stray', ['U'])] } : pile)) };
  const state = buildRtgState(withLandOnBattlefield, 'me', turn);
  assert.equal(state.me.untapped_lands.by_color.U, 1, 'players drop lands wherever they like - the app has no rules zone');
  assert.equal(state.me.battlefield.some((c) => c.card === 'Stray'), false, 'and it is not also a creature');
});
