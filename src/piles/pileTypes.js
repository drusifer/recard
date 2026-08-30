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
  plain: Pile,
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
 * D87 (*nit, direct user request: "all pile types must be convertible to
 * any other pile type... deck -> hand -> discard -> all are allowed"):
 * every registered kind is both a valid source AND target for
 * `changePileType` now - the D86 source/target asymmetry (deck/hand as
 * targets only) is gone, superseded by this explicit "ALL" directive.
 * Single source of truth for `ui.js`'s change-type menu choices; the
 * reducer itself (`state.js`'s `CHANGE_PILE_TYPE`) no longer needs a
 * separate list at all - any existing pile's `kind` is trivially already
 * valid as a source (it got there through this same registry), so it
 * only checks the TARGET kind is a real `PILE_TYPES` key.
 *
 * This only stays safe because the conversion is genuinely presentation-
 * only (direct user request: "it's just a presentation thing" - cards/
 * count/id never change, only `kind`+maybe the default `name`) AND
 * because `ensureHandPile` (`state.js`) was hardened alongside this to
 * never reuse a canonical id (`hand:<playerId>`) that's already claimed
 * by a pile that used to be that player's hand but got converted away -
 * see its own comment. Without that fix, converting a hand away and then
 * drawing/dealing again would have produced two piles sharing one id.
 */
export const CHANGE_PILE_TYPE_KINDS = Object.keys(PILE_TYPES);

/**
 * *nit (direct user request): a change-type MENU needs a human label per
 * kind, not just the raw `kind` string - reuses the exact same "plain ->
 * Pile, else capitalize" rule `state.js`'s `defaultNameWord` already
 * establishes for a freshly-created pile's own default name, so a menu
 * entry reads the same word a pile spawned as that kind would actually
 * be called. Duplicated rather than imported: `ui.js` (this function's
 * only caller) deliberately never imports `state.js` (presentation layer
 * staying decoupled from the reducer module), and this one-line rule is
 * cheaper to keep in sync by inspection than to add that coupling for.
 */
export function pileKindLabel(kind) {
  if (kind === 'plain') return 'Pile';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
