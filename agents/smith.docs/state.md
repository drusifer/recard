# Agent State

## Context
### Recent Decisions
- Gate 1 (sprint stories review) for Recard: **Approved with notes**.
  Stories US-1..11 are testable, user-centered, and consistent. Added two
  AC amendments myself (connection/status visibility, Nielsen #1) since
  P2P has no server to paper over a silent connection failure:
  - US-1: host sees live roster + per-player connection state.
  - US-2: joining player sees explicit "connecting..." state.

### Key Findings
- No other HCI red flags in v1 scope. Privacy model (hand contents never
  sent to other clients, not just hidden in UI) is a strong AC — keep an
  eye that Morpheus's architecture actually honors this at the data layer,
  not just the UI layer.

### Important Notes
- Will need to actually run the app once Neo has something working (per
  "never approve based on spec alone") — mid-phase `*user test` and the
  Gate 2 architecture review, then full `*user test` at sprint close.

## Current Task
**Status:** Gate 1 complete, watching for Gate 2 (post-architecture)
**Assigned to:** Smith
**Started:** 2026-08-15

### Task Description
Sprint review gates for the Recard P2P card game sprint.

### Progress — v1.3 ("top-down table redesign")
- [x] Gate 2: **Approved.** D19's privacy proof (cardId iff faceUp===true
      at drag-start) is airtight given the existing MOVE_CARD
      authorization rule - checked the logic myself rather than taking it
      on faith, and it holds: nothing draggable at all can be visible to
      a receiver but not the dragger. One non-blocking note for Neo/Trin:
      cursor's existing throttle rate is a reasonable starting point, but
      a larger card-sized ghost may read as choppier than a small cursor
      dot at the same update rate - verify visually during Phase Bloop
      and adjust the rate only if it actually looks bad, not
      preemptively.
- [x] Gate 1: **Approved with 4 substantive amendments** to
      docs/USER_STORIES.md v1.3 backlog (US-26..30): explicit "You" seat
      marker + 8-player density check (US-26), drop-target hover
      highlighting (US-28, Nielsen #1 - drag has no affordance without
      it), the anonymized-card-back broadcast must follow the exact same
      zone-not-slot privacy granularity already set for cursor (US-29 -
      this is a new channel carrying an actual card silhouette, deserves
      its own explicit restatement not just inherited by association),
      and fanned hand cards must stay individually identifiable, not just
      individually tappable (US-30). This sprint carries real density AND
      privacy risk simultaneously (a first for this project) - will watch
      both closely at close-out.

### Progress
- [x] Gate 2: approved docs/ARCHITECTURE.md, conditional on explicit
      "Host disconnected - session ended" message (added as D6 condition)
- [x] Sprint-close `*user test`: ran full flow via Playwright screenshots
      (real app, not spec). Found 3 bugs, full report in
      agents/smith.docs/uat-report-sprint1.md. Filed to Trin for triage.
- [x] Re-test after fixes: PASS. Re-screenshotted host-share (short code
      `9KTJ57`-style, form gone) and session-ended (disabled controls,
      consistent 'disconnected' roster). Report closed. Approved for retro.
- [x] `*judge tool and skill usage`: scored TES 98/100 (see
      agents/smith.docs/trace_eval_usage.md) - 2 genuine redundant-call
      deductions, 1 AP-MAKE-PIPE, +10 bonus for real e2e/architecture
      wins. Cataloged BUG-001 (agents/smith.docs/bugs.md): judge/
      bob-protocol skill docs claim `make judge-trace` is wired via a
      Makefile target; checked 6 projects total, none actually have that
      target. Routed to Bob (doc/skill fix, not a code bug).
- [x] Sprint 2 (v1.1 backlog, US-12..18) Gate 1: **Approved with
      substantial UX requirements added** to docs/USER_STORIES.md:
      - Per-story AC: error-prevention on non-revealable private cards
        (US-13), don't punish the common one-tap-play path for the rare
        face-down case (US-12), resolved the score-edit-permission open
        call as "everyone can adjust everyone's" (US-16).
      - New cross-cutting "Smith UX requirements" block covering all of
        US-12/13/14: ownership must stay visible on public middle cards,
        revealing a *private* card needs a confirm step (irreversible,
        gives away info) while revealing a *shared* card doesn't (normal
        flow), reuse existing tap/drag patterns rather than inventing new
        gestures, zero-signal anonymity for face-down cards (no timing/
        layout leaks).
      - US-15: preset selection must show what it actually configures
        before commit (recognition, not recall).
      - US-18: consistent format across rules-reference entries, and
        opening the reference must not lose table state (same bug class
        as the sprint-1 session-ended-but-controls-still-live bug).

### Blockers
None

### Oracle Consultations
None yet

- [x] Sprint 3 ("zones, presence, hand tools") Stage-3 end-to-end test:
      ran the real app, two 390px mobile clients, deliberately built a
      dense scene (3 zones, 5 middle cards across all 3 visibility
      states, a full 7-card hand, pass marker, live cursor) since this
      sprint's own Gate 1/2 flagged density risk. **1 bug found**: a
      player's hand count renders twice - once as roster text `(N
      cards)`, again as the mini-hand fan's own count badge - squished
      together with zero spacing since `.mini-hand` has no left margin
      and is appended with no separator. Reproduced on both clients, with
      both a long name and a short one, base case not an edge case. Full
      report: `agents/smith.docs/uat-report-sprint3.md`. Everything else
      (zones, middle-zone density, move-to, pass propagation, hand sort
      at full density, cursor labeling/self-exclusion, deck visual) tested
      clean. Filed to Trin for triage.

- [x] Re-tested the mini-hand fix with the exact original repro
      scenario: clean now, count shown once, real spacing. Report closed,
      approved for retro. `agents/smith.docs/uat-report-sprint3.md`.

- [x] Sprint 3: fully closed out (implementation + bug-fix + re-test + retro).

### Progress — v1.3 ("top-down table redesign") Stage-3 close-out test
- [x] Ran the real app at 390px and 1280px, host+guest over real WebRTC.
      **2 findings**: (1) draggable cards give zero cursor affordance
      (`cursor: auto`, no `grab`/`grabbing`) on a mouse-driven client -
      real discoverability gap for this sprint's headline drag feature,
      medium severity, small contained fix. (2) re-confirmed the
      5+-player mobile density finding Neo/Trin already measured -
      independently verified their numbers hold, high severity (hits the
      CORE redesign at an ordinary group size, not an edge case), but
      recommending against a rushed Phase 27 fix since the team already
      correctly identified this needs a real compact-seat design pass -
      escalating to Cypher's backlog for proper scoping instead of
      squeezing a second "improved not resolved" attempt into this
      sprint's closing hours. Full report:
      `agents/smith.docs/uat-report-sprint4.md`. Everything else
      (personal zones, drag mechanics once discovered, drag-broadcast
      privacy, You marker, hand fan) tested clean.

### Blockers
None

### Oracle Consultations
None yet

## Next Steps
### Immediate Next Action
Handed to Trin to triage finding #1 (cursor affordance, recommend
Phase 27). Finding #2 (density) recommended for Cypher's backlog, not a
close-out fix phase.

- [x] Re-tested finding #1 with the exact original repro: both cursor
      checks now report `grab`. Report closed, approved for retro.
      Finding #2 intentionally left open in the report, tracked in
      Cypher's backlog per the agreed disposition (not a close-out item).

### Waiting On
Nothing.

### Planned Work
- [ ] Next sprint's Gate 1, whenever Cypher opens one - including
      whatever sprint eventually picks up the density backlog item.

---
*Last updated: 2026-08-15 22:53*
