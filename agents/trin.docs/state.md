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

---

## CHECKPOINT (2026-09-10, paused mid-task for a Smith side-quest)

Unit test coverage audit: pipeline complete and validated end-to-end
(dry run at file-level produced a real, sensible report). The real
per-CASE 781-case collection is running in the BACKGROUND right now
(`node tools/testAudit/collectCoverageByCase.mjs`, log at
`/tmp/case-collect2.log`, ~6min total, started ~01:08).

**Resume**: `tail /tmp/case-collect2.log` - if it shows `Done in`,
run `bobp make test-audit` (or `.venv/bin/python3
tools/testAudit/analyze.py` directly) to generate the real
`test_audit.md` against per-case data, review its content for
sense (redundancy table, gaps, heatmaps), then report to the user
and post the QA-decision summary to chat (methodology limitations
already baked into the report itself - line overlap is a heuristic,
not proof; module-level shared-fixture code will still show SOME
false-positive similarity even at case granularity, expected and
already caveated).

Everything built so far: `tools/testAudit/{collectCoverage.mjs,
collectCoverageByCase.mjs, analyze.py, requirements.txt}`,
`package.json` scripts (`coverage:unit`, `coverage:unit:deep`), three
new Makefile targets (`coverage-unit`, `coverage-unit-deep`,
`test-audit`), `.gitignore` additions (`/coverage/`, `/test_audit.md`,
`/test_audit_graph.html` - regenerate-on-demand, never committed
stale). `c8` added as a real devDependency (audit-fixed, 0
vulnerabilities). `.venv` bootstrapped for pandas/matplotlib.

---

## Unit test coverage audit (2026-09-10) — direct user request

"Run an audit on our unit tests to eliminate wasteful duplicative
tests" - per-file coverage in isolation, a pandas tool mapping code to
tests, a rich `test_audit.md` dashboard for eliminating test slop.

### Built

- `tools/testAudit/collectCoverage.mjs` - per-test-FILE coverage (c8,
  scoped to "our code": `src/**`, `tools/**`, `tests/designLint.mjs`,
  explicitly excluding `src/decks/rtg/catalog.js` - see below). Also
  harvests every case's real runtime NAME from TAP output (`# Subtest:
  <name>`), which the case-level pass needs.
- `tools/testAudit/collectCoverageByCase.mjs` - per-test-CASE coverage
  (781 real cases), isolating each with node's own official
  `--test-name-pattern` flag - no invasive edits to the 29 test files.
  Verified this actually isolates (not just runs everything anyway)
  before trusting it at scale: a single case covered fewer statements
  than its whole file. Bounded worker pool (default 8 concurrent).
- `tools/testAudit/analyze.py` (pandas/numpy/matplotlib, `.venv`
  bootstrapped by `make test-audit`) - builds the coverage-to-test
  mapping and generates `test_audit.md`: headline metrics, a pyramid
  shape chart, a redundancy-candidates table (Jaccard similarity +
  containment ratio + a plain-language verdict), a lowest-unique-value
  table, real coverage gaps, fan-in, two heatmaps, and a linked D3
  connections graph (`test_audit_graph.html`).
- Wired via `bobp make coverage-unit` / `coverage-unit-deep` /
  `test-audit`. Output (`coverage/`, `test_audit.md`,
  `test_audit_graph.html`) is gitignored - regenerated on demand,
  never committed stale.

### Two real engineering problems, found by actually running it at
### scale - not by reasoning about the code

**1. The naive pairwise algorithm didn't scale from 29 units to 781.**
Two implementations were correct and both had to be killed after 10+
minutes: `matrix.loc[a,b] = j` inside a 305,590-pair loop (label-
indexed pandas writes), then per-unit PYTHON SETS intersected/unioned
pairwise (same pair count, ~4-9k-element sets). Neither problem showed
up in the 29-file dry run, which finished instantly either way - real
scale is what surfaced it. Fixed by building a boolean (unit x
coverage_key) membership matrix once and computing every pairwise
Jaccard as ONE BLAS matrix multiply (`membership @ membership.T`)
instead of 305k Python-level operations: 10+ minutes (killed twice) ->
**77 seconds**, same math. Added permanent per-stage timing output to
`analyze.py` so the NEXT slow stage (if this ever runs at 5,000+
units) is diagnosable in one run instead of another blind kill-and-
guess cycle - this is now standing tooling, not a one-off fix.

**2. The redundancy signal itself was wrong before the data was even
looked at closely enough.** The first real run flagged 80,158 of
305,590 pairs (26%) as "redundant" - technically correct math, but
useless: `src/decks/rtg/catalog.js` (3,584 lines, marked "GENERATED...
do not edit" in its own header - compiled from YAML by `cards:build`)
was in scope, and every deck-touching test trivially iterates all of
it. Two tests asserting completely unrelated things looked 100%
redundant because they both happened to construct a deck. Excluded it
from "our code" scope for both collectors - a real scope correction
(a compiled data file was never what "coverage of our logic" meant),
not a threshold tuned to make the number look better. Re-ran the full
collection after the fix.

### A third finding, once the first two were fixed: the redundancy
### COUNT itself doesn't mean what it looks like it means

Excluding `catalog.js` cut total covered-line rows nearly in half
(3.46M -> 1.9M) but the flagged-pair count went UP slightly (80,158 ->
83,429) - proof the count was never the useful number. Line-overlap
Jaccard sits near 1.0 for almost any two tests that touch a small or
simple module, close to regardless of what they actually assert - a
property of the METRIC at fine (per-case) granularity, not a defect
excluding one file could fix.

Added a second, separately-sorted table rather than keep chasing the
count: same underlying data, filtered to containment >= 0.9 and sorted
by ABSOLUTE shared lines instead of the ratio. That reordering alone
turned the top of the report from `cardFaces` trivia (a 197-line file
where any two tests are near-identical almost by construction) into a
real, actionable finding: four separate `chipPile :: BREAK_CHIP` tests
("a 5 becomes five 1s", "breaks into the largest smaller denomination",
"total value is unchanged", "new chips get their own ids") sharing
almost all their coverage - plausibly one shared setup with four
genuinely valuable property assertions (fine as-is), or a real
consolidation candidate. Either way, a real human question, not
volume-driven noise.

### Numbers (final, catalog.js excluded, case-level, 781 units)

- 60 src files touched by unit tests, 10,893 coverable statements,
  8,790 covered (**80.7%** line coverage of touched files)
- Test pyramid: 29 unit files / 781 unit cases vs 4 integration files /
  46 cases (static count, not executed) - a healthy shape, unit-heavy
  by roughly 17:1 on cases
- 21 src files carry >=1 uncovered line (real gaps, not a heuristic)
- 83,429 pairs clear the Jaccard >= 0.6 flag threshold, but see above -
  the report's own "start here" table (containment >= 0.9, sorted by
  absolute shared lines) is the actionable 25, not this count

### Not done, flagged rather than silently skipped

- Redundancy candidates are still a HEURISTIC even after the
  catalog.js fix - the report's own Methodology section says so, and
  every "REDUNDANT" verdict needs a human read of both tests before
  deleting either. This tool finds candidates; it does not delete
  tests, and I have not gone through the candidate list myself to
  actually retire anything - that is real follow-up work, not done as
  part of building the tool.
- Integration/browser suite (4 files, ~46 cases) is a STATIC count
  only, never executed for this audit - the project's own standing
  rule (run e2e frugally) plus the fact that browser coverage needs a
  live server+Chromium, a different pipeline entirely.

---

## US-117 Phase 111 UAT (2026-09-11): PASSED

Verified rather than trusted Neo's writeup:
- 795/795 unit green, `tests/tableZoom.test.js` (8 tests) covers the
  pure module.
- `tests/tableZoom.browser.mjs` (7 tests) re-run clean against a real
  solo table: default M applies, all 4 presets set both the dial and
  the live `--table-zoom`, direct dial drag works, every control
  itself clears 44px.
- **Mutation-checked both load-bearing guards, not just read them:**
  breaking `clampTableZoom` (replacing the clamp with a no-op) fails
  `tableZoom.test.js` with a concrete diff (2.6 vs expected 1.6);
  restoring it passes clean. Breaking `designLint.check.mjs`'s new
  scale-division (hardcoding `scale = 1`) brings back the exact
  pre-fix failure list (dozens of "under the 44px floor" buttons);
  restoring it returns to the 8-violation baseline. Both fixes are
  real, not incidental.
- lint-js confirmed at the pre-existing 10-error baseline (diffed
  against a stash of my own changes, not eyeballed). lint:design at 8
  violations, same 2 pre-existing categories (scroll overflow, zone
  overlap) as baseline, neither touched by this phase.
- The 44px-floor fix generalizes correctly: it's scoped to
  `insideZones` buttons only, so it can't accidentally forgive an
  actually-broken button OUTSIDE the zoomed table.

## Next Steps
@Morpheus *lead review phase-111.

---

## US-117 Phase 113 UAT (2026-09-11): PASSED, after a real gap I found and closed

Neo's 5 live-browser tests all passed on re-run, but none of them
actually exercised the phase's own stated hardest problem: does
`reapplyFocusZoom` survive a re-render while a pile is focus-zoomed?
`renderZones` rebuilds `#zones` wholesale on any state-driven render -
this was the CENTRAL claim of the whole phase and it was UNTESTED.

Added a 6th test myself: hover the deck pile to grow it, click its own
"Draw" button (inside the overlay, so it isn't also a click-outside
dismissal - that's a separate, already-covered behavior), which
dispatches DRAW and forces a real `renderZones`. **First attempt used a
score-adjust button elsewhere on the page as the re-render trigger and
it failed** - but that was a test design flaw, not the real bug: any
click outside the overlay correctly dismisses focus-zoom first
(working as specified), which confounded the re-render question
entirely. Rewrote it to act ON the focused pile itself instead.

**With the corrected test, it failed for real**: after the re-render,
the DOM had 2 `.pile-section[data-pile-id="deck"]` elements (an orphan
left in `<body>` plus a fresh one back in `#zones`) - exactly the
duplicate-element risk Neo's own writeup named as the reason
`reapplyFocusZoom` needed to exist, caught live rather than reasoned
about. Neo's code already handled it correctly; the gap was in the
test suite's COVERAGE, not the implementation - confirmed by mutation:
neutering `reapplyFocusZoom` reproduces this exact 2-vs-1 failure,
restoring it fixes it.

6/6 live-browser green (stress-run), 802/802 unit, lint-js/lint:design
at their pre-existing baselines (confirmed by diff, not eyeballed).

## Next Steps
@Morpheus *lead review phase-113.

---

## US-117 Phase 114 UAT (2026-09-11): PASSED

Re-ran everything: 802/802 unit, lint-js/lint:design at baseline
(confirmed by diff), 8/8 live-browser green in `focusZoom.browser.mjs`
(stress-run 3x). Mutation-checked the reparent-then-measure fix by
reverting to the stale pre-reparent rect for the clamp calculation -
reproduces the EXACT original bug (same pile, same overage numbers,
`x:260.625... width:185.2, height:194.5`, clipping the bottom edge).
Restoring the fix passes clean. The fix is real, not incidental.

## Next Steps
@Morpheus *lead review phase-114.
