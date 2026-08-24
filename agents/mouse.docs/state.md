# Agent State

## Context
### Recent Decisions
- Sprint 1 ("v1 playable deck") broken into 5 phases in `task.md`, 2-3
  tasks each, following Morpheus's module layout from
  `docs/ARCHITECTURE.md`: (1) deck engine, (2) state engine, (3) P2P
  session wiring, (4) UI + wiring, (5) motion sync + polish. Shipped.
- Sprint 2 ("clear backlog," v1.1, US-12..18) broken into 6 phases
  (numbered 6-11 to keep task.md history linear): (6) middle-zone data
  model, (7) score tracking, (8) solo regression + static content
  modules (presets/rules-reference), (9) middle-zone UI, (10) score+
  presets+rules-reference UI, (11) e2e verification. Split data-layer
  phases (6-8) from UI phases (9-10) since they're independently
  verifiable and data-layer work has no DOM/network dependency (same
  pattern that worked well in Sprint 1).
- Sprint 3 ("zones, presence, hand tools," v1.2, US-19..25) broken into
  9 phases (12-20): 3 data-layer (zones/DEAL_MORE+pass/hand-order-module),
  4 UI (zones/deck+hands/cursor+lift/sort+deal-more+pass), 1 e2e
  verification, and — new this sprint — **Phase 20 is a dedicated,
  reserved bug-fix phase**, deliberately left unfilled until Smith's
  close-out test runs, instead of tailing fixes onto the last impl
  phase. This directly answers the process note that had been re-raised
  at both prior sprint retros without being acted on.

### Key Findings
- Phases 1-2 are pure logic (unit-testable, no DOM/network) and can move
  fast. Phase 3-4 is where architecture risk concentrates (PeerJS wiring,
  UI). Phase 5 depends on 3+4 being solid since motion sync piggybacks on
  the protocol/UI built there.

### Important Notes
- Every phase task references which user story(ies) it covers, so Trin's
  UAT can trace directly back to acceptance criteria.

## Current Task
**Status:** Phase breakdown complete, awaiting Morpheus plan review
**Assigned to:** Mouse
**Started:** 2026-08-15

### Task Description
Break the Recard sprint into small phases and get Morpheus's sign-off
before kicking off the Phase Bloop (Neo → Trin → Morpheus per phase).

### Progress — Sprint 1: DONE (5/5 phases shipped)
### Progress — Sprint 2: DONE (6/6 phases shipped)
### Progress — Sprint 3: DONE (9/9 phases shipped, incl. Phase 20 bug-fix)

### Progress — Sprint 4 (v1.3, "top-down table redesign")
- [x] Wrote `task.md` Sprint 4 section, 7 phases (21-27, incl. reserved
      bug-fix phase 27 — carried the pattern forward proactively this
      time instead of waiting for a 3rd retro to request it): 21 (data),
      22-23 (structural layout: seating, personal zones, hand spread),
      24-25 (interaction: drag-and-drop, live broadcast), 26 (e2e
      verification), 27 (reserved bug-fix)
- [ ] Morpheus review of phase plan
- [ ] Phase Bloop x6 (21-26) + Phase 27 during Stage 3

### Blockers
None

### Oracle Consultations
None yet

## Next Steps
### Immediate Next Action
Wait for Morpheus's `*lead review sprint plan`. If approved, Neo starts
Phase 1.

### Waiting On
@Morpheus: sprint plan review.

### Planned Work
- [ ] Track phase-by-phase status in `task.md` as Neo/Trin/Morpheus cycle
      through phases 1-5.

---

## Sprint 5 ("desktop table width")

### Recent Decisions
- Single Fast-Track phase (Phase 28, task.md), not the usual multi-phase
  pattern — matches Cypher's Fast-Track flag and the actual scope: one
  CSS file, two `@media` tiers per D20, no JS/state/protocol involved.
  T28.1 is the CSS change itself; T28.2 is an objective width-assertion
  test at both breakpoint boundaries (1023/1024/1439/1440px) plus a
  no-horizontal-scroll check at the extremes (320px/1920px) — reusing
  Sprint 4's "measure, don't just eyeball" lesson (Trin retro item 14)
  even though this sprint is small.

### Blockers
None.

## Next Steps
### Immediate Next Action
Wait for Morpheus's `*lead review sprint plan`. If approved, Neo starts
Phase 28 (only phase) directly — no Trin UAT→Morpheus review cycle
needed before Oracle groom, since there's only one phase; Trin's UAT
still runs on Phase 28 per normal Phase Bloop before Oracle groom.

### Waiting On
@Morpheus: sprint plan review for Phase 28.

### Planned Work
- [ ] Track Phase 28 status in `task.md`.

---

## Sprint 6 ("snap-to stack/overlap" + deck operations)

### Recent Decisions
- 6-phase plan (29-34, task.md): Phase 29 (Pile unification, D23) is
  the foundation and MUST land + pass full regression before Phase 30
  starts building the `layout`/`insertCard` state-layer work on top of
  it — sequencing directly reflects Morpheus/Smith's explicit
  requirement, not just convention. Phase 30 (state layer) before
  Phase 31 (UI) mirrors Phase 21-22-style dependency ordering from past
  sprints. Deck ops (Phase 32) has no dependency on Phase 30/31 content
  but is sequenced after them anyway since it reuses Phase 29's
  `dealRoundRobin()` output — keeping foundation-dependent phases
  together. Reserved bug-fix phase (34) included proactively, per the
  pattern that's held for 2 sprints running.
- T30.2 explicitly calls out a dedicated regression test for the
  before-side-overlap direction bug Smith caught at Gate 2 — flagged by
  name in the task so it isn't only incidentally covered by a broader
  test.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Morpheus for `*lead review sprint plan`.

### Waiting On
@Morpheus: sprint plan review.

### Planned Work
- [ ] Track Phase 29-34 status in `task.md` as the team cycles through.

---
*Last updated: 2026-08-16 (Sprint 6 planning)*

## Shutdown prep catch-up (2026-08-22)

This file went stale after Sprint 6 - Sprints 9 through 21+ (touch parity,
deck-side dealing, restart/reconnect, the design-lint/touch-target fix, the
full Pile/Zone/GameConfig framework epic D38-D49, the table-unification
redesign D51, and the D52 radial action menu) all shipped via background
agents that used `agents/CHAT.md` and `docs/ARCHITECTURE.md`/
`docs/USER_STORIES.md` for phase/sprint continuity instead of this file.
Those are the authoritative sources for anyone resuming cold - read
CHAT.md's tail first, then the latest D-numbered entries in
ARCHITECTURE.md, before trusting anything above this note.

**Current state:** branch `touch-targets-and-pile-actions-sprint`, latest
commit `44303e3`, working tree clean, 260/260 unit tests green, e2e green
as of the last full sprint close. Sprint numbering is up to ~21 in
practice (see CHAT.md's `*pm launch` messages for the exact list).

**Open, not urgent:** two disclosed minor visual overlaps backlogged in
`docs/USER_STORIES.md` (personal-zone-label/hand-row at 1440x900, radial-
menu-button/zone-heading text collision). The builder screen (the one
piece of the framework epic never started) is waiting on real user
product/UX input, not phase planning.

---
## Sprint 22 phase plan — 2026-08-24

6 phases (task.md 62-67): 62 dropRule->polymorphism refactor (foundation,
must land clean first), 63 foundation+cascade piles (Solitaire), 64
rankAdjacent pile (Spit), 65 GameConfig.zones+2 presets, 66 e2e, 67
reserved bug-fix. Morpheus-approved, no changes requested. Handed to
Neo for Phase 62. Track phase-by-phase status in task.md as usual.
