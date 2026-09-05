import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../src/deck.js';
import { createInitialState, reduce, pilesOf, handsOf } from '../src/state.js';
import { PILE_TYPES, convertibleKindsFor } from '../src/piles/pileTypes.js';
import { ChipPile } from '../src/piles/ChipPile.js';
import { CHIP_DENOMINATIONS } from '../src/pileables/ChipPileable.js';
import { PRESETS } from '../src/presets.js';

/**
 * *fix (direct user request): "we need a good default piletype for chips
 * they should be stacked by denom and have actions for braking large
 * denom to smaller denom - dont show non-chip piletypes in the menu".
 *
 * This REVERSES the sprint's earlier "chips carry no value" scope
 * ruling, on the user's own instruction - breaking a denomination is
 * meaningless without one. Chips gain a `denom`; everything that
 * followed from "nothing to order by" (no sort action) follows from the
 * opposite now.
 */

const chipPile = (cards) => new ChipPile({ id: 'p', kind: 'chip', ownerId: 'me', cards });

test('chips carry a denomination, and colour maps to it the way real chips do', () => {
  const chips = buildDeck({ type: 'chips', deckList: 'poker-stack' });
  assert.ok(chips.every((chip) => typeof chip.denom === 'number' && chip.denom > 0),
    'every chip has a positive denomination');
  const byColour = new Map(chips.map((chip) => [chip.colour, chip.denom]));
  assert.equal(new Set(byColour.values()).size, byColour.size, 'each colour is its own denomination');
});

test('chip is a registered pile kind', () => {
  assert.equal(PILE_TYPES.chip, ChipPile);
});

// "stacked by denom": a chip landing in the pile joins its own
// denomination rather than the end, so a tray stays sorted by itself.
test('ChipPile keeps its chips grouped by denomination on insert', () => {
  const pile = chipPile([
    { id: 'a', pileableType: 'chip', denom: 25 },
    { id: 'b', pileableType: 'chip', denom: 5 },
  ]);
  const after = pile.insertPileable({ id: 'c', pileableType: 'chip', denom: 25 });
  assert.deepEqual(after.cards.map((chip) => chip.denom), [25, 25, 5],
    'the new 25 joins the other 25s, it does not land at the end');
});

test('ChipPile orders denominations highest first, like a real tray', () => {
  const pile = chipPile([{ id: 'a', pileableType: 'chip', denom: 1 }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'chip', denom: 100 });
  assert.deepEqual(after.cards.map((chip) => chip.denom), [100, 1]);
});

// The Core invariant still holds: a chip pile is not a rules engine, so
// it accepts anything dragged onto it, same as every other pile.
test('ChipPile still accepts a non-chip - permissiveness is not negotiable here', () => {
  assert.equal(chipPile([]).canAccept({ id: 'x', rank: 'A', suit: 'spades' }), true);
});

test('ChipPile defaults to a stacked spread, not a flat row', () => {
  assert.ok(ChipPile.defaultSpread > 0.5, `got ${ChipPile.defaultSpread}`);
});

// --- Breaking a denomination ----------------------------------------

test('BREAK_CHIP: a 5 becomes five 1s, in the same pile', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [{ id: 'c5', pileableType: 'chip', colour: 'red', denom: 5 }] } : p)) };

  state = reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'c5' });
  const tray = pilesOf(state).find((p) => p.id === 'tray');
  assert.deepEqual(tray.cards.map((c) => c.denom), [1, 1, 1, 1, 1]);
  assert.ok(tray.cards.every((c) => c.pileableType === 'chip'));
});

// Value has to be conserved - that is the whole point of "breaking".
test('BREAK_CHIP: total value is unchanged, whatever the denomination', () => {
  const breakable = CHIP_DENOMINATIONS.filter((value) => value > 1);
  for (const denom of breakable) {
    let state = createInitialState({}, () => 0.5, {
      piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
    });
    state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
      ? { ...p, cards: [{ id: 'c', pileableType: 'chip', denom }] } : p)) };
    state = reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'c' });
    const total = pilesOf(state).find((p) => p.id === 'tray').cards.reduce((sum, c) => sum + c.denom, 0);
    assert.equal(total, denom, `breaking a ${denom} must still be worth ${denom}`);
  }
});

// A 25 breaks into five 5s, not two-and-a-half 10s: the largest smaller
// denomination that divides evenly.
test('BREAK_CHIP: breaks into the largest smaller denomination that divides evenly', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [{ id: 'c25', pileableType: 'chip', denom: 25 }] } : p)) };
  state = reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'c25' });
  assert.deepEqual(pilesOf(state).find((p) => p.id === 'tray').cards.map((c) => c.denom), [5, 5, 5, 5, 5]);
});

test('BREAK_CHIP: the smallest denomination cannot be broken', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [{ id: 'c1', pileableType: 'chip', denom: 1 }] } : p)) };
  assert.throws(() => reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'c1' }),
    /smallest|cannot be broken/i);
});

test('BREAK_CHIP: a non-chip cannot be broken', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [{ id: 'card', rank: 'A', suit: 'spades' }] } : p)) };
  assert.throws(() => reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'card' }), /chip/i);
});

test('BREAK_CHIP: the new chips get their own ids, never a duplicate', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [{ id: 'c5', pileableType: 'chip', denom: 5 }, { id: 'c5b', pileableType: 'chip', denom: 5 }] } : p)) };
  state = reduce(state, { type: 'BREAK_CHIP', playerId: 'p1', pileId: 'tray', pileableId: 'c5' });
  const ids = pilesOf(state).find((p) => p.id === 'tray').cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids introduced');
});

// --- The offer layer -------------------------------------------------

test('a chip pile offers break, and sorting by denomination', () => {
  const actions = chipPile([{ id: 'a', pileableType: 'chip', denom: 5 }])
    .pileActions({ isOwner: true, isShared: true, cards: [{ pileableType: 'chip', denom: 5 }] });
  assert.ok(actions.includes('break'), `got ${JSON.stringify(actions)}`);
  assert.ok(actions.includes('sortDenom'), `got ${JSON.stringify(actions)}`);
});

test('break is disabled when nothing in the pile can be broken', () => {
  const onlyOnes = [{ pileableType: 'chip', denom: 1 }];
  assert.ok(chipPile(onlyOnes).disabledActions(1, { cards: onlyOnes }).includes('break'));
  const breakable = [{ pileableType: 'chip', denom: 5 }];
  assert.ok(!chipPile(breakable).disabledActions(1, { cards: breakable }).includes('break'));
});

// "dont show non-chip piletypes in the menu"
test('a chip pile offers no non-chip pile type to convert to', () => {
  assert.deepEqual(ChipPile.convertibleKinds(), ['chip']);
});

// A kind OPTS IN to a restriction; its absence means every registered
// kind (D87). Resolved by `convertibleKindsFor` rather than on the base
// class, which cannot enumerate the registry without a circular import.
test('every other pile kind still offers the full set - the restriction is the chip pile\'s own', () => {
  assert.ok(convertibleKindsFor('plain').length > 1);
  assert.ok(convertibleKindsFor('plain').includes('discard'));
  assert.deepEqual(convertibleKindsFor('chip'), ['chip']);
  assert.equal(PILE_TYPES.plain.convertibleKinds, undefined, 'the base class defines no restriction at all');
});

// A menu with one entry, which is what the pile already is, is a dead
// control - the same reasoning `disabledActions` uses everywhere else.
test('changePileType is not offered at all when there is nowhere to convert to', () => {
  const actions = chipPile([]).pileActions({ isOwner: true, isShared: true, cards: [] });
  assert.ok(!actions.includes('changePileType'), `got ${JSON.stringify(actions)}`);
});

// --- The presets use it ----------------------------------------------

test('every chip supply in every preset is a chip pile, not a plain one', () => {
  for (const preset of PRESETS) {
    const supplies = preset.piles?.filter((pile) => pile.deckList?.includes('chip')) ?? [];
    for (const pile of supplies) {
      assert.equal(pile.kind, 'chip', `${preset.name}/${pile.name} should be a chip pile`);
    }
  }
});


// Found by looking at a real tray: the chips ARRIVED unsorted, because
// a declared pile's stock is assigned straight onto the pile and never
// passes through `insertPileable`. "Stacked by denom" has to be true of
// the tray a player is first shown, not only of chips added later.
test('a stocked chip pile arrives already sorted by denomination, highest first', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray', deckType: 'chips', deckList: 'standard-chips' }],
  });
  const denoms = pilesOf(state).find((p) => p.id === 'tray').cards.map((chip) => chip.denom);
  assert.deepEqual(denoms, denoms.toSorted((a, b) => b - a), `tray arrived unsorted: ${denoms.slice(0, 8)}`);
});

// A DECK must not be sorted by the same hook - it is shuffled on purpose.
test('a stocked deck is NOT sorted - stocking order is the pile kind\'s own business', () => {
  const state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'deck', ownerId: null, count: 1, id: 'd', deckType: 'standard', deckList: 'x' }],
  });
  const deck = pilesOf(state).find((p) => p.id === 'd');
  assert.ok(deck.cards.length > 0);
});


// REVERSED by a later *nit ("dropped chips are not aligned on the
// piles?"). Honouring the drop's `layout` was the right fix while a tray
// rendered as one flat row and stacking had to come from the drop. It is
// wrong now that `<chip-tray>` stacks natively: a per-card `layout`
// carries its own margins, so a dropped chip sat out of line with the
// stack it joined - and if it landed first in a column, shifted the
// whole column sideways.
//
// A tray's arrangement is the KIND's (by denomination), never the drop
// point's, so the layout is stripped rather than respected.
test('ChipPile strips a drop layout - the tray decides arrangement, not the drop point', () => {
  const pile = chipPile([{ id: 'a', pileableType: 'chip', denom: 25 }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'chip', denom: 25 }, { layout: 'stack' });
  assert.equal(after.cards.find((chip) => chip.id === 'b').layout, undefined);
});

test('ChipPile strips an overlap layout too, and still sorts', () => {
  const pile = chipPile([{ id: 'a', pileableType: 'chip', denom: 5 }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'chip', denom: 100 }, { layout: 'overlap' });
  assert.equal(after.cards.find((chip) => chip.id === 'b').layout, undefined);
  assert.deepEqual(after.cards.map((chip) => chip.denom), [100, 5], 'sorted regardless of where it was dropped');
});

// Chips that arrived carrying a layout from somewhere else must not
// stay misaligned either - the whole tray is normalised.
test('ChipPile clears a layout an existing chip was already carrying', () => {
  const pile = chipPile([{ id: 'a', pileableType: 'chip', denom: 5, layout: 'stack' }]);
  const after = pile.insertPileable({ id: 'b', pileableType: 'chip', denom: 5 });
  assert.ok(after.cards.every((chip) => chip.layout === undefined), 'every chip in the tray is unlaid-out');
});

test('ChipPile still places a chip relative to a target when one is given', () => {
  const pile = chipPile([
    { id: 'a', pileableType: 'chip', denom: 5 },
    { id: 'b', pileableType: 'chip', denom: 5 },
  ]);
  const after = pile.insertPileable({ id: 'c', pileableType: 'chip', denom: 5 }, { targetCardId: 'a', side: 'before' });
  assert.deepEqual(after.cards.map((chip) => chip.id), ['c', 'a', 'b'],
    'equal denominations keep the base class\'s placement - toSorted is stable');
});


// *nit (direct user request): "chip stacks better but need to be
// actually 'stacked' like a deck one on top of the other not side by
// side". A card fan stops at MAX_SPREAD so every card keeps a readable
// corner index; a chip stack has no index to preserve - you read the
// TOP chip, exactly like a deck - so it legitimately goes tighter. The
// ceiling becomes a property of the pile TYPE rather than one global
// number for everything.
test('a chip stack may go tighter than a card fan - the ceiling is the pile type\'s own', () => {
  assert.ok(ChipPile.maxSpread > PILE_TYPES.plain.maxSpread,
    `chips ${ChipPile.maxSpread} should exceed cards ${PILE_TYPES.plain.maxSpread}`);
  assert.ok(ChipPile.defaultSpread >= 0.9, `and start nearly stacked, got ${ChipPile.defaultSpread}`);
  assert.ok(ChipPile.defaultSpread <= ChipPile.maxSpread, 'without starting at its own ceiling');
});

test('ADJUST_PILE_SPREAD clamps a chip tray at ITS ceiling, not the card one', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  for (let index = 0; index < 30; index++) {
    state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'tray', delta: 0.1 });
  }
  assert.equal(pilesOf(state).find((p) => p.id === 'tray').spread, ChipPile.maxSpread);
});

test('a card pile still clamps at the card ceiling - chips did not raise it for everyone', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'plain', ownerId: null, count: 1, id: 'flat' }],
  });
  for (let index = 0; index < 30; index++) {
    state = reduce(state, { type: 'ADJUST_PILE_SPREAD', pileId: 'flat', delta: 0.1 });
  }
  assert.equal(pilesOf(state).find((p) => p.id === 'flat').spread, PILE_TYPES.plain.maxSpread);
});


// *nit (direct user request): "on chip piles show the Sum of the
// denominations not the count of chips". A tray of 17 chips tells you
// nothing useful; what you want to know is that it is worth 155.
test('a chip pile\'s badge is the total VALUE, not the number of chips', () => {
  const cards = [
    { id: 'a', pileableType: 'chip', denom: 100 },
    { id: 'b', pileableType: 'chip', denom: 25 },
    { id: 'c', pileableType: 'chip', denom: 5 },
  ];
  assert.equal(ChipPile.badge({ cards }), 130, 'not 3');
});

test('every other pile kind still badges its COUNT', () => {
  const cards = [{ id: 'a' }, { id: 'b' }];
  assert.equal(PILE_TYPES.plain.badge({ cards }), 2);
  // A deck's view carries an explicit `count`, which still wins.
  assert.equal(PILE_TYPES.deck.badge({ cards, count: 52 }), 52);
});

test('an empty chip tray badges 0, not blank', () => {
  assert.equal(ChipPile.badge({ cards: [] }), 0);
});

// A tray accepts anything (the Core invariant), so a card really can
// land in one. It contributes no value, and must not break the badge.
test('a non-chip in a tray contributes nothing to the total and does not break it', () => {
  const cards = [
    { id: 'a', pileableType: 'chip', denom: 25 },
    { id: 'b', rank: 'A', suit: 'spades' },
  ];
  assert.equal(ChipPile.badge({ cards }), 25);
});


// --- RESET must not confiscate anyone's chips ------------------------
//
// *fix (direct user report): "reshuffle and redeal is still busted -
// deals whole deck and all the chips disappear". RESET clears every
// surviving pile, which is right for CARDS (a new round redeals them)
// and catastrophic for chips: a reshuffle took every player's money.
// `assertCardsConserved` skips RESET, so nothing caught it.

test('RESET keeps chips - a new round redeals the cards, it does not confiscate the stacks', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray', deckType: 'chips', deckList: 'poker-stack' }],
  });
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  const before = pilesOf(state).find((p) => p.id === 'tray').cards.length;
  assert.ok(before > 0);

  state = reduce(state, { type: 'RESET' });
  assert.equal(pilesOf(state).find((p) => p.id === 'tray').cards.length, before, 'every chip survives');
});

test('RESET still clears CARDS from a table pile - that is what a reset is for', () => {
  let state = createInitialState({}, () => 0.5, {
    piles: [{ kind: 'chip', ownerId: null, count: 1, id: 'tray' }],
  });
  state = { ...state, piles: state.piles.map((p) => (p.id === 'tray'
    ? { ...p, cards: [
      { id: 'chip-a', pileableType: 'chip', denom: 5 },
      { id: 'card-a', pileableType: 'card', rank: 'A', suit: 'spades' },
    ] }
    : p)) };

  const after = pilesOf(reduce(state, { type: 'RESET' })).find((p) => p.id === 'tray');
  assert.deepEqual(after.cards.map((c) => c.id), ['chip-a'], 'the card goes back to the deck, the chip stays');
});

test('RESET keeps chips a player was holding in hand rather than dropping the hand with them in it', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  state = { ...state, piles: state.piles.map((p) => (p.kind === 'hand'
    ? { ...p, cards: [...p.cards, { id: 'held-chip', pileableType: 'chip', denom: 25 }] }
    : p)) };

  const after = reduce(state, { type: 'RESET' });
  const held = pilesOf(after).flatMap((p) => p.cards).filter((c) => c.pileableType === 'chip');
  assert.deepEqual(held.map((c) => c.id), ['held-chip'], 'a chip in hand is not destroyed by a reset');
});

test('RESET drops an ordinary hand entirely, exactly as before', () => {
  let state = createInitialState({}, () => 0.5);
  state = reduce(state, { type: 'JOIN', playerId: 'p1', name: 'Alice' });
  state = reduce(state, { type: 'DEAL', pileId: 'deck', cardsPerPlayer: 3 });
  assert.deepEqual(handsOf(reduce(state, { type: 'RESET' })), {});
});
