import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PILEABLE_TYPES, pileableFor, sortActionsFor } from '../src/pileables/pileableTypes.js';
import { Pileable } from '../src/pileables/Pileable.js';
import { CardPileable } from '../src/pileables/CardPileable.js';
import { ChipPileable } from '../src/pileables/ChipPileable.js';
import { TokenPileable } from '../src/pileables/TokenPileable.js';
import { buildDeck } from '../src/deck.js';

/**
 * Sprint pileObjects, Phase 97 (US-101, D107). `Pileable` is the type of
 * a thing IN a pile, mirroring `src/piles/`'s own shape: plain records
 * at rest, live instances on demand, one registry keyed by `type`.
 *
 * This phase deliberately ships `Card` as the ONLY subtype and changes
 * no behaviour - it is the cheapest falsification of D107. Chip and
 * Token arrive in Phase 100, once the abstraction is known to fit.
 */

test('the registry exposes card, and every registered type extends Pileable', () => {
  assert.ok(Object.hasOwn(PILEABLE_TYPES, 'card'));
  for (const [type, PileableClass] of Object.entries(PILEABLE_TYPES)) {
    assert.ok(Object.prototype.isPrototypeOf.call(Pileable, PileableClass) || PileableClass === Pileable,
      `${type} must extend Pileable`);
  }
});

test('pileableFor resolves a card record to CardPileable', () => {
  assert.equal(pileableFor({ id: 'c', pileableType: 'card' }).constructor, CardPileable);
});

// The same defensive default `faceFor` already makes for an absent
// `face`. Not a compatibility shim - there is no second code path, just
// a default - and it keeps a record built anywhere in the codebase
// renderable rather than blanking the table.
test('pileableFor defaults an absent pileableType to card, and falls back for an unknown one', () => {
  assert.equal(pileableFor({ id: 'c' }).constructor, CardPileable);
  assert.equal(pileableFor({ id: 'c', pileableType: 'no-such-type' }).constructor, CardPileable);
  assert.equal(pileableFor(null).constructor, CardPileable, 'and for no record at all');
});

test('a Pileable keeps its record\'s own fields - it is a view over plain data, not a copy', () => {
  const card = { id: 'ace-spades-0', pileableType: 'card', rank: 'A', suit: 'spades', faceUp: true };
  const instance = pileableFor(card);
  assert.equal(instance.id, 'ace-spades-0');
  assert.equal(instance.rank, 'A');
  assert.equal(instance.suit, 'spades');
});

// `type` has to be stamped at construction, not inferred later: it is
// what every dispatch reads, and a record that never gets one would
// rely on the default forever.
test('buildDeck stamps type: card on every card it builds', () => {
  const deck = buildDeck({ type: 'standard' });
  assert.ok(deck.length > 0);
  assert.ok(deck.every((card) => card.pileableType === 'card'), 'every standard card');
});

test('buildDeck stamps it for every deck type, not just standard', () => {
  for (const type of ['standard', 'pinochle']) {
    assert.ok(buildDeck({ type }).every((card) => card.pileableType === 'card'), `${type} deck`);
  }
});

// The two axes D107 keeps separate: `type` is what a thing IS, `face`
// is how a CARD prints. A card's render must still go through
// `CARD_FACES`, or this sprint would silently change how all 132 RtG
// cards look - the one thing Smith's Gate 2 checked for.
test('CardPileable delegates rendering to the card-face registry, so faces are untouched', () => {
  const standard = pileableFor({ id: 'c', rank: 'A', suit: 'hearts' });
  const rtg = pileableFor({ id: 'r', face: 'rtg', name: 'Test', cost: [] });
  assert.notEqual(standard.faceModule(), rtg.faceModule(), 'a card still dispatches on its own face');
});

test('CardPileable className comes from its face - card-red still reaches the shell', () => {
  assert.equal(pileableFor({ id: 'c', rank: 'A', suit: 'hearts' }).className(), 'card-red');
  assert.equal(pileableFor({ id: 'c', rank: 'A', suit: 'spades' }).className(), '');
});

// Both of these are regressions for real collisions Phase 97 hit on its
// first run - the reason this phase ships `Card` alone and changes no
// behaviour.
test('the discriminator is pileableType, NOT type - an RtG card\'s type is its MTG type line', () => {
  const rtgCard = { id: 'r', face: 'rtg', type: 'Creature', name: 'Test', pileableType: 'card' };
  assert.equal(pileableFor(rtgCard).type, 'Creature', 'its own type field survives untouched');
  assert.equal(pileableFor(rtgCard).constructor, CardPileable, 'and it still resolves as a card');
});

test('a record field never shadows a method - `face` is a field, faceModule() is the method', () => {
  const rtgCard = pileableFor({ id: 'r', face: 'rtg', name: 'Test', cost: [] });
  assert.equal(rtgCard.face, 'rtg', 'the field is still the plain string');
  assert.equal(typeof rtgCard.faceModule, 'function');
});


// --- Chip and Token (Phase 100, US-102, Smith Gate 1 condition A) ----
//
// They have NO behaviour a card lacks - the user was asked directly and
// said so. What they have is a look and, per Smith's condition, a
// PRESENTATIONAL distinguisher, because a supply of identical discs
// gives a player no way to tell whether anything happened.

test('chip and token are registered Pileable types', () => {
  assert.equal(pileableFor({ id: 'x', pileableType: 'chip' }).constructor, ChipPileable);
  assert.equal(pileableFor({ id: 'y', pileableType: 'token' }).constructor, TokenPileable);
});

test('a chip reaches the shell through the same className hook a card face uses - no type-aware shell', () => {
  assert.match(pileableFor({ id: 'x', pileableType: 'chip', colour: 'red' }).className(), /card-chip/);
  assert.match(pileableFor({ id: 'y', pileableType: 'token', colour: 'blue' }).className(), /card-token/);
});

// Smith Gate 1 condition A: chips must be tellable apart at rest.
test('a chip\'s colour reaches the shell as its own class, so a supply is not N identical discs', () => {
  assert.match(pileableFor({ id: 'x', pileableType: 'chip', colour: 'red' }).className(), /chip-red/);
  assert.match(pileableFor({ id: 'x', pileableType: 'chip', colour: 'blue' }).className(), /chip-blue/);
});

test('a chip with no colour still renders - it degrades, it does not throw or blank', () => {
  const chip = pileableFor({ id: 'x', pileableType: 'chip' });
  assert.doesNotThrow(() => chip.className());
  const element = { append: () => {}, textContent: '' };
  assert.doesNotThrow(() => chip.render(element));
});

// Smith Gate 1 condition B, at the type level: nothing to order by, so
// nothing is offered. An action that rearranges a pile unpredictably is
// worse than no action.
test('chips and tokens offer NO sort actions; cards offer rank and suit', () => {
  assert.deepEqual(ChipPileable.sortActions, []);
  assert.deepEqual(TokenPileable.sortActions, []);
  assert.deepEqual(CardPileable.sortActions, ['sortRank', 'sortSuit']);
});

// The distinguisher is presentational ONLY (the user's "no new
// behaviour" ruling). If a colour ever became orderable, this test is
// what should fail first.
test('colour is presentational - it gives a chip no ordering, so no sort appears', () => {
  assert.deepEqual(ChipPileable.sortActions, [], 'even though chips carry a colour');
});

// A token carries a label as well as a colour. Asserted as a FIELD
// here, not as rendered output: `render` builds DOM, and there is no
// document in a node test - which is the same scope line D104 drew,
// rendering belongs to the browser layer. `uiActions.browser.mjs`
// asserts the label actually reaches the screen once Phase 102 puts
// tokens on a real table.
test('a token carries a short label as well as a colour', () => {
  const token = pileableFor({ id: 'y', pileableType: 'token', colour: 'blue', label: '+1' });
  assert.equal(token.label, '+1');
  assert.match(token.className(), /token-blue/);
});

// A second intersection case, added because the first mutation check
// showed only ONE test standing behind this guard: the order of a mixed
// pile must not decide the answer. Card-then-chip and chip-then-card
// have to agree, or "intersection" is really "whatever is first".
test('sortActionsFor: the intersection is order-independent', () => {
  const cardFirst = sortActionsFor([{ pileableType: 'card' }, { pileableType: 'chip' }]);
  const chipFirst = sortActionsFor([{ pileableType: 'chip' }, { pileableType: 'card' }]);
  assert.deepEqual(cardFirst, chipFirst);
  assert.deepEqual(cardFirst, []);
});
