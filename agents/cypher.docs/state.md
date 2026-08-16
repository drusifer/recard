# Agent State

## Context
### Recent Decisions
- Project kickoff: "Recard" — P2P, no-server-infra, same-room virtual deck
  of cards. Game-agnostic (simulates a deck, doesn't referee any specific
  game). Drafted PRD v0.1 and 10 user stories (US-1..US-10).
- Added Principle 6 (live, best-effort motion sync) + US-11: hand
  reorganizing and card plays/draws replicate live to other clients.
  Reorganizing shows motion only (card identity stays private per US-5);
  playing/drawing reveals per existing rules. Best-effort = ok to drop/
  coalesce intermediate frames, must converge to correct end state.
- 2026-08-15 (post-launch): New v1.1 backlog requirement — card
  orientation (face-up/face-down play) + turn-over action + a shared
  "middle" that any player can interact with (poker/gin rummy support).
  Added US-12/13/14 to USER_STORIES.md + Feasibility Flag 3 to PRD.md.
  Flagged an open product question rather than assuming: is face-down
  hidden from *everyone* (community-card style, assumed for the stories
  as drafted) or hidden from *others but visible to the owner* (hole-card
  style, bigger addition — a second private zone)? Proceeded on the
  first interpretation since it matches "turn over to reveal" literally,
  but did not silently pick it without flagging.
- 2026-08-15 (post-launch, 2nd request): game presets + score keeping.
  Added US-15 (quick-start presets — pure client-side config lookup over
  existing US-3/US-4, no feasibility flag needed) and US-16 (score
  tracking). US-16 directly touches the existing "no scoring" Out-of-
  Scope principle — resolved by scoping score keeping as a dumb shared
  counter the app stores/displays but never computes, and updated the PRD
  Out-of-Scope section to say so explicitly rather than letting the
  contradiction sit unaddressed. Left one open call for Smith: can any
  player edit any player's score, or just their own?
- 2026-08-15 (user clarification round): resolved several open items at
  once —
  1. BOTH face-down forms confirmed wanted (not either/or). Generalized
     US-12/13 around a single `owner`/`faceUp` model per PRD Flag 3 —
     one mechanic covers community cards AND hole cards, matching the
     user's own framing ("primitives, not per-game rules").
  2. Sharpened PRD Vision with the user's own words verbatim: ship
     composable primitives, not game rules — this is now the explicit
     yardstick for future requests (does it add a primitive, or encode
     one game's rule?).
  3. Score UI = simple +/- buttons, not free-entry (US-16 AC updated).
  4. New: US-18 in-app rules reference (static content, bundled per D1,
     linked from US-15 presets where applicable).
  5. New: US-17 solo/solitaire play — checked the actual code myself
     before writing this story (grepped for any player-count gate in
     src/): none exists. Host is already added as a player on table
     creation, DEAL never assumed >1 player. This is a "make it an
     explicit tested guarantee" story, not new engineering — said so
     plainly rather than implying it needs a feasibility flag it doesn't.

### Key Findings
- Project was completely fresh: no sprint plan, no lessons/memory, no prior
  CHAT.md history. This is the first product artifact for the repo.

### Important Notes
- 2026-08-15: Accepted Neo's descope of QR *image* to v1.1 (US-1/US-2 now
  say join code + Copy Link for v1; scannable QR moved to Deferred/Stretch
  in USER_STORIES.md). Reasonable call — an unverifiable hand-rolled QR
  encoder is a worse user experience than no QR at all.
- 2026-08-15: Sprint 1 retro backlog (from all personas, for v1.1/v2
  planning):
  1. Reconnect-after-refresh / host handoff (Morpheus: biggest remaining
     architectural gap; was already PRD Open Question 4). STILL OPEN
     after Sprint 2 — not touched this sprint.
  2. Hand drag-reorder doesn't persist — wiped by the next state
     broadcast (Neo: real tech debt, needs local-order state if we want
     to keep the feature). STILL OPEN.
  3. Real QR code image, v1.1 (already tracked in Deferred/Stretch). STILL OPEN.
  4. Process: "UI must never show two contradictory states" AC checklist
     item — ADOPTED, applied informally through Sprint 2 (Smith's Gate 1
     UX requirements followed this spirit throughout).
  5. Process: flag feasibility-uncertain stories as research spikes at
     planning time — partially adopted (QR wasn't repeated, but this
     sprint's own new-theme risk, touch-target sizing, wasn't caught
     until close-out either — see item 8 below).
  6. Process: time-box a dedicated bug-fix phase — STILL NOT DONE; Sprint
     2 repeated the same pattern (bug round absorbed into the tail, per
     Mouse's Sprint 2 retro). Escalating: this is now a 2-sprint-running
     pattern, worth actually doing next time rather than re-noting.

- 2026-08-15: Sprint 2 retro backlog (new items):
  7. Standing pre-ship checklist item — "measure real interactive element
     sizes on a mobile viewport" — ADOPTED IMMEDIATELY: codified in
     `docs/ARCHITECTURE.md`'s new UI Conventions section (≥44×44px), not
     just left as a note (Smith/Oracle).
  8. Hole-card vs. community-card ambiguity and the score-button-mechanism
     question were both legitimate flagged questions, not planning
     misses — but note the pattern: two requests in a row needed a
     mid-draft clarification round. Consider asking bifurcating-design
     questions in the same turn as the initial ask when the request
     itself signals a fork (e.g. "cards not revealed" could mean two
     different mechanics) rather than drafting toward one interpretation
     first.
- Flagged a feasibility question to Morpheus: true zero-signaling P2P is
  not typically possible with WebRTC — some out-of-band exchange is needed
  even for same-room devices. See "Feasibility Flag" section in
  `docs/PRD.md`. This affects join UX (US-2) and is core architecture, so
  Cypher deferred the decision rather than assuming an approach.
- Open questions logged in PRD (max players, structured zones vs. freeform,
  custom card backs, reconnect behavior) — assumptions stated inline so
  work isn't blocked, but these should be confirmed with the user as the
  design firms up.

## Current Task
**Status:** In progress
**Assigned to:** Cypher
**Started:** 2026-08-15

### Task Description
Draft initial PRD and user stories for the new card-game project, then
route for feasibility (Morpheus) and UX Gate 1 review (Smith) per protocol.

### Progress — SPRINT 1 COMPLETE
- [x] PRD v0.1, USER_STORIES.md v0.1 (US-1..US-11)
- [x] Both feasibility flags resolved by Morpheus (docs/ARCHITECTURE.md)
- [x] Smith Gate 1 + Gate 2 approved
- [x] Mouse phase plan (5 phases), all implemented by Neo, all UAT-passed
      by Trin, all code-reviewed by Morpheus
- [x] Oracle groom (docs/DECISIONS.md, lessons.md, memory.md, README index)
- [x] Smith sprint-close user test: found + Neo fixed 3 bugs, re-verified
- [x] Full team retro posted to CHAT.md, backlog captured above
- [x] Launched (see *pm launch below)

### Blockers
None — proceeding on stated assumptions; flagged open questions rather than
blocking.

### Oracle Consultations
None yet — nothing in memory/lessons relevant to a fresh project.

## Next Steps
### Immediate Next Action
This is v1.1 backlog, not an active sprint — waiting on Morpheus's
feasibility read (Flag 3: face-down middle cards) before this becomes a
plannable sprint item. Not auto-starting `*plan sprint` for it; that's a
separate user/Mouse call once feasibility + the open orientation question
are resolved.

### Waiting On
- @Morpheus: feasibility on Flag 3 (face-down middle card privacy model).
- User: confirm the face-down-hidden-from-everyone vs. hole-card-style
  open question once Morpheus's feasibility read is in — no need to ask
  before that, since the answer may change the technical shape of the ask.

### Progress — SPRINT 2 ("clear backlog", v1.1): COMPLETE
- [x] US-12..18 stories, Gate 1 (batch review + substantial UX reqs),
      Morpheus architecture (D7-D11), Gate 2, Mouse 6-phase plan, all
      implemented/UAT'd/reviewed, Oracle groom, Smith close-out (2 bugs
      found+fixed+re-verified), full retro, launched (see *pm launch).

### Progress — SPRINT 3 ("zones, presence, hand tools"): COMPLETE
- [x] Drafted US-19..25 in USER_STORIES.md + Feasibility Flag 4 in PRD.md.
      Flagged 2 open questions rather than assuming: "incremental
      dealing" (assumed = deal-more-without-wiping, not animation
      pacing) and cursor/motion granularity (assumed = zone-level, not
      hand-slot-level, to avoid a privacy side-channel). US-23
      (hand sort) explicitly folds in the still-open Sprint-1 tech debt
      (hand order doesn't persist) rather than repeating the same bug
      with a new feature built on the same foundation.
- [x] Smith Gate 1 (approved, 5 UX requirements added) + Gate 2
      (Morpheus's D12-D16 approved)
- [x] Mouse 9-phase plan (12-20, incl. a dedicated reserved bug-fix
      phase — item 6 below, finally acted on after 2 sprints of just
      re-noting it)
- [x] All 8 implementation phases (12-19) implemented/UAT'd/code-reviewed
- [x] Oracle groom (DECISIONS.md D12-D16 entry, 4 new lessons, memory.md,
      README)
- [x] Smith close-out test: found 1 bug (mini-hand duplicate hand-count,
      squished with no spacing) — Phase 20 fix, re-UAT'd, re-reviewed,
      re-tested by Smith, report closed
- [x] Full team retro posted to CHAT.md, backlog updated below
- [x] Launched (see *pm launch below)

### Blockers
None.

### Oracle Consultations
None this sprint beyond the standard close-out groom handoff.

## Next Steps
### Immediate Next Action
Sprint 3 is fully closed. No active sprint queued — next work starts
when the user brings a new request/backlog item.

### Waiting On
Nothing.

### Planned Work — backlog for v2 planning
- [x] Item 2 (hand-order persistence) — DONE this sprint via US-23/D14,
      not deferred again.
- [x] Item 6 (dedicated bug-fix phase) — DONE this sprint (Phase 20),
      worked exactly as intended per Mouse's retro. Retiring this item.
- [ ] Item 1 (reconnect-after-refresh / host handoff) — STILL OPEN, now
      3 sprints running. Biggest remaining architectural gap per
      Morpheus's original Sprint 1 retro note.
- [ ] Item 3 (real QR code image) — STILL OPEN, 3 sprints running.
- **New from Sprint 3's retro:**
  9. Oracle: the continuous-groom gap (record decisions/lessons as they
     happen, not just at Stage 3 close) was already flagged in Sprint 1's
     retro and recurred again this sprint unchanged — this is now a
     repeat-pattern item like #6 was, worth actually acting on next
     sprint rather than re-noting a third time.
  10. Smith/Morpheus: add "does this new visual indicator duplicate info
      already shown elsewhere on the same row/element" as a standing
      Gate 1 AC / design-review question, same tier as the touch-target-
      size check adopted after Sprint 2 (item 7) — this sprint's bug
      (mini-hand count duplicating roster text) is exactly the class of
      thing that check would catch before implementation, not after.
  11. Neo: diff the working tree against the last commit at phase/sprint
      start, don't just trust task.md's checkboxes — this sprint's
      Phase 18 scaffolding was already sitting uncommitted from an
      interrupted session and task.md didn't reflect it.
  12. Trin: "can this assertion fail on purpose" as a standing question
      for any new regression test, not a one-off — proved genuinely
      useful twice this sprint (the sort-selector self-catch, the
      DEAL_MORE mutation test).

### Progress — SPRINT 4 ("top-down table redesign") — IN PROGRESS
- [x] Drafted US-26..30 in USER_STORIES.md + PRD Feasibility Flag 5.
      Confirmed 3 forking questions with the user before drafting: drag
      snaps to zones (not freeform x/y), every player auto-gets a
      personal zone at their seat, and — corrected mid-draft by the user
      — other players' card movement needs true real-time position
      broadcast (best-effort/approximate accepted), not just an animated
      jump on drop.
- [x] Smith Gate 1 (4 amendments) + Gate 2 (D17-D19 approved) +
      Mouse 7-phase plan (21-27, incl. proactive reserved bug-fix phase)

### Blockers
None.

### Progress — SPRINT 4 ("top-down table redesign"): COMPLETE
- [x] US-26..30, Gate 1 (4 amendments) + Gate 2 (D17-D19), Mouse 7-phase
      plan (21-27, proactive reserved bug-fix phase - planned upfront
      this time, not requested after the fact)
- [x] All 6 implementation phases (21-26) implemented/UAT'd/code-reviewed
- [x] Oracle groom (DECISIONS.md D17-D19, 4 new lessons, memory.md,
      README - CHAT.md archived at 111 msgs)
- [x] Smith close-out: 2 findings - #1 (cursor affordance) fixed via
      Phase 27, re-verified, closed. #2 (5+-player mobile density)
      deliberately NOT fixed - escalated to backlog below instead of a
      rushed second attempt, per Smith/Trin/Morpheus consensus
- [x] Full team retro posted to CHAT.md, backlog updated below
- [x] Launched (see *pm launch below)

### Blockers
None.

### Planned Work — backlog for next sprint's planning
- [ ] **New, high priority**: seated-player mobile layout needs a real
      compact-seat design (not a CSS tweak) - measured, not guessed:
      clean through 4 players, overlap starts at exactly 5, worse by 8.
      The 44px score-button touch-target floor (Sprint 2) is a hard
      constraint on how compact a seat card carrying score controls can
      get - likely needs score adjustment moved off the seat card itself,
      or a fundamentally different compact layout. Worth its own small
      sprint, not squeezed into a close-out phase a second time.
- [ ] A real pre-existing bug (not caused by Sprint 4) - if 2+ players
      click Join within the same moment (not sequentially), the host hits
      "Maximum call stack size exceeded" inside PeerJS's msgpack pack()
      broadcasting to a connection that isn't open yet. Confirmed on the
      committed baseline, so not a Sprint 4 regression. Likely needs
      `sendTo` to defer/queue until a connection's `open` event fires.
- Items 1 (reconnect) and 3 (real QR) — STILL OPEN, now 4 sprints running.
- **New from Sprint 4's retro:**
  13. Neo: check whether new pure logic has a natural dedicated-module
      home BEFORE writing it, not only after a prompt to extract it
      (seating.js was pulled out of main.js/ui.js reactively this
      sprint).
  14. Trin: reach for an objective measurement, not just a visual/
      screenshot read, whenever a UAT finding will inform a scope or
      priority decision (this is what let the team confidently escalate
      the density finding instead of guessing at its severity).
  15. Morpheus: architecture review for a new geometry/layout decision
      should explicitly ask "does this scale against an existing hard
      constraint" (here: seat count vs. the 44px touch-target floor) as
      its own question, not just "is the geometry correct."
  16. Oracle: the continuous-groom gap (items 9, originally from Sprint
      1) did NOT recur this sprint - first repeat-pattern item to
      actually break its streak. Retiring this item; worth noticing
      when a fix actually holds, not just when a pattern repeats.
  17. Smith: add "does this new gesture/control have a visual
      affordance signaling it's interactive" as a standing Gate 1
      question, same tier as touch-target-size (item 7) and
      info-duplication (item 10) checks.

---
*Last updated: 2026-08-15 22:55*
