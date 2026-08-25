# Agent State

## Context
### Recent Decisions
- BUG-001 fix (2026-08-15): corrected `agents/skills/judge/SKILL.md`,
  `agents/trin.docs/SKILL.md`, and `agents/neo.docs/SKILL.md` — they all
  described `bobp make judge-trace`/`make judge-trace` as a wired
  Makefile wrapper around `agents/tools/trace_annotate.py`. Checked 6
  bob-protocol projects (recard + 5 siblings); none actually have that
  target. Replaced with the real invocation
  (`python3 agents/tools/trace_annotate.py [--date ...] [--format ...]`)
  and added an explicit "there is no make wrapper, don't go looking for
  one" note plus "copy the script in from a sibling project if it's
  missing" guidance, since the script itself is confirmed generic
  (byte-identical `trace_rules.json` across all 5 siblings checked).

### Key Findings
- Did not add a `judge-trace` Makefile target as an alternative fix —
  recard has no Makefile at all (it's an npm-scripts project), and
  none of the 5 sibling projects checked have wired one either despite
  some having Makefiles, so "fix the docs to match reality" was the
  right-sized fix here, not "invent new infrastructure to match stale
  docs." Left a note in the skill that a project *could* wire a real
  target if it wants to, without assuming it exists.

### Important Notes
None yet

## Current Task
**Status:** Complete
**Assigned to:** Bob
**Started:** 2026-08-15

### Task Description
`*judge tool and skill usage` loop, Step 4: fix BUG-001 (skill docs
overstating `make judge-trace` as a real wired command).

### Progress
- [x] agents/skills/judge/SKILL.md corrected (2 passages)
- [x] agents/trin.docs/SKILL.md corrected (2 passages)
- [x] agents/neo.docs/SKILL.md corrected (2 passages)
- [x] Verified no remaining stale `make judge-trace` references in any
      instructional file (only historical report/log files still
      mention it, correctly, as part of describing the bug itself)

### Blockers
None

### Oracle Consultations
None

## Next Steps
### Immediate Next Action
Hand to Trin to verify (Step 5): re-run the trace tool as documented now,
confirm the new wording is followed correctly, then either close the
judge loop (TES already 98 from Smith) or re-score if Smith wants a
fresh pass.

### Waiting On
Nothing.

### Planned Work
- [ ] None — this was a single-defect fix, not an open-ended task.

---
*Last updated: 2026-08-15 13:29*

## `*nit` loop added (2026-08-25)

### Context
User asked for a new skill via `/bob`: a targeted-fix loop, abbreviated
from `*fix`, so incremental adjustments still get logged to CHAT.md
instead of happening off-record in a single freeform turn.

### Decision
Added `*nit <thing>` to `agents/skills/bloop/SKILL.md` (the canonical
copy - `.claude/skills/bloop` is a symlink to it): `Neo → Trin`, no
Morpheus step. Neo's step is `*swe fix <thing>` (same as `*fix`);
Trin's is `*qa test <thing>` (targeted, not `*qa uat` - a full
acceptance-criteria pass would defeat the point of an abbreviated
loop). Reused Trin's EXISTING `*qa test` command rather than inventing
a new one - Trin's Command Interface already has `test`/`verify`/
`report`/`review`/`repro`, no gap to fill.

Updated `bob-protocol/SKILL.md`'s two loop-command lists (TLDR line,
"multi-step workflows" line) to include `*nit` alongside `*fix`/
`*impl`/`*qa`/`*review`/`*plan sprint`, so it's discoverable from
either entry point.

### Why 2-persona, not 3
`*fix` (Neo→Trin→Morpheus) was the closest existing loop, but the
user's framing - "incremental adjustments," run more than once in a
row - meant Morpheus's architecture-review step would slow down
exactly the iteration speed being asked for. Anti-loop protocol
(Oracle consult after 2 failed Neo attempts) still applies unchanged;
`*nit`'s own doc tells the user to fall back to `*fix` if Trin's
targeted check surfaces something bigger than the nit itself.

### Verified
Read `agents/skills/bloop/SKILL.md` after editing to confirm the new
section matches every other loop's format (chain diagram, step table,
escalation rules, example). Did not run `setup_agent_links.py` - no
new agent file was created, only an existing skill file edited, so
there's nothing to link.

## Next Steps
### Immediate Next Action
None - this was a single, complete skill addition. Watch for the
user's first real `*nit` invocation to confirm the loop reads
naturally in practice.

### Waiting On
Nothing.

---
*Last updated: 2026-08-25 (added *nit loop)*
