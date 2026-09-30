import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stack, stacksOf } from '../src/piles/Stack.js';
import { VERTICAL, HORIZONTAL } from '../src/pileables/Stackable.js';

const card = (id, stackId) => ({ id, pileableType: 'card', ...(stackId !== undefined && { stackId }) });

// ---------------------------------------------------------------------
// A Stack is LIVE (D129): built from the pile's own flat `cards` list
// by grouping on the persisted `stackId`. `pile.cards` is unchanged and
// stays the single source of ordering.
// ---------------------------------------------------------------------

test('a pile with no stackIds anywhere is ONE stack', () => {
  const stacks = stacksOf({ cards: [card('a'), card('b'), card('c')], style: VERTICAL });
  assert.equal(stacks.length, 1);
  assert.deepEqual(stacks[0].pileables.map((p) => p.id), ['a', 'b', 'c']);
});

test('an empty pile has no stacks', () => {
  assert.deepEqual(stacksOf({ cards: [], style: VERTICAL }), []);
});

test('things are grouped by stackId', () => {
  const stacks = stacksOf({
    cards: [card('a', 'left'), card('b', 'right'), card('c', 'left')],
    style: VERTICAL,
  });
  assert.equal(stacks.length, 2);
  assert.deepEqual(stacks.map((s) => s.id), ['left', 'right']);
  assert.deepEqual(stacks[0].pileables.map((p) => p.id), ['a', 'c']);
  assert.deepEqual(stacks[1].pileables.map((p) => p.id), ['b']);
});

test('order WITHIN a stack follows pile.cards, not stackId order', () => {
  // The flat list is authoritative for ordering - that is the whole
  // reason membership is a foreign key on the child rather than a
  // nested array that could disagree with it.
  const stacks = stacksOf({
    cards: [card('c', 'x'), card('a', 'x'), card('b', 'x')],
    style: VERTICAL,
  });
  assert.deepEqual(stacks[0].pileables.map((p) => p.id), ['c', 'a', 'b']);
});

test('stack order follows first appearance in pile.cards - stable, not alphabetical', () => {
  // Stable so a re-render never reshuffles the columns under a player's
  // cursor.
  const stacks = stacksOf({
    cards: [card('a', 'zebra'), card('b', 'apple')],
    style: VERTICAL,
  });
  assert.deepEqual(stacks.map((s) => s.id), ['zebra', 'apple']);
});

test('a player-formed stack needs nothing derivable from the thing itself', () => {
  // D129's whole reason: two IDENTICAL cards in different stacks. No
  // sortValue could ever separate these.
  const twin = (id, stackId) => ({ id, pileableType: 'card', rank: 'A', suit: 'spades', stackId });
  const stacks = stacksOf({ cards: [twin('a', 's1'), twin('b', 's2')], style: VERTICAL });
  assert.equal(stacks.length, 2);
});

test('a pile with SOME things unplaced keeps them in a default stack', () => {
  const stacks = stacksOf({ cards: [card('a', 'left'), card('b')], style: VERTICAL });
  assert.equal(stacks.length, 2);
  assert.deepEqual(stacks.find((s) => s.id === undefined).pileables.map((p) => p.id), ['b']);
});

// ---------------------------------------------------------------------
// The Stack owns style and spread, and asks each Stackable where it
// goes. The Pile chooses the style (a cascade is vertical, a run is
// horizontal) - the Stack never decides it, and nothing branches on it.
// ---------------------------------------------------------------------

test('a stack lays its things out along its own style', () => {
  const stack = new Stack({ pileables: [card('a'), card('b'), card('c')], style: VERTICAL, spread: 0 });
  assert.deepEqual(stack.layout(), [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 0, y: 1 },
    { id: 'c', x: 0, y: 2 },
  ]);
});

test('the same stack laid out horizontally steps across instead', () => {
  const stack = new Stack({ pileables: [card('a'), card('b')], style: HORIZONTAL, spread: 0 });
  assert.deepEqual(stack.layout(), [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 1, y: 0 },
  ]);
});

test('layout delegates to each Stackable rather than recomputing', () => {
  // Guard against the offset formula being reimplemented here - the
  // exact duplication (four copies of one calc()) this design removes.
  const stack = new Stack({ pileables: [card('a'), card('b')], style: VERTICAL, spread: 0.5 });
  assert.deepEqual(stack.layout(), [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 0, y: 0.5 },
  ]);
});

test('extent is how far the LAST thing sits - the caller adds one card', () => {
  // The pile needs this to size itself; getting it wrong is what made
  // the document taller than the viewport and tripped lint:design.
  const vertical = new Stack({ pileables: [card('a'), card('b')], style: VERTICAL, spread: 0 });
  assert.deepEqual(vertical.extent(), { x: 0, y: 1 });

  const horizontal = new Stack({ pileables: [card('a'), card('b')], style: HORIZONTAL, spread: 0 });
  assert.deepEqual(horizontal.extent(), { x: 1, y: 0 });
});

test('extent comes from the SAME layout the rendering uses', () => {
  // Never recomputed from the count - that second path is how a stack
  // starts claiming more room than it draws.
  const stack = new Stack({ pileables: [card('a'), card('b'), card('c')], style: VERTICAL, spread: 0.5 });
  const { x, y } = stack.layout().at(-1);
  assert.deepEqual(stack.extent(), { x, y });
});

test('a fully-spread stack occupies exactly one thing of space', () => {
  const stack = new Stack({ pileables: [card('a'), card('b'), card('c')], style: VERTICAL, spread: 1 });
  assert.deepEqual(stack.extent(), { x: 0, y: 0 });
});

test('an empty stack occupies nothing', () => {
  const stack = new Stack({ pileables: [], style: VERTICAL, spread: 0 });
  assert.deepEqual(stack.extent(), { x: 0, y: 0 });
});

// ---------------------------------------------------------------------
// Direction is a property of the STACK, not of the pile (direct user
// request: "make direction per stack so we can all use one happy
// layout"). A pile supplies the DEFAULT for stacks that never chose;
// a stack that did chose keeps its own, which is what lets one pile
// hold a vertical column beside a horizontal run - the case the
// pile-wide style could not express at all.
// ---------------------------------------------------------------------

test('a stack with no recorded style falls back to the pile default', () => {
  const [stack] = stacksOf({ cards: [card('a')], style: VERTICAL });
  assert.equal(stack.style, VERTICAL);
});

test('a stack keeps its OWN recorded style over the pile default', () => {
  const [stack] = stacksOf({
    cards: [card('a', 'col')],
    stacks: { col: { style: HORIZONTAL } },
    style: VERTICAL,
  });
  assert.equal(stack.style, HORIZONTAL);
});

test('one pile can hold stacks running in DIFFERENT styles', () => {
  // The whole point. A battlefield with a vertical lands column beside
  // an ordinary horizontal row of creatures.
  const stacks = stacksOf({
    cards: [card('a', 'col'), card('b', 'col'), card('c', 'row'), card('d', 'row')],
    stacks: { col: { style: VERTICAL }, row: { style: HORIZONTAL } },
    style: HORIZONTAL,
  });
  const [column, row] = stacks;
  assert.equal(column.style, VERTICAL);
  assert.equal(row.style, HORIZONTAL);
  // And they lay out along different axes, from the same one formula.
  assert.deepEqual(column.layout().at(-1), { id: 'b', x: 0, y: 1 });
  assert.deepEqual(row.layout().at(-1), { id: 'd', x: 1, y: 0 });
});

test('per-stack metadata does NOT duplicate membership or ordering', () => {
  // `stacks` carries style only. Membership stays the pileable's
  // own stackId and ordering stays pile.cards, so there is no state
  // where the two can disagree about what is in a stack - the reason
  // a nested `pile.stacks = [[id, id]]` was rejected.
  const stacks = stacksOf({
    cards: [card('a', 'col'), card('b', 'col')],
    stacks: { col: { style: VERTICAL } },
    style: HORIZONTAL,
  });
  assert.equal(stacks.length, 1);
  assert.deepEqual(stacks[0].pileables.map((p) => p.id), ['a', 'b']);
});

test('metadata for a stack that no longer has any cards is simply ignored', () => {
  // A stack empties when its last card moves away. The leftover entry
  // must not conjure a phantom empty stack into the layout.
  const stacks = stacksOf({
    cards: [card('a', 'kept')],
    stacks: { kept: { style: VERTICAL }, gone: { style: HORIZONTAL } },
    style: HORIZONTAL,
  });
  assert.deepEqual(stacks.map((s) => s.id), ['kept']);
});

// ---------------------------------------------------------------------
// Per-stack spread and StackActions (direct user request: a gear
// emblem on every stack opens its own actions; pile-level Tighten
// becomes "Tighten All", ROUTING to each stack's own tighten).
//
// `spread` moves onto the stack beside `style` - same metadata
// map, no new persistence shape - and falls back stack -> pile -> kind
// default, so a pile nobody has touched looks exactly as it did.
// ---------------------------------------------------------------------

test('a stack with no spread of its own falls back to the pile default', () => {
  const [stack] = stacksOf({ cards: [card('a')], style: VERTICAL, spread: 0.4 });
  assert.equal(stack.spread, 0.4);
});

test('a stack keeps its OWN spread over the pile default', () => {
  const [stack] = stacksOf({
    cards: [card('a', 'col')],
    stacks: { col: { style: VERTICAL, spread: 0.9 } },
    style: VERTICAL,
    spread: 0.4,
  });
  assert.equal(stack.spread, 0.9);
});

test('stacks in one pile can be tightened INDEPENDENTLY', () => {
  // The capability the gear exists for: a battlefield column tightened
  // right down while the run beside it stays readable.
  const stacks = stacksOf({
    cards: [card('a', 'tight'), card('b', 'tight'), card('c', 'loose'), card('d', 'loose')],
    stacks: { tight: { style: VERTICAL, spread: 0.9 }, loose: { style: VERTICAL, spread: 0.1 } },
    style: VERTICAL,
    spread: 0.5,
  });
  const [tight, loose] = stacks;
  assert.ok(tight.layout().at(-1).y < loose.layout().at(-1).y,
    'the tightened column occupies less room than the loose one');
});

// Tighten/Loosen slider (2026-09-13): tightenStack/loosenStack merged
// into one `spreadStack` action (a `<spread-slider>`, `ui.js`) - it is
// bounded by its own `min`/`max`, so there is no more disabled-at-the-
// limit state for `stackActions` to compute (the ceiling/floor tests
// below it are gone with the buttons they described).
test('a stack offers spread and flip', () => {
  const [stack] = stacksOf({ cards: [card('a'), card('b')], style: VERTICAL, spread: 0.5 });
  const actions = stack.stackActions();
  assert.deepEqual(actions.ids.toSorted(), ['flipStack', 'spreadStack']);
});

test('a stack of ONE offers no overlap actions - there is nothing to overlap', () => {
  // No false affordance: tighten/loosen/flip on a single card would be
  // three buttons that visibly do nothing.
  const [stack] = stacksOf({ cards: [card('a')], style: VERTICAL, spread: 0.5 });
  assert.deepEqual(stack.stackActions({ maxSpread: 0.85 }).ids, []);
});

// US-145/D167: `Stack.flippedDirection()` (and its tests, formerly here)
// is deleted along with the `FLIP_STACK` toggle action it existed for -
// the gear menu's Flip entry now sets a stack's style directly to
// one of Column/Row/Fan (`SET_STACK_DIRECTION`, see state.test.js), so
// nothing computes "the other" style from the current one any more.

// ---------------------------------------------------------------------
// Stack-scoped tap/untap (direct user request: "add stackaction for
// tap/untap, keep pile level for all stacks"). Pile-level `untapAll`
// is UNCHANGED - this only adds a per-stack pair, gated by pile kind
// (`canTap`) since orientation is meaningful only on tap-capable piles
// (Battlefield/Lands), unlike tighten/loosen/flip which are universal.
// ---------------------------------------------------------------------

const tappable = (id, orientation) => ({ id, pileableType: 'card', ...(orientation && { orientation }) });

test('tap/untap are absent unless the caller says this pile can tap', () => {
  const [stack] = stacksOf({ cards: [tappable('a')], style: VERTICAL });
  assert.deepEqual(stack.stackActions({ maxSpread: 0.85, canTap: false }).ids, []);
});

test('tap/untap are offered even for a stack of ONE - unlike tighten/loosen/flip', () => {
  // A single permanent is still tappable; it just has nothing to
  // overlap, which is the distinction tighten/loosen/flip are gated on.
  const [stack] = stacksOf({ cards: [tappable('a')], style: VERTICAL });
  const actions = stack.stackActions({ maxSpread: 0.85, canTap: true });
  assert.deepEqual(actions.ids.toSorted(), ['tapStack', 'untapStack']);
});

test('untapStack is disabled when every card is already upright', () => {
  const [stack] = stacksOf({ cards: [tappable('a'), tappable('b')], style: VERTICAL });
  const { disabled } = stack.stackActions({ maxSpread: 0.85, canTap: true });
  assert.ok(disabled.includes('untapStack'));
  assert.ok(!disabled.includes('tapStack'));
});

test('tapStack is disabled when every card is already tapped', () => {
  const [stack] = stacksOf({
    cards: [tappable('a', 'landscape'), tappable('b', 'landscape')],
    style: VERTICAL,
  });
  const { disabled } = stack.stackActions({ maxSpread: 0.85, canTap: true });
  assert.ok(disabled.includes('tapStack'));
  assert.ok(!disabled.includes('untapStack'));
});

test('a MIXED stack disables neither tap action - there is real work for both directions', () => {
  const [stack] = stacksOf({
    cards: [tappable('a', 'landscape'), tappable('b')],
    style: VERTICAL,
  });
  const { disabled } = stack.stackActions({ maxSpread: 0.85, canTap: true });
  assert.ok(!disabled.includes('tapStack'));
  assert.ok(!disabled.includes('untapStack'));
});
