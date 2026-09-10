# Judge Run — "tool and skill use" — 2026-09-10

Custom rubric addendum for this run (direct user instruction): **-10 points per
confirmed one-off validation** (a throwaway probe/check standing in for a
repeatable test), in addition to the standard AP- deductions.

Target session: **9069c7ff-eed3-4aa8-916f-6d45698bd737** (729 calls, ended
2026-09-10 19:33 — the *bloop stackable sprint: domain-model impl → tray
rewrite → StackActions tap/untap → test-coverage audit tooling). Session
c2d6bc7c (the live judge session, 4 calls) is out of scope.

Trace generated via `python3 agents/tools/trace_annotate.py --date
2026-09-10 --format md` → `agents/trin.docs/judge_tool_trace.md` (baseline,
not regenerated for this report). 733 calls / 171 flags across both
sessions; 171 flags all belong to 9069c7ff.

## Automated flag review (manual verdict per type, not blanket)

| AP code | Count | Verdict | Reason |
|---|---|---|---|
| AP-MAKE-PIPE | 106 | **CONFIRMED, all** | Every sampled instance (`bobp make test 2>&1 \| grep ...`, `bobp make lint-js 2>&1 \| tail ...`) is a literal violation of the rule already written in `agents/neo.docs/SKILL.md` ("Make Rules" section) and `.claude/skills/make/SKILL.md`: pipe `bobp make` output instead of using `test-q` or tailing `build/build.out`. Not a rule-clarity problem — the rule is explicit and was in context all session. This is a session-long habitual drift: 106 in one session is worse than the 39 that triggered the original rule write-up on 2026-07-10. |
| AP-MAKE-BYPASS | 34 | **Overriding most; ~2 real** | The large majority of these fire on Bash calls that write to `agents/*.docs/state.md` or `agents/CHAT.md` via heredoc (calls like [042], [143], [151]) — the rule's regex apparently keys on "state.md"/persona-doc writes it treats as bypassing a make-driven docs target, but there is no such target and this is normal persona bookkeeping, not a test/lint bypass. Two calls ([132], [136] context) that also carry AP-MAKE-PIPE alongside real inline test-running are borderline double-flags of the same underlying pipe habit — not a second distinct violation. **Net confirmed AP-MAKE-BYPASS: 0** (all sampled hits were persona-doc writes, not raw pytest/lint calls). |
| AP-VIA-GREP | 21 | **Overriding all** | `via` is not enabled for this project's current workflow — every hit is a `grep -rn` symbol lookup in `src/*.js` during genuine architecture exploration (finding `Pileable`, `insertPileable`, `layout` usages while designing D129). No via MCP tool was ever available/used this session, and the project doesn't appear to have via wired for JS. Confirmed false-positive class, consistent with the 2026-08-15 prior judge finding that via essentially never applies outside an indexed, via-enabled codebase. |
| AP-RAW-VENV | 14 | **Overriding all** | This project has no Python venv/pytest — it's a Node/vanilla-JS project (`node --test`, `bobp make test`). Sampled hits are `python3 -c`/`python3 - <<'PY'` scripted find/replace edits against JS/CSS source files, not a bypass of a Python test runner. There is no make target for "apply this exact string replacement," so this isn't a real AP-RAW-VENV in the sense the rule was written for (bypassing `.venv/bin/pytest`). **However**, seeing this volume of scripted `python3` heredoc edits (dozens of calls) instead of the `Edit` tool is a real efficiency question — noted below as a separate, non-AP finding, not scored as AP-RAW-VENV.

## New category: AP-ONEOFF-VALIDATION (user's custom rule for this run)

Not one of the tool's built-in AP- codes — tagged manually per the user's request. Definition used: a Bash call that verifies behavior via a throwaway script, temporary debug hook, or improvised mutation-check loop, where the same verification could have been written once into `tests/` and re-run by any future session.

**Confirmed instances:**

1. **[112]** `node -e "import(...)..."` — manual REPL-style check of `stacksOf`/`ChipPile` stacking output instead of a `tests/` assertion.
2. **[120]–[122]** Throwaway `git worktree add` + `npm run lint:design` + `git worktree remove` — a one-off lint probe against a detached HEAD checkout, discarded immediately, to answer a question `bobp make lint-design` already answers in-tree.
3. **[123], [124], [136]** First hand-rolled mutation-check scaffold: `cp src/... $B/...` backup, inline sed/python mutation, re-run, restore from backup — a bespoke bash harness reinventing "does this test actually fail if the fix is reverted," done outside `tests/`.
4. **[148]** `process.env.SMITH_SHOT`-gated screenshot hook spliced into test/browser code as a temporary debug aid, later removed — a probe embedded in source rather than a real fixture.
5. **[408]** Second occurrence of the same mutation-check scaffold ("4 mutations, 4 killed" posted to chat, backed by nothing left in `tests/`) — **this is a repeat after the user had already corrected the exact same pattern once in this same session** (see below).

**Self-correction already visible in-session:** the user caught this live and said so twice — once mid-session, once again after point 5 above ("still doing one offs 😔"). In response, a memory was written: `~/.claude/projects/-home-drusifer-Projects-recard/memory/feedback_no_oneoff_verification.md` (created after incident 4, then edited again after incident 5 at call [411]). Call [207] also shows the user explicitly escalating this to a **team-wide** lesson request: `@Bob *learn no one-off tests - use the automation test pyramid. Institutionalize as a team-wide lesson, not just my own memory.` — this request was queued in chat but never actually landed in any persona `SKILL.md`. That gap is this run's main actionable finding for Bob (see below).

**Not counted as one-off validation** (legitimate, kept distinct):
- `node --test tests/*.js` runs (running real, already-written test files — this is exactly the correct workflow).
- `[451]` `node -e "console.log(require(...istanbuljs/schema/default-exclude.js))"` — research into a library's default config while wiring `tools/testAudit/collectCoverage.mjs`, not a behavior-verification probe.
- `[530]` `node -e` launching Playwright to render a documentation screenshot (`connectome_dark.png`/`connectome_light.png`) for the coverage-audit deliverable — output is a kept artifact, not a discarded check.

## Secondary observation (not separately scored)

Dozens of `python3 - <<'PY' ... s.replace(...) ...` heredoc calls were used for source edits where the `Edit` tool would have been simpler, cheaper, and less error-prone (no need to hand-escape the exact old string into a shell heredoc). Worth a note to Neo's persona doc but not one of the scored categories here.

## Comparison to prior judge baseline (2026-08-15)

Prior run: 288 calls, 1 real flag (one AP-MAKE-PIPE-shaped false positive, correctly overridden), TES effectively ~100. This run: 729 calls, ~106 confirmed real AP-MAKE-PIPE violations and 5 confirmed one-off-validation incidents. This is a sharp regression in make-output-piping discipline specifically, despite that exact rule already carrying "real teeth" documentation in `neo.docs/SKILL.md` from the prior finding. Handing to Smith for scoring.
