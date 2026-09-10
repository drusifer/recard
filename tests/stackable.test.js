import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stackable, VERTICAL, HORIZONTAL, FAN } from '../src/pileables/Stackable.js';
import { Pileable } from '../src/pileables/Pileable.js';
import { CardPileable } from '../src/pileables/CardPileable.js';
import { ChipPileable } from '../src/pileables/ChipPileable.js';
import { TokenPileable } from '../src/pileables/TokenPileable.js';
import { pileableFor } from '../src/pileables/pileableTypes.js';

// Offsets are UNITLESS STRIDE MULTIPLIERS, not px (Morpheus review
// Condition 2): card metrics are rem-based and rewritten per preset at
// runtime, so px would either need a computed-style read per card or go
// stale. `1` here means "one full stride along the stack's direction",
// and CSS multiplies it by `--card-h + --card-gap` (or `--card-w`).
const at = (index, spread, direction) =>
  new Stackable({ id: `s${index}` }).offsetIn({ index, spread, direction });

// ---------------------------------------------------------------------
// The hierarchy (D129). Stackable sits BETWEEN Pileable and the
// concrete types, so Pileable stays free for a future free-form pile.
// ---------------------------------------------------------------------

test('Stackable is a Pileable, and the concrete types are Stackables', () => {
  assert.ok(new Stackable() instanceof Pileable);
  for (const Type of [CardPileable, ChipPileable, TokenPileable]) {
    assert.ok(new Type() instanceof Stackable, `${Type.name} must be a Stackable`);
    assert.ok(new Type() instanceof Pileable, `${Type.name} must still be a Pileable`);
  }
});

test('Pileable itself is NOT a Stackable - that is the room for free-form', () => {
  // If this ever flips, "leave room for non-stacked piles" has been
  // quietly lost: everything in a pile would be stackable by
  // construction and the distinction would be vacuous.
  assert.ok(!(new Pileable() instanceof Stackable));
  assert.equal(typeof Pileable.prototype.offsetIn, 'undefined');
});

test('a record revived through the registry is a Stackable', () => {
  assert.ok(pileableFor({ pileableType: 'card' }) instanceof Stackable);
  assert.ok(pileableFor({ pileableType: 'chip' }) instanceof Stackable);
  assert.ok(pileableFor({}) instanceof Stackable);
});

// ---------------------------------------------------------------------
// Stack membership is PERSISTED, not derived (D129) - a stack a player
// formed by hand has nothing to derive from.
// ---------------------------------------------------------------------

test('stackId is read off the record, and defaults for an unplaced thing', () => {
  assert.equal(new Stackable({ stackId: 'red' }).stackId, 'red');
  assert.equal(new Stackable().stackId, undefined);
});

test('stackId survives a JSON round trip - records stay plain at rest', () => {
  // The whole reason membership lives in a flat field: state.piles is
  // serialized to the wire and localStorage on every send.
  const record = { id: 'c1', pileableType: 'card', stackId: 'left' };
  // Deliberately a real JSON round trip and not `structuredClone`: what
  // this guards is the WIRE and `localStorage` shape, and JSON is what
  // those two actually use.
  const wire = JSON.stringify(record);
  const revived = pileableFor(JSON.parse(wire));
  assert.equal(revived.stackId, 'left');
});

// ---------------------------------------------------------------------
// The offset. ONE formula: a thing sits `index` visible strides along
// the stack's direction. No axis special cases, no depth multiplier, no
// sign flip - those were artifacts of computing this as flex margins.
// ---------------------------------------------------------------------

test('the first thing in a stack sits at the origin', () => {
  assert.deepEqual(at(0, 0.5, VERTICAL), { x: 0, y: 0 });
  assert.deepEqual(at(0, 0.5, HORIZONTAL), { x: 0, y: 0 });
});

test('vertical stacks step DOWN by a full stride at spread 0', () => {
  assert.deepEqual(at(1, 0, VERTICAL), { x: 0, y: 1 });
  assert.deepEqual(at(2, 0, VERTICAL), { x: 0, y: 2 });
});

test('horizontal stacks step ACROSS by a full stride at spread 0', () => {
  assert.deepEqual(at(1, 0, HORIZONTAL), { x: 1, y: 0 });
  assert.deepEqual(at(2, 0, HORIZONTAL), { x: 2, y: 0 });
});

test('direction picks the AXIS only - the multiplier is the same number', () => {
  // Which stride it multiplies (card height vs width) is CSS's job, so
  // there is no per-direction arithmetic left here to get wrong.
  assert.equal(at(3, 0.4, VERTICAL).y, at(3, 0.4, HORIZONTAL).x);
});

test('spread 1 collapses a stack to a single position', () => {
  for (const direction of [VERTICAL, HORIZONTAL]) {
    for (const index of [1, 2, 5]) {
      assert.deepEqual(at(index, 1, direction), { x: 0, y: 0 }, `${direction} #${index}`);
    }
  }
});

test('every step is the SAME size, however deep the stack', () => {
  // The bug this replaces: a 3rd card landed at the same offset as the
  // 2nd, because each margin was measured from a shared reference
  // instead of from its predecessor. Assert 3+ precisely - comparing
  // only card 0 to card 1 cannot see a compounding error, which is
  // exactly why the browser test missed it.
  const y = (index) => at(index, 0.5, VERTICAL).y;
  assert.equal(y(1), 0.5);
  assert.equal(y(2), 1);
  assert.equal(y(3), 1.5);
  assert.equal(y(3) - y(2), y(2) - y(1));
});

test('a real chip stack at its default spread nearly fully overlaps', () => {
  // Regression guard for the live finding: a stack at spread 0.963 sat
  // 69px APART instead of overlapping.
  const { y } = at(1, 0.963, VERTICAL);
  assert.ok(y < 0.05, `expected a near-collapsed stack, got ${y} strides of separation`);
});

test('rising spread always tightens, never loosens', () => {
  let previous = Infinity;
  for (const spread of [0, 0.2, 0.5, 0.8, 0.963, 1]) {
    const { y } = at(2, spread, VERTICAL);
    assert.ok(y < previous, `spread ${spread} must tighten: ${y} !< ${previous}`);
    previous = y;
  }
});

test('spread is clamped - a thing never inverts past its predecessor', () => {
  // --pile-spread is player-driven (Tighten/Loosen), so clamp rather
  // than trust: past 1 the stack would start reversing itself.
  assert.deepEqual(at(1, 1.5, VERTICAL), { x: 0, y: 0 });
  assert.deepEqual(at(1, -0.5, VERTICAL), { x: 0, y: 1 });
});

test('direction is required to be one of the two real ones', () => {
  assert.throws(() => at(1, 0.5, 'diagonal'), /direction/i);
});

// ---------------------------------------------------------------------
// FAN is a third stack layout, not a decoration on top of one (direct
// user question: "are you including Fan as a stack layout option?").
//
// It used to be `applyFanOffset` in ui.js writing a `--raise-base`
// transform over a horizontally-positioned row - a second mechanism
// doing layout, which is exactly what this rewrite exists to remove.
// A hand IS a stack: cards overlapping along one axis. It just arcs.
// ---------------------------------------------------------------------

const fanned = (index, count, spread = 0.7) =>
  new Stackable({ id: `f${index}` }).offsetIn({ index, count, spread, direction: FAN });

test('FAN is a real direction, accepted like the other two', () => {
  assert.doesNotThrow(() => fanned(0, 3));
  assert.throws(() => new Stackable().offsetIn({ index: 0, count: 3, spread: 0, direction: 'arc' }), /direction/i);
});

test('a fan still overlaps along x exactly like a horizontal stack', () => {
  // The arc is added TO a horizontal stack, not instead of one - so
  // Tighten/Loosen keeps working on a hand with no special case.
  for (const index of [0, 1, 2, 3]) {
    assert.equal(
      fanned(index, 4, 0.7).x,
      at(index, 0.7, HORIZONTAL).x,
      `card ${index} must sit where a horizontal stack would put it`,
    );
  }
});

test('a fan rotates each card by its distance from the centre', () => {
  const [a, b, c] = [0, 1, 2].map((index) => fanned(index, 3));
  assert.ok(a.rotate < 0, 'the left card leans left');
  assert.equal(b.rotate, 0, 'the middle card is upright');
  assert.ok(c.rotate > 0, 'the right card leans right');
  assert.equal(Math.abs(a.rotate), Math.abs(c.rotate), 'the arc is symmetric');
});

test('a fan of one card is upright and undrooped - no arc to be on', () => {
  const only = fanned(0, 1);
  assert.equal(only.rotate, 0);
  assert.equal(only.y, 0);
});

test('an even-sized fan straddles the centre instead of picking one card', () => {
  const [a, b, c, d] = [0, 1, 2, 3].map((index) => fanned(index, 4));
  assert.equal(a.rotate, -d.rotate);
  assert.equal(b.rotate, -c.rotate);
  assert.ok(Math.abs(b.rotate) < Math.abs(a.rotate), 'the inner pair leans less than the outer pair');
});

test('the droop is a CURVE, not a V - the whole point of squaring it', () => {
  // A linear droop paired with a bottom-center pivot reads as two
  // straight edges meeting at the middle ("it still looks triangular
  // rather than a steady curve"). Squaring is what curves it, so
  // walking from the centre outward the steps must GROW rather than
  // stay constant - a constant step IS the V.
  const fromCentre = [4, 3, 2, 1, 0].map((index) => fanned(index, 9).y);
  const steps = fromCentre.slice(1).map((droop, index) => droop - fromCentre[index]);
  for (const [index, step] of steps.slice(1).entries()) {
    assert.ok(step > steps[index],
      `droop steps must grow toward the ends, got ${steps.map((n) => n.toFixed(3)).join(', ')}`);
  }
});

test('a fan droops DOWNWARD and symmetrically', () => {
  assert.ok(fanned(0, 5).y > 0, 'the end cards hang below the centre');
  assert.equal(fanned(0, 5).y, fanned(4, 5).y, 'both ends hang equally');
  assert.equal(fanned(2, 5).y, 0, 'the centre card is the high point');
});

test('the droop scales with the cards, because it is in stride units', () => {
  // The old formula was a fixed `0.08rem` per step, so a preset that
  // resized the cards left the arc behind. Expressed as a fraction of
  // a stride, the same multiplier is correct at every card size - the
  // same reason offsets are multipliers rather than px.
  assert.ok(fanned(0, 9).y < 1, 'a droop is a fraction of a stride, not a whole card');
});

test('the other two directions carry no rotation at all', () => {
  assert.equal(at(2, 0.5, HORIZONTAL).rotate ?? 0, 0);
  assert.equal(at(2, 0.5, VERTICAL).rotate ?? 0, 0);
});
