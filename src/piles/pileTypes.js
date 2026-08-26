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

export const PILE_TYPES = {
  zone: Pile,
  deck: DeckPile,
  hand: HandPile,
  discard: DiscardPile,
  foundation: FoundationPile,
  cascade: CascadePile,
  rankAdjacent: RankAdjacentPile,
};
