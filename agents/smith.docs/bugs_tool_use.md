# Bugs / Defects — judge tool-use run, 2026-09-10

No code or script bugs found. All confirmed findings are process/habit
violations (tool-use anti-patterns), not defects in `src/`, `tests/`, or
project tooling. Per the judge skill's branching rule, this routes to
**Bob** (prompt/skill update), not Neo.

## Confirmed anti-patterns (session 9069c7ff)

1. **AP-MAKE-PIPE × 106** — `bobp make <target> 2>&1 | grep/tail/head ...`
   used throughout the entire session despite this exact rule being
   explicitly documented (with teeth) in `agents/neo.docs/SKILL.md` and
   `.claude/skills/make/SKILL.md`. Regression vs. the 2026-08-15 baseline
   (0 confirmed) and worse than the 39-instance finding that originally
   motivated writing the rule down. Sample call numbers: [032]-[034],
   [041], [065]-[066], [078], [096], [101], [106], [119], [125], [137]-
   [140], [169], [175], [178], [186]-[187], [191]-[193], [195], [204]-
   [206], [209], [211], [219], [221]-[222], [225], [227], [230], [233]-
   [234], [236]-[239], [242], and more (see `judge_tool_use_trace.md` for
   the manual-review writeup).
2. **AP-ONEOFF-VALIDATION × 5** (custom category, this run) — throwaway
   probes/mutation loops standing in for repeatable tests: calls [112],
   [120]-[122], [123]/[124]/[136], [148], [408]. Notably [408] repeats the
   exact pattern the user had already corrected once earlier in the same
   session (memory `feedback_no_oneoff_verification.md`, edited twice).
   The user's own escalation at call [207] (`@Bob *learn no one-off tests
   ... Institutionalize as a team-wide lesson, not just my own memory`)
   was never actually applied to any persona `SKILL.md` before this judge
   run — that gap is the actionable item.

## Overridden (false-positive) flags — no action needed

- AP-MAKE-BYPASS (34): all sampled hits are persona `state.md`/CHAT.md
  heredoc writes, not raw pytest/lint bypasses.
- AP-VIA-GREP (21): via is not enabled/used for this JS codebase; all
  hits are legitimate `grep` during architecture exploration.
- AP-RAW-VENV (14): no Python venv/pytest in this project; hits are
  `python3` heredoc source edits, not a test-runner bypass.
