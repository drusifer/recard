import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILE_TYPES } from '../src/piles/pileTypes.js';
import * as deckPile from '../src/piles/deckPile.js';
import * as handPile from '../src/piles/handPile.js';
import * as zonePile from '../src/piles/zonePile.js';
import * as discardPile from '../src/piles/discardPile.js';

// D42 (Sprint 13, US-47): one module per pile TYPE instead of a `kind`
// string switched on in state.js/pileActions.js. Phase 59 builds these
// as pure, standalone modules and proves them equivalent to the
// EXISTING (still-untouched) behavior before Phase 60 wires anything -
// same "module first, verify, then wire" order D18/D14/D21 used.
// `discard` (D45, Sprint 15) is the first type added AFTER the registry
// existed - proves Open/Closed for real, not just in the doc comment.

test('the registry exposes exactly the four existing pile kinds', () => {
  assert.deepEqual(Object.keys(PILE_TYPES).sort(), ['deck', 'discard', 'hand', 'zone']);
  assert.equal(PILE_TYPES.deck, deckPile);
  assert.equal(PILE_TYPES.hand, handPile);
  assert.equal(PILE_TYPES.zone, zonePile);
  assert.equal(PILE_TYPES.discard, discardPile);
});

test('visibility matches state.js\'s existing PILE_VISIBILITY table exactly', () => {
  assert.equal(deckPile.visibility, 'hidden');
  assert.equal(handPile.visibility, 'in-hand');
  assert.equal(zonePile.visibility, 'mixed');
  assert.equal(discardPile.visibility, 'mixed');
});

test('dropRule: NONE for deck/hand (no halo geometry reachable today), FAN for zone, STACK for discard (D45)', () => {
  assert.equal(deckPile.dropRule, 'NONE');
  assert.equal(handPile.dropRule, 'NONE');
  assert.equal(zonePile.dropRule, 'FAN');
  assert.equal(discardPile.dropRule, 'STACK');
});

test('tableSide (D45): zone and discard are PLAY/MOVE_CARD destinations, deck and hand are not', () => {
  assert.equal(zonePile.tableSide, true);
  assert.equal(discardPile.tableSide, true);
  assert.equal(deckPile.tableSide, false);
  assert.equal(handPile.tableSide, false);
});

// --- cardActions: characterized against pileActions.js's actionsForCard ---

const deck = { id: 'deck', kind: 'deck', ownerId: null };
const myHand = { id: 'hand:me', kind: 'hand', ownerId: 'me' };
const theirHand = { id: 'hand:you', kind: 'hand', ownerId: 'you' };
const table = { id: 'table', kind: 'zone', ownerId: null };

test('deck cardActions: always empty (D34 moved draw off the per-card table)', () => {
  assert.deepEqual(deckPile.cardActions(deck, { id: 'c' }, 'me'), []);
});

test('hand cardActions: play, owner only', () => {
  assert.deepEqual(handPile.cardActions(myHand, { id: 'c' }, 'me'), ['play']);
  assert.deepEqual(handPile.cardActions(theirHand, { id: 'c' }, 'me'), []);
});

test('zone cardActions: face-up card offers pickup/move, not reveal', () => {
  assert.deepEqual(zonePile.cardActions(table, { faceUp: true, owner: null }, 'me'), ['pickup', 'move']);
});

test('zone cardActions: shared face-down card - anyone may reveal or move, nobody may pick up', () => {
  assert.deepEqual(zonePile.cardActions(table, { faceDown: true, owner: null }, 'me'), ['reveal', 'move']);
});

test('zone cardActions: a non-owner gets nothing on someone else\'s still-hidden private card', () => {
  assert.deepEqual(
    zonePile.cardActions(table, { faceDown: true, owner: 'you' }, 'me'),
    [],
    'not reveal, not move - a real privacy boundary, not an oversight',
  );
});

test('zone cardActions: the owner of a still-hidden private card can reveal or move their own', () => {
  assert.deepEqual(zonePile.cardActions(table, { faceDown: true, owner: 'me' }, 'me'), ['reveal', 'move']);
});

// --- redactCard: characterized against state.js's redactMiddleCard ---

test('zone redactCard: a face-up card passes through unchanged', () => {
  const card = { id: 'c1', rank: '5', suit: 'clubs', owner: null, faceUp: true };
  assert.deepEqual(zonePile.redactCard(card, 'anyone'), card);
});

test('zone redactCard: a face-down card the viewer doesn\'t own loses rank/suit', () => {
  const card = { id: 'c1', rank: '5', suit: 'clubs', owner: null, faceUp: false };
  assert.deepEqual(zonePile.redactCard(card, 'anyone'), { id: 'c1', owner: null, faceDown: true });
});

test('zone redactCard: the owner of a still-hidden private card sees it in full', () => {
  const card = { id: 'c1', rank: '5', suit: 'clubs', owner: 'me', faceUp: false };
  assert.deepEqual(zonePile.redactCard(card, 'me'), card);
});

test('zone redactCard: layout survives redaction (D21 - arrangement leaks nothing about identity)', () => {
  const card = { id: 'c1', rank: '5', suit: 'clubs', owner: null, faceUp: false, layout: 'stack' };
  assert.deepEqual(zonePile.redactCard(card, 'anyone'), { id: 'c1', owner: null, faceDown: true, layout: 'stack' });
});

// --- pileActions: characterized against pileActions.js's pileLevelActions ---

test('deck pileActions: draw open to everyone, deal/reshuffleDeal/shuffle/split host-only', () => {
  assert.deepEqual(deckPile.pileActions({ isHost: true }), ['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split']);
  assert.deepEqual(deckPile.pileActions({ isHost: false }), ['draw']);
});

test('hand pileActions: sort/pass, owner only', () => {
  assert.deepEqual(handPile.pileActions({ isOwner: true }), ['sortRank', 'sortSuit', 'pass']);
  assert.deepEqual(handPile.pileActions({ isOwner: false }), []);
});

test('zone pileActions: none today - no pile-level action has ever targeted a shared zone', () => {
  assert.deepEqual(zonePile.pileActions({}), []);
});

// --- Write-side (D43, Sprint 14/Tranche 2): canRemoveCard/removeCard/
// insertCard - the transfer half of the interface. Deliberately just
// these three, not the four-function canAccept/insert/canRemove/remove
// shape D39 originally floated: no existing action has ever
// authorization-checked the INSERT side, so a canAccept nobody would
// ever call is exactly the kind of unearned abstraction the project's
// own retros warn against.

test('zone canRemoveCard: reuses cardActions - same rule, one source of truth, not a second copy', () => {
  const faceUp = { id: 'c', faceUp: true, owner: null };
  const hiddenUnowned = { id: 'c', faceDown: true, owner: null };
  const hiddenMine = { id: 'c', faceDown: true, owner: 'me' };
  const hiddenTheirs = { id: 'c', faceDown: true, owner: 'you' };
  assert.equal(zonePile.canRemoveCard(table, faceUp, 'me', 'pickup'), true);
  assert.equal(zonePile.canRemoveCard(table, faceUp, 'me', 'reveal'), false, 'already face-up, nothing to reveal');
  assert.equal(zonePile.canRemoveCard(table, hiddenUnowned, 'me', 'reveal'), true, 'unowned face-down - anyone may reveal');
  assert.equal(zonePile.canRemoveCard(table, hiddenMine, 'anyone-else', 'move'), false, 'a non-owner cannot move a still-hidden private card');
  assert.equal(zonePile.canRemoveCard(table, hiddenMine, 'me', 'move'), true, 'the owner can move their own still-hidden card');
  assert.equal(zonePile.canRemoveCard(table, hiddenTheirs, 'me', 'pickup'), false, 'a still-hidden card cannot be picked up by anyone');
});

test('zone removeCard/insertCard: pure, round-trips a card', () => {
  const pile = { id: 'z', kind: 'zone', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = zonePile.removeCard(pile, 'a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const reinserted = zonePile.insertCard(removed, { id: 'a' });
  assert.deepEqual(reinserted.cards.map((c) => c.id), ['b', 'a'], 'no placement - appends');
});

test('zone insertCard: placement before/after a target, layout on the correct card (Smith Gate 2 direction rule)', () => {
  const pile = { id: 'z', kind: 'zone', cards: [{ id: 'a' }, { id: 'b' }] };
  const before = zonePile.insertCard(pile, { id: 'x' }, { targetCardId: 'b', side: 'before', layout: 'overlap' });
  assert.deepEqual(before.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(before.cards.find((c) => c.id === 'b').layout, 'overlap', 'before-drop: layout lands on the TARGET, not the dropped card');
  assert.equal(before.cards.find((c) => c.id === 'x').layout, undefined);

  const after = zonePile.insertCard(pile, { id: 'x' }, { targetCardId: 'a', side: 'after', layout: 'stack' });
  assert.deepEqual(after.cards.map((c) => c.id), ['a', 'x', 'b']);
  assert.equal(after.cards.find((c) => c.id === 'x').layout, 'stack');
});

test('hand canRemoveCard: true - PLAY has never been authorized per-card, only per-hand-ownership', () => {
  assert.equal(handPile.canRemoveCard(myHand, { id: 'c' }, 'me', 'play'), true);
  assert.equal(handPile.canRemoveCard(theirHand, { id: 'c' }, 'me', 'play'), false, 'not your hand');
});

test('hand removeCard/insertCard: pure, appends on insert', () => {
  const pile = { id: 'hand:me', kind: 'hand', ownerId: 'me', cards: [{ id: 'a' }] };
  const removed = handPile.removeCard(pile, 'a');
  assert.deepEqual(removed.cards, []);
  const inserted = handPile.insertCard(removed, { id: 'b' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b']);
});

test('deck canRemoveCard: always true - DRAW has never been per-card authorized (deck cards have no owner)', () => {
  assert.equal(deckPile.canRemoveCard(deck, { id: 'c' }, 'anyone', 'draw'), true);
});

test('deck removeCard/insertCard: pure', () => {
  const pile = { id: 'deck', kind: 'deck', cards: [{ id: 'a' }, { id: 'b' }] };
  const removed = deckPile.removeCard(pile, 'a');
  assert.deepEqual(removed.cards.map((c) => c.id), ['b']);
  const inserted = deckPile.insertCard(removed, { id: 'c' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['c', 'b'], 'unexercised by any current action - DRAW only ever removes, never inserts, into a deck');
});

// --- Discard (D45, Sprint 15): "stack, drop-only" ---

const discard = { id: 'discard', kind: 'discard', ownerId: null };

test('discard cardActions: always empty - drop-only, nothing is ever offered on a discarded card', () => {
  assert.deepEqual(discardPile.cardActions(discard, { id: 'c', faceUp: true }, 'me'), []);
});

test('discard pileActions: none today', () => {
  assert.deepEqual(discardPile.pileActions({}), []);
});

test('discard canRemoveCard: always false, for every action, for every viewer - falls out of the empty cardActions, no new logic', () => {
  const card = { id: 'c', faceUp: true, owner: null };
  for (const action of ['pickup', 'move', 'reveal']) {
    assert.equal(discardPile.canRemoveCard(discard, card, 'me', action), false, action);
  }
});

test('discard insertCard: always lands on top (index 0), no placement/halo splicing like zone', () => {
  const pile = { id: 'discard', kind: 'discard', cards: [{ id: 'a' }] };
  const inserted = discardPile.insertCard(pile, { id: 'b' }, { targetCardId: 'a', side: 'before' });
  assert.deepEqual(inserted.cards.map((c) => c.id), ['b', 'a'], 'placement is ignored entirely - STACK always wins');
});

test('discard redactCard: same per-card {owner, faceUp} rule as zone (D7) - a hidden discard is a real house rule', () => {
  const hidden = { id: 'c1', rank: '5', suit: 'clubs', owner: null, faceUp: false };
  assert.deepEqual(discardPile.redactCard(hidden, 'anyone'), { id: 'c1', owner: null, faceDown: true });
  const visible = { id: 'c2', rank: '5', suit: 'clubs', owner: null, faceUp: true };
  assert.deepEqual(discardPile.redactCard(visible, 'anyone'), visible);
});
