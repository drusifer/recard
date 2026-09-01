/**
 * The pile-type registry (D42, D56) - `pile.kind` dispatches here
 * instead of being switched on as a string across state.js,
 * pileActions.js, and ui.js. Maps each `kind` string to its real class
 * (`extends Pile`).
 *
 * D93 (direct user request: "undo the Piles are plain data objects
 * decision... rich type hierarchy with domain abstraction"): piles are
 * real instances now, not plain data passed into static methods -
 * `revivePile(data)`/`pileInstanceFor(pile, viewerId)` below are the
 * two places a `kind` string turns into a live `new SubClass(data)`,
 * so nowhere else needs to reach into `PILE_TYPES` directly.
 */
import { Pile } from './Pile.js';
import { DeckPile } from './DeckPile.js';
import { OpponentHandPile } from './OpponentHandPile.js';
import { PlayerHandPile } from './PlayerHandPile.js';
import { DiscardPile } from './DiscardPile.js';
import { FoundationPile } from './FoundationPile.js';
import { RunPile } from './RunPile.js';
import { SetPile } from './SetPile.js';
import { CascadePile } from './CascadePile.js';
import { RankAdjacentPile } from './RankAdjacentPile.js';
import { BattlefieldPile } from './BattlefieldPile.js';
import { ExilePile } from './ExilePile.js';
import { StackPile } from './StackPile.js';

export const PILE_TYPES = {
  plain: Pile,
  deck: DeckPile,
  hand: OpponentHandPile,
  discard: DiscardPile,
  foundation: FoundationPile,
  run: RunPile,
  set: SetPile,
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

/**
 * Reconstructs a real `Pile` instance from plain data (a wire message,
 * a `localStorage` read, or a plain record already living in
 * `state.piles`) - already an instance, returned unchanged. The one
 * place a `kind` string turns into a live object anywhere outside this
 * module.
 */
export function revivePile(data) {
  if (data instanceof Pile) return data;
  const Cls = PILE_TYPES[data.kind] ?? Pile;
  return new Cls(data);
}

/**
 * A throwaway instance carrying only `kind` - for the handful of
 * `pileActions.js` accessors that only ever had a bare kind STRING in
 * scope (not a real pile object), historically because the two real
 * call sites (`ui.js`/`main.js`) never had one either (see
 * `pileLevelActions`'s own comment). None of the methods these
 * accessors call (`pileActions`/`disabledActions`/`resolveDropTarget`)
 * read any instance field beyond `kind` itself, so this is safe.
 *
 * `undefined` for an unregistered kind - deliberately NOT `revivePile`'s
 * "fall back to the base Pile" default: these accessors are
 * presentation-layer input that must degrade to a safe empty result for
 * a kind the registry doesn't recognize, never silently grant a base
 * Pile's real actions to something bogus. Each caller supplies its own
 * safe fallback (`?? []`/`?? {}`).
 */
export function pileForKind(kind) {
  const Cls = PILE_TYPES[kind];
  return Cls ? new Cls({ kind }) : undefined;
}

/**
 * The real instance that decides how this pile behaves TOWARD
 * `viewerId` - `PILE_TYPES[pile.kind]` for every pile, except a hand
 * pile viewed by its own owner, which is a `PlayerHandPile` instead
 * (`OpponentHandPile`, `PILE_TYPES.hand`'s own entry, is correct for
 * anyone else). The one place that decision gets made, so callers with
 * a real viewer (`ui.js`'s render loop, `state.js`'s per-card
 * authorization/view-building) call `pileInstanceFor(pile,
 * viewerId).someMethod(...)` polymorphically, never branching on
 * `pile.kind`/ownership themselves.
 */
export function pileInstanceFor(pile, viewerId) {
  const Cls = pile.kind === 'hand' && pile.ownerId === viewerId ? PlayerHandPile : (PILE_TYPES[pile.kind] ?? Pile);
  return new Cls(pile);
}
