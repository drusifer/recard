/**
 * A Stackable is a Pileable that participates in a STACK - an
 * overlapping run of things, which is what a cascade and a run both
 * are at different directions and spreads (D129).
 *
 * WHERE THIS SITS
 *   containment:  Table -> Zone -> Pile -> Stack -> Stackable
 *   class:        Pileable -> Stackable -> Card/Chip/Token Pileable
 *
 * It slots BETWEEN `Pileable` and the concrete types deliberately.
 * `Pileable` stays what D107 says it is - the honest, behaviour-free
 * type for "a thing that can be in a pile" - so a free-form pile can
 * arrive later holding Pileables that simply never became Stackables.
 * Putting overlap on the root instead would make every pileable
 * stackable by construction and the distinction would be vacuous;
 * making `Stackable` a SIBLING of `CardPileable` would need a card to
 * be both at once, which is multiple inheritance - JS won't do it, and
 * this codebase has no mixin anywhere to follow. Pushing the shared
 * concern up into a shared parent is the move `GroupedPile` already
 * made (D116, "they share a parent class though so let's push some of
 * that up").
 *
 * WHY THE OFFSET LIVES ON THE THING BEING STACKED
 * It used to live in `style.css`, once per context, as four separate
 * `calc()` formulas - and two of those contexts were given DIFFERENT
 * shapes that were both wrong in different ways ("3 cards cascades
 * weird"; a real chip stack sitting 69px APART at the spread that
 * should have nearly collapsed it). Nothing caught either, because CSS
 * cannot be unit-tested and the one browser test compared card 0 to
 * card 1, where a depth-chaining error is invisible by construction.
 *
 * The two "different shapes" were never a fact about stacking. They
 * came from computing the offset as a flex MARGIN: inside a card row
 * `margin-top` is a cross-axis margin measured from the line's shared
 * top (so it doesn't chain, and needed a depth multiplier bolted on),
 * while inside a chip stack the same property is the main-axis margin
 * (so it chains for free, from an opposite baseline, needing the
 * opposite sign). Once a thing is positioned from its own INDEX, none
 * of that exists: there is one formula, and it is this file.
 */
import { Pileable } from './Pileable.js';

/** The two directions a stack can run. A cascade is vertical, a run is
 * horizontal; there is no third, and nothing accepts a free string. */
export const VERTICAL = 'vertical';
export const HORIZONTAL = 'horizontal';

/**
 * A fan (a hand): a horizontal stack that also ARCS - each card
 * rotated by its distance from the centre and drooping on a curve.
 *
 * A real layout here rather than a decoration applied over one
 * (direct user question: "are you including Fan as a stack layout
 * option?"). It used to be `applyFanOffset` in `ui.js` writing a
 * `--raise-base` transform on top of a horizontally-positioned row,
 * which meant a hand's position came from one mechanism and its arc
 * from another - the last place two layout mechanisms coexisted.
 */
export const FAN = 'fan';

/**
 * Degrees of lean per card away from the centre of a fan.
 */
const FAN_DEGREES_PER_CARD = 5;

/**
 * How far the outermost cards of a fan hang below the centre, per
 * squared step, as a fraction of one stride.
 *
 * A fraction rather than the old fixed `0.08rem`: card metrics are
 * rewritten at runtime per preset, so a fixed length left the arc
 * behind whenever the cards resized. Same reasoning as offsets being
 * multipliers - see `offsetIn`.
 */
const FAN_DROOP_PER_STEP = 0.019;

/** `--pile-spread` is player-driven (Tighten/Loosen), so clamp rather
 * than trust: above 1 a thing would invert past its predecessor, below
 * 0 it would push away from the stack it was placed on. */
const clampSpread = (spread) => Math.min(1, Math.max(0, spread ?? 0));

export class Stackable extends Pileable {
  /**
   * Which stack within its pile this thing belongs to.
   *
   * PERSISTED on the record, not derived (D129). Deriving it worked
   * only while every real case happened to be a function of the thing
   * itself - `GroupedPile.sortValue`: a chip's denomination, a land's
   * colour. A stack a PLAYER formed by dragging cards out has nothing
   * to derive from, and a placement decision that isn't recorded is
   * lost on reload and never reaches the other clients.
   *
   * A flat field rather than a nested `pile.stacks = [[id, id], [id]]`:
   * `pile.cards` already holds the ordering, so nesting would duplicate
   * it and create a state where a card is in `cards` and missing from
   * `stacks`. A foreign key on the child has one source of truth, and
   * keeps records plain at rest (D93/D107) - no wire or `localStorage`
   * shape change, no migration across 15 pile kinds.
   *
   * `undefined` for a thing not yet placed in any particular stack,
   * which `Stack` reads as the pile's one default stack.
   *
   * DELIBERATELY NOT DECLARED as a class field here. A Pileable is a
   * VIEW over its record (`Object.assign(this, record)` in the base
   * constructor), and class fields initialize AFTER `super()` returns -
   * so `stackId = undefined` on this class would silently overwrite
   * every record's real value with `undefined`. Caught by this
   * module's own round-trip test, not by review. D107 already names
   * the METHOD-vs-field collision hazard of the view-over-record
   * shape; this is the same trap reached through a field declaration,
   * and the rule is the stricter one: a Pileable subclass declares no
   * instance fields at all, only statics and methods.
   *
   * Note also `stackId` and not `stack`, per D107's collision rule -
   * it keeps the field clear of any future `stack()` method.
   */

  /**
   * Where this thing sits in its stack, relative to the stack's own
   * origin, as UNITLESS STRIDE MULTIPLIERS on each axis.
   *
   * ONE formula, both directions: a thing sits `index` VISIBLE STRIDES
   * along the stack's direction, where a visible stride is how much of
   * one thing stays uncovered beside the next - a full stride at spread
   * 0, nothing at spread 1, linear between, so equal Tighten steps
   * uncover equal amounts at every spread. Which axis the multiplier
   * lands on is the only thing direction decides; the multiplier itself
   * is the same number either way.
   *
   * Offsets are absolute from the stack origin rather than relative to
   * the previous thing, so depth chains by arithmetic and cannot
   * compound an error: index 3 lands exactly one step past index 2 by
   * construction, which is the specific bug that kept coming back.
   *
   * MULTIPLIERS, DELIBERATELY NOT PX (Morpheus, iteration-1 review
   * Condition 2). Card metrics here are rem-based custom properties
   * (`--card-w: 2.7rem`) and are REWRITTEN AT RUNTIME per preset
   * (`ui.js` setCardSize). A px-returning formula would force the
   * caller to either read `getComputedStyle` per card per render -
   * layout thrash, and impossible to unit-test without a browser - or
   * freeze a px value that goes silently stale the next time a preset
   * changes the card size, losing the resolution-independence the rem
   * sizing exists to provide.
   *
   * So the caller writes these as `--stack-x`/`--stack-y` and ONE CSS
   * rule converts:
   *   `left: calc(var(--stack-x) * (var(--card-w) + var(--card-gap)))`
   * That is not a walk-back of "style.css stops computing anything" -
   * it stops computing the LAYOUT. The formula (the thing that was
   * wrong four times) is here, in JS, unit-tested; CSS is left with a
   * multiply it cannot get subtly wrong.
   */
  offsetIn({ index, count = 0, spread, direction }) {
    if (direction !== VERTICAL && direction !== HORIZONTAL && direction !== FAN) {
      throw new TypeError(
        `Stackable.offsetIn: direction must be ${VERTICAL}, ${HORIZONTAL} or ${FAN}, got ${direction}`,
      );
    }
    const step = index * (1 - clampSpread(spread));
    // Only a fan rotates, so only a fan reports a rotation - the other
    // two keep the plain `{x, y}` contract and CSS defaults the angle
    // (`var(--stack-rotate, 0deg)`).
    if (direction === VERTICAL) return { x: 0, y: step };
    if (direction === HORIZONTAL) return { x: step, y: 0 };

    // A fan overlaps along x exactly as a horizontal stack does - the
    // arc is added TO that, so Tighten/Loosen keeps working on a hand
    // with no special case anywhere.
    //
    // `offset` is the card's distance from the CENTRE of the fan, so an
    // even-sized hand straddles the middle instead of one card being
    // arbitrarily upright. The rotation is linear in it (a real fanned
    // hand's cards do sit at roughly equal angles) but the droop is
    // SQUARED: a linear droop paired with each card pivoting around its
    // own bottom-centre reads as a sharp V, two straight edges meeting
    // at the middle, not an arc. Squaring is what curves it - cards
    // near the centre barely drop, the ends drop increasingly more.
    const offset = index - (count - 1) / 2;
    return {
      x: step,
      y: offset * offset * FAN_DROOP_PER_STEP,
      rotate: offset * FAN_DEGREES_PER_CARD,
    };
  }
}
