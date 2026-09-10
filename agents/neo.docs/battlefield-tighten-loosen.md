# Fix: battlefield tighten/loosen + column-depth chaining bug (2026-09-07)

Direct user request: "add tighter/looser actions to the battlefield
pile and tighter/looser also effects the column layout", followed
immediately by a real bug found live: "adding additional cards to the
vertical layout blocks the second one instead of offsetting from the
previous card".

## Tighten/Loosen for BattlefieldPile

`BattlefieldPile.pileActions` fully overrides the base class and
simply never included `tighten`/`loosen` - every other row-laid-out
pile kind gets them from `Pile.pileActions` itself. Added them.

`BattlefieldPile.disabledActions(count)` predates the `spread`-aware
version `disabledPileActionsFor` (pileActions.js) has called for a
while now (`disabledActions(count, {spread, cards})`) - it only ever
duplicated the base class's `remove`-when-nonempty rule under a
narrower signature, silently dropping the `spread` argument on the
floor. Deleted the override entirely rather than hand-sync it: the
base `Pile.disabledActions` already does exactly what's needed
(remove/split/tighten/loosen, `split` harmlessly disabled-but-never-
offered).

## Column layout responds to spread

`.middle-card[data-layout='column']`'s downward push used to be a
fixed `calc(var(--card-h) * 0.4)` - a hardcoded default from the
original feature, with no connection to Tighten/Loosen at all. Now:

```
margin-top: calc(var(--column-depth, 1) * (var(--card-h) + var(--card-gap)) * (1 - var(--pile-spread, 0)));
```

`(1 - pile-spread)` is the same "how much shows" shape chip-stack's own
vertical formula already established (just inverted, since spread 0 -
the default, never-adjusted state every pile starts at - should mean
NO overlap, same as every other pile's own unadjusted spacing, not a
baked-in default look). Consequence: an un-tightened column now renders
as a plain vertical list (full separation) rather than the pre-set 40%
overlap it shipped with - hit Tighten (now offered) for the classic
overlapping-lands look. `MAX_SPREAD` (0.85) still leaves the covered
card's cost/name strip visible.

## The chaining bug, and `--column-depth`

Found immediately by re-testing with 3+ chained cards instead of 2:
the 3rd card landed at the SAME height as the 2nd, not one step
further down.

Root cause: `margin-top` is a CROSS-axis margin in a row-direction flex
container. Flex computes each item's cross-axis position from the
LINE's shared reference (its own margin from that shared top), never
from a sibling's own already-offset position - unlike `margin-left`,
whose negative pull actually reduces the main-axis space every LATER
sibling's start position is computed from, so horizontal overlap
chains "for free". Two column cards with the same spread value
therefore always landed at the same depth, regardless of how many
column cards came before either of them.

Fix: `ui.js`'s `renderPileCards` now tracks a running `columnDepth`
while building each row (reset to 0 whenever a card's `layout !==
'column'`, incremented when it is) and writes it as `--column-depth` on
that card's wrapper. The CSS multiplies the one-step offset by this
count - depth 2 lands exactly one more step below depth 1, chained by
arithmetic instead of relying on flex to produce it. No DOM
restructuring needed; z-index/paint order was already correct (later
DOM siblings already painted on top, unaffected by this).

## Verification

- `tests/rtgPiles.test.js`: new case, tighten/loosen offered + disabled
  correctly at the spread ceiling/floor. Mutation-checked (removed
  tighten/loosen from `pileActions`, watched it fail, reverted).
- `tests/rtgPlaythrough.browser.mjs`: new case, drags 3 cards from hand
  into a column via the project's synthetic-DragEvent pattern and
  asserts all 3 deltas are equal and positive (not just "greater than
  0", which the chaining bug would have still passed at n=2).
  Mutation-checked against the ACTUAL bug (reverted `--column-depth`'s
  multiply back to the old fixed formula, watched this exact test fail
  with "each column step should be the same size, got 91.99 then
  105.59", reverted).
- Manually verified end-to-end with a 4-card chain via a throwaway
  script before writing the permanent test: uniform ~105.6px deltas
  across all 3 steps, screenshotted.
- `bobp make test` (689), `test-rtg` (12, +1), `test-ui` (18), `lint`
  (style+js clean, design at the pre-existing 9-violation baseline) -
  all green.
