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
