import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGIES, decide, knockEarly, ginHunter, equilibrium, defensive } from '../tools/gin/strategies.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)] });
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);
const idOf = (short) => card(short).id;

function context({ hand, phase = 'discard', discardPile = '', stockDrawn = 3, stockCount = 29, threat = 0, helps = {} }) {
  const obs = {
    handNumber: 1, phase, outcome: null, hand: cards(hand), discardPile: cards(discardPile),
    stockCount, stockDrawn, opponentHandSize: 10, opponentDiscards: [], opponentTook: [], myDiscards: [], takenFromDiscard: null,
  };
  const helpsById = Object.fromEntries(Object.entries(helps).map(([short, value]) => [idOf(short), value]));
  return { obs, facts: computeFacts(obs), jev: phase === 'discard' ? { threat, threatConfidence: 0.8, helps: helpsById, model: 'fake' } : null };
}

const KNOCKABLE = 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d 7c'; // discard 7c -> deadwood 5
const GIN = 'Ah 2h 3h 9c 9d 9s Js Qs Ks 10s Kd'; // discard Kd -> gin
const WAITING = 'Ah 2h 3h 4h 9c 9d 9s 9h 2d 3d Kc'; // discard Kc -> deadwood 5, outs Ad/4d
const HEAVY = 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd 4c'; // no knock in sight

test('the registry names every strategy, and says which ones call Jev', () => {
  assert.deepEqual(Object.keys(STRATEGIES), ['knock-early', 'gin-hunter', 'equilibrium', 'defensive']);
  assert.equal(STRATEGIES['knock-early'].usesJev, false);
  assert.ok(['gin-hunter', 'equilibrium', 'defensive'].every((name) => STRATEGIES[name].usesJev));
});

test('draw: take the upcard only when it lands in a meld; no upcard means the stock', () => {
  const melds = decide(knockEarly(), context({ hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd', phase: 'draw', discardPile: '9s' }));
  assert.deepEqual(melds.decision, { type: 'draw', source: 'discard' });
  const useless = decide(knockEarly(), context({ hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd', phase: 'draw', discardPile: '6c' }));
  assert.deepEqual(useless.decision, { type: 'draw', source: 'stock' });
  const empty = decide(ginHunter(), context({ hand: 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd', phase: 'draw' }));
  assert.deepEqual(empty.decision, { type: 'draw', source: 'stock' });
});

test('every strategy declares gin when it has it', () => {
  for (const strategy of Object.values(STRATEGIES)) {
    const { decision } = decide(strategy, context({ hand: GIN }));
    assert.deepEqual(decision, { type: 'discard', cardId: idOf('Kd'), declare: 'gin' }, strategy.name);
  }
});

test('knock-early: knocks as soon as deadwood allows, throwing the card that leaves least', () => {
  assert.deepEqual(decide(knockEarly(), context({ hand: KNOCKABLE, stockDrawn: 15 })).decision, { type: 'discard', cardId: idOf('7c'), declare: 'knock' });
  assert.deepEqual(decide(knockEarly(), context({ hand: HEAVY })).decision.declare, 'none');
});

test('gin-hunter: chases gin only while the chance over the next 3 draws clears its threshold', () => {
  // 2 outs in 41 unseen over 3 draws ~ 14%: below the default 25%, so knock.
  assert.equal(decide(ginHunter(), context({ hand: WAITING })).decision.declare, 'knock');
  // A looser hunter (10%) holds and keeps both outs alive by throwing the Kc.
  assert.deepEqual(decide(ginHunter({ chaseChance: 0.1 }), context({ hand: WAITING })).decision, { type: 'discard', cardId: idOf('Kc'), declare: 'none' });
  // ...unless the opponent looks close: then take the points.
  assert.equal(decide(ginHunter({ chaseChance: 0.1 }), context({ hand: WAITING, threat: 3.4 })).decision.declare, 'knock');
});

test('gin-hunter: pays a point of deadwood to keep gin outs alive when it chases', () => {
  // Throwing 5h leaves least deadwood (5) but no outs; throwing 4c leaves
  // 6 with 5c/5d as outs (5h-5s-5c set, 6-9 of spades still a run).
  const hand = '5h 7s 6s 4c 9s 9d 8s 10d 5s Ac Jd';
  assert.equal(computeFacts(context({ hand }).obs).bestDiscard.card.id, idOf('5h'));
  assert.deepEqual(decide(ginHunter({ chaseChance: 0.1 }), context({ hand })).decision, { type: 'discard', cardId: idOf('4c'), declare: 'none' });
  assert.deepEqual(decide(knockEarly(), context({ hand })).decision, { type: 'discard', cardId: idOf('5h'), declare: 'knock' });
});

test('equilibrium: knocks early; mid-game only under threat or on its last chance, else discards by utility', () => {
  assert.equal(decide(equilibrium(), context({ hand: KNOCKABLE, stockDrawn: 3 })).decision.declare, 'knock');
  const quiet = decide(equilibrium(), context({ hand: KNOCKABLE, stockDrawn: 10, threat: 1 }));
  assert.equal(quiet.decision.declare, 'none');
  assert.deepEqual(quiet.trace, [
    { rule: 'declareGin', fired: false },
    { rule: 'knockEarlyStage', fired: false },
    { rule: 'knockUnderThreat', fired: false },
    { rule: 'knockLastChance', fired: false },
    { rule: 'discardByUtility', fired: true },
  ]);
  assert.equal(decide(equilibrium(), context({ hand: KNOCKABLE, stockDrawn: 10, threat: 3.2 })).decision.declare, 'knock');
  assert.equal(decide(equilibrium(), context({ hand: KNOCKABLE, stockDrawn: 25, stockCount: 2 })).decision.declare, 'knock');
});

test('equilibrium utility: among equal-deadwood discards, the one Jev says won\'t feed the opponent wins', () => {
  // Kd/Js/Qs all leave the same deadwood, and Qs comes first on code
  // alone (fewest live meld paths). Jev says Qs and Js would help them.
  assert.equal(computeFacts(context({ hand: HEAVY }).obs).bestDiscard.card.id, idOf('Qs'));
  const { decision } = decide(equilibrium(), context({ hand: HEAVY, stockDrawn: 10, helps: { Qs: 0.9, Js: 0.8, Kd: 0.1, '7c': 0.2 } }));
  assert.equal(decision.cardId, idOf('Kd'));
});

test('defensive: knocks whenever it can; otherwise throws the card Jev rates least useful to the opponent', () => {
  assert.equal(decide(defensive(), context({ hand: KNOCKABLE, stockDrawn: 12 })).decision.declare, 'knock');
  const { decision } = decide(defensive(), context({ hand: HEAVY, helps: { Kd: 0.7, Js: 0.6, Qs: 0.5, '7c': 0.05 } }));
  assert.equal(decision.cardId, idOf('7c'), 'safety over deadwood');
});

test('a Jev strategy refuses to decide a discard without its judgments', () => {
  const noJev = { ...context({ hand: HEAVY }), jev: null };
  assert.throws(() => decide(defensive(), noJev), /defensive needs Jev judgments/);
});
