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

### Blockers
None

### Oracle Consultations
N/A (this is Oracle's own task)

## Next Steps
### Immediate Next Action
Hand to Smith for Stage 3 Step 8 (`*user test` + `*user feedback`) on
Sprint 3's full feature set (zones, cursor/lift, deck visual, mini-hand,
hand sort/drag, Deal More, pass marker).

### Waiting On
Nothing — groom is done, handing off now.

### Planned Work
- [ ] If Smith finds bugs, expect a Trin triage round + Phase 20 before
      retro (same pattern as Sprints 1 and 2).
- [ ] Watch CHAT.md length again at Sprint 3's actual close (currently 66,
      still headroom before the 50-100 archive threshold).

---
*Last updated: 2026-08-15 21:20*
