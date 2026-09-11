# Test audit follow-up (2026-09-11)

Re-ran `bobp make test-audit` per direct user request ("run the test
audit again and address the findings"). Full report: `test_audit.md`
(regenerated, not committed - see its own header).

## What was NOT acted on, and why

The redundancy-candidate tables (83429 flagged pairs) are the report's
own documented noise floor, not a real finding - its Methodology
section says line-overlap Jaccard approaches 1.0 for any two tests
touching a small/simple module almost regardless of what they assert,
and excluding the worst offender (`catalog.js`) barely moved the
count. Spot-checked a handful of the top "REDUNDANT" pairs (chipPile's
BREAK_CHIP tests, cardFaces' faceFor tests) - each pair asserts a
genuinely different thing about the same setup (five different facts
about one BREAK_CHIP call), which is exactly the "happy-path + boundary
test sharing every line, both earning their keep" case the methodology
warns not to delete on sight. Not touched.

`src/ui.js` (30.5%), `RtgCardFace.js` (41%), `StandardCardFace.js`
(52%) all show as under-covered, but their uncovered lines are DOM-
manipulation code (`document.createElement`, etc.) - this project has
no jsdom, so plain unit tests structurally cannot reach them. They're
exercised live by the 6 `*.browser.mjs` suites instead, which this
audit explicitly excludes (its own stated scope). Not a real gap;
adding jsdom to fake coverage here wasn't in scope for "address the
findings."

## What WAS a real, fixed gap

Six src files/functions had zero direct unit-test exercise despite
being small, pure, and real behavior - not defensive/unreachable code:

- **`TokenPile.pileActions()`** (0% func coverage) - only ever hit
  incidentally through a preset. New test in `tests/piles.test.js`.
- **`StackPile.resolveDropTarget()` / `StackPile.pileActions()`** -
  same story. New tests in `tests/rtgPiles.test.js`.
- **`Zone.viewerRelation()` / `Zone.defaultPosition()` (base)** - no
  test file for `src/zones/*` existed at all before this. New
  `tests/zones.test.js` (9 tests: Zone, SharedZone, PerPlayerZone).
- **`pileActions.js`'s `disabledPileActionsFor()` / `componentFor()`**
  - same polymorphic-dispatch shape as the already-tested
  `pileLevelActions()`, reached the same way by `ui.js`/`main.js`, but
  had no test of their own - a typo in either wrapper would have
  silently always returned the fallback. New tests in
  `tests/pileLevelActions.test.js`.
- **`SHUFFLE_DECK`'s "pile does not exist" guard** (`state.js`) - every
  other pile-targeting reducer action (MOVE_PILE, CREATE_PILE,
  REORDER_PILE, ADJUST_PILE_SPREAD, several more) already had this
  exact test shape; SHUFFLE_DECK's own copy didn't. New test in
  `tests/state.test.js`.

All five targeted files now show 100% line coverage (verified with
`node --test --experimental-test-coverage`); `pileActions.js` has one
residual uncovered branch (line 393, a `null` vs `undefined` OR-chain
subcase with no behavioral difference between the two - not chased,
per the same "don't test what can't happen differently" standard as
everywhere else in this project).

## Deliberately NOT chased: state.js's other 8 "not authorized"/"does
not exist" guards

`state.js` still has ~8 uncovered lines matching the same
`canRemove(...)` "not authorized" throw pattern for FLIP/ROTATE/split/
transferCard's own copies. Left alone rather than mechanically adding
8 near-identical tests: post-D83/84 ("no per-viewer restriction of any
kind, ever"), `canRemove` no longer gates on VIEWER identity, only on
whether the action is structurally offered for that card/pile kind
(e.g. a Deck card never offers `rotate`). Whether these guards are
still meaningfully reachable through normal play, or now near-dead
code left over from the pre-D83/84 model, is a real question worth its
own look - not something to paper over with a mechanically-written test
per guard just to move a coverage number. Flagging as a genuine open
question rather than either guessing or silently padding coverage.

## Verification

819/819 unit tests green (802 -> 819, 17 new cases across 5 files).
`lint-js` at its pre-existing 10-error baseline, `lint:design`
unchanged. Every new test mutation-spot-checked (Zone.viewerRelation
shown here; the same shape of check - break the line, confirm the test
fails with the mutated value, restore - was run against each new
assertion before trusting it).
