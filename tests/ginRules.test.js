import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFacts, meldPaths, ginChance } from '../tools/gin/rules.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => {
  const rank = short.slice(0, -1);
  const suit = SUITS[short.at(-1)];
  return { id: `${rank}-${suit}-0`, rank, suit };
};
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);

function observation({ hand, discardPile = '', phase = 'discard', stockDrawn = 3, stockCount = 29, opponentTook = '', opponentDiscards = '', takenFromDiscard = null }) {
  return {
    handNumber: 1, phase, outcome: null, hand: cards(hand), discardPile: cards(discardPile),
    stockCount, stockDrawn, opponentHandSize: 10, opponentDiscards: cards(opponentDiscards),
    opponentTook: cards(opponentTook), myDiscards: [], takenFromDiscard,
  };
}

test('meldPaths: the 3-card melds a card can still join - A/K 4, Q/2 5, 3..J 6 - minus paths through dead cards', () => {
  const open = observation({ hand: '5c' });
  assert.deepEqual(['As', 'Ks', 'Qs', '2s', '7s', 'Js'].map((short) => meldPaths(card(short), open)), [4, 4, 5, 5, 6, 6]);
  // With 6s and 8s gone, 5-6-7, 6-7-8 and 7-8-9 of spades all die.
  const dead = observation({ hand: '5c', discardPile: '6s 8s' });
  assert.equal(meldPaths(card('7s'), dead), 3, 'only the three sets remain');
});

test('stage: early before 8 stock draws, middle before 17, late after (AAAI equilibrium thresholds)', () => {
  const stage = (stockDrawn) => computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd 4c', stockDrawn })).stage;
  assert.deepEqual([0, 7, 8, 16, 17].map((drawn) => stage(drawn)), ['early', 'early', 'middle', 'middle', 'late']);
});

test('discard phase: every legal discard with its deadwood after, best first; knock and gin flags', () => {
  const facts = computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d 7c' }));
  assert.equal(facts.bestDiscard.card.id, '7-clubs-0');
  assert.equal(facts.deadwood, 5);
  assert.equal(facts.canKnock, true);
  assert.equal(facts.isGin, false);
  assert.equal(facts.discards.length, 11);

  const gin = computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d 5h' }));
  assert.equal(gin.canKnock, true);
  assert.equal(gin.isGin, false, 'one 5 is left over whichever is thrown');
  const real = computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 10s Kd' }));
  assert.equal(real.isGin, true);
  assert.equal(real.bestDiscard.card.id, 'K-diamonds-0');
});

test('the card just taken from the discard pile is not a legal discard', () => {
  const facts = computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d 7c', takenFromDiscard: '7-clubs-0' }));
  assert.ok(facts.discards.every((option) => option.card.id !== '7-clubs-0'));
  assert.equal(facts.bestDiscard.card.id, '5-diamonds-0');
});

test('draw phase: the upcard\'s deadwood gain and whether it lands in a meld', () => {
  const facts = computeFacts(observation({ hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd', discardPile: '2c 9s', phase: 'draw' }));
  assert.equal(facts.upcard.id, '9-spades-0');
  assert.equal(facts.upcardMelds, true);
  assert.equal(facts.deadwood, 9 + 9 + 10 + 10 + 5 + 7 + 10);
  // With 9s: melds A23h + 999, discard Kd -> deadwood Js Qs 5d 7c = 32.
  assert.equal(facts.upcardGain, 60 - 32);
  assert.equal(facts.canKnock, false, 'knocking is only ever a discard-phase call');
});

test('gin outs: unseen cards that complete gin after the best discard; dead cards are not outs', () => {
  // Discard Kc -> A234h + four 9s + 5d6d: 4d or 7d makes all 11 melded,
  // and a 9 (the set of four) is the gin discard.
  const facts = computeFacts(observation({ hand: 'Ah 2h 3h 4h 9c 9d 9s 9h 5d 6d Kc' }));
  assert.equal(facts.bestDiscard.card.id, 'K-clubs-0');
  assert.equal(facts.unseen, 52 - 11);
  assert.equal(facts.ginOuts, 2);
  const deadSeven = computeFacts(observation({ hand: 'Ah 2h 3h 4h 9c 9d 9s 9h 5d 6d Kc', discardPile: '7d' }));
  assert.equal(deadSeven.ginOuts, 1);
});

test('ginChance: probability of at least one out in k draws from the unseen cards', () => {
  assert.equal(ginChance({ outs: 0, unseen: 30 }, 3), 0);
  assert.equal(ginChance({ outs: 30, unseen: 30 }, 1), 1);
  assert.ok(Math.abs(ginChance({ outs: 3, unseen: 30 }, 1) - 0.1) < 1e-9);
  assert.ok(Math.abs(ginChance({ outs: 2, unseen: 40 }, 3) - (1 - (38 / 40) * (37 / 39) * (36 / 38))) < 1e-9);
});
