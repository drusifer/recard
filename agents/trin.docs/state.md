# Agent State

## Context
### Recent Decisions
- Sprint 1: all 5 phases UAT-passed, launched.
- Sprint 2 (v1.1, US-12..18): all 6 phases UAT-passed. Phase 11 (final):
  independently re-ran npm test (41/41) + npm run test:e2e (all new
  assertions green, stable) myself, and read tests/e2e.smoke.mjs's new
  middle-zone/score section line by line - assertion counts (pickup-btn
  1→2→3 as cards get revealed) are correct given the test's own sequence,
  not off-by-one. The two self-caught test-logic bugs Neo mentioned
  (wrong pickup-btn counts, wrong "no rank" query grabbing the wrong
  card) are exactly the kind of thing that would have made this test
  file lie about coverage if left in - good that they got caught before
  handoff, not after.

### Key Findings
- Deliberate choice to not duplicate solo-play into e2e (documented in
  the test file itself) is correct reasoning, not corner-cutting - solo
  play has zero P2P/UI surface that state.test.js doesn't already
  exercise.

### Important Notes
None yet

## Current Task
**Status:** Sprint 2 (v1.1) complete - all 6 phases UAT-passed
**Assigned to:** Trin
**Started:** 2026-08-15

### Task Description
UAT gate for each phase of Sprint 2 ("clear backlog," v1.1) per task.md.

### Progress
- [x] Phase 6 UAT: PASS
- [x] Phase 7 UAT: PASS
- [x] Phase 8 UAT: PASS
- [x] Phase 9 UAT: PASS (incl. independent confirm-cancel test)
- [x] Phase 10 UAT: PASS (incl. independent 2-client cross-propagation test)
- [x] Phase 11 UAT: PASS (final). 41/41 unit tests, e2e stable, read the
      new e2e assertions line-by-line for correctness, not just "did it
      exit 0."
- [x] Post-launch UX overhaul re-verification: PASS (41/41 + e2e green,
      confirmed cardEl() restructure broke no test usage).
- [x] Sprint 3 Phase 12 UAT: PASS. 49/49 unit + e2e unchanged/green.
      Traced MOVE_CARD's same-zone no-op guard and PLAY's validate-
      before-mutate ordering by hand, both correct. Fixed one small
      readability nit while reviewing (a JSDoc comment had gotten
      separated from the function it documented by an inserted const) -
      trivial, fixed directly rather than filing it.
- [x] Sprint 3 Phase 13 UAT: PASS. 55/55 unit + e2e unchanged/green.
      Verified `dealCards()` refactor didn't change DEAL's own behavior
      (re-ran the pre-existing DEAL tests specifically, not just the new
      DEAL_MORE ones) and that RESET's passed-vs-scores divergence is
      real, not accidental (both explicitly asserted in one test).
- [x] Sprint 3 Phase 14 UAT: PASS (final data-layer phase). 64/64 unit +
      e2e unchanged/green. This is real tech-debt payoff, so read
      handOrder.js closely: reconcile logic correctly preserves a
      manually-reordered position when a new card arrives (tested), sort
      tiebreaks are symmetric in both directions (rank-sort ties broken
      by suit order and vice versa) - no asymmetry bugs.
- [x] Sprint 3 Phase 15 UAT: PASS. 64/64 unit + e2e unchanged/green.
      Went beyond Neo's ad-hoc check with a real privacy-critical
      independent test: confirmed a non-owner gets ZERO move-to control
      on someone else's still-hidden private card (can't see it, can't
      act on it), the owner DOES get one on their own, and moving a
      still-hidden private card zone-to-zone does not reveal it to
      non-owners. This is exactly the kind of authorization edge case
      that needs independent verification, not self-check trust.
- [x] Sprint 3 Phase 16 UAT: PASS. 64/64 unit + e2e unchanged/green.
      Independently checked 2 edge cases Neo's screenshot didn't cover:
      no "undefined" artifacts in the roster before anyone else has
      joined (0-opponent state), and the deck visual actually hides
      itself (not just shows a "0" stack) once fully drawn down.
- [x] Sprint 3 Phase 17 UAT: PASS. 64/64 unit + e2e unchanged/green.
      Independently checked 2 things Neo's screenshot didn't cover: a
      player never sees their own cursor rendered back at them, and
      lifting a still-hidden shared face-down card leaks nothing (no
      rank/suit visible on the OTHER client even while it's highlighted
      as lifted) - the exact privacy invariant this feature depends on.

- [x] Sprint 3 Phase 18 UAT: PASS. 64/64 unit + e2e 3/3 stable
      (independently re-ran both myself, not just trusting Neo's numbers).
      Went beyond Neo's ad-hoc check with the exact Smith Gate 1 scenario
      Neo hadn't specifically exercised: manual drag-reorder (dispatched
      DragEvents, same technique as the e2e fix) then a state-triggering
      Draw confirmed the manual order survives (D14's whole point), then
      Sort by rank correctly overrides it into true ascending order
      (verified by parsing rank out of card ids, not trusting a
      superficial check - my first pass at this had a bug reading a
      nonexistent `dataset.rank` that would have silently rubber-stamped
      a false pass, caught it by inspecting actual output before trusting
      it), then one more manual drag afterward confirms sort doesn't lock
      the list - drag and sort genuinely share one list, never fight.
      Also reviewed Neo's e2e.smoke.mjs fix (native-DnD test rewritten to
      dispatch real DragEvents): reasonable and not corner-cutting - Neo's
      isolation evidence (same failure reproduces on the exact turn-start
      code, before any Phase 18 change) is solid proof this predates
      Phase 18, and the rewritten assertion still exercises the real
      dragstart/dragend app handlers, just skips the browser-internal
      native-DnD arbitration step that doesn't work headless here.

- [x] Sprint 3 Phase 19 UAT: PASS (final implementation phase). 64/64
      unit + e2e 3/3 stable, independently re-run. Read every new
      assertion line by line rather than trusting exit codes: the zone
      `.filter({ has: ... })` locator pattern resolves correctly, the
      DEAL_MORE hand-size wait uses a computed expected count (not a
      magic number that would silently pass for the wrong reason), the
      hand-sort-persistence check verifies the sorted PREFIX is untouched
      (not just that count grew, which the old buggy behavior would also
      satisfy). Went beyond reading: **actually proved the new DEAL_MORE
      assertion has teeth** by temporarily swapping DEAL_MORE for a plain
      DEAL in main.js (reintroducing the exact "wipes existing hand" bug
      DEAL_MORE exists to avoid) and confirmed the suite genuinely fails
      - not a vacuous check that would pass either way. Restored
      immediately after, re-confirmed 64/64 + e2e green again.
      Also reviewed Neo's mobile-390/desktop-1280 screenshots: zones +
      hand-tools row wrap cleanly at both sizes, no overflow - Smith's
      density flag for this sprint holds up.

- [x] Triaged Smith's Sprint 3 close-out finding (mini-hand duplicate
      count): confirmed real by reading the code myself, not just
      trusting the screenshot description. `src/ui.js:310` builds
      ` (${p.handCount} cards)` into the roster row's own text node;
      `src/ui.js:315-318` then appends a *second* element
      (`renderMiniHand`) whose badge (`src/ui.js:301`) is literally the
      same `p.handCount` value again, for every non-self player. Not a
      one-off rendering glitch - it's structurally guaranteed to
      duplicate for anyone who isn't "you," every time. Root cause and
      fix location are unambiguous enough to hand straight to Neo without
      a separate reproduction step. Populated Phase 20 in task.md.

- [x] Sprint 3 Phase 20 UAT: PASS. 64/64 unit + e2e 3/3 stable
      (independently re-run). Went beyond Neo's own repro (7 cards) with
      a 9-card hand specifically to stress the interaction Neo's check
      didn't: confirmed the mini-hand fan still correctly caps visually
      at 5 backs while the roster text still states the real "(9 cards)"
      exactly once, badge fully gone (grepped the live DOM for
      `.mini-hand-count`, zero anywhere), and real spacing now separates
      the fan from the preceding text. Screenshotted at 390px for the
      record.

- [x] Sprint 3: fully shipped (Phase 20 UAT above, retro done).

## Sprint 4 ("top-down table redesign")
- [x] Phase 21 UAT: PASS. 70/70 unit (independently re-run) + e2e still
      green. Went beyond Neo's own check: verified `ownerId` specifically
      survives `RESET`, not just zone count/cards-cleared (Neo's own
      RESET test fix asserted count-preserved and cards-empty, but not
      that the per-zone `ownerId` field itself came through the reset
      spread correctly - confirmed it does, codified as a new test
      rather than just an ad-hoc check). Also independently re-verified
      the 6 pre-existing tests Neo fixed are now finding the RIGHT zone
      by name, not just passing for the same accidental reason they used
      to.

### Blockers
None

### Oracle Consultations
None yet

## Next Steps
### Immediate Next Action
Handed to Morpheus for Phase 21 code review.

- [x] Phase 22 UAT: PASS. 70/70 unit + e2e 3/3 stable (independently
      re-run). Went beyond Neo's 2-3-player checks: solo (1-player)
      case exercises `seatPosition(0, 1)` cleanly (1 seat, correctly
      "You"-marked), and a 5-player case confirms all 5 computed
      positions are genuinely distinct and symmetric (`50,92` bottom for
      the viewer, then mirrored pairs going up each side) - the kind of
      geometry bug that's easy to get subtly wrong (e.g. an off-by-one in
      the angle step) but wouldn't show up at 2-3 players. Also
      independently re-verified the pointer-events fix didn't overcorrect
      into making seats' OWN buttons unclickable (a real inverse-
      regression risk of that exact fix) - hit a false alarm on my first
      pass (my own test script's fault, an irrelevant leftover
      `reset-scores-btn` click), caught it by rereading my own test
      before reporting a false regression, fixed the script, re-ran
      clean.

- [x] Phase 23 UAT: PASS. 70/70 unit + e2e 3/3 stable. Independently
      exercised the exact scenario Neo's own screenshots didn't cover
      (a card actually IN a personal zone, not just the zone rendering
      empty): played a card to the shared zone, moved it into Alice's
      personal zone via the existing Move-to control, then verified (1)
      that same card's own Move-to dropdown correctly lists the shared
      Table zone AND Bob's personal zone as destinations (not just
      whatever happens to be in the same render call), (2) a
      private-facedown card moved into a personal zone still hides its
      rank from a non-owner - privacy holds through the new
      `renderSeatZones` path, not just the original `renderZones` one,
      (3) drag-reorder in the hand still works after the fan's switch
      from `for..of` to indexed `forEach`. Had to fix my own test
      twice - first assumed tapping/face-down-button plays a card
      straight into the player's own personal zone, but that's not how
      it works yet (tap always plays to the shared default zone; landing
      a card in a personal zone currently requires the existing Move-to
      control - direct-to-zone dragging is Phase 24's job). Good
      reminder that UAT scripts need to match what the app ACTUALLY
      does, not what you'd expect the finished feature to do.

- [x] Phase 24 UAT: PASS. 70/70 unit + e2e 3/3 stable at the time.
      Independently checked three things beyond Neo's happy-path
      verification: (1) an invalid drop (onto the roster, not a zone) is
      a genuine no-op - hand count unchanged, card still present, not
      just "didn't crash", (2) a non-owner truly cannot drag another
      player's still-hidden private card - `draggable` is false on that
      element, not just "no visible button" the way it read before, (3)
      only the zone actually under the pointer highlights during a
      multi-zone drag, not every zone at once (a real risk given the
      highlight is a plain class toggle per zone, not scoped by anything
      else). All 3 passed clean.
- [x] Re-verified after Neo's `seating.js` extraction (response to "unit
      tests form the base of the pyramid"): 81/81 unit + e2e still 3/3
      stable. The extraction is DOM-behavior-neutral by construction (same
      functions, same call sites, just relocated + exported), so this was
      a quick confirmation pass, not a full re-UAT.

- [x] Phase 25 UAT: PASS. 86/86 unit + e2e stable. Went beyond Neo's
      explicit-dragend-only coverage with two independent checks: (1)
      the literal TTL AC ("if a drag never completes... clears on the
      same TTL basis") - dispatched dragstart+drag with NO dragend at
      all (simulating a crash/dropped connection mid-drag), confirmed
      the ghost is still present right after (proving it's not somehow
      auto-clearing immediately) then genuinely gone ~2.2s later with
      zero further app interaction; (2) dragging a card FROM a personal
      zone (not just the shared default Neo's tests used) still resolves
      its real face correctly - `resolveVisibleCard()` iterates every
      zone, but only Neo's own tests happened to exercise the shared one.

- [x] Phase 26 UAT (final implementation phase): PASS. 86/86 unit + e2e
      stable. Went beyond Neo's screenshot-based density check with an
      objective, measured one: computed real `getBoundingClientRect()`
      overlap between every pair of seat cards at 390px width, across
      2/3/4/5/6/8 players. Precisely confirms and quantifies Neo's
      finding rather than just trusting the screenshot read: **0
      overlapping pairs through 4 players, 1 at 5, climbing to 6 at 8** -
      the degradation genuinely starts at 5, not earlier or later, and
      Neo's "not fully resolved at 5+ players" characterization is
      accurate, not overstated or understated. This is exactly the kind
      of finding that deserves a precise number, not just "looks
      cramped."

- [x] Triaged Smith's Sprint 4 close-out findings: finding #1 (cursor
      affordance) confirmed real by checking the code myself - no
      `cursor` rule anywhere in style.css for `.hand-card`/`.middle-card`,
      matches Smith's `getComputedStyle` result exactly. Small, contained,
      populated as Phase 27 T27.1. Finding #2 (density) - agreed with
      Smith's recommendation NOT to force a Phase 27 fix; re-read the
      existing Neo/Morpheus record (task.md, DECISIONS.md) and confirmed
      the team already correctly scoped this as needing a real redesign,
      so routing to Cypher's backlog is the right call, not a second
      rushed attempt.

### Blockers
None

### Oracle Consultations
None yet

## Next Steps
### Immediate Next Action
Handed to Neo for Phase 27 fix (cursor affordance only).

- [x] Phase 27 UAT: PASS. 86/86 unit + e2e stable. Went beyond Neo's
      base-case check with two independent verifications: (1) a
      NON-draggable card (another player's still-hidden private card,
      which correctly gets no drag wiring at all per Phase 24's
      authorization logic) genuinely does NOT get the grab cursor -
      confirmed `auto`, proving the `[draggable="true"]` attribute
      selector is scoped correctly, not just applied broadly and hoping;
      (2) the `:active` "grabbing" state genuinely fires under a real
      mousedown-and-hold, not just present in the stylesheet unverified.

### Waiting On
@Morpheus: Phase 27 code review.

### Planned Work
- [ ] Hand back to Smith to close uat-report-sprint4.md once reviewed.

---

## Sprint 5, Phase 28 (only phase) — UAT

### Progress
- [x] Independently re-ran `npm test` (86/86) and `npm run test:e2e`
      (stable) rather than trusting Neo's reported numbers.
- [x] Verified against US-31's actual AC line by line, not just "tests
      pass": found a genuine gap in Neo's own test - his 4 fixed-width
      checkpoints prove each CSS tier individually but don't verify AC's
      "extra width is actually used by content, not just wider padding"
      claim. Added an objective measurement for it: `.table-surface`'s
      own rendered width, 582px @ 760px container -> 922px @ 1300px
      container - genuinely grows, confirmed not just outer padding.
  - **Real finding surfaced, not glossed over** (same "measure, don't
    guess" instinct as Sprint 4's density finding): with exactly 2
    seated players, `seatPosition()`'s angle math puts both seats at
    leftPct=50 (directly above/below, not side-by-side) - so the seats
    THEMSELVES don't visibly spread horizontally from this width
    increase, even though the surface under them does and 3+-player
    tables would see real horizontal spread. Confirmed pre-existing
    geometry (not introduced by D20) and out of this story's scope -
    logging as a non-blocking observation, not filing a bug or
    rejecting the phase over it.
- [x] Added Smith's explicit Gate 2 UAT request: continuous-resize sweep
      (5px steps) through both breakpoints, asserting width is never
      monotonically decreasing during a live resize - not just the 4
      fixed snapshots. Passed both sweeps (1000-1050px, 1420-1460px).
- [x] Ran `python3 agents/tools/trace_annotate.py --date 2026-08-16` per
      protocol: 12 flags total, all pre-existing patterns from earlier
      in the day's session (AP-VIA-GREP/READ/DUP-READ/SKILL-RELOAD) or a
      stack-mismatch false positive (AP-MAKE-BYPASS - this project has
      no Makefile and has used `npm test`/`npm run test:e2e` directly
      across all 4 prior sprints, matching every prior state.md; not a
      real violation for this project). Nothing new or real from Phase
      28 itself.

**Verdict: PASS.**

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Morpheus for Phase 28 code review (only phase — this doubles
as the sprint's final implementation gate before Oracle groom).

### Waiting On
@Morpheus: Phase 28 code review.

### Planned Work
None pending beyond Morpheus's review.

---

## Sprint 6, Phase 29 (Pile unification, D23) — UAT

### Progress
- [x] Independently re-ran `npm test` (86/86 as handed off) and
      `npm run test:e2e` (green, real WebRTC).
- [x] Audited Neo's corrected T29.2 claim rather than taking it: diffed
      the migrated test file and confirmed **no assertion against a
      `viewFor` result changed** — the only 4 diff lines touching a view
      test changed the *expected* side (internal-state lookup), never
      the asserted view field. Neo's correction is accurate as stated.
- [x] **Added 5 tests for failure modes this refactor newly creates**
      (91/91 now). Three separately-shaped state slices couldn't be
      mis-routed into each other; one `piles` array keyed by `kind` can:
      deck contents leaking into `zones`, another player's hand leaking
      by id, a pile whose kind isn't routed silently vanishing from the
      view, an undefined visibility rule, and the DEAL/DEAL_MORE merge.
- [x] **Mutation-tested all of it** (standing "can this assertion fail
      on purpose" rule, Sprint 3 retro item 12): injected each bug into
      `state.js` and confirmed the tests catch it —
      deck-routed-into-zones → 7 fail; unrouted pile kind → 7 fail;
      `fresh` flag forced false → 1 fail. Restored and verified
      `state.js` byte-identical to the e2e-verified version, then re-ran
      e2e to be sure no mutation residue shipped.

### Real finding (not a blocker — code is correct, coverage was not)
- The `fresh`-flag mutation failed **exactly one** test, and it was one
  I had just written. Meaning: collapsing `DEAL` and `DEAL_MORE` into a
  single reducer case separated only by that flag had **zero** test
  coverage distinguishing the two — the pre-existing 86 tests could not
  tell "DEAL resets hands" from "DEAL appends." A one-character slip in
  that flag would have silently turned every re-deal into a deal-more
  and shipped green. This is a coverage gap the refactor *introduced*
  (the two used to be independent code paths), and it was invisible
  until mutation-tested. Now covered.

**Verdict: PASS.**

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Morpheus for Phase 29 code review — which must also rule on
Neo's flagged D23 deviation (visibility derived from `pile.kind` vs.
D23's original per-card uniform `{owner, faceUp}`).

### Waiting On
@Morpheus: Phase 29 code review + D23 deviation ruling.

---
*Last updated: 2026-08-16 (Sprint 6 Phase 29 UAT)*

## Sprint 6, Phase 30 (D21 layout/placement) — UAT: PASS
- [x] 101/101 unit + e2e green, re-run independently.
- [x] Mutation-verified the two things most likely to be silently wrong:
      (1) writing `layout` to the dropped card on a before-side drop —
      i.e. **the exact bug Smith predicted at Gate 2** — fails precisely
      the one test written for it, nothing else. That test is genuinely
      load-bearing, not decorative. (2) restoring `MOVE_CARD`'s same-zone
      early return fails 7 tests. Restored and confirmed byte-identical.
- [x] Confirmed Neo's flagged intermediate behavior change is real:
      between Phase 30 and 31 a same-zone drop moves the card to the end
      of its zone rather than doing nothing. Not a state-layer defect;
      Phase 31 makes it intentional. Not filing a bug — noting it so
      Smith doesn't hit it cold at close-out.


## Sprint 6, Phases 31 + 32 — UAT: PASS
- [x] 109/109 unit + full e2e green, re-run independently.
- [x] Mutation-verified all three new guards actually fail on purpose:
      - shrinking `dropTarget`'s halo reach to zero -> 4 failures, so the
        overlap-vs-stack region split is genuinely covered, not incidental;
      - pushing the pot's max-height far past D24's measured budget ->
        the D24 overlap guard fires precisely, naming the offending zones;
      - removing D24's pot centring -> the suite fails **earlier**, as a
        click timeout rather than an assertion. That is worth recording:
        it independently reproduces the original symptom in the D12-era
        comment ("broke click-through, not just looked messy - caught by
        the e2e suite actually clicking a zone button that was covered").
        Direct evidence the pre-existing overlap Neo found was actively
        breaking interaction, not merely cosmetic.
- [x] Verified Neo's pre-existing-bug claim myself rather than taking it:
      measured the extracted HEAD baseline, both personal zones do
      overlap the pot at 900/1024/1440/1920.
- [x] Confirmed the <1024px promise: 900px measurements identical to
      baseline.
- Noted, not filed: seat card vs. its own personal zone still overlap at
  the bottom seat (different element pair than D24's invariant). Routing
  to Smith at close-out rather than expanding this phase.

## Sprint 6, Phase 33 (deck operations) — UAT: PASS
- [x] 116/116 unit + full e2e green, independently re-run.
- [x] Mutation-tested the three highest-risk edits, all caught:
      - making `redactMiddleCard` leak the full card -> 4 failures. This
        was the one that mattered: Neo modified the single function the
        whole privacy model rests on, so the question isn't "does the
        new behaviour work" but "would the privacy tests still notice if
        redaction broke". They would.
      - `SPLIT_DECK` removing the deck pile (the exact mistake Morpheus
        pre-emptively flagged in D24) -> 2 failures, including the
        DRAW-after-split guard.
      - dropping Split's per-pile guard -> 1 failure.
- [x] Confirmed the guest-visible-controls bug independently: the e2e
      host-only assertion fails on the pre-fix CSS. Worth noting as a
      class of defect - `hidden` silently losing to a class's `display`
      is invisible to every unit test and to code review.
- Endorsed Neo's pile-density finding as real and correctly *not* fixed
  under this phase; it needs a design call, not a CSS nudge.

## 2026-08-20 — Added design-lint (user request, direct to Trin)

**What:** `tests/designLint.mjs` (pure, DOM-free geometry assertions:
`rectsOverlap`, `fitsViewport`, `meetsMinTouchTarget`, `pageOverflow`,
`findOverlaps` - 17 unit tests, all 4 mutation-verified) +
`tests/designLint.check.mjs` (renders the real app across 6 viewports,
runs those assertions against real measured rects, non-zero exit on any
violation). Wired into `npm run lint` as `lint:style && lint:design`
(user's explicit choice: block now, fix as follow-up - not advisory).

**Why this shape, not an off-the-shelf package:** researched npm for a
literal "Designlint" package first (Trin protocol: verify, don't guess).
Found five candidates - none catch layout/overlap/overflow regressions,
which is what actually broke last session (table-too-big, seat-ring/pot
collision, button-row wrapping). The project's OWN e2e suite already had
one hand-rolled overlap check (D24, `tests/e2e.smoke.mjs`) - this
generalizes that pattern instead of adding an unproven dependency,
matching D1 (minimal toolchain) and my own "mocks validate assumptions,
not reality" standard (extraction is real code, not a mocked belief
about what a 3rd-party tool does).

**Real finding, not a clean baseline:** first run found 70 pre-existing
touch-target violations (buttons under the documented 44px floor),
present even at 1440x900. Cross-verified independently via Playwright's
own `boundingBox()` before trusting it - not a checker bug. Filed to
`docs/USER_STORIES.md` Backlog rather than fixed here: several offenders
sit in button rows Neo JUST repacked tighter to kill page scroll, so
the real fix needs Smith's UX judgment on that trade-off, not a blind
size bump from me.

**Verification:** 188 unit (171 + 17 new) + full e2e green. `npm run
lint` correctly propagates non-zero exit through the `&&` chain.
`lint:style` alone still passes clean.

## Next
- Nothing queued. If picked up again: the 70-violation fix needs a
  Cypher story + Smith gate (padding/font-size/layout trade-off against
  the no-scroll fix), then re-run `lint:design` to confirm 0 before
  anyone re-tightens the gate's expectations further.

## 2026-08-20 (continued) — "fix them, not ignore them" + Sprint 12 kickoff

User overrode the "advisory backlog" call above: fixed all 70 touch-
target violations for real. Chain of real, live-diagnosed bugs along
the way (each found by measuring, not guessing):
- Base `button{}` now has `min-height/min-width: 44px` +
  flex-centering; `.card` and `.action-btn` explicitly exempted (cards:
  user authorized shrinking them; action-btn: min-width:44px per
  button made D25's hover row wide enough to intercept neighbor cards).
- Taller buttons reopened D24 seat-ring/pot overlap AND the "table too
  big" scroll bug from the prior fix. Re-tuned `--table-min-h` (28-34rem
  per width tier, binary-searched against the REAL e2e, not synthetic
  probes) + pushed panel padding much harder in two height-based media
  tiers (850px/700px, correctly ORDERED - narrower tier must come
  SECOND in source or its tighter padding loses to the looser one).
- `#table-area`'s `overflow-y:auto` (restored last session) clips
  ABSOLUTELY-POSITIONED popups that extend past its IN-FLOW content
  height - `max-height` bumps don't touch this, it's an overflow-vs-flow
  mismatch. Padding-bottom to "reserve space" made it WORSE for zones
  already at the cap (padding competes for the same capped budget).
  Reverted `#table-area`'s overflow cap a 2nd time - the extreme
  maxed-pot scenario it protected against isn't exercised by any
  shipped test.
- Then found `.middle-card`'s z-index:7 (on hover) was trapped inside
  `#table-center`'s OWN stacking context (from `transform`) - couldn't
  outrank `#seat-zones`, a stacking-context SIBLING. Fixed via
  `#table-center:has(.middle-card:hover)`.

**design-lint: 70 -> 1** (phone-SE hand-visibility, a real geometric
wall - documented, not chased further at the CSS level).

**e2e: STILL RED, not fixed.** Last known failure: deck-controls-strip's
Deal button, untriaged (paused at a usage checkpoint before diagnosing
it - this is a NEW failure point, not the same mechanism confirmed-fixed
for card action-buttons). This is a real gap - `npm run lint` will pass
but `npm run test:e2e` will not, as of this state.

**Then /sprint this** (user): Sprint 12, US-46 - remove ALL persistent
action buttons, pile-hover-reveals-actions + drag-an-action model, hand
becomes a pile like any other. Full planning done (Cypher->Smith Gate 1
[blocker: Draw needs a tap-shortcut, it's the project's own documented
highest-frequency action] ->Morpheus D34-D37->Smith Gate 2 [correction:
singleTarget must be STATIC, never computed from live pile count, or
move/pickup would flip behavior mid-game]->Mouse's 7-phase plan->
Morpheus review, approved). **Phase 52 done** (pileActions.js
generalized: hand offers sort/pass to owner, draw moved pile-level open
to everyone, singleTarget static+mutation-verified, targetsForAction
gained a real fix - it only checked ACTIONS, so a dragged Draw would've
had nowhere to drop). 196/196 unit green, UAT passed, Morpheus approved.
**Phases 53-58 NOT started** - all UI-heavy (the pile anchor, Draw's
drag+tap, reveal->tap, migrating remaining deck buttons, final
cleanup). See task.md Sprint 12 section for the full phase list.

## Next (supersedes the note above)
1. **`npm run test:e2e` is red** - deck-controls-strip Deal button,
   untriaged. Diagnose live (element-at-point, not guessing) before
   Phase 53 touches that same area, or the fix and the new UI could
   collide.
2. Then Phase 53: the generalized pile anchor. Morpheus's own note to
   whoever picks this up: build its positioning fresh, not adapted from
   D25's per-card row - this session paid real cost for that exact
   shortcut on the button-height fix.
3. Nothing in this session is committed as of this note - see git
   status before assuming a clean baseline.

---

## Shutdown prep catch-up (2026-08-22)

This note is from mid-Sprint-12 planning, before Phase 53 even started -
badly stale now. What actually happened: the `test:e2e` RED blocker got
diagnosed and fixed for real (not a stale-assertion issue for the Deal
button specifically, but a genuine z-index stacking-context trap, plus a
card-stack/halo test that needed reordering, plus a D24 seat-ring/pot
clearance retune) before Phase 53 landed. Sprint 12 shipped and closed.
Sprints 13-21+ followed: the full Pile/Zone/GameConfig framework (D38-D49,
verified with exhaustive characterization + mutation testing on the
authoritative replicated reducer at every phase), then the table-
unification + radial-menu redesign (D51/D52), then a full e2e-suite
migration to the new radial-menu DOM (5 real bugs found fixing it
honestly rather than routing around it) and a proper formal close.

Standing verification guidance changed mid-session, by explicit user
request: don't run the full `npm run test:e2e` suite for routine
verification (it's slow) - reserve it for genuine gates. `npm test` (fast
unit suite) is the default for routine checks now.

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`44303e3`, clean, 260/260 unit tests green, e2e green as of last close.
Two minor visual findings backlogged in `docs/USER_STORIES.md`, not fixed.

## Sprint 23 Phase 71 UAT (2026-08-25)
PASSED - real Zone entity (state.zones/zoneId), MOVE_PILE reducer case,
`<table-zone>` hardcode removed from ui.js (D55, corrected twice by the
user mid-design). 318/318 unit independently re-run, lint:design 14/14
byte-identical to git-stash baseline, mutation-verified the zone/discard
eligibility guard has teeth. Handed to Morpheus for code review.

## Phase 68 UAT (2026-08-25)
PASSED - SPLIT_PILE/TAKE_PILE reducer cases. 331/331 independently
re-run, mutation-verified SPLIT_PILE's ownership guard. Reviewed Neo's
two mid-build corrections (TAKE_PILE can't reuse cardActions('pickup')
- discardPile's is always empty by design; the ACTION_SPECS crash catch
pre-ship) - both correct. lint:design 14->15 (one phone-width overlap,
Table Zone header grew from new buttons) confirmed real via git-stash,
same bucket as the existing per-seat-anchor item. Handed to Morpheus.

## D56 UAT (2026-08-26) - PASSED

Independent verification, not a re-read of Neo's claims:

- `npm test`: 341/341 green, independently re-run (not trusted from the
  handoff message).
- `npm run lint`: stylelint clean; `lint:design` 5 violations,
  confirmed same list Neo already isolated as pre-existing (Phase
  68-70 baseline, unrelated to D56).
- Grepped for stray references to the 7 deleted flat-module files
  (`zonePile.js`/`deckPile.js`/etc.) - none survive except comments and
  one unrelated local variable name (`discardPile` in a test), no live
  imports.
- **Mutation-verified two load-bearing points, not assumed from a green
  suite:**
  1. `FoundationPile.canAccept`'s `super.canAccept(pile, card)` call
     (the `RunPile` inheritance) - broke it (`return false` instead),
     confirmed a real test fails, restored, confirmed green again.
     `extends RunPile` is doing real work, not decorative.
  2. `HandPile.tableSide` (Neo's own self-caught bug) - flipped back to
     `false`, confirmed `tests/state.test.js:711`'s zone-count
     assertion fails (5 vs 3, same failure Neo described catching),
     restored, confirmed green. The fix is real and the test that
     caught it is real, not a coincidence.
- **Test pyramid, per the user's explicit reminder:** this is a pure
  logic/duplication refactor with zero DOM change - the added coverage
  is correctly ALL at the unit layer (`tests/piles.test.js`, no
  Playwright, no DOM). `state.test.js`'s existing reducer-level tests
  already exercise `PILE_TYPES[kind]` through the real dispatch path
  (a thin integration layer above the unit tests), and needed zero
  changes - itself a signal the class rewrite kept its call-site
  contract intact. No `e2e.smoke.mjs` run - correctly skipped per this
  project's own standing "frugal e2e" rule, and justified here
  specifically: no DOM/CSS/rendering code changed, confirmed via
  `lint:design`'s live-browser render being byte-identical before/
  after.
- Reviewed both of Neo's scope calls (mixins rejected, ScoreZone ruled
  out) - agree with both. The mixin rejection is backed by a real grep
  showing the shared functions already exist; not asserted, checked.
- **One real, disclosable finding, not blocking:** ran
  `python3 agents/tools/trace_annotate.py --date 2026-08-26` per this
  project's own gate practice - 11 `AP-VIA-READ` flags this session
  (via is declared `enabled` in `agents/PROJECT.md`, but Read/Grep were
  used for codebase exploration throughout the Morpheus arch pass and
  Neo's implementation instead of `via`). Not a rule false-positive -
  genuinely didn't use `via`. Not blocking D56's correctness, but
  worth the team's attention since it's a repeat pattern, not a
  one-off.

**Verdict: PASS.** No blockers. Handed to Morpheus for code review.

## *nit: rename zones/piles (2026-08-26) - PASSED

Targeted check (not full UAT/e2e - matches the abbreviated `*nit` loop):
- `npm test`: 349/349, independently re-run.
- Mutation-verified `RENAME_PILE`'s blank-name guard - killed it, a
  real test failed, restored, confirmed green again.
- `npm run lint:style`: clean.
- Confirmed wiring symmetry: exactly 2 `onRenamePile`/`onRenameZone`
  call sites in `main.js`, exactly 2 matching `onRename:` consumers in
  `ui.js` - no orphaned half of the plumbing.
- Reviewed the guest-path fix Neo already live-verified (session.send
  round-trip) rather than re-running it myself - Neo's own script
  output (guest edit -> host dispatch -> broadcast back, both clients
  showing "Loot Pile") is real evidence, not just a claim.
- No new e2e coverage added - correct call for a `*nit`; the reducer
  tests + Neo's own live Playwright check already cover both the pure
  logic and the real DOM/network path.

No blockers, nothing bigger than the nit itself surfaced. **Verdict:
PASS.**

## *nit: drop count from pile titles (2026-08-26) - PASSED

349/349 independently re-run. Confirmed the only other `count`-reading
line left in that function (`disabledPileActionsFor`'s own arg) is
unrelated to the title and correctly untouched - this was a real
one-line, single-call-site change, not a partial fix hiding a second
spot. `rawName: zone.name` (the rename feature's own field) still
matches the new plain title exactly, so the two *nits compose cleanly
rather than drifting apart. No blockers.

## *nit: real hand-card privacy fix (2026-08-26) - PASSED

The long-disclosed "handPile.redactCard is a no-op" gap (D54's own
"single biggest open gap" note) is genuinely closed, not just marked
so. 349/349 independently re-run, including solo-play (a real
regression risk for any "hide from others" change - confirmed a lone
player's own hand still renders fully, never accidentally redacted
against themself). Grepped for any remaining `kind === 'hand'`
special-casing in `ui.js` that could bypass the generic redaction path
- none found, the fix is real end-to-end through the same pipeline
every other pile already uses. Reviewed the id-omission reasoning
(card ids encode rank/suit in this app) - correct, and a sharper
privacy bar than the base `Pile.redactCard`'s `{id, owner, faceDown}`
shape, appropriately so given hand cards have no legitimate reason for
another player to ever address one by id. No blockers.

## *nit: deck overflow fix (2026-08-26) - PASSED

Independently re-ran the same live overflow measurement (not just
trusted the claim): zero overflowing elements at the deck pile across
desktop/laptop/phone viewports (1440, 1024, 390px), each freshly
re-created and dealt, not reusing Neo's own session. 349/349 green,
stylelint clean. One-line CSS fix, correctly scoped - no other
`.deck-stack` consumer (pre-game preview screen shares the same class)
regressed. No blockers.

## D57 UAT (2026-08-26) - PASSED, with one real gap found+fixed

Independent verification, not a re-read of Neo's claims:
- `npm test`: 354/354 (then 356 after my own fix below), re-run myself.
- `npm run lint`: unchanged pre-existing baseline.
- **Mutation-tested `MeldPile.reparentable` and found a REAL gap**:
  deleting the flag should have made `FoundationPile`/`CascadePile`/
  `RankAdjacentPile` movable again, but the test named "rejects
  deck/hand/foundation/cascade/rankAdjacent" passed clean anyway - it
  never actually tested any of those three kinds, only deck/hand
  (a pre-existing coverage gap, not introduced by D57, but D57's own
  MOVE_PILE-reads-the-flag change made it newly load-bearing with zero
  guard). Fixed it myself: added real foundation/cascade/rankAdjacent
  piles via `GameConfig.piles` and asserted MOVE_PILE rejects each one
  through the real reducer. Re-ran the same mutation - now correctly
  caught (1 real failure), restored, confirmed green again.
- Mutation-tested `CREATE_PILE`'s `viewerId` threading - killing it
  broke a real test for a different (still correct) reason, confirming
  the wiring matters.
- Did not re-run Neo's live Playwright drag verification myself
  (screenshots + DOM assertions already in the session transcript are
  real evidence, not just a claim) - reviewed the technique (real
  `DragEvent` dispatch, matches this project's own established
  workaround for native DnD not firing from synthetic input) and it's
  sound.

**Verdict: PASS**, with the one gap found during UAT itself fixed, not
just filed. @Morpheus for code review (this touches architecture -
new reducer action, a real drag-handle mechanism conflict resolved).

## *nit: remove pointer-based panel drag + ScoreZone ActionBar unification (2026-08-26) - PASSED

353/353 independently re-run. Grepped for stray `attachPanelDrag`/
`onMovePanel`/`savePanelPosition`/`movePanel` references - only
comments left, all accurate, no live code paths. Checked CSS
(`.panel-drag-handle`/`.panel-dragging`/`body.panel-drag-active`) -
fully removed, only historical comment mentions remain in unrelated
resize-handle rules.

Independent live check (fresh session, not reused): `score-zone`'s `-`
button works through the ActionBar (0 -> -1), and its heading is now a
genuine `<header-actions>` element with the exact expected className -
structurally identical to every other panel's heading, not a
lookalike that merely looks the same. No blockers.

## *nit correction: Movable-not-Actionable, universal pile drag + reorder (2026-08-26) - PASSED

Independently re-ran 357/357. Grepped for every deleted symbol
(attachActionRow/actionMenuEl/beginTargeting/beginTargetingWithGhost,
card-action-row/card-action-btn/radial-follow-ghost) - only comments
remain (historical, harmless), `.pile-target`/`highlightDragTargets`
correctly still live since native card drag still uses them
independent of the deleted popup.

Mutation-verified `REORDER_PILE`'s same-zone guard (already done
during implementation, re-confirmed): killing the zoneId check lets
cross-zone "reordering" silently succeed - real test catches it.

Reviewed Neo's own live verification (3 separate Playwright checks:
zero popup on hover, tap-to-rotate actually rotates, universal pile
drag + reorder + rejected cross-zone alert) as real evidence, not just
a claim - each script's assertions are concrete DOM/state checks, not
vibes. No blockers.

## *nit: resize-flex-grow bug + zone Movable regression (2026-08-26) - PASSED

360/360 independently re-run. Reviewed the CSS specificity fix
(`#zones > .zone.panel-sized:not(.seat-zone)`) - matches the exact
specificity of the rule it overrides plus the extra class, same
technique this file already used for `.zone.panel-moved` vs
`.seat-zone` - not a guess, a real specificity calculation. Mutation-
tested `REORDER_ZONE`'s unknown-id guards (both sides) - real
failures on removal, confirmed load-bearing. Reviewed the CAPTURE-
phase zone-drag listener placement (`renderZonePanel`) - correctly
intercepts before `body`'s own bubble-phase pile/card handler would
misread a zone-drag token as a card id. No blockers.

## *nit: Copy code button real clipboard bug (2026-08-26) - PASSED

Independently re-verified the NORMAL (secure-context) path myself with
real clipboard read/write permissions granted - the displayed code and
the actual clipboard content matched exactly. Reviewed the root-cause
claim against the project's own README (does tell guests to open via
the host's LAN IP over plain http) - real, not speculative. Reviewed
`copyText`'s fallback logic - correct order (modern API first, legacy
textarea/execCommand second), never throws, honestly reports failure
instead of a false positive. 360/360 green. No blockers.

## *nit: zone free-positioning restored (2026-08-26, real regression fix) - PASSED

358/358 independently re-run. Grepped for the removed REORDER_ZONE/
zone-drag-token machinery - fully gone, no stray references. Confirmed
`attachPanelDrag` matches the original HEAD implementation exactly
(diffed against `git show HEAD:src/ui.js`), not a rewritten
approximation. Reviewed the "no zone nesting" claim myself by walking
the live DOM tree for any `.zone` containing another `.zone` - none,
confirmed `attachPanelDrag` only ever sets CSS position, never
reparents nodes. No blockers.
