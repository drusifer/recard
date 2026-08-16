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
*Last updated: 2026-08-15 22:47*
