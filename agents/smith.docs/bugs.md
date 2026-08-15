# Cataloged Defects

## BUG-001 — `judge`/`bob-protocol` skill docs overstate `make judge-trace` as wired
**Found:** 2026-08-15, during `*judge tool and skill usage`.
**Severity:** Medium (process/docs, not app-breaking).

**Description:** `agents/skills/judge/SKILL.md` Step 1 and
`agents/trin.docs/SKILL.md` both call `bobp make judge-trace [DATE=...]`
a "**Required tool**" for judge runs, and describe it as wrapping
`agents/tools/trace_annotate.py`. In `recard`, this failed outright: no
Makefile exists in the project at all, and `agents/tools/trace_annotate.py`
/ `trace_rules.json` were never scaffolded in.

Checked 5 sibling bob-protocol projects (gsworks, GlobalHeadsOrTails,
InvestaCo, SubwayReader, fingerling) to see if this was recard-specific:
- All 5 *do* have `agents/tools/trace_annotate.py` (byte-identical
  `trace_rules.json` across all of them, confirming it's meant to be
  generic, reusable scaffolding).
- **None of the 5** have a `make judge-trace` target wired anywhere
  (`Makefile`, `Makefile.prj`, or `mkf.py` all searched, no match).
  `gsworks/agents/neo.docs/SKILL.md` even documents that the tool was
  "orphaned (missing dependency, no make target) until 2026-07-10" — and
  it's still invoked as `python agents/tools/trace_annotate.py` directly
  in that same project's own retrospective notes, not through `make`.

**Impact:** Every fresh bob-protocol project (and apparently several
existing ones) hits the same "No rule to make target 'judge-trace'"
failure the first time `*judge` is run, because the skill's own
instructions describe a wrapper that doesn't exist anywhere it was
checked. Trin has to rediscover the same workaround (copy the script in,
run it directly with `python3 agents/tools/trace_annotate.py`) from
scratch each time.

**Recommended fix (for Bob):**
1. Update `agents/skills/judge/SKILL.md` and `agents/trin.docs/SKILL.md`
   to either (a) describe the actual invocation
   (`python3 agents/tools/trace_annotate.py --date ... --format ...`,
   no `make` wrapper), or (b) actually add a `judge-trace` target to the
   project template's `Makefile`/`Makefile.prj` so the documented command
   is real. (b) is more in the spirit of "make targets are the standard
   automation surface" that the rest of the make/mkf skills enforce.
2. Whichever direction is chosen, make it part of `bobp setup-agent-links`
   (or the project scaffolding step) so `agents/tools/trace_annotate.py`
   + `trace_rules.json` (+ the Makefile target, if (b)) are seeded into
   every new project automatically instead of being copied in ad hoc by
   whichever persona first hits the gap.

**Status:** Open, routed to Bob.
