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
## Sprint 23 phase plan — 2026-08-25

6 phases (task.md 68-73), pure-logic-first: 68 SPLIT_PILE+TAKE_PILE
reducer cases, 69 SET_PILE_ORIENTATION reducer case, 70 both reach the
UI (ACTION_SPECS+confirm wiring), 71 groupId field+MOVE_PILE reducer
(pure), 72 pile-title drag-and-drop UI (Smith's 2 Gate-2 notes baked
in), 73 reserved bug-fix+regression. 71/72 split from 68/69/70 per
Morpheus's D55 sequencing call - US-63 is strictly bigger and
independent of the other three. Handed to Morpheus for sprint-plan
review before Neo starts Phase 68.

---
## Sprint 22 phase plan — 2026-08-24

6 phases (task.md 62-67): 62 dropRule->polymorphism refactor (foundation,
must land clean first), 63 foundation+cascade piles (Solitaire), 64
rankAdjacent pile (Spit), 65 GameConfig.zones+2 presets, 66 e2e, 67
reserved bug-fix. Morpheus-approved, no changes requested. Handed to
Neo for Phase 62. Track phase-by-phase status in task.md as usual.

---
## Status check-in — 2026-08-27 (`*mouse status update`)

### Context
- Tech-debt sprint (US-64..68, D58-D60, task.md Phases 74-78) fully
  shipped, reviewed, retro'd, and launched by Cypher. Session-close
  notes posted by Neo for context-clear prep. Working tree was clean at
  `fbd3789`/`259c474` before this session started; branch
  `touch-targets-and-pile-actions-sprint` is 26 commits ahead of its
  origin (unpushed, not yet requested).
- This file (state.md) had been stale since Sprint 6/the 2026-08-22
  shutdown note - CHAT.md and task.md are the actual source of truth,
  confirmed by cross-checking task.md's Phase 74-78 log and `git log`
  against the CHAT.md tail. No discrepancies found.

### Current Task
**Status:** No sprint plan currently awaiting review or in flight.
Idle between sprints.

### Open backlog (from tech-debt retro, unclaimed)
- Rebuild the e2e suite (D60 removed the stale monolithic one) -
  Trin's retro flagged it should be discrete `test()` cases this time,
  not one script, so a failure anywhere doesn't hide everything after
  it.
- 7 flagged `sonarjs/cognitive-complexity` findings (deliberately not
  fixed under Phase 75 time pressure per D58's AC) - candidate for its
  own small future pass per Morpheus's retro.
- Builder screen (framework epic's one unstarted piece) - blocked on
  real product/UX input, not phase planning.
- 2 disclosed minor visual overlaps in `docs/USER_STORIES.md`
  (personal-zone-label/hand-row at 1440x900, radial-menu-
  button/zone-heading text collision).

### Next Steps
No planning action pending. Waiting on the user for direction: start a
new sprint (candidates: e2e rebuild, cognitive-complexity pass, or
something new), or something else entirely.

---
## Session close-out — 2026-08-27, later same day

Two direct-user-request items landed this session, both via full Bloop
chains, both fully reviewed:

1. **`*fix`: permissive pile-creation drop for PlayerZone/OpponentZone.**
   Root cause was CSS geometry (`.seat-zone` shrink-wraps to its one
   pile, zero spare drop space), not a reducer restriction. Fix:
   `.zone-drop-gutter`, a reserved one-card-slot drop target,
   generically added to every zone type (`renderZonePanel`). Neo -> Trin
   -> Morpheus, all approved.
2. **`*impl`: ScoreZone consolidated.** One panel now lists every
   player (typed entry + -10/-1/+1/+10), replacing one panel per
   player. New `SET_SCORE` reducer action, `ADJUST_SCORE` widened to
   +/-10. Two real bugs found+fixed via live testing (a CSS
   specificity bug, a blank-input-zeroes-score bug). Side effect: cut
   the pre-existing `lint:design` baseline from 5 violations to 3
   (removed 2 Score-related overlaps as a natural consequence of
   consolidating). Neo -> Trin -> Morpheus -> Smith (UX gate), all
   approved.

362/362 unit tests, lint:js baseline unchanged (7 pre-existing
cognitive-complexity findings), lint:design improved (5->3, all
remaining ones pre-existing/unrelated Table-Zone/Bob overlaps).

**Repo state at close:** branch `touch-targets-and-pile-actions-sprint`
was 26 commits ahead of its own origin before this session; origin/main
is a strict ancestor of this branch (clean fast-forward available, no
divergent history to reconcile). User asked to commit this session's
work and push main - proceeding to commit, then fast-forward local
`main` to this branch's tip and push `origin main`.

### Next Steps
None pending after the push. Same open backlog as before this session
(e2e rebuild, cognitive-complexity pass, builder screen, 2 minor
visual overlaps) plus the pre-existing Table-Zone/Bob overlap debt -
unclaimed, no active sprint.

---
## Sprint phase plan — Save Layout/Remove Zone+Pile/changePileType (2026-08-27)

7 phases (`task.md` 79-85), following the data-layer-before-UI split
that's worked well every sprint since Sprint 2: 79 (REMOVE_ZONE/PILE
reducer, D62), 80 (CHANGE_PILE_TYPE reducer, D63), 81
(`layoutOverrides.js` module, D61), 82 (Remove Zone/Pile UI), 83
(changePileType UI), 84 (Save/SaveAs/Reset Layout UI, carrying both
Gate 1 and Gate 2 UX conditions explicitly into its task checklist so
they aren't lost between review and implementation), 85 (reserved
bug-fix, carried forward per the pattern held for 3 sprints running).
81 sequenced after 79/80 rather than in parallel with them since it's
independent logic but keeps all three data-layer phases grouped before
any UI phase starts, matching Sprint 22/23's ordering convention.
Handed to Morpheus for `*lead review sprint plan` before Neo starts
Phase 79.

### Waiting On
@Morpheus: sprint plan review.

### Planned Work
- [ ] Track Phase 79-85 status in `task.md` as the team cycles through.

---
## Session close-out — 2026-08-27, later same day

All 7 phases (79-85) shipped and launched (Cypher `*pm launch`, same
day). Phase 85 ended up covering a run of direct post-launch *nits
rather than a formal Smith close-out pass - user kept finding real
issues by actually using the shipped feature (deck drag-and-drop was
the big one: took 4 rounds - D64 reparenting, D65 a real dragstart-
bubbling bug, D66 then D67 to get pick-up/drop semantics genuinely
generic instead of a fixed-destination action wearing a drag costume).
Every round still went through TDD + live Playwright verification
before being called done, not just diff review.

**Repo state at close:** branch `touch-targets-and-pile-actions-sprint`,
working tree has this session's full diff (Save Layout/SaveAs/Remove
Zone+Pile/changePileType sprint + D64-D67 *nits) staged for commit -
user asked to close out and commit. 396/396 unit tests, lint baseline
unchanged throughout (7 pre-existing `cognitive-complexity`, 3
pre-existing `lint:design` overlaps).

### Next Steps
None pending after commit. Standing backlog unchanged (e2e rebuild,
cognitive-complexity pass, builder screen, 2 minor visual overlaps)
plus this session's new items (SaveAs's `window.prompt()`, Morpheus's
"check id survival before designing a save-for-reuse feature" note).

---
## Session close-out #2 — 2026-08-27, same day, context-clear prep

Two more direct-user-request items landed AFTER the previous close-out
commit (`405e240`) and its D68/D69 follow-up (card-drag seat-relative
coordinates, committed `e72275d`):

1. **Sprint: Convert Pile Actions (US-74, D71)** - `changePileType`
   widened from a zone/discard-only flip to a real 5-kind cycle
   (zone/discard/foundation/cascade/rankAdjacent), all empty-only.
   Gate 1 caught a real Nielsen #1 gap (silent cycle, no feedback) -
   fixed via auto-rename on conversion when the pile's name is still
   its old kind's own default. Full Bloop (Cypher->Smith->Morpheus->
   Mouse->Neo/Trin/Morpheus->Oracle->Smith->retro->Cypher launch),
   Fast-Track single phase (86).

2. **Chain of direct *nits, D72-D75** (default naming + zone-heading
   visibility, triggered by a real user-reported bug):
   - D72: pile default name is "Pile" not "Zone" (was colliding with
     the Zone/Pile vocabulary split); the Zone record itself also
     got a default name.
   - **User reported a real bug**: "dropping Pile on the table did
     not create a new table zone - looks like the pile is parentless."
   - D73: root cause found live - a standalone zone's own heading was
     UNCONDITIONALLY suppressed (a 2026-08-26 decision, "the lone
     pile's own heading already says the same thing"), which is what
     made an ungrouped pile look parentless. User's fix instruction
     was direct and specific: "don't hide zone headings ever" -
     removed the suppression entirely, including reverting D72's own
     `piles.length > 1` gate after the user said "that was not a
     requirement." Notable process moment: the user twice pushed back
     on unprompted special-casing mid-fix ("STOP adding special
     cases", "if you think we need a special case ask me") - both
     times, backed off to exactly the literal instruction rather than
     the smarter-seeming version.
   - Separately, direct user request: **removed the `pass` feature
     outright** (`HandPile` action, `TOGGLE_PASS`, `state.passed`,
     roster tag) - "not a requirement." Asked the user how far the
     removal should go (full feature vs. just the button) before
     touching anything, given the scope-creep pushback earlier in the
     same session - user confirmed full removal.
   - D75: user caught the REAL underlying issue behind D73's flagged-
     not-fixed gap - two independent `ensureZoneRecord` call sites
     (`CREATE_ZONE`/`MOVE_PILE`'s ungroup case) doing the same "make a
     zone" operation with different defaults, which is exactly how
     they'd drifted in the first place ("fix separate code paths for
     make zone... there can be only 1"). Unified onto one
     `makeStandaloneZone` helper.

**Process lesson worth carrying forward**: this session ran hot on
inferring "the smart fix" during D72/D73 and got corrected twice for
scope creep. The pattern that worked afterward: implement exactly
what's asked, and when a related-but-broader fix seems obviously
right, ASK before doing it (worked cleanly for `pass`'s removal-scope
question). Default to narrow + literal; expand only on explicit
confirmation.

**Repo state at close:** branch `touch-targets-and-pile-actions-sprint`,
2 commits ahead of `origin/touch-targets-and-pile-actions-sprint`/
`origin/main` (`405e240`, `e72275d` already pushed) - this session's
remaining diff (US-74 sprint + D72-D75) is uncommitted, staged for the
close-out commit+push the user just requested. 407/407 unit tests,
lint baseline unchanged throughout (7 pre-existing
`cognitive-complexity`, 3 pre-existing `lint:design` overlaps).

### Next Steps
None pending after commit+push. Standing backlog: e2e rebuild,
cognitive-complexity pass, builder screen, 2 minor pre-existing visual
overlaps, SaveAs's `window.prompt()` (Smith, non-blocking), Morpheus's
"check id survival before designing a save-for-reuse feature" note.
On cold resume: read `docs/ARCHITECTURE.md`'s tail (D64-D75) and this
entry before trusting anything older in this file.

---
## Status check confirmed — 2026-08-27, `*mouse status update`

Verified push completed: working tree clean, 0 commits ahead of
`origin/touch-targets-and-pile-actions-sprint`, tip `05aa3f6`. No
change to backlog or next steps above. Idle, no sprint in flight.

---
## Session close-out — 2026-08-28 (RtG sprint + art pipeline)

Two large pieces shipped and pushed this session.

**1. Sprint "Recard the Gathering" (US-75..83, D76-D81), phases 87-96.**
Full Bloop, all gates, launched by Cypher. 132 invented cards, 15
balanced decks, a `CARD_FACES` registry, 3 new pile kinds, `UNTAP_ALL`,
and a 2-player MTG preset - all without changing the table simulation,
which was the brief's hard constraint. Commit `acf96e6`.

Key sequencing call that paid off: the deck-balance linter (phase 88)
landed BEFORE any card content (89/90), so 132 cards were authored
against an enforced gate rather than retrofitted to one. It immediately
caught a real MTG rules violation (dual lands aren't basics, so the
4-copy limit applies) that would otherwise have shipped as 10 silently
illegal decks.

Phase 96 (reserved bug-fix) went unused for the first time in 4 sprints
- every defect was caught inside its own phase by live measurement
rather than surfacing at close.

**2. Art pipeline replacement.** Procedural SVG -> real generated
illustration for all 132 cards, plus a branded card back and a reusable
`tools/imagegen`. Commit `6721b5c`. Details in neo.docs/state.md.

**Process note worth carrying:** almost every defect this session was
invisible to code review and only surfaced by measuring - CSS
specificity beating a rule, a flex item stretching past its width floor,
a distorting square resize, a preset preview printing "1 deck" 14 times.
The habit that worked: screenshot or measure the real thing before
calling it done.

**Repo state at close:** branch `touch-targets-and-pile-actions-sprint`,
identical to `origin/main` at `0a4cff1`+ (0 ahead / 0 behind), working
tree clean. 490 tests, lint baselines unchanged (7 js / 3 design), 15/15
decks balanced. No background processes left running.

## Sprint: US-100 card right-click action menu (2026-09-02) — CLOSED

Two phases, both 1-3 tasks, both landed with no rework and no overflow:
- **Phase 1** — in-place actions (rotate/reveal): contextmenu wiring
  gated on having actions, menu render/position/dismiss, styles, tests.
- **Phase 2** — targeted actions (move/pickup/play): highlight +
  one-shot click-to-commit through the existing `onMoveCard`.

The split was along the real seam (does this action need a destination
or not?), which is why Phase 1 shipped as a working feature on its own
rather than as scaffolding. Worth repeating: cut phases where the
*mechanism* changes, not by file or by line count.

Velocity note: full cycle (stories → 2 gates → arch → 2 phases → groom
→ retro → launch) inside one session. Gates stayed real — Gate 2 sent a
genuine design question back rather than waving it through.

### Queued sprint, not started
`Pileable` (Chips/Tokens/Cards), `PileableActions` base extracted from
`cardActions`, per-pile-type UX + sorting, no back-compat. No stories
or arch exist — Cypher moves first. Sizing instinct for when it reaches
me: this one is a type-hierarchy refactor touching `src/piles/`,
`pileActions.js` and the reducer, so it will want MORE phases than
US-100 did, not fewer, and the first phase should be the interface
extraction alone with the existing card behavior unchanged and green.
