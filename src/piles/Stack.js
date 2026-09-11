/**
 * A Stack is one overlapping run of Stackables inside a Pile (D129).
 *
 *   containment:  Table -> Zone -> Pile -> Stack -> Stackable
 *
 * A pile has one or more; a cascade and a run are the same object at
 * different directions and spreads. It is LIVE, not persisted: built
 * from the pile's own flat `cards` list by grouping on each thing's
 * persisted `stackId`, the same "plain records at rest, live instances
 * when a question needs asking" shape as `Pile` (D93) and `Pileable`
 * (D107). That costs no migration and no protocol change - `pile.cards`
 * is untouched and stays the single source of ORDERING, which is why
 * membership is a foreign key on the child rather than a nested
 * `pile.stacks` array that could disagree with it.
 *
 * A Stack owns the direction and spread and asks each Stackable where
 * it goes; it never computes an offset itself. The PILE chooses the
 * direction - a cascade is vertical, a run is horizontal - so that stays
 * polymorphic in the `Pile` hierarchy where the rest of the pile-kind
 * behaviour already lives, rather than becoming a flag anything
 * branches on here.
 *
 * This replaces `GroupedPile`'s render-time `groupByValue` derivation
 * and the per-card `layout: 'column'` flag, both of which it subsumes:
 * `sortValue` becomes a DEFAULT stackId assigned at insert time rather
 * than a grouping re-derived forever, so a stack a player formed by
 * hand persists exactly as well as one a rule produced.
 */
import { pileableFor } from '../pileables/pileableTypes.js';
import { VERTICAL, HORIZONTAL, FAN } from '../pileables/Stackable.js';

/**
 * The metadata key for the pile's DEFAULT stack - the one holding
 * everything that carries no `stackId` of its own.
 *
 * A real key rather than letting `undefined` index the map: an object
 * lookup with an undefined key silently reads the string `"undefined"`,
 * which works right up until something legitimately names a stack that.
 * The stack's own `id` stays `undefined` (an unplaced card genuinely
 * has no membership); only its metadata slot is named.
 */
export const DEFAULT_STACK_KEY = '_default';

/**
 * Where a stack's metadata lives in `pile.stacks`.
 */
export const stackKeyFor = (stackId) => (stackId === undefined ? DEFAULT_STACK_KEY : String(stackId));

export class Stack {
  /** @param {{id?: string, pileables: object[], direction: string,
   *   spread?: number}} options - `pileables` are plain records, in the
   *   pile's own order; revived here so callers keep passing records. */
  constructor({ id, pileables = [], direction = VERTICAL, spread = 0 } = {}) {
    this.id = id;
    this.direction = direction;
    this.spread = spread;
    this.pileables = pileables.map((record) => pileableFor(record));
  }

  /**
   * Where every thing in this stack sits, relative to the stack's own
   * origin, as unitless stride multipliers. Each Stackable is asked
   * for its own offset (`offsetIn`) - the formula lives there, exactly
   * once, and is unit-tested there. Takes no metrics: units are the
   * caller's business (see `Stackable.offsetIn`).
   */
  layout() {
    return this.pileables.map((pileable, index) => ({
      id: pileable.id,
      ...pileable.offsetIn({
        index,
        // A fan arcs around the centre of the WHOLE stack, so the
        // layout has to know how many it is placing.
        count: this.pileables.length,
        spread: this.spread,
        direction: this.direction,
      }),
    }));
  }

  /**
   * How far the LAST thing in this stack sits from the origin, in the
   * same stride multipliers - so the space the stack occupies is this
   * plus exactly one thing, which the caller's CSS adds:
   *   `height: calc(var(--stack-extent-y) * (var(--card-h) +
   *      var(--card-gap)) + var(--card-h))`
   *
   * The pile needs this to size itself honestly. A stack reporting
   * more room than it uses is what pushed the document past the
   * viewport and tripped `lint:design`'s no-scroll invariant - so this
   * is deliberately derived from the SAME `layout()` the rendering
   * uses, never computed a second way from the count.
   */
  extent() {
    if (this.pileables.length === 0) return { x: 0, y: 0 };
    const { x, y } = this.layout().at(-1);
    return { x, y };
  }

  /**
   * The direction this stack would run if flipped (direct user
   * request: a gear emblem on every stack, offering its own actions).
   *
   * A FAN flips to VERTICAL rather than to HORIZONTAL: a fan already
   * IS horizontal - it is a horizontal stack that arcs - so flipping it
   * to a plain horizontal one would look like nothing happened while
   * silently discarding the arc.
   *
   * `pileDefaultDirection` (the owning Pile kind's own `stackDirection` -
   * `HandPile.stackDirection = FAN`, `GroupedPile`'s = VERTICAL, the
   * base `Pile`'s = HORIZONTAL) makes flip a genuine 2-state toggle for
   * a FAN-default pile: FAN -> VERTICAL -> FAN -> ..., never advancing
   * on to HORIZONTAL. *fix (queued 2026-09-10, direct user report:
   * "cant re-fan my hand stack after flip") - the un-parameterized
   * version below only ever toggled VERTICAL<->HORIZONTAL, so a
   * FAN-default stack could flip AWAY from its own fan but never flip
   * back to it, landing on a plain horizontal run with the arc gone for
   * good instead. Non-FAN-default piles (Battlefield/Lands, VERTICAL;
   * GroupedPile, VERTICAL) are unaffected - the parameter only changes
   * anything when it's FAN.
   */
  flippedDirection(pileDefaultDirection = VERTICAL) {
    if (pileDefaultDirection === FAN) return this.direction === FAN ? VERTICAL : FAN;
    return this.direction === VERTICAL ? HORIZONTAL : VERTICAL;
  }

  /**
   * What this stack offers in its own action menu, and which of those
   * are currently unavailable.
   *
   * Tighten/loosen/flip are absent on a stack of ONE - three controls
   * that visibly do nothing, the same "no false affordance" rule
   * `ChipPile` applies to `changePileType`. The ceiling comes from the
   * caller because it is the PILE KIND's (a chip stack goes tighter
   * than a card fan may), and a stack does not know its own kind.
   *
   * Tap/untap (direct user request: "add stackaction for tap/untap,
   * keep pile level for all stacks" - pile-level `UNTAP_ALL` is
   * untouched) are gated by `canTap`, not by count: a single permanent
   * is still tappable on its own, unlike overlap actions which need a
   * second card to mean anything. `canTap` comes from the caller
   * because it is the PILE KIND's too - only Battlefield/Lands declare
   * `Pile.supportsStackTap`, the same opt-in-static shape
   * `stacksDownward`/`groupBadge` already use, since tapping a chip or
   * a hand card is not a real concept.
   *
   * Disabled the same way tighten/loosen are - when the action would
   * be a no-op on every card in the stack - rather than `orientation
   * Actions`' strict hide/show XOR: a MIXED stack has real work for
   * BOTH directions, so nothing is disabled until the whole stack
   * agrees.
   */
  stackActions({ maxSpread, canTap = false } = {}) {
    const ids = [];
    const disabled = [];
    if (this.pileables.length >= 2) {
      ids.push('tightenStack', 'loosenStack', 'flipStack');
      if (this.spread >= maxSpread) disabled.push('tightenStack');
      if (this.spread <= 0) disabled.push('loosenStack');
    }
    if (canTap && this.pileables.length > 0) {
      ids.push('tapStack', 'untapStack');
      if (this.pileables.every((p) => p.orientation === 'landscape')) disabled.push('tapStack');
      if (this.pileables.every((p) => p.orientation !== 'landscape')) disabled.push('untapStack');
    }
    return { ids, disabled };
  }
}

/**
 * Every stack in a pile, in the order the stacks first appear in
 * `pile.cards`.
 *
 * First-appearance rather than sorted: stable across renders, so a
 * re-render never reshuffles columns under the player's cursor. Things
 * with no `stackId` collect into one default stack (`id: undefined`) -
 * an unplaced thing is in the pile's one stack, not in a stack of its
 * own, which is what keeps every ordinary single-stack pile a
 * single-stack pile with no placement data at all.
 *
 * DIRECTION IS PER STACK (direct user request: "make direction per
 * stack so we can all use one happy layout"). `pile.stacks` is a small
 * metadata map keyed by `stackId` - `{ [stackId]: { direction } }` -
 * and `direction` here is only the PILE'S DEFAULT, used by any stack
 * that never chose one.
 *
 * Metadata, deliberately, and nothing else: it carries direction, not
 * membership and not order. Membership stays each pileable's own
 * `stackId` and order stays `pile.cards`, so there is no state in
 * which the two can disagree about what is IN a stack. That was the
 * decisive objection to a nested `pile.stacks = [[id, id], [id]]`, and
 * it still holds - this map cannot desynchronise from the cards
 * because it never describes them. An entry for a stack whose last
 * card has moved away is simply unused; it never conjures a phantom
 * empty stack into the layout, because the stacks come from the cards.
 *
 * A pile-wide direction could not express one pile holding a vertical
 * column beside a horizontal run - which is exactly what a battlefield
 * is - so it was the last thing forcing a second layout mechanism to
 * exist alongside this one.
 */
export function stacksOf({ cards = [], stacks = {}, direction = VERTICAL, spread = 0 } = {}) {
  const groups = new Map();
  for (const record of cards) {
    const key = record?.stackId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Iterator.from(groups)
    .map(([id, pileables]) => {
      const meta = stacks?.[stackKeyFor(id)];
      return new Stack({
        id,
        pileables,
        direction: meta?.direction ?? direction,
        // Stack -> pile -> kind default, so a pile nobody has adjusted
        // looks exactly as it always did.
        spread: meta?.spread ?? spread,
      });
    })
    .toArray();
}
