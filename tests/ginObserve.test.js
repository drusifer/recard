import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GinTracker } from '../tools/gin/observe.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short, isFaceUp = true) => {
  const rank = short.slice(0, -1);
  const suit = SUITS[short.at(-1)];
  return { pileableType: 'card', id: `${rank}-${suit}-0`, rank, suit, faceUp: isFaceUp };
};
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);
const stock = (count) => Array.from({ length: count }, (_, index) => ({ pileableType: 'card', id: `stock-${index}`, rank: '2', suit: 'clubs' }));

// A Recard view as the bot (guest "ME") receives it - including the
// opponent's REAL hand, which Recard's guest view does carry.
function view({ mine, theirs, table = '', stockCount = 32, top }) {
  const tableCards = cards(table);
  if (top) tableCards.push(top);
  return {
    myHand: cards(mine),
    piles: [
      { id: 'deck', kind: 'deck', cards: stock(stockCount) },
      { id: 'table', kind: 'plain', cards: tableCards },
      { id: 'hand:HOST', kind: 'hand', cards: cards(theirs) },
      { id: 'hand:ME', kind: 'hand', cards: cards(mine) },
    ],
  };
}

const MINE = 'Ah 2h 3h 9c 9d Js Qs 5d 7c Kd';
const THEIRS = '4s 4c 4d 6h 7h 8h 10c 10d 2s 3c';

test('fairness: the observation never carries an opponent card it did not see publicly', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'bot' });
  const observation = tracker.update(view({ mine: MINE, theirs: THEIRS }));
  const json = JSON.stringify(observation);
  for (const hidden of cards(THEIRS)) assert.ok(!json.includes(hidden.id), `leaked ${hidden.id}`);
  assert.equal(observation.opponentHandSize, 10);
  assert.equal(observation.hand.length, 10);
  assert.equal(observation.stockCount, 32);
});

test('who goes first: the bot draws first by default, waits when the opponent starts', () => {
  assert.equal(new GinTracker({ myId: 'ME', firstPlayer: 'bot' }).update(view({ mine: MINE, theirs: THEIRS })).phase, 'draw');
  assert.equal(new GinTracker({ myId: 'ME', firstPlayer: 'opponent' }).update(view({ mine: MINE, theirs: THEIRS })).phase, 'wait');
});

test('an opponent turn seen in one snapshot (stock draw + discard) is attributed and hands the turn over', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'opponent' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  // They drew from stock (unseen card) and discarded the 2s.
  const after = tracker.update(view({ mine: MINE, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', table: '2s', stockCount: 31 }));
  assert.deepEqual(after.opponentDiscards.map((c) => c.id), ['2-spades-0']);
  assert.equal(after.stockDrawn, 1);
  assert.equal(after.phase, 'draw');
  assert.ok(!JSON.stringify(after).includes('Q-hearts-0'), 'the stock card they drew stays hidden');
});

test('my draw puts me in the discard phase; my discard hands the turn over', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'bot' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  const drawn = tracker.update(view({ mine: `${MINE} 4h`, theirs: THEIRS, stockCount: 31 }));
  assert.equal(drawn.phase, 'discard');
  const discarded = tracker.update(view({ mine: 'Ah 2h 3h 4h 9c 9d Js Qs 5d 7c', theirs: THEIRS, table: 'Kd', stockCount: 31 }));
  assert.equal(discarded.phase, 'wait');
  assert.deepEqual(discarded.myDiscards.map((c) => c.id), ['K-diamonds-0']);
});

test('a discard-pile card the opponent takes becomes public; it leaves their known cards if they discard it again', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'bot' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  tracker.update(view({ mine: `${MINE} 4h`, theirs: THEIRS, stockCount: 31 }));
  tracker.update(view({ mine: 'Ah 2h 3h 4h 9c 9d Js Qs 5d 7c', theirs: THEIRS, table: 'Kd', stockCount: 31 }));
  // They take my Kd and discard the 2s.
  const took = tracker.update(view({ mine: 'Ah 2h 3h 4h 9c 9d Js Qs 5d 7c', theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Kd', table: '2s', stockCount: 31 }));
  assert.deepEqual(took.opponentTook.map((c) => c.id), ['K-diamonds-0']);
  assert.deepEqual(took.opponentDiscards.map((c) => c.id), ['2-spades-0']);
  assert.equal(took.phase, 'draw');
});

test('a face-down card on the discard pile is a knock: the hand is over', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'opponent' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  const knocked = tracker.update(view({ mine: MINE, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', top: card('2s', false), stockCount: 31 }));
  assert.equal(knocked.phase, 'hand-over');
  assert.equal(knocked.outcome, 'knock');
});

test('a discard that leaves 2 stock cards with no knock is a dead hand', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'opponent' });
  tracker.update(view({ mine: MINE, theirs: THEIRS, stockCount: 3 }));
  const dead = tracker.update(view({ mine: MINE, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', table: '2s', stockCount: 2 }));
  assert.equal(dead.phase, 'hand-over');
  assert.equal(dead.outcome, 'dead');
});

test('a redeal (stock grows back) starts a fresh hand with empty history', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'opponent' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  tracker.update(view({ mine: MINE, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', table: '2s', stockCount: 31 }));
  const fresh = tracker.update(view({ mine: MINE, theirs: THEIRS }));
  assert.deepEqual(fresh.opponentDiscards, []);
  assert.equal(fresh.stockDrawn, 0);
  assert.equal(fresh.handNumber, 2);
  assert.equal(fresh.phase, 'wait');
});

test('the discard-pile card I take is recorded, so I cannot throw it straight back; my discard clears it', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'opponent' });
  tracker.update(view({ mine: MINE, theirs: THEIRS }));
  tracker.update(view({ mine: MINE, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', table: '2s', stockCount: 31 }));
  const took = tracker.update(view({ mine: `${MINE} 2s`, theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', stockCount: 31 }));
  assert.equal(took.phase, 'discard');
  assert.equal(took.takenFromDiscard, '2-spades-0');
  assert.deepEqual(took.opponentTook, [], 'my own pickup is not the opponent\'s');
  const after = tracker.update(view({ mine: 'Ah 2h 3h 9c 9d Js Qs 5d 7c 2s', theirs: '4s 4c 4d 6h 7h 8h 10c 10d 3c Qh', table: 'Kd', stockCount: 31 }));
  assert.equal(after.takenFromDiscard, null);
});

test('joined before the deal: an empty hand waits, and the deal itself starts hand 1 (not 20 stock draws)', () => {
  const tracker = new GinTracker({ myId: 'ME', firstPlayer: 'bot' });
  const early = tracker.update(view({ mine: '', theirs: '', stockCount: 52 }));
  assert.equal(early.phase, 'wait');
  assert.equal(early.handNumber, 0, 'nothing dealt yet is not a hand');
  const dealt = tracker.update(view({ mine: MINE, theirs: THEIRS, stockCount: 32 }));
  assert.equal(dealt.handNumber, 1);
  assert.equal(dealt.stockDrawn, 0);
  assert.equal(dealt.phase, 'draw');
});
