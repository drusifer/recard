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

### Progress — SPRINT 5 ("desktop table width"): IN PROGRESS
- [x] Drafted US-31 in USER_STORIES.md. Root cause confirmed by reading
      style.css directly: `#screen-game { max-width: 760px; }` has no
      desktop breakpoint at all — same cap applies whether the viewport
      is a phone or a 27" monitor. Deliberately scoped this AWAY from
      the open mobile-density backlog item (below) — same seat/table
      code, opposite problem (desktop has too little use of space,
      mobile has too much crowding); fixing one is not a reason to
      touch the other in the same story.
      Fast-Track candidate per Cypher operational guideline 7 (single
      story, CSS-scoped, no new protocol/state) — flagging for Mouse to
      consider a 1-phase sprint rather than the full 6-9 phase pattern
      of Sprints 3/4.

### Blockers
None.

### Next Steps
### Immediate Next Action
Handed to Smith for Gate 1 (`*user review`). Exact breakpoint/max-width
values deliberately left to Morpheus's Gate 2 architecture pass, not
prescribed in the story.

### Waiting On
Nothing.

### Progress — SPRINT 5 ("desktop table width"): COMPLETE
- [x] US-31, Gate 1 (3 amendments) + Gate 2, Mouse's first-ever
      Fast-Track single phase (28), implemented/UAT'd/reviewed, Oracle
      groom (D20), Smith close-out (screenshotted the real app, no
      bugs), full retro, launched below.
- Team retro highlights: Trin's "AC coverage, not just passing tests"
  catch is the sprint's most reusable lesson - added to backlog as a
  standing UAT checklist item. Fast-Track process itself validated
  end-to-end for the first time since being written at Sprint 1.

### Blockers
None.

## Next Steps
### Immediate Next Action
Sprint 5 is fully closed. No active sprint queued.

### Waiting On
Nothing.

### Planned Work — backlog for next sprint's planning
- [ ] **New process item**: "does every AC bullet have a corresponding
      test assertion" as a standing Trin UAT checklist step (this
      sprint's own finding - Neo's tests all passed but one AC bullet
      had zero coverage until Trin checked line by line).
- Items 1 (reconnect-after-refresh/host handoff) and 3 (real QR image)
  - STILL OPEN, now 5 sprints running.
- Item from Sprint 4: seated-player mobile density (5+ players) - still
  needs its own real compact-seat design sprint, untouched by Sprint 5
  (deliberately - opposite problem, same code area).
- Non-blocking observation from Sprint 5 (Smith Gate 2): desktop
  type/density scaling (the UI still visually reads as "mobile sizing in
  a bigger box") is a separate future item from "more room," if ever
  requested.

---
*Last updated: 2026-08-16 (Sprint 5 close)*

### Progress — SPRINT 6 ("snap-to stack/overlap for runs and sets"): IN PROGRESS
- [x] User request: "snap to" logic for stacking/overlapping cards in a
      zone. **Asked a clarifying question before drafting** (matches the
      Sprint 2/3/4 precedent of confirming forking questions up front):
      offered a continuous drop-position spectrum, two explicit discrete
      modes, or stack-only-deferred-overlap. User picked **two explicit
      discrete modes**.
- [x] Grounded in actual code before writing AC (not guessed): confirmed
      `MOVE_CARD` currently always appends and no-ops on a same-zone
      move (zero reordering exists today), and that
      `dropCardOnZone`/`renderZonePanel` already carry an explicit
      precedent comment against mid-drag popups (established when
      face-down play was kept button-only) — used that precedent to
      shape AC toward a spatial drop-region distinction instead of a
      dialog, rather than contradicting a decision the team already made.
- [x] Drafted US-32 (stack) and US-33 (overlap/fan) in USER_STORIES.md,
      as two stories sharing one mechanism (differ in render offset +
      drop region only). Added PRD Feasibility Flag 6 for Morpheus with
      a concrete technical proposal (position-aware `MOVE_CARD`, new
      shared `stacked` per-card hint, drop-target detection extension).
      Explicitly flagged the *exact* drop-region split (which half/edge
      = which mode) as Smith's call at Gate 1, not prescribed here.
- Not a Fast-Track candidate — real new reducer semantics, new shared
  state field, new drag-drop wiring, new CSS. Expect a multi-phase plan
  from Mouse.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Smith for Gate 1 (`*user review` US-32/US-33) — specifically
need Smith to propose the concrete drop-region mechanism.

### Waiting On
@Smith: Gate 1 approval + concrete drop-region UX proposal.

### Mid-sprint addition (user, same session): deck operations
User asked to also add "Draw, Split, Shuffle" deck operations for
easier deck interaction. Checked existing code before drafting:
- **Draw**: already exists (`DRAW` action, existing button) - real gap
  is placement/discoverability, not missing logic. It's buried in the
  hand panel's button row, not grouped with the deck visual
  (`.deck-area`) it actually acts on.
- **Shuffle**: does NOT exist as a standalone action today - `RESET` is
  the only thing that reshuffles, and it also wipes every hand, every
  zone's cards, and passed markers. No way to just reshuffle the
  remaining deck in place without a full round reset.
- **Split**: does not exist at all. Asked the user to clarify via
  AskUserQuestion (two draw piles vs. a cosmetic cut); the user declined
  to answer directly and said to stop asking and just proceed with
  backlog items noted instead. **Proceeding on a stated assumption, not
  blocking**: Split = divide the deck into two independently-drawable
  piles (implemented as a new face-down zone carrying half the deck) -
  the more useful of the two options, and the cosmetic-cut alternative
  would be functionally undetectable by any player anyway since deck
  order is never shown to anyone (`viewFor` only ever exposes
  `deckCount`, never order/contents). **Flagged clearly as an
  assumption for the user to correct, not silently decided.**
- User separately said: "backlog mobile support" - referring to
  Smith's Gate 1 finding that native drag-and-drop doesn't fire from
  touch gestures on real mobile browsers (pre-existing since US-28, not
  a regression from this sprint's work). Logged as a backlog item, not
  a blocker for Sprint 6.
- Drafted US-34 (Draw regrouped near the deck, no logic change), US-35
  (Shuffle - new host-only `SHUFFLE_DECK`, reshuffles in place without
  touching hands/zones/scores/passed, the one thing today's
  Reshuffle&Reset can't do), US-36 (Split - new host-only `SPLIT_DECK
  {pileCount}`, creates N face-down zones dealt round-robin, explicitly
  supporting more than 2 piles per the user's solitaire correction).
  Added PRD Feasibility Flag 7 for Morpheus - both new actions proposed
  as thin reuses of existing helpers (`shuffle()`, `makeZone()`,
  `dealCards()`'s round-robin loop), not new mechanisms.
- Sprint 6 now covers US-32..36 (2 stories = card stacking/overlap
  snap, 3 stories = deck operations) as one sprint, not split into two
  sequential Bloop chains - both are "make card/deck interaction
  easier" additions from the same conversation, consolidated per
  Bloop-efficiency guidance.

### Waiting On
@Smith: Gate 1 covering the full US-32..36 set (32/33 already
Gate-1-approved earlier this turn; 34/35/36 are new, need review).

---

## Shutdown prep catch-up (2026-08-22)

This file went stale after Sprint 6 - many stories shipped since via
background agents using `agents/CHAT.md` (its `*pm launch` messages are
the real story-close record) and `docs/USER_STORIES.md` directly, not this
file. Read those first before trusting anything above this note. Notably:
US-40 through US-45 (touch/reconnect), US-46 (pile-hover-actions
redesign), US-47/48 (Pile interface, D39), US-49/50/51 (GameConfig
epic remainder), US-52/53 (orientation, preset schema), US-54 (hide Add
Zone), US-55 (table unification), and the D52 radial-menu follow-on all
shipped and launched. `docs/USER_STORIES.md`'s tail has the current
backlog: two minor visual findings, and the builder screen (needs real
product/UX scoping from the human user - the one open item that's
actually still Cypher's to pick up next, not an implementation task).

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`44303e3`, clean, 260/260 unit tests green.

---
## Sprint: Custom Layouts + Zone/Pile Removal + changePileType (2026-08-27)

Drafted US-69..73 in USER_STORIES.md per direct user request: Save
Layout (persist current positions as a preset-scoped localStorage
override), SaveAs (custom name, default = preset name), Remove Zone,
Remove Pile, and a new `changePileType` pile action. Researched first
(via Explore agent) against panelLayout.js/presets.js/state.js/
pileActions.js/pileTypes.js before drafting - confirmed no
REMOVE_ZONE/REMOVE_PILE reducer action exists at all today (RENAME_*
is the nearest precedent), and layout persistence today is one global
non-preset-scoped localStorage blob. Flagged 7 open questions for
Smith's Gate 1 rather than guessing, most consequentially: whether
"remove zone/pile" is meant to persist into a saved layout override or
stay a live-session-only action (proposed: live-session-only, out of
scope to also override gameConfig.piles/zones this sprint) - the
feature request conflates layout-position persistence with
zone/pile-existence, which are separate systems in the current code.
Also proposed empty-only guards for remove-zone/remove-pile/
changePileType (no cascade-delete, no silent card loss, no per-card
re-validation against a new pile type's canAccept).

### Waiting On
@Smith: Gate 1 on US-69..73, specifically the 7 flagged open questions.

## Launch — Save Layout/Remove Zone+Pile/changePileType (2026-08-27)

Full cycle complete: Gate 1 (7 questions resolved) -> Morpheus arch
(D61-D63) -> Gate 2 (1 condition) -> 6 phases (task.md 79-84) -> Oracle
groom -> Smith end-to-end test (APPROVED) -> full-team retro. 393/393
tests, lint baseline unchanged. Two real live-caught UX bugs fixed
before shipping (Table-pile always-fails Remove button; 1px scroll
regression). Backlog additions: SaveAs's `window.prompt()` (Smith,
non-blocking), Morpheus's "check id-survival before designing a save-
for-reuse feature" process note.

### Current Task
**Status:** Sprint complete, launched.

### Next Steps
None pending. Same standing backlog as before (e2e suite rebuild,
7 cognitive-complexity findings, builder screen, 2 minor visual
overlaps) plus this sprint's 2 new items above.

---

## Sprint 23 ("pile-level actions, generalized") — 2026-08-25

Drafted US-60..63 in USER_STORIES.md per direct user request: Split
Pile, Take Pile, Hide/Show (pile-wide face orientation), and
drag-a-pile-between-zones via its title bar. `split`/`draw` already
exist deck-only (SPLIT_DECK/DRAW) - US-60/61 generalize them via the
D42/D53 per-type module pattern rather than inventing parallel
deck-only/generic paths. US-62/63 are new. Flagged 5 real open
questions for Smith's Gate 1 rather than guessing: odd-card-count
split rounding, take-pile confirm threshold, hide/show naming
(collision risk with existing `rotate`) + authorization level, and
US-63's two biggest calls - which pile kinds are eligible to move at
all (proposed: zone/discard only, NOT hand/foundation/cascade/
rankAdjacent), and merge-vs-sibling on drop.

### Waiting On
@Smith: Gate 1 on US-60..63, specifically the 5 flagged open questions.

---

## Sprint 22 ("Zone/Pile polymorphism") — 2026-08-24

Drafted US-56..59 in USER_STORIES.md per direct user request, but only
after Morpheus checked whether D38's original Zone-catalog pitch had a
real driver (it didn't) - user's follow-up reframed the ask around
Solitaire+Spit as concrete proof games. Gate 1 approved with 1 UX note
(foundation lock affordance). Handed through Morpheus/Mouse; sprint now
in implementation (task.md Phases 62-67). Nothing further for Cypher
until close-out.

## Launch — US-100 card right-click action menu (2026-09-02)

Shipped and pushed (`d8ce5a1` on `dev`). Full sprint cycle, both Smith
gates real, no rework at any gate.

**US-100 as written:** a player right-clicks an actionable card and
gets a context menu of the actions `actionsForCard` already offers it
(rotate/reveal/move/pickup/play), reusing `ACTION_SPECS` and the
existing confirm/destructive rules. Explicitly NOT a bar across the top
the way PileActions works — that was the user's own framing, and it
matters because a persistent per-card bar was already tried and removed
(2026-08-26, "cards are Movable not Actionable"). The menu is additive:
existing tap and drag gestures still work.

Scoped OUT and shipped that way: touch/long-press (desktop-only per the
standing UI-pass rule), and any change to the pile-level header bar.

**Smith's two gate conditions, both honored in the delivered code:**
(1) only suppress the native OS menu on a card that actually has
actions — no dead-end empty menu; (2) targeted actions needed a real
destination-choice step, since no click-based picker existed. Gate 2
was the valuable one — it caught an assumption in my original AC that
the targeting flow already existed. It did not.

**Caveat carried to the user, not buried:** no live click-through
happened. No browser-automation tool was connected and a real two-peer
WebRTC session wasn't worth scripting headless for this size of change.
Smith approved on code review with that disclosed. If the user reports
this doesn't behave in the browser, that gap is the first suspect.

### Backlog added this sprint
1. Browser-automation tooling for this project, so `*user test` stops
   being review-only on interaction-heavy stories (Smith).
2. ~~Grooming pass on stale `tests/e2e.smoke.mjs` references~~ — DONE,
   tech-debt sprint 2 (US-108, 2026-09-05).
3. A jsdom/e2e harness for `ui.js` interaction wiring (Trin).

## Launch — Tech-debt sprint 2, US-106..108/D114 (2026-09-05)

Full cycle, no rework at any gate: Gate 1 (US-106 flagged as the
sprint's one deliberate behavior change) -> Morpheus's D114 (found and
closed a real gap: no standalone RESET control existed before this)
-> Gate 2 (Smith's UX spec for the new button, followed verbatim) ->
Mouse's 6-phase plan -> all phases implemented/UAT'd/reviewed -> Oracle
groom (CHAT.md archived at 237 msgs) -> Smith close-out (approved on
code review, browser automation still not wired up) -> full retro.
`npm run lint:js` 8 -> 0 findings. One live CSS bug (`.deck-stack` dup
`min-width`) found and fixed at the reserved bug-fix slot.

### Backlog added this sprint
4. Standing process item: run the FULL `npm run lint` (not just
   `npx eslint src/`) as the UAT/close gate command - this sprint's
   `.deck-stack` finding was caught only because Trin ran the full
   pipeline, not the narrower JS-only check (Neo/Trin).
5. `*ora report` cadence: archive mid-sprint when CHAT.md nears the
   50-100 rolling threshold, not only at sprint close - this sprint's
   archive happened at 237 messages (Oracle).

## Next Steps

**Queued sprint — I own the first move. NOT started.**

The user asked for it and then immediately asked to prep for shutdown,
so Stage 1 never began. Nothing exists yet: no stories, no AC, no arch.
Their request, close to verbatim:

> new Objects representing chips and/or tokens. Make Chips, Tokens and
> Cards extend a new interface: Pileable. Same deal as cardActions —
> extract a base PileableActions and extend. New UX for different pile
> types, sorting actions etc. Same universal drag and drop and pile
> dynamics as cards. If you do this right the existing code shouldn't
> have to change too much. **No back compat.**

Start at `*pm plan sprint`. Two things to weigh while writing the AC:
- "The existing code shouldn't have to change too much" is a stated
  success criterion, not just an aside — worth an explicit AC, and
  worth checking against reality early rather than discovering late.
- "No back compat" is this project's standing rule and it is literal:
  old interfaces and their tests get deleted, never kept as aliases.

## Sprint: Tech Debt (2026-09-04) — IN PROGRESS

User invoked `*sprint tech debt` right after the previous session's
close-out queued RESET vs Reshuffle & re-deal separation. Drafted
US-106..108 in USER_STORIES.md, second tech-debt sprint after US-64..68
(2026-08-27):
- **US-106**: RESET vs Reshuffle & re-deal separation — the queued item,
  per-card deck origin is the substantive work. **Flagged explicitly as
  a deliberate user-visible behavior change**, not a no-behavior-change
  refactor like the other two — the whole point is that reshuffle stops
  wiping zones/scores/chips. Also flagged: D111's chip-on-RESET handling
  needs re-deriving from the corrected definitions, left as a Morpheus
  question rather than assumed.
- **US-107**: fix the cognitive-complexity lint findings flagged (not
  fixed) at the last tech-debt sprint. Checked live rather than trusting
  the "7" in state files (`npx eslint src/`) — it's now 8: dropTarget.js
  (18), main.js x2 (27, 65 — the reducer), touchDrag.js (18), ui.js x3
  (22/22/25), plus one unrelated unicorn/name-replacements finding
  bundled in as a bonus since it's in the same sweep.
- **US-108**: groom stale `e2e.smoke.mjs` references out of docs/memory
  (deleted at D60, still cited as live in several places per earlier
  grep). Explicitly scoped OUT: building a new E2E suite (that's the
  separate browser-automation-tooling backlog item).

Deliberately did NOT bundle in: reconnect/host-handoff, real QR image,
mobile density, builder screen — those are feature/product work, not
tech debt, and stay on the standing backlog.

### Waiting On
@Smith: Gate 1 review of US-106..108. US-106 in particular needs Smith's
read since it's not pure internal cleanup — reshuffle's actual behavior
changes for the player.
