# Agent State

## Current Task (2026-09-19)

Groomed the harness-MCP usability *fix: D136 amended in place (registration
path + agent-facing errors) - not a new D, same decision corrected; index
line unchanged. BACKLOG harness-MCP follow-ups += Smith's 4 player_query/
player_wait concerns from the live-tools spin. Removed 3 empty stray root
files (Drop-in/Fetch/Use, 0 bytes, created by a stray shell command). Left
the untracked root screenshot alone - user's file, flagged. Committed on
dev, fast-forwarded main to dev (not pushed).

## Earlier (2026-09-18)

Groomed US-119 / D136: DECISIONS D136 + index line, ARCHITECTURE
Testing Strategy + README point at `recard-harness` MCP, BACKLOG harness
MCP follow-ups, CHAT archived as SPRINT_HARNESS_MCP.

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

## Groom — docs backfill + CHAT archive (2026-09-01)

Triggered directly (`*ora groom docs and address backfill question`) -
not a sprint close, a standalone doc-health pass answering a question
Morpheus/Neo had flagged repeatedly this session: state files kept
claiming `docs/ARCHITECTURE.md` was "current through D95"/"D99" when it
was actually stuck at D91 since 2026-08-29 (a real, disclosed drift,
same class of gap `docs/DECISIONS.md` already has at D20).

- **`docs/ARCHITECTURE.md`**: backfilled D92-D99 (split/pickup guided
  picker; no-canonical-piles + rich Pile class hierarchy; `viewFor`
  polymorphic dispatch; universal count badges; universal-DnD guarantee
  test; Deck cardActions exception struck + HandPile split; MERGE_PILE
  added then simplified; hand-size default fix). Sourced from Neo/
  Morpheus/Trin's own state-file summaries this session, cross-checked
  against the actual CHAT.md decision-broadcast messages, not
  reconstructed from memory alone. Header stamp/status line updated
  (was still referencing the long-superseded v1.5/D21-D23 sprint
  framing).
- **`docs/DECISIONS.md`**: left untouched, same standing policy since
  Sprint 14 (superseded by `ARCHITECTURE.md`'s per-sprint sections) -
  did NOT try to backfill this one too; two separate decision logs
  drifting independently is worse than one current one.
- **`agents/oracle.docs/memory.md`**: Major Decisions table got a gap
  row (D58-D91, same convention as the existing D21-D52 gap row) and a
  fresh D92-D99 summary row. Repository Structure Memory's `task.md`
  note flagged stale (still says "current through Sprint 22") - NOT
  edited, that's Mouse's file per Oracle's own boundary rule.
- **CHAT.md archived** (rolling `*ora archive`, not `*ora report` - no
  sprint actually closed): 268 messages had accumulated, well past the
  50-100 threshold. 199 archived to `agents/chat_archive/
  CHAT-ARCHIVE-20260901.md` (verified message-count-conserving: 199 +
  69 kept = 268 exactly), one pointer summary added matching the
  existing convention, `CHAT.diagram.md` regenerated via `bobp
  chat-diagram`.

### Next Steps
Nothing in-flight. If `task.md` staleness matters before the next
sprint starts, that's Mouse's groom, not mine - flagged in
`memory.md`, not acted on here.

## Groom — D100 backfill (2026-09-01, same day)

Quick follow-up groom, triggered directly (`*ora update docs and push`):
backfilled D100 (the reconnect-identity `resolvePlayer` fix - see
Morpheus's own state.md note flagging it right after that *fix
shipped). Same treatment as the D92-D99 backfill earlier today:
`docs/ARCHITECTURE.md` gets the full decision writeup, header stamp
bumped to "D92-D100", `agents/oracle.docs/memory.md`'s table gets one
matching summary row. `docs/DECISIONS.md` untouched, same standing
policy. No CHAT.md archive needed this time (well under the threshold
after this morning's archive).

### Next Steps
Nothing in-flight.

## Groom — D101 card context menu (2026-09-02)

**Recorded same-session as the work, not batched at close** — the
decision-broadcast discipline held for this sprint with no drift.

What I wrote:
- `docs/ARCHITECTURE.md`: **D101** inserted at the top (above D100 —
  this file is newest-first after the Core invariant section, not
  appended at the bottom; worth remembering, it is easy to get wrong).
  Header stamp `**Last updated:**` moved to `2026-09-02 (D92-D101)`.
- `agents/oracle.docs/memory.md`: matching Major Decisions row.
- Deleted `agents/morpheus.docs/D101_card_context_menu_arch.md`, the
  interim scratch doc Morpheus wrote only because a chat post caps at
  512 chars. Its content is now in ARCHITECTURE.md verbatim; leaving
  both would have been exactly the duplicate-that-drifts problem this
  project keeps hitting. No precedent for per-decision scratch files
  living in `morpheus.docs/` — don't start one.

**Not done, deliberately:** no `*ora report` / CHAT.md archive this
sprint. CHAT.md is still well under the 50-100 message rolling
threshold after the D100-era archive.

### Documentation debt I flagged at retro — RESOLVED (tech-debt sprint 2, US-108, 2026-09-04)
The `e2e.smoke.mjs` groom happened: `designLint.mjs`/`designLint.check.mjs`
comments no longer imply it's a live suite, a stale duplicate
"substantially out of date" bullet was cut from ARCHITECTURE.md's Open
Items (superseded by D60's own accurate Testing Strategy entry), and
the user's stale cross-session memory note ("Recard status 2026-08-25")
was retired outright rather than patched, since the whole snapshot -
not just its e2e line - was obsolete. Dated historical entries
(state.md session logs, DECISIONS.md, lessons.md, chat_archive) were
correctly left alone.

`docs/DECISIONS.md` still stops at D20. Standing, deliberate gap since
Sprint 14 — `docs/ARCHITECTURE.md` is the binding spec, now through
**D101**.

### Queued sprint, not started
`Pileable` interface (Chips/Tokens/Cards), `PileableActions` base
extracted from `cardActions`, per-pile-type UX + sorting, universal DnD
unchanged, **no back-compat**. Nothing written — no stories, no arch.
When it lands it will almost certainly need the Core invariant section
of ARCHITECTURE.md reworded (it says "cards/table objects" in places
and "cards" in others), plus a D102. Next session starts at
`@Cypher *pm plan sprint`.

(The `Pileable` work queued directly above did land — see D107 onward.
This groom's own log resumes below; the gap between D101 and today
was tracked live in `docs/ARCHITECTURE.md`/CHAT.md per this file's own
established pattern, not backfilled here.)

## Groom — docs (2026-09-10)

Triggered directly (`*ora groom docs`), not a sprint close. Found and
fixed real drift, not just cosmetic staleness:

- **`docs/ARCHITECTURE.md` backfill, D117-D129.** Morpheus's own
  `state.md` had an explicit standing request: "D129 should be written
  up in docs/ARCHITECTURE.md (it is currently only in CHAT.md and the
  state files)." Wrote it up in full (Stack/Stackable domain model,
  Morpheus's two blocking review conditions, 3 wiring iterations,
  StackActions, tap/untap StackAction), sourced from CHAT.md's own
  decision-broadcast messages plus neo.docs/morpheus.docs `state.md` -
  cross-checked, not reconstructed from memory. Also backfilled D117
  (New Game) through D125 (LandsPile): 8 same-day drop-target/layout
  decisions that existed only as well-written `agents/neo.docs/*.md`
  scratch files and had never reached the canonical doc at all. D126-
  D128 left as an honest 3-number gap note (a few same-day nits with
  no individual write-up) rather than fabricated entries.
- **Found and fixed two REAL pre-existing defects while inserting
  this**, neither caused by past groom work but both silently wrong
  until now: (1) New Game had shipped labeled `D116`, colliding with
  GroupedPile's own (earlier) `D116` - renumbered the New Game entry
  to `D117` and swapped its position for newest-first order. (2) D111
  and D112 were swapped (D112 is the newer of the two but sat below
  D111) - reordered.
- **Wrote `tools/checkDecisionOrder.mjs` (`make check-decisions`)**
  specifically because I got the D117/D118 insertion order wrong BY
  HAND on my own first pass at this exact fix, mid-groom - proof a
  mechanical check was needed, not just care. It walks every
  `### D<N>` heading, flags real duplicates (allowing adjacent
  "(continued)"/"follow-up" same-number headings, a real convention),
  and reports where the file's legacy forward-chronological section
  (D1-D81, pre-dating the newest-first convention) begins rather than
  false-flagging it. Has its own test coverage
  (`tests/checkDecisionOrder.test.js`), wired into `make`/`.PHONY`.
- **`docs/USER_STORIES.md`**: backfilled US-116 (New Game) - the user
  story had a full, well-written scratch doc (`cypher.docs/`) that had
  NEVER reached the canonical doc, unlike its own architecture
  decision which had (mislabeled, per above).
- **Deleted 10 now-redundant scratch docs** once their content was
  confirmed merged: `morpheus.docs/D116-new-game.md`,
  `cypher.docs/US-116-new-game.md`, 8 `neo.docs/*.md` write-ups for
  D118-D125, and `neo.docs/stackable-handoff.md` (an early, ABANDONED
  StackableElement-as-Web-Component design, superseded by the
  Stackable-extends-Pileable domain-object direction that actually
  shipped - kept as history would have been actively misleading, not
  merely stale).
- **`agents/oracle.docs/memory.md`**: gap row for D102-D115, full rows
  for D117-D125 and D129, and fixed a real stale claim (test count
  said 358, actual is 790) plus a `src/`/`tools/` structure refresh
  (Stack/Stackable/GroupedPile/LandsPile, `tools/testAudit`/
  `codeConnectome`/`buildStandalone`/`buildDistribution`/
  `checkDecisionOrder` were all missing).
- **`README.md`**: added 3 real shipped features that had never
  gotten a bullet - the four-way drop-target vocabulary (stack/
  overlap/column/adjacent) with its live ghost preview, per-stack
  StackActions (tighten/loosen/flip/tap), and New Game.
- **Logged 5 items the user queued mid-groom** to CHAT.md for Neo,
  none started: New Game maybe not recreating per-player zones on one
  of its two paths; RtG stacks showing no StackActions gear; a hand
  stack not re-fannable after Flip; the deck/pile split panel reading
  too wide with many cards; folding pile actions into rows for the
  same reason.

**Verification:** `bobp make test` (790/790), `bobp make lint-js`
(10 errors, unchanged `ui.js` baseline - nothing new introduced),
`bobp make check-decisions` (clean).

**Not done:** `agents/DOCUMENTATION_INDEX.md` (generic bob-protocol
scaffolding, not project content) and `task.md` (Mouse's file, flagged
stale since 2026-09-01, still not this persona's to edit) both left
untouched, same boundary as every prior groom.

### Next Steps
Nothing blocking. If the 5 queued items above get triaged, that starts
at `@Neo *swe fix <item>`. `@Smith *user test D129` is still open
(noted in the ARCHITECTURE.md entry itself) - StackActions/tap-untap
have unit + one live browser test each but no end-to-end usability
pass yet.

---

## Groom: US-117 Infinity Table sprint close (2026-09-11)

`check-decisions` clean (131 headings, no duplicates, modern section
newest-first through D132). Archived `CHAT.md` (1372 lines, covering
both the prior session's tail - gear reposition, all-players-pile-
actions, bob-protocol On-Entry additions - and this whole US-117 arc)
to `agents/chat_archive/CHAT_US117_D132.md`/`.diagram.md`, reset for
the next sprint. No other doc reorganization needed - US-117/D130-132
are already written up in `docs/USER_STORIES.md`/`docs/ARCHITECTURE.md`
as the work happened, not deferred to groom time.

### Next Steps
@Smith *user test US-117 (end-to-end, sprint close). D129's own open
`*user test` item (StackActions/tap-untap usability pass) is still
outstanding from an earlier sprint - unrelated to this one, not
blocking it.

---

## `*ora refactor` — ARCHITECTURE.md split into present-state + full decision log (2026-09-17)

Direct user request: "Architecture.md has become a dumping ground of
what looks like decisions. It's very hard to tell what the actual
architecture is... turn whatever is happening right now in the
architecture file into what the present state looks like. Maybe move
those decisions into the decision file." Confirmed the diagnosis first:
`docs/ARCHITECTURE.md` was 6278 lines, almost entirely a chronological
`### D<n>.` decision log (D1-D132) with one real present-state section
(Core invariant) and a small, stale "Module Layout"/"Testing Strategy"/
"UI Conventions"/"Open Items" block near the end. `docs/DECISIONS.md`
(266 lines) was already explicitly self-declared stale/superseded,
stopping at D20 with a note saying ARCHITECTURE.md was canonical for
D21+ — so this was a one-way move, not a reconciliation of two
diverging histories.

**What changed:**
- **`docs/DECISIONS.md`** (266 -> 6147 lines): now holds the COMPLETE
  decision log, D1 through D132, moved verbatim (not summarized/
  reformatted) from ARCHITECTURE.md - same per-decision shape it
  already had there. New header explains the newest-first-then-legacy
  structure and points to the present-state docs for "how it works
  today."
- **`docs/ARCHITECTURE.md`** (6278 -> 185 lines): rewritten from
  scratch as present-state only - Overview, Core invariant (kept,
  D-refs updated), Networking/replication model (including local-only
  view state as its own category), Module Layout (refreshed against
  the actual current source tree, the old one was self-flagged stale),
  Testing Strategy (refreshed - the old one didn't know about
  test:tablezoom/test:focuszoom), Open backlog items.
- **NEW `docs/DOMAIN_MODEL.md`** (136 lines) and **`docs/UI_ARCHITECTURE.md`**
  (102 lines) - split out per the user's own follow-up guidance mid-task
  ("consider decomposing... if warranted"): the Pileable/Stackable/Pile/
  Stack/Zone hierarchy and the Web-Components/camera/focus-zoom/
  table-zoom subsystems were each substantial enough that burying them
  in one file would recreate the same problem. UI Conventions (44px
  floor, zone-overlap) folded into UI_ARCHITECTURE.md rather than its
  own file - too small to warrant a 4th doc.
- **Retargeted tooling**: `tools/checkDecisionOrder.mjs` (`make
  check-decisions`) now reads `docs/DECISIONS.md`, not ARCHITECTURE.md;
  `tests/checkDecisionOrder.test.js`'s real-file assertion updated to
  match; `Makefile`'s help text/comment for the target updated;
  `tests/designLint.check.mjs`'s own violation-report pointer message
  updated (UI Conventions -> UI_ARCHITECTURE.md, D24 -> DECISIONS.md).
- **Deliberately NOT touched**: historical cross-references in
  `agents/oracle.docs/memory.md`, `agents/chat_archive/*`, other state
  files, or source-code comments citing "docs/ARCHITECTURE.md D<n>" -
  those are frozen records of what was true when written, consistent
  with this project's "memory is frozen in time" convention. Only the
  two live docs plus the 3 pieces of tooling that actively point readers
  somewhere were updated.

**Verified:** `make check-decisions` clean (131 headings, no
duplicates, modern section newest-first) against the new DECISIONS.md.
851/851 unit tests unchanged. `lint-js`/`lint-style`/`lint-design`
baselines unchanged (8 pre-existing design-lint violations, confirmed
unrelated in an earlier session via `git stash` comparison - not
re-verified here since this is a docs-only change that cannot affect
layout).

### Next Steps
Nothing blocking. Not yet committed - this was a fork's own work,
running under the parent session; the parent session owns committing
it. If a future decision gets recorded, it goes in `docs/DECISIONS.md`
now, not `docs/ARCHITECTURE.md` - update `*ora record`'s own routing
instructions/muscle memory accordingly the next time this comes up.
