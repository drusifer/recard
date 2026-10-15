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

## Follow-up Q&A pass (same day, later) - answered with real data, not recall

The user asked several sharper questions about the report itself; each
was answered by actually running something, not by describing the
tool. Recorded here so the next reader doesn't have to re-derive them:

- **"Can the data tell if a test touches 0 src code (over-mocked)?"**
  Yes - `coverage/per-case/_manifest.json` already carries a `covered`
  count per case. Checked directly: 0 of 819 cases have `covered: 0`.
  The lowest are 16-26 lines, all real narrow assertions on genuinely
  tiny pure constants/functions, not mocking artifacts.
- **"Anything else worth addressing?"** Went back and actually READ
  the three PNG heatmaps (`coverage/test_audit_assets/*.png`), which
  had only been described from the table text before. The biggest
  apparent redundancy block in the Jaccard heatmap (~270 cases, far
  bigger than anything the tables surfaced) is `state.test.js`'s
  entire reducer suite - every reducer test shares `createInitialState`/
  `reduce`/`pilesOf` plumbing regardless of which action it exercises,
  so FLIP/SORT_PILE/JOIN tests all show near-total pairwise overlap
  despite asserting unrelated things. Confirms the structural
  explanation rather than overturning it.
- **"Why don't we use jsdom for ui.js?"** No recorded decision against
  it - `docs/USER_STORIES.md` names it as a standing, unclaimed
  backlog item ("browser-automation tooling / jsdom harness for
  ui.js"), never built, never explicitly rejected.
- **"Do Playwright tests actually cover ui.js's uncovered lines?"**
  Checked for real with Playwright's `page.coverage.startJSCoverage()`
  (real V8 execution ranges from an actual Chromium session) driving a
  thorough scripted pass (host setup, deal, all 4 zoom presets, focus-
  zoom hover/click, card context menu, a deck action, a card drag).
  **Result: 62.0% of `ui.js`'s non-blank/non-comment lines executed
  (697/1125)** - meaningfully more than unit-only 30.5%, confirming
  browser tests genuinely pick up real slack, but not "basically
  everything" as I'd implied earlier that same conversation. The
  remaining gap is NOT random scatter - it's one coherent block:
  `touchTargetAt`/`makeDragGhost`/`moveDragGhost`/
  `wireTouchDragEvents`/`attachTouchDrag` (the touch-drag DOM-wiring
  path) has zero coverage from anything, unit or browser, because
  every current browser test drives with mouse events and this
  project has a standing desktop/mouse-only decision for the current
  UI pass. Real, named, and consistent with an existing decision -
  not an oversight.
- **Dead-code/extraction question**: scanned `ui.js` for exported
  symbols with zero importers anywhere (none found - the 4 apparent
  hits were custom-element side-effect imports my grep mis-scored) and
  for pure logic still sitting inline, untested: `effectiveSpread`,
  `deckDepth`, `pileDragToken`/the parse half of `pileDragFromDrop`,
  and the parse/clamp half of `stackStepIn` are the real, small,
  genuine extraction candidates - not yet pulled out, not yet decided
  on by the user.

No code changes in this pass - investigation and reporting only, using
a throwaway Playwright coverage script (written, run, deleted -
`tests/_check_ui_coverage.mjs` never existed after this session, per
the project's own "no one-off verification left lying around" norm,
though the SCRIPT itself was one-off by necessity - the FINDING is
what's preserved here, not a repeatable check, since it depends on a
live Chromium session and isn't meant to run in CI).
