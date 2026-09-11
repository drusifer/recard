# Agent State

## Context

**D129 (user-confirmed, this session) is the binding model for stacking.**
Reached by three successive user corrections of my own wrong models —
worth reading, because each wrong turn is a trap that is easy to walk
back into:

1. I first built `src/cardStacking.js` with `crossAxisOffset` /
   `mainAxisOffset` — "two baselines, one with a depth multiplier."
   **Wrong**: that distinction is not a fact about stacking at all, it
   is an artifact of computing overlap as flex MARGINS inside two
   differently-shaped containers. I took the accidental structure of
   the DOM and enshrined it in a supposedly-pure math module, which
   reproduced the original bug's root cause instead of removing it.
   DELETED, along with its tests.
2. I then designed `StackableElement` as a CONTAINER base class for
   `<pile-panel>`/`<chip-tray>` to extend. **Wrong, inverted**: user —
   "A Stackable is the object being Stacked (is a Pileable). The
   webcomponent contains a list of Stackable objects." There is no
   `StackableElement`; the components keep `extends HTMLElement`.
3. I proposed `Stack` be fully DERIVED from `pile.cards`. **Wrong**:
   user — "i don't think derived will work if there is more than one
   stack in a pile (like lands pile)." Correct: derivation via
   `GroupedPile.sortValue` only works while membership is a function of
   the thing itself (chip denom, land colour). A stack a PLAYER formed
   by dragging cards out has nothing to derive from, and an unrecorded
   placement is lost on reload and never reaches other clients.

**The settled model (D129):**

    containment:  Table -> Zone -> Pile -> Stack -> Stackable
    class:        Pileable -> Stackable -> Card/Chip/Token Pileable

- `Stackable extends Pileable` and the concrete types re-parent onto
  it. `Stackable` sits BETWEEN deliberately: `Pileable` stays the
  behaviour-free root D107 says it is, which is the room the user
  explicitly asked to leave for future FREE-FORM (non-stacked) piles.
  A sibling `Stackable` was rejected — a card would have to be both a
  `CardPileable` and a `Stackable` at once, i.e. multiple inheritance,
  which JS won't do and which has no mixin precedent anywhere here.
- Overlap is VERTICAL or HORIZONTAL only. A cascade and a run are the
  same object at different directions/spreads. Grouping/columns/grid is
  NOT Stackable's concern — that layer composes N Stacks.
- `Stack` is LIVE; membership is PERSISTED as a flat `stackId` field on
  each Stackable. Rejected nested `pile.stacks = [[id, id], [id]]`:
  `pile.cards` already holds the ordering, so nesting duplicates it and
  admits a state where a card is in `cards` but missing from `stacks`.
  A foreign key on the child has one source of truth and keeps records
  plain at rest (D93/D107) — no wire/localStorage change, no migration
  across 15 pile kinds.
- The PILE chooses direction (cascade vertical, run horizontal), so it
  stays polymorphic in the `Pile` hierarchy. Nothing branches on it.

**New hazard found, worth generalizing (extends D107).** A class FIELD
on a Pileable subclass silently clobbers the record. `Pileable` is a
view over its record (`Object.assign(this, record)` in the base
constructor) and class fields initialize AFTER `super()` returns — so
`stackId = undefined;` on `Stackable` overwrote every record's real
value with `undefined`. Caught by the round-trip test, NOT by review.
D107 names the method-vs-field NAME collision; this is the same trap
via field declaration, and the rule is stricter: **a Pileable subclass
declares no instance fields at all, only statics and methods.**

## Current Task

`*impl stackable` — COMPLETE. One layout mechanism, everywhere. The
reported cascade bug is fixed, with live regression tests proven to
catch it.

**Iteration 3 (this one) finished the unification:**
- **Smith's defect fixed**: `LandsPile.defaultSpread = MAX_SPREAD`
  (0.85) instead of inheriting the chip-calibrated 0.963. Scoped to
  lands - a chip tray SHOULD stay tighter than any card pile, and a
  test guards that it still is.
- **Direction is PER STACK**: `pile.stacks = { [stackId]: { direction } }`,
  a metadata map carrying direction ONLY - never membership, never
  order - so it cannot desynchronise from `cards`. One pile can now
  hold a vertical column beside a horizontal run, which is what was
  forcing a second layout mechanism to exist.
- **`layout` is GONE** from state and the DOM. A drop's `column`/
  `stack`/`overlap` hint is translated by `Pile.insertPileable` into
  stack membership plus that stack's direction, and nothing persists
  it. D21's "layout belongs to whichever card ends up second" rule
  went with it, as did `removePileable`'s stale-layout strip - a
  shorter stack is simply correct.
- **FAN is the third stack layout** (direct user question). A hand is
  a horizontal stack that arcs. `applyFanOffset`, the `options.fan`
  flag and its plumbing are deleted; the droop is now a fraction of a
  stride rather than a fixed `0.08rem`, so it scales with per-preset
  card resizing, which the old one did not.
- **`renderPileCards` renders every pile as a row of stacks** and
  returns them. `<chip-tray>` no longer builds columns or positions
  anything - it adds badges. All four CSS overlap formulas plus
  `--column-depth` are deleted; CSS does unit conversion only.

Net effect on source: **-24 lines of non-comment code** (192 added,
216 removed across `src/` + `style.css`), with four layout mechanisms
collapsed into one.

Suites: 761 unit / 18 browser / 13 rtg, all green. `make check`
PASSED. `lint-style` clean. `lint-js` 10 (down from the 13 baseline).

Shipped this iteration:
- `src/pileables/Stackable.js` — `VERTICAL`/`HORIZONTAL`, `offsetIn()`.
  ONE formula both directions: a thing sits `index` visible strides
  along the direction, absolute from the stack origin (so depth chains
  by arithmetic and cannot compound), spread clamped 0..1. Throws on an
  unknown direction.
- `src/piles/Stack.js` — `Stack` (owns direction+spread, delegates
  every offset to the Stackable, plus `extent()` so a pile can size
  itself honestly) and `stacksOf(pile)` (groups the flat list by
  `stackId`, first-appearance order so re-renders never reshuffle
  columns under the cursor; no-`stackId` things collect into one
  default stack).
- `CardPileable`/`ChipPileable`/`TokenPileable` re-parented onto
  `Stackable` (import + extends only, no behaviour change).
- `tests/stackable.test.js` (15) + `tests/stack.test.js` (14).

Then both review conditions, same iteration:
- **Condition 2 (interface change): `offsetIn` returns unitless STRIDE
  MULTIPLIERS, not px.** It no longer takes metrics at all. Direction
  now decides only WHICH AXIS the multiplier lands on - the multiplier
  itself is the same number either way, so there is no per-direction
  arithmetic left in JS to get wrong. The caller writes `--stack-x`/
  `--stack-y` and one CSS rule converts:
  `left: calc(var(--stack-x) * (var(--card-w) + var(--card-gap)))`.
  `Stack.layout()`/`Stack.extent()` lost their metrics arguments to
  match; `extent()` now reports the LAST thing's offset (the caller's
  CSS adds one card) and is derived from the same `layout()` the
  rendering uses, never recomputed from the count.
- **Condition 1: `stackId` now strips everywhere `layout` strips.**
  `state.js`'s `toHandCard` and `toDeckCard` are the only two choke
  points (verified: every DEAL/DRAW/PICKUP/TAKE_PILE/PICKUP_SPLIT
  path routes through one of them), so the fix is two destructures.
  4 new tests in `state.test.js`, all going through the REAL reducer
  actions rather than calling the helpers - including a deliberate
  over-stripping guard (`stackId` must SURVIVE a table-to-table MOVE,
  or player-formed stacks could never persist at all, which is the
  capability D129 exists to provide).

Verified: `bobp make test` 733/733 pass. `lint-style` clean.
`lint-js` back at its pre-existing 13-error baseline (I introduced 2,
both fixed; none of the 13 are in files I touched).

### StackActions — BUILT (direct user decision on the GUI)

User's call, verbatim shape: "I like the badge idea but since this is
universal for stacks use an additional emblem using the gear symbols
to pull up the stack action menu. note keep pile level tighten/loosen
as tighten all / loose all PileActions that route each stacks
tight/loosen action."

- **`spread` moved onto the stack**, beside `direction` in the same
  metadata map - no new persistence shape. Falls back stack -> pile ->
  kind default, so an untouched pile looks exactly as it did.
- **`Stack.stackActions({ maxSpread })`** returns `tightenStack` /
  `loosenStack` / `flipStack` plus disabled ids. A stack of ONE offers
  nothing - three controls that visibly do nothing is the same false
  affordance `ChipPile` refuses for `changePileType`.
- **`Stack.flippedDirection()`** - a FAN flips to VERTICAL, not
  HORIZONTAL: a fan already IS horizontal, so flipping it to a plain
  horizontal stack would look like nothing happened while silently
  discarding the arc.
- **`ADJUST_PILE_SPREAD` gained an optional `stackKey`**, following
  the existing "one action, signed delta" precedent (D75/D103) rather
  than adding a second action. Omitting the key means EVERY stack -
  that is the routing. It cannot mean "the default stack", because
  that stack has a real key (`DEFAULT_STACK_KEY`) precisely so the two
  are never confused.
- **`FLIP_STACK`** is new - replicated like every other presentation
  change, since everyone at the table sees the same arrangement.
- **`tighten`/`loosen` -> `tightenAll`/`loosenAll`** everywhere (six
  pile subclasses declared their own copies). "All" is disabled only
  when EVERY stack has hit the limit - one column at the ceiling must
  not stop the others, which is the point of routing.
- **The gear emblem** (`.stack-gear`, `stackGearFor`) on every stack
  that has something to offer, opening `openStackActionMenu` - which
  reuses the card menu's own list styling and single closer rather
  than inventing a parallel look (D101's rule).

**Two real bugs found building it, both worth remembering:**
1. An EMPTY pile has no stacks to route to, so Tighten All became a
   silent no-op the pile then forgot. Both the reducer and
   `disabledActions` now treat an empty pile as one default stack -
   and note `every()` on an empty list is vacuously TRUE, which was
   disabling both directions on a pile that adjusts perfectly well.
2. The gear was first sized to the 44px interactive floor. A card is
   about 43px wide, so it covered the entire stack and swallowed every
   click meant for the cards - five card-menu tests went from passing
   to 30-second timeouts. Sized to the badge (1.3rem) instead; the
   floor is enforced on `.pile-action-btn`/`.pile-action-menu-item`,
   and this UI pass is mouse-only by standing decision.

## Next Steps

**Superseded - StackActions are built.** Original note kept below for
the reasoning only.

### Tap/Untap per stack — BUILT (direct user request, "only if it's easy")

It was easy: same shape as `FLIP_STACK`/`ADJUST_PILE_SPREAD`, both of
which already existed to copy from.

- `Pile.supportsStackTap` (false by default, true on
  `BattlefieldPile`/`LandsPile` - the two kinds that already declare
  pile-level `untapAll`). Same opt-in-static shape as `groupBadge`/
  `stacksDownward` - tapping a chip or a hand card is not a real
  concept, so this is gated by pile kind, unlike tighten/loosen/flip
  which are universal to every stack.
- `Stack.stackActions({ maxSpread, canTap })` gained `tapStack`/
  `untapStack`, offered for a stack of ONE (unlike tighten/loosen/flip,
  gated on count>=2) - a single permanent is still tappable on its
  own. Disabled the same way tighten/loosen are (a no-op on every card
  in the stack), not `orientationActions`' strict hide/show XOR - a
  MIXED stack has real work for both directions.
- `SET_STACK_ORIENTATION` reducer action - ONE action taking
  `orientation` rather than a `TAP_STACK`/`UNTAP_STACK` pair, the same
  D75/D103 correction `ADJUST_PILE_SPREAD` already follows. Filters by
  `stackKeyFor(card.stackId) === action.stackKey`; pile-level
  `UNTAP_ALL` is completely untouched, per the user's own instruction
  ("keep pile level for all stacks").
- `tapStack`/`untapStack` specs, `stackGearFor` passes `canTap` from
  `PILE_TYPES[kind]?.supportsStackTap`, `main.js` dispatch.

11 new tests (5 `Stack.stackActions`, 6 reducer in `rtgPiles.test.js`
alongside the existing `UNTAP_ALL` tests) + 1 live browser test on a
REAL 3-card battlefield column (reuses the column the existing cascade
test builds): taps the whole stack, confirms a card OUTSIDE it stays
untouched, untaps it back. 781 unit / 20 ui / 14 rtg green, `make
check` PASSED, lint-js still at the 10-error baseline. The user asked
whether they are needed for consistency. `Pile` has `pileActions` and
`Pileable` has `pileableActions`/`sortActions`; a `Stack` has none, so
Tighten/Loosen still act on the whole PILE even though direction is
now per stack. That is a real inconsistency: a battlefield with a
vertical column beside a horizontal run can only be tightened as a
unit. Recommend `Stack.stackActions()` offering tighten/loosen/flip
direction, which would move `spread` onto the stack beside `direction`
(same metadata map, no new persistence shape). NOT started - ask
first.

**Queued:** `@Bob *learn no one-off tests - use automation test
pyramid` (direct user request, logged to CHAT.md, not started).

**`lint-design`'s 9 violations remain, and are NOT this work's.**
Identical 9 exist at HEAD. Separate responsive-layout task.

**Uncommitted:** everything above, plus the original staged
`dropTarget.js` simplification, which is correct and should stay.

---
## Session close (2026-09-10, evening) — bloop queue processing

Long session: Oracle groom (D117-D129 backfill, a real duplicate D116
+ D111/D112 order bug found+fixed by a new `tools/checkDecisionOrder.mjs`),
then a `*bloop queue till done` run through the accumulated CHAT.md
queue. All committed and pushed (`dev` and `main` both up to date,
tree clean).

### Shipped, verified, closed
- **RtG stack gear clipped/oversized** — `.stack-gear` was rendering at
  the global 44px touch-target floor instead of its documented 1.3rem,
  and the battlefield's `overflow-y:auto` row reserved no space for
  anything outside a stack's own box. Fixed both.
- **Gear moved to top-right** (was bottom-right) — mirrors
  `.chip-stack-badge`'s pin-outside-the-card pattern.
- **Stack-hover shadow overlap** — real bug: `.middle-card:hover` forced
  `position:relative` over the stack's own `position:absolute` (D129),
  same specificity + later source order. Hovering a stacked card fell
  into flex flow, width ballooned to the unrelated 8.5rem max-width,
  painting a giant disconnected shadow. Removed `position` from the
  hover rule entirely.
- **Found+fixed a real test flake** while stress-testing the gear fix:
  a dismiss-click raced `openStackActionMenu`'s `setTimeout(0)`
  listener in ~1/3 of runs. Zero-tolerance-for-flakes held - didn't
  ship until 8/8 stress runs were clean.
- **Can't re-fan hand after Flip** — `Stack.flippedDirection()` only
  ever toggled vertical↔horizontal; a FAN-default pile (hand) flipped
  once could never flip back. Now takes the pile's own default
  direction, making FAN-default piles a genuine 2-state toggle.
- **Deck panel too wide / fold actions into rows** — `.pile-title` had
  no width cap, so Deck's 6 actions + enum forced the whole panel open
  to fit one unbroken row. Capped at 11rem (tuned empirically against
  `lint:design`'s scroll baseline, not guessed - 9rem was narrower but
  regressed it).
- **All players get all pile actions** (generalized mid-session from
  "deck actions for every player" to a full authorization removal):
  stripped `isOwner`/`isShared` from 10 pile classes' `pileActions()`
  and `isHost` from `DeckPile`, plus 3 reducer checks (`SORT_PILE`,
  `UNTAP_ALL`, `SET_STACK_ORIENTATION`). **Found two real latent bugs
  this exposed**: Shuffle/Reset/Reshuffle-Deal had never been wired
  with the host-dispatch/guest-relay split every other action uses -
  invisible until removing the host gate let a guest reach them. Fixed
  both. Full writeup: `agents/neo.docs/all-players-pile-actions.md`.
- **New Game zone-recreation report** — investigated, could NOT
  reproduce in the single-client path; added a real regression test
  proving the reducer creates every player's Zone correctly. Left OPEN
  - likely candidate is the guest-side broadcast path, blocked on the
  standing no-2-peer-harness gap.

Verification throughout: unit suite ended at 787/787 (net down from
794 - 15 old restriction-tests deleted/rewritten, not just patched),
all 4 browser suites green (68 tests), lint-js/lint:design both at
their pre-existing baselines (unchanged byte-for-byte).

### Queued, NOT started - real feature/design work, not fixes
1. **Tighten/Loosen as a slider** — reusable Web Component, shared
   between the pile-level menu and the per-stack gear menu.
2. **Flip as a radio box with preview icons** — replace the single
   Flip action with a radio control listing orientations directly,
   each with a small icon/image showing the resulting arrangement.
3. **Zone-level privacy** (architecture change) — a pile inside a
   player's own PlayerZone should default to hidden-from-everyone-but-
   owner (like a hand card), revealable via the existing hide/show
   toggle. Explicitly a ZONE property, not a pile property - today's
   model is pile-level. NOT touched by the pile-ACTIONS work above
   (that was authorization; this is visibility/data-model).
4. **Remote-cursor redesign** (no back-compat) — replace exact-
   coordinate/transform mirroring with an animate-to-target model: on
   pointer-enters-pile/zone, glide the OTHER clients' cursor indicator
   onto that pile/zone rather than following live pixel coordinates.

### Next steps
Any of the 4 queued items above can start directly (`@Neo *swe impl
<item>`). #3 (zone privacy) is the most architecturally significant -
probably wants a `@Morpheus *lead arch` pass first given it moves a
concept from Pile to Zone. #1/#2 are UI builds with real visual design
decisions the user may want to weigh in on before implementation
(slider styling, preview-icon rendering) rather than a fix-loop
guessing them. #4 is a protocol simplification, self-contained to
`session.js`/`protocol.js`/cursor-rendering in `ui.js`.

`git`: `dev` and `main` both pushed and in sync, tree clean (only the
pre-existing untracked screenshot and `test-results/` remain, neither
from this session's work).
