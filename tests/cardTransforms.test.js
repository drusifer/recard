import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireCanRemove, cardTransform, rotateCard, flipCard } from '../src/cardTransforms.js';

// A minimal fake Pile - only `canRemove` matters to these functions,
// same seam `state.js`'s own `pileInstanceFor(pile, viewerId)` result
// already provides.
const pileOffering = (...actions) => ({ canRemove: (card, viewerId, action) => actions.includes(action) });

test('requireCanRemove: does nothing (no throw) when the pile offers the action', () => {
  assert.doesNotThrow(() => requireCanRemove(pileOffering('rotate'), { id: 'c1' }, 'p1', 'rotate'));
});

test('requireCanRemove: throws a specific, actionable message when the pile does not offer it', () => {
  assert.throws(
    () => requireCanRemove(pileOffering('move'), { id: 'c1' }, 'p1', 'rotate'),
    /Player p1 is not authorized to rotate c1/,
  );
});

test('cardTransform: a fixed verb checks that exact verb and applies mutate on success', () => {
  const doubleIt = cardTransform({ verb: 'double', mutate: (card) => ({ ...card, n: card.n * 2 }) });
  const result = doubleIt(pileOffering('double'), { id: 'c1', n: 5 }, 'p1');
  assert.equal(result.n, 10);
});

test('cardTransform: a fixed verb throws, and never calls mutate, when the pile does not offer it', () => {
  let wasMutateCalled = false;
  const doubleIt = cardTransform({ verb: 'double', mutate: () => { wasMutateCalled = true; } });
  assert.throws(() => doubleIt(pileOffering('move'), { id: 'c1', n: 5 }, 'p1'));
  assert.equal(wasMutateCalled, false, 'a rejected action must never run its mutation');
});

test('cardTransform: a function verb is resolved from the CARD, not fixed', () => {
  const toggle = cardTransform({
    verb: (card) => (card.on ? 'turnOff' : 'turnOn'),
    mutate: (card) => ({ ...card, on: !card.on }),
  });
  assert.equal(toggle(pileOffering('turnOn'), { id: 'c1', on: false }, 'p1').on, true);
  assert.equal(toggle(pileOffering('turnOff'), { id: 'c1', on: true }, 'p1').on, false);
  assert.throws(() => toggle(pileOffering('turnOn'), { id: 'c1', on: true }, 'p1'),
    /not authorized to turnOff/, 'the wrong verb for the CURRENT state must be checked, not the other one');
});

// --- rotateCard ----------------------------------------------------------

test('rotateCard: landscape becomes portrait and back again', () => {
  const rotated = rotateCard(pileOffering('rotate'), { id: 'c1', orientation: 'landscape' }, 'p1');
  assert.equal(rotated.orientation, 'portrait');
  const rotatedBack = rotateCard(pileOffering('rotate'), rotated, 'p1');
  assert.equal(rotatedBack.orientation, 'landscape');
});

test('rotateCard: throws when the pile does not offer rotate (e.g. a hand card)', () => {
  assert.throws(() => rotateCard(pileOffering('move'), { id: 'c1', orientation: 'landscape' }, 'p1'),
    /not authorized to rotate c1/);
});

// --- flipCard --------------------------------------------------------------

test('flipCard: face-down (or absent faceUp) reveals, checking "reveal" not "conceal"', () => {
  const revealed = flipCard(pileOffering('reveal'), { id: 'c1' }, 'p1');
  assert.equal(revealed.faceUp, true);
});

test('flipCard: face-up conceals, checking "conceal" not "reveal"', () => {
  const concealed = flipCard(pileOffering('conceal'), { id: 'c1', faceUp: true }, 'p1');
  assert.equal(concealed.faceUp, false);
});

test('flipCard: throws with the CORRECT verb for the card\'s current state', () => {
  // The pile only offers "reveal" (as a still-hidden card's pile might) -
  // trying to flip an already-face-up card must ask for "conceal" and fail,
  // not silently check "reveal" (which the pile DOES offer) and succeed.
  assert.throws(() => flipCard(pileOffering('reveal'), { id: 'c1', faceUp: true }, 'p1'),
    /not authorized to conceal c1/);
});
