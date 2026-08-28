/**
 * The pile-type registry (D42, D56) - `pile.kind` dispatches here
 * instead of being switched on as a string across state.js,
 * pileActions.js, and ui.js. Maps each `kind` string to its real class
 * (`extends Pile`) - a class's static members are read exactly the same
 * way a module namespace's exports were, so every `PILE_TYPES[kind]
 * .method(...)` call site is unchanged.
 */
import { Pile } from './Pile.js';
import { DeckPile } from './DeckPile.js';
import { HandPile } from './HandPile.js';
import { DiscardPile } from './DiscardPile.js';
import { FoundationPile } from './FoundationPile.js';
import { CascadePile } from './CascadePile.js';
import { RankAdjacentPile } from './RankAdjacentPile.js';
import { BattlefieldPile } from './BattlefieldPile.js';
import { ExilePile } from './ExilePile.js';
import { StackPile } from './StackPile.js';

export const PILE_TYPES = {
  zone: Pile,
  deck: DeckPile,
  hand: HandPile,
  discard: DiscardPile,
  foundation: FoundationPile,
  cascade: CascadePile,
  rankAdjacent: RankAdjacentPile,
  battlefield: BattlefieldPile,
  exile: ExilePile,
  stack: StackPile,
};

/**
 * D71 (US-74): `changePileType`'s eligible kinds, in cycle order - the
 * single source of truth for both `state.js`'s `CHANGE_PILE_TYPE`
 * eligibility check and `main.js`'s "advance to the next kind"
 * cycling, so the two can never drift apart. `deck`/`hand` excluded -
 * structural reasons (fixed-id lookup; per-player exactly-one
 * invariant) unrelated to card content, so they stay excluded
 * regardless of the pile being empty. Registry-declaration order
 * (Smith Gate 1 - no strong reason to prefer another).
 */
export const CHANGE_PILE_TYPE_CYCLE = [
  'zone', 'discard', 'foundation', 'cascade', 'rankAdjacent',
  // D79 (US-82): the MTG kinds join the cycle rather than being carved
  // out. They're general-purpose containers like the rest, and excluding
  // them would be exactly the kind of unprompted special case this
  // project's own discipline warns against.
  'battlefield', 'exile', 'stack',
];
