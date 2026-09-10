# Agent State

## Context

`*qa uat stackable` iteration 1 (D129 domain model). The model itself
is new; the LIVE BUG IT EXISTS TO FIX IS STILL PRESENT in the working
tree — this UAT covers the model only, and I did not let "27 green
tests" stand in for "the cascade is fixed", because it isn't yet.

Why the guards needed real mutation checking rather than a green run:
the whole reason this rewrite exists is that the previous version was
"tested" and still shipped two wrong formulas. The old browser test
compared chip 0 to chip 1 only, where a depth-chaining error is
invisible BY CONSTRUCTION, and the manual verification scripts checked
"did the number change" rather than what the number should be. So a
passing suite was already proven worthless here once.

## Current Task

**`*qa uat stackactions` (iteration 4): PASSED.**

770 unit / 20 browser / 13 rtg all green, `make check` PASSED,
`lint-style` clean, `lint-js` 10 (three below the old 13 baseline).

The browser suite caught TWO real product bugs here that no model test
could, and both were bugs in the new control itself:

1. **The gear covered whatever it was anchored to.** Inside the stack
   box it sat on the cards' hit area and the hover-raise fought the
   cursor (card lifts, pointer lands on the gear, card drops back) -
   Playwright reported "element never became visible, enabled and
   stable" and every card-menu test timed out at 30s. Moved ABOVE, it
   intercepted the pile header's own Loosen All / Make change clicks.
   It sits BELOW the stack now, and the CSS records the elimination so
   it does not get moved back into either trap.
2. **Tighten All / Loosen All never disabled at the limits.**
   `pileForKind` builds a BARE instance, so `this.cards`/`this.stacks`
   are empty inside `disabledActions` - the exact trap
   `disabledPileActionsFor`'s own comment documents for `ChipPile`'s
   break rule. Both controls stayed live at the floor and the ceiling:
   a dead click at each end.

**Three defects in MY OWN tests, worth recording because each made a
test that proved nothing:**
- The flip test left the tray sideways, breaking three later tests -
  this suite shares one dealt table, so a test that changes replicated
  state has to put it back.
- The gear test hunted for a chip stack that earlier tests
  redistribute (and eventually replace). Rewritten against the HAND,
  which always holds the five dealt cards.
- Before that, it picked the FIRST chip column, which may legitimately
  hold one chip and therefore correctly carry no gear - asserting
  against the one case designed to have nothing.

**Harness improvements, permanent:** the fixture now captures
`pageerror`/console errors (it was silently swallowing them, so a
render exception surfaced only as a 30-second timeout saying nothing),
and `openMenu` asserts a real card box first, reporting card and stack
geometry. Both paid for themselves immediately - the error capture
ruled out an exception, and the geometry check ruled out a zero box,
which is what narrowed this to a hit-testing problem.

**Method note for the record:** the gear regression was found by
BISECT - disabling the single suspect and re-running one test - after
a long unproductive stretch of reasoning about it from the source. A
test says THAT something broke; only a bisect says WHICH change did.

---

**`*qa uat stackable` iteration 3 (full unification): PASSED.**

Suites: 761 unit / 18 browser / 13 rtg green; `make check` PASSED;
`lint-style` clean; `lint-js` 10, three BELOW the old 13 baseline.

**No synthetic mutation run this time, deliberately** - the user
called out one-off verification as waste, and the tests earned their
keep organically instead. During this iteration alone they caught FOUR
real regressions that a green model suite did not:

1. `Pile.getView()`'s explicit field list dropped `stacks`, so the
   reducer recorded per-stack directions correctly and a battlefield
   column still rendered flat. Same failure mode `spread` had before -
   now guarded for the whole CATEGORY, not the two fields caught so
   far ("every field the LAYOUT depends on crosses into the view").
2. `GroupedPile` honoured a drop's DIRECTION hint via the base class,
   recording a lands colour-column as horizontal - so a cascade laid
   itself out sideways. Reproduced at model level from the browser
   symptom, which is the pyramid working.
3. Renaming `.chip-stack` to `.card-stack` silently BROADENED every
   test selector using it, so the chip geometry test was measuring a
   hand's fan and asserting nothing.
4. CSS specificity: the generic row rule outranked the stack rule and
   fanned every stack sideways by a whole card.

**Tests now self-diagnose.** The geometry assertions carry the
layout's own inputs (`--stack-x`/`--stack-y`, `--pile-spread`,
computed position) in their failure messages. That is what turned #2
from a hunt into one line: `spread 0.85, stackX 0.15, stackY 0` says
"laying out horizontally" immediately. Permanent, not a probe.

**Smith's usability defect is now a TEST, not a screenshot review.**
The lands cascade asserts a buried card keeps >10% of its height
visible, so the chip-calibrated spread can never be inherited back in
unnoticed.

---

**`*qa uat stackable` iteration 2 (wiring): PASSED. The reported bug is
fixed AND the tests that prove it are proven able to fail.**

The whole reason this rewrite existed is that the old tests were
green while the rendering was wrong, so I did not accept green here
either. Mutation results on the LIVE tests:

| mutation (the two ORIGINAL bugs, reintroduced) | caught by |
|---|---|
| `index` -> `Math.min(index, 1)` (depth compounding) | chip stack: "gap of 0px"; lands: "must run DOWNWARD, got 0px" |
| `(1 - spread)` -> `spread` (sign/shape flip) | chip: "step 64.4px of height 58.9px"; lands: "101.7px between cards 97.6px tall" |
| downward anchoring reverted to `bottom:` | lands cascade test |

The sign-flip mutation reproduces the user's own words almost
exactly - "cards FARTHER apart than before the fix" - which is the
strongest evidence available that these tests actually guard the
reported defect and not a proxy for it.

**Live coverage gap I closed.** `LandsPile` - the pile the original
report was about, and the ONLY user of the downward/`top:`-anchored
half of the stacking CSS - had NO live test whatsoever. That is how
its cascade broke twice unnoticed. `rtgPlaythrough.browser.mjs` now
drives 9 real draws into a lands tray through the real drop path and
asserts a 3+ deep column cascades downward, overlaps, and steps
evenly. It refuses to pass on a shallow column (`need a column of 3+
to see a cascade bug at all`) rather than silently asserting nothing.

**A vacuous assertion I wrote and caught.** My first version of the
chip-geometry test queried `[data-pileable-id]`, which also matches
the card element INSIDE each wrapper - so it compared a wrapper to
its own child, measured a 0px gap, and would have "passed" while
proving nothing. Scoped to `> .middle-card`. Worth recording because
it is the same class of error as the original: an assertion that
looks like geometry but measures the wrong thing.

Suites: 737 unit / 18 browser / 13 rtg, all green. `make check`
PASSED, 15 decks balanced. `lint-style` clean, `lint-js` 12 (one
BELOW the old 13 baseline - deleting `withColumnLayout` removed one).

**`lint-design` 9 violations: NOT this work's, and my iteration-1
note calling them acceptance criteria was WRONG.** Verified properly
against a HEAD worktree - the identical 9 exist at HEAD, before any
stacking change. Neither fixed nor broken here. Separate task.

---

**`*qa uat stackable` iteration 1: PASSED.**

Re-verified after Morpheus's two blocking conditions were implemented
in the same iteration: **still PASSED**. 733/733 full suite,
`lint-style` clean, `lint-js` back at its 13-error baseline (2 new
errors introduced and fixed). The 4 new `state.test.js` strip tests
are mutation-confirmed load-bearing: removing the `toHandCard` strip
fails 4 of them, removing the `toDeckCard` strip fails 2. The
over-stripping guard is the one I care most about - it fails if
someone "fixes" the strip by dropping `stackId` unconditionally, which
would silently remove the ability to persist a player-formed stack.

Mutation checks — 11 attempted, **11 killed, 0 survived**:

| mutation | killed by |
|---|---|
| `index` -> `Math.min(index, 1)` (the original depth-compounding bug) | same-step-size test |
| spread clamp removed | clamp test |
| direction validation removed | direction test |
| `(1 - spread)` -> `spread` (the original sign flip) | stride tests |
| stack order sorted instead of first-appearance | stability test |
| `extent` ignoring overlap | extent tests |
| `CardPileable` re-parenting reverted | hierarchy test |
| `offsetIn` pushed up onto `Pileable` | free-form-room test |
| `stackId` reintroduced as a class field | JSON round-trip test |

The last two matter most and are the ones I'd have missed if I only
read the diff:
- pushing `offsetIn` onto `Pileable` is exactly how the user's stated
  requirement ("leave room for non-stacked free-form piles") gets
  quietly lost — it would still be 27 green tests with the design
  intent gone. The guard holds.
- the `stackId` class-field clobber is a REAL bug that actually
  happened during implementation and was caught by a test, not review
  (class fields initialize after `super()`, so they overwrite
  `Object.assign(this, record)`). Regression guard confirmed live.

Repeatability: new tests run 5x consecutively, 27/27 every time, no
flake. Full suite `bobp make test` 727/727 both before and after all
mutations were reverted (i.e. the tree is genuinely restored, not
left mid-mutation). `lint-style` clean; `lint-js` at its pre-existing
13-error baseline with none in the new/touched files.

Re-parenting diff is 6 lines across 3 files (import + extends only) —
no behaviour change smuggled in with the hierarchy move, which is what
I was most concerned to check given D107's "no subclass gets behaviour
a card lacks" rule.

**NOT verified, deliberately, and NOT to be claimed as verified:**
- No live/browser verification — nothing is wired yet, so there is
  nothing on screen to look at. `Stack`/`Stackable` are currently
  called by their tests and by nothing else.
- `lint-design` is still RED (9 violations). Untouched by this
  iteration, expected to be addressed by the wiring.
- E2E not run (project rule: real gates only, and this isn't one).

## Next Steps

Iteration 2 (wiring) is where I re-engage with the checks that matter
most, and where I should NOT accept unit tests as sufficient:
1. Require real position assertions for 3+ things in BOTH directions —
   the precise gap that let the original bug through. Comparing item 0
   to item 1 is not acceptable coverage for this.
2. Require live verification of a real 3-card LandsPile cascade and a
   real 3+ chip stack, computing what the offset SHOULD be and
   comparing, not eyeballing a change.
3. `lint-design`'s 9 violations are acceptance criteria, not noise —
   verify `Stack.extent()` is what makes them go green rather than a
   CSS nudge that happens to fit the current viewport.
4. Re-check `transform` composition (fan droop + hover-raise) once
   wrappers become absolutely positioned — that chain currently shares
   `transform` with nothing else and the wiring plan frees it, so it's
   a likely regression site.
