# Agent State

## Context
### Recent Decisions
- Sprint 2 (v1.1) groom complete: `docs/DECISIONS.md` +1 entry (v1.1
  architecture D7-D11, with the user's own "primitives not rules"
  framing preserved verbatim), `agents/oracle.docs/lessons.md` +4 lessons
  (generalize-before-inventing, flag-don't-guess ambiguity, self-check
  vs. independent-check, count-from-current-state in e2e assertions),
  `agents/oracle.docs/memory.md` updated (Project Context sharpened,
  Major Decisions +1 row, Repository Structure updated for new files),
  `README.md` updated (features list, "Known v1 limitations" →  "Known
  limitations" since it's not v1-only anymore, privacy section extended
  to cover the middle zone).
- CHAT.md archived: was at 109 messages (over the 50-100 threshold),
  archived to `agents/chat_archive/CHAT_SPRINT_1_2.md` /
  `CHAT_SPRINT_1_2.diagram.md` via `bobp chat-report --moniker
  SPRINT_1_2`, CHAT.md reset for the next stretch of work.

### Key Findings
None new this groom — Sprint 1's groom already established the pattern
(continuous decision/lesson capture during the sprint via
Cypher/Morpheus/Trin posting to CHAT.md as they went, not just invented
at close-out), and Sprint 2 followed it.

### Important Notes
None yet

## Current Task
**Status:** Groom complete
**Assigned to:** Oracle
**Started:** 2026-08-15

### Task Description
Sprint-close documentation grooming for Sprint 2 ("clear backlog", v1.1),
per sprint.md Stage 3 Step 7.

### Progress — Sprint 2 (v1.1)
- [x] docs/DECISIONS.md updated
- [x] agents/oracle.docs/lessons.md updated
- [x] agents/oracle.docs/memory.md updated
- [x] README.md updated
- [x] CHAT.md archived (109 msgs, over threshold) and reset
- [x] Handed to Smith for end-to-end user testing

### Progress — Sprint 3 ("zones, presence, hand tools") groom
- [x] docs/DECISIONS.md +1 entry (D12-D16, matching the D7-D11 entry's
      format/depth)
- [x] agents/oracle.docs/lessons.md +4 lessons: the headless-Chromium
      native-drag-and-drop gap (mirrors Sprint 1's `page.close()`
      lifecycle lesson - both are "the test harness, not the app, is the
      problem" gotchas), a self-check-your-check catch (Trin's first pass
      at verifying sort read a dataset attribute that doesn't exist and
      would have trivially rubber-stamped a pass), proving an assertion
      has teeth via a deliberate mutation test (Trin's DEAL_MORE swap),
      and task.md drifting stale relative to CHAT.md's actual history.
- [x] agents/oracle.docs/memory.md updated (Major Decisions +1 row,
      Repository Structure updated for handOrder.js/64 tests/new e2e
      coverage)
- [x] README.md updated: features list now covers zones/sort/Deal More/
      pass/cursor, removed the now-fixed "hand-drag doesn't persist" known
      limitation (that was literally this sprint's D14), added the
      lift-cue-not-pixel-drag scope note in its place, ARCHITECTURE.md
      index line D1-D6 -> D1-D16.
- [x] CHAT.md checked: 66 messages, under the 50-100 archive threshold
      (last reset was for Sprint 1+2's close) - not archived this time.
- [ ] Hand to Smith for Stage 3 end-to-end test on the full v1.2 feature
      set.

### Progress — Sprint 4 ("top-down table redesign") groom
- [x] docs/DECISIONS.md +1 entry (D17-D19), matching prior entries'
      format/depth, including the honest density-finding disposition
- [x] agents/oracle.docs/lessons.md +4 lessons: recognizing a mid-draft
      user correction as reopening previously-declined PRD scope (not
      new scope), applying "unit tests form the base of the pyramid"
      retroactively (not just to new code), preferring an objective
      measurement over a screenshot read once a finding feeds a
      design/backlog decision, and "improved not resolved" as its own
      valid, honest disposition distinct from both overclaiming and
      ignoring
- [x] agents/oracle.docs/memory.md updated (Major Decisions +1 row,
      Repository Structure: seating.js, cardDragPayload, 86 tests)
- [x] README.md updated: features list covers the table/seating/drag/
      personal-zones redesign, the now-outdated "cursor+lift not
      pixel-drag" limitation removed (D19 delivers real drag now), the
      5+-player mobile density gap added as an honestly-reported known
      limitation (not silently dropped), ARCHITECTURE.md index line
      D1-D16 -> D1-D19.
- [x] CHAT.md archived: was at 111 messages (over threshold), archived to
      `agents/chat_archive/CHAT_SPRINT_3_4.md` (bundled Sprints 3+4 since
      Sprint 3's own count - 66 at its own groom - hadn't yet crossed the
      threshold on its own), reset for the next stretch of work.

### Blockers
None

### Oracle Consultations
N/A (this is Oracle's own task)

## Next Steps
### Immediate Next Action
Hand to Smith for Stage 3 Step 8 (`*user test` + `*user feedback`) on
Sprint 4's full feature set - specifically re-checking the 5+-player
mobile density finding via her own Gate 1 requirement.

### Waiting On
Nothing — groom is done, handing off now.

### Planned Work
- [ ] If Smith finds bugs (or formally escalates the density finding),
      expect a Trin triage round + Phase 27 before retro (same pattern as
      the last two sprints).
- [ ] CHAT.md just reset - plenty of headroom before the next archive.

---

## Sprint 5 ("desktop table width") groom

### Progress
- [x] `docs/DECISIONS.md`: added the D20 entry (context, decision,
      consequences) — Morpheus's D20 in `docs/ARCHITECTURE.md` already
      had the technical detail; this is the project-history-level
      summary matching every prior sprint's pattern.
- [x] `agents/oracle.docs/lessons.md`: 2 new lessons — (1) UAT must
      check each AC bullet against actual test coverage, not just that
      handed-off tests pass (Trin found an uncovered AC bullet despite
      Neo's tests being green); (2) Fast-Track single-phase planning,
      used for the first time this sprint, held up end-to-end with no
      process friction.
- [x] `agents/oracle.docs/memory.md`: decision table +1 row (D20).
- [x] `agents/CHAT.md`: 24 messages — well under the 50-100 archive
      threshold, no action needed.
- [x] `README.md`: checked, no update needed — the existing "Known
      limitations" mobile-density entry is still accurate (D20 didn't
      touch it), and per the PRD's own "primitives, not polish" yardstick
      a CSS breakpoint fix doesn't warrant a new Features-list bullet
      (matches how Sprint 4's cursor-affordance fix also got no bullet).

### Blockers
None.

## Next Steps
### Immediate Next Action
Hand to Smith for Stage 3 Step 8 (`*user test` + `*user feedback`) on
Sprint 5's one feature — plus a general sanity pass that nothing else
regressed, since this is a layout-wide CSS change even though scoped to
one selector.

### Waiting On
Nothing — groom is done, handing off now.

### Planned Work
- [ ] If Smith finds anything, expect a Trin triage round before retro.
- [ ] CHAT.md has headroom; no archive needed this sprint.

---
*Last updated: 2026-08-16 (Sprint 5 groom)*

## Shutdown prep catch-up (2026-08-22)

This file went stale after Sprint 5 - many groom passes happened since
(Sprints 6, 9-21+) directly in `docs/ARCHITECTURE.md`/`docs/USER_STORIES.md`/
`docs/DECISIONS.md` rather than being logged here. Two real, previously-
flagged gaps worth knowing about: (1) `docs/DECISIONS.md`'s narrative log
used to stop at D20 while ARCHITECTURE.md ran to D42+ - this was flagged
twice with no action, then actually resolved during Sprint 14's groom:
DECISIONS.md's header now marks it superseded by ARCHITECTURE.md's
per-sprint sections, so that gap is closed, not still open. (2) The D51
table-unification redesign got superseded by D52's radial menu less than
a day after shipping, before a formal groom ever ran on D51 alone - the
e2e-fix-and-close sprint (commit `d007cf2`) groomed both together so the
docs read as current truth, not a stale intermediate state.

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`44303e3`, clean, 260/260 unit tests green, e2e green as of last close.
`docs/ARCHITECTURE.md` is current through D52. Nothing needs grooming
right now.

---
## Post-Sprint-22 / D54 groom (2026-08-25)

Groomed after the ad-hoc post-Sprint-22 session that split Zone and
Pile into real Web Components (commit `ab75f0a`). Added:
- `docs/ARCHITECTURE.md`: D54 entry (full narrative - the five-round
  user-corrected design path, the Deck-becomes-a-Pile change, two
  real pre-existing bugs found+fixed, verification numbers), plus
  refreshed "Open Items Carried Forward" with the 3 current standing
  gaps (handPile.redactCard privacy, per-seat anchor geometry,
  e2e.smoke.mjs staleness) at the top, above the older still-open items.
- `agents/oracle.docs/memory.md`: Major Decisions +1 row (D54),
  Repository Structure section refreshed (chat_archive listing,
  src/piles + src/components, current test count 308).
- `agents/oracle.docs/lessons.md`: 3 new lessons - checker-selector rot
  after a DOM rename (false-positive-clean, not just false-positive-red),
  iterative user corrections as real design refinement not scope creep,
  geometric proof over screenshot-read applied to a new claim shape
  (fan curve).
- `README.md`: fixed a real doc/code contradiction found while
  grooming - "How it works" claimed hand privacy holds at the data
  layer, which stopped being true when the hand became a real Pile in
  the shared zone pipeline (handPile.redactCard was never implemented).
  Corrected the claim, added the gap to Known Limitations explicitly
  rather than leaving stale documentation standing. Also refreshed the
  long-stale `lint:design` status line (70 -> 6 violations) and added 2
  small user-visible feature bullets (panel drag/resize, opponent
  scores) that had shipped with no README mention.
- `agents/CHAT.md`: was at 138 messages (well over the 50-100
  threshold), archived the top 103 (messages spanning Sprint 12 through
  Sprint 22 + the full D54 ad-hoc session) to
  `agents/chat_archive/CHAT_SPRINT_12_22.md`, regenerated
  `CHAT.diagram.md` via `bobp chat-diagram`.

`docs/DECISIONS.md` untouched - still correctly marked superseded by
ARCHITECTURE.md's per-sprint sections (resolved Sprint 14).

Current state: branch `touch-targets-and-pile-actions-sprint`, commit
`ab75f0a` (pushed to main), working tree has this groom's docs-only
diff uncommitted. `docs/ARCHITECTURE.md` is current through D54.

---
## Sprint 22 groom (2026-08-24)

Groomed: `docs/ARCHITECTURE.md` D53, `docs/USER_STORIES.md` US-56..59
(+ the pre-existing-flake backlog entry), `task.md` Phases 62-67,
`agents/oracle.docs/lessons.md` (4 new lessons), `agents/oracle.docs/
memory.md` (1 milestone row + an explicit gap-marker row for the
untracked D21-D52 span, rather than silently leaving the table looking
current through D20). `docs/DECISIONS.md` untouched - its own header
already marks it superseded by ARCHITECTURE.md's per-sprint sections
(resolved Sprint 14), so D53 doesn't need a mirrored entry there.

Current state: branch `touch-targets-and-pile-actions-sprint`, working
tree has Sprint 22's uncommitted diff (not yet committed - awaiting
Smith close-out + user sign-off), 288/288 unit tests green, e2e green
(2 clean runs). `docs/ARCHITECTURE.md` is current through D53.

## D56 groom (2026-08-26)

Groomed after Morpheus approved D56 (Pile/Zone real class hierarchy
rewrite) - Trin UAT and Morpheus review both already passed with
independent verification (mutation tests, LOC count) before this
groom, nothing to re-litigate.

- `agents/oracle.docs/lessons.md`: 2 new lessons - scoped-vs-blanket
  `git stash` for before/after isolation (a real mistake caught and
  redone mid-session, worth keeping so it isn't relearned), and
  checking an architecture doc's own premise against the actual code
  before implementing from it (the mixin-rejection finding).
- `agents/oracle.docs/memory.md`: repository-structure note updated
  (`src/piles/`/`src/zones/` file lists were stale, still naming the
  pre-D56 flat modules); 2 new Major Decisions rows added (D55 Sprint
  23 Zone-as-entity, D56 the class rewrite) - the table had a gap
  after D54 despite two real decisions having landed since.
- `docs/ARCHITECTURE.md`: D56 itself is already complete and correct
  as written (includes its own mid-implementation corrections -
  `HandPile.tableSide`, the mixin rejection - written in place rather
  than needing backfill here). No open-items-list change: D56 didn't
  resolve any of the pre-existing disclosed items (per-seat-anchor
  geometry, stale `e2e.smoke.mjs`, `handPile.redactCard` privacy gap)
  - it was a pure internal-structure refactor, confirmed zero
  behavior change via lint:design.
- `docs/DECISIONS.md`: untouched again, same standing reason as every
  groom since Sprint 14 (superseded by `ARCHITECTURE.md`'s per-sprint
  sections).
- **CHAT.md archived**: 77 messages (Sprint 23 Phase 68-71 close +
  D56's full cycle) - `bobp chat-report --moniker sprint23_D56`,
  archived to `agents/chat_archive/CHAT_sprint23_D56.md`/`.diagram.md`,
  CHAT.md reset.

Current state: branch `touch-targets-and-pile-actions-sprint`, working
tree carries Phase 68-71 + D56's full diff, all uncommitted (not yet
committed - matches this project's existing pattern of committing at
a user-directed point, not automatically). 341/341 unit tests green,
`lint:design` at its known pre-existing 5-violation baseline (not
introduced by this work, confirmed twice). `docs/ARCHITECTURE.md` is
current through D56.

### Next Steps
@Smith: `*user test` - end-to-end usability pass. D56 itself has no
new UI surface to test (pure internal refactor), so this is really
about Sprint 23's Phase 68-71 UI (split/take/hide/show buttons,
Zone-entity rendering) which hasn't had a Smith end-to-end pass since
Phase 70's live spot-check. Phase 72 (pile-title drag-drop) remains
unimplemented - not in scope for this test pass.

## Groom — Save Layout/Remove Zone+Pile/changePileType sprint (2026-08-27)

Sprint fully implemented (task.md 79-84, US-69..73, D61-D63) - groomed:
- `docs/USER_STORIES.md`: added "Sprint status: COMPLETE" summary
  under the US-69..73 section, same convention as every prior sprint's
  status line.
- `docs/ARCHITECTURE.md` already current (D61-D63 recorded live by
  Morpheus during Stage 1, not deferred to groom).
- `task.md` already current (Neo checked off every AC live per phase,
  including the two live-caught fixes).
- CHAT.md archived via `bobp chat-report --moniker
  save-layout-remove-changetype` -> `agents/chat_archive/
  CHAT_save-layout-remove-changetype.md`/`.diagram.md`, reset for the
  next sprint.

### Next Steps
@Smith: `*user test` - full end-to-end pass on this sprint's actual
delivered surface (Save/SaveAs/Reset Layout, Remove Zone, Remove Pile,
changePileType), from the user's perspective, HCI heuristics applied.
Neo already live-verified functionally via Playwright during
implementation (Phase 84) - Smith's pass should probe usability/
learnability specifically, not just re-confirm it runs.
