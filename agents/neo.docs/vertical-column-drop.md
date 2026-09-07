# Fix: vertical column drop targets (2026-09-07)

Direct user request, resuming a queued nit (`agents/CHAT.md`, 2026-09-06
`*queue`: "add a drop zone on the lower half of a card that snaps it
into vertical alignment with the card above/below, so lands (or
anything) can be organized into color columns").

## What shipped

The lower half of a card's own drop region is now a distinct outcome
(`layout: 'column'`) from the upper half (`layout: 'stack'`, unchanged).
Dropping there places the dragged card directly below the target, at
the same x, sliding down instead of sideways - a column, the way a real
MTG player stacks tapped lands.

- `src/dropTarget.js`: `evaluateBox`'s existing "point inside this
  card's box" hit (`isStackHit`) is now split by `isLowerHalf` - upper
  half keeps its original meaning (stack), lower half returns a new
  `column` verdict. `resolveDropTarget` returns `{targetCardId, side:
  'after', layout: 'column'}` for it. Pure addition, no existing
  branch's behavior changed (confirmed: all 8 pre-existing tests still
  pass unmodified).
- `src/piles/Pile.js`, `src/state.js`: untouched. `layout` was already
  a free-form per-card string (D21's `withLayout`/`insertPileable`),
  never validated against an enum anywhere - `'column'` just flows
  through the same machinery `'stack'`/`'overlap'` already use.
- `style.css`: `.middle-card[data-layout='column']` - full horizontal
  pull-back (same x as predecessor, no sideways peek at all, unlike
  `stack`/`overlap`) plus `margin-top: calc(var(--card-h) * 0.4)` to
  push it down, revealing ~60% of the covered card's TOP (where RtG's
  cost/name already live, per the earlier "cost moves to upper-left"
  nit - not a coincidence, that decision anticipated exactly this).
  Also `.drop-below` - a bottom-edge accent bar, the same "glow reads
  onto, a line reads before/after" hint vocabulary the other two
  outcomes already use.
- `src/ui.js`: `showDropHint` gets the `column` branch; `DROP_HINTS`
  includes `drop-below` so it's cleared correctly.

## Why this works for ANY pile, not just battlefield

`BattlefieldPile` doesn't override `resolveDropTarget` - it inherits
`Pile`'s base implementation, which is the exact function this change
touches. No battlefield-specific code was written; the queued note's
own "(or anything)" is true by construction, not by extra effort.

## Verification

- `tests/dropTarget.test.js`: 2 new cases (lower-half columns, the
  midline boundary still stacks - named specifically so a future
  off-by-one in `isLowerHalf`'s `>` doesn't silently flip either
  test's meaning). Mutation-checked both the boundary comparison and
  the `resolveDropTarget` column branch itself (forced each off,
  watched the right test fail, reverted).
- End-to-end on a real RtG battlefield via the project's own established
  synthetic-DragEvent pattern (Playwright can't synthesize real HTML5
  drag): dropped a card on the lower ~80% of an existing battlefield
  card, confirmed `data-layout` became `'column'`, and screenshotted the
  result - the new card visibly slides under the first, cost/name
  still readable at top, second unrelated battlefield card untouched.
  Also captured the live `.drop-below` hint bar mid-drag (had to widen
  the screenshot crop to see it - a 3px bar 5.6px outside the card's
  own box, correctly there on the first try, just easy to crop past).
- `bobp make test` (688, +2 from baseline), `test-rtg` (11), `test-ui`
  (18), `test-hostsetup` (7), `test-newgame` (5), all green. `lint:
  design`'s violation set is byte-for-byte the pre-existing baseline -
  no new regressions.

## Not done / left as-is

- No preset declares a starting layout of `'column'` - this is a
  player-driven arrangement only, same as `stack`/`overlap` today.
- The accent-bar hint briefly measured `overflow-x: auto` on
  `[data-kind='battlefield'] .card-row` (an existing rule, D-Battlefield
  overflow/Smith C2) - CSS's own "one non-visible overflow axis forces
  the other to `auto` too" rule, not something this change introduced.
  Did not chase further: in the one scenario actually tested (a card
  near the top of an under-full battlefield) nothing was clipped, and
  investigating whether existing `drop-before`/`drop-after` hints are
  ever clipped on a crowded battlefield is a separate, pre-existing
  question this fix didn't create.
