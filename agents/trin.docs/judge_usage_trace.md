# Judge Run — "tool and skill usage" — 2026-08-15

## Environment gap found and fixed before this trace could even run
`bobp make judge-trace` does not exist in this project — there is no
Makefile at all, and `agents/tools/trace_annotate.py` /
`agents/tools/trace_rules.json` (the actual ground-truth tool) were never
scaffolded into `recard`. Confirmed this is missing project setup, not an
intentional gap: five sibling bob-protocol projects
(gsworks, GlobalHeadsOrTails, InvestaCo, SubwayReader, fingerling) all
carry these exact files, byte-identical `trace_rules.json` across all of
them, confirming it's generic/project-agnostic tooling meant to be part of
every project's scaffolding. Even `gsworks` notes in its own
`neo.docs/SKILL.md` that this tool was "orphaned (missing dependency, no
make target) until 2026-07-10" — this is a recurring setup gap across the
Bob Protocol project family, not unique to recard.

**Fix applied:** copied the newest version (2026-07-12, from gsworks/
fingerling) of `trace_annotate.py` + `trace_rules.json` into
`agents/tools/`. Ran it directly via `python3 agents/tools/trace_annotate.py
--date 2026-08-15 --format md` (there is still no `make judge-trace`
wrapper target — none of the sibling projects have one either, despite the
skill docs' wording; they all invoke the script directly too). This is the
real tool, not a CHAT.md reconstruction — flagging as a process gap for
Bob to address in `bob-protocol`/`judge` skill docs (the "Required tool —
`make judge-trace`" wording overstates what's actually wired anywhere).

## Trace results
288 tool calls, 1 session, **1 automated flag**:

| AP | Count | Manual verdict |
|---|---|---|
| `AP-MAKE-PIPE` | 1 | **Confirmed, true positive.** Call [274]: ran `bobp make judge-trace DATE=2026-08-15 2>&1 \| tail -60` in the same Bash invocation as a chat post. Should have run `bobp make judge-trace` unpiped and read the real output/error directly (which is what surfaced the "no rule to make target" failure anyway) instead of defensively piping to `tail`. Minor - one instance, self-caught by the same tool it violated using. |

No other rule fired: zero `AP-SKILL-RELOAD`, `AP-MAKE-BYPASS`,
`AP-RAW-VENV`, `AP-VIA-GREP`, `AP-VIA-READ`, `AP-DUP-READ` across 288 calls.

## Manual review beyond what the tool checks
- **`via` never used despite `PROJECT.md` declaring `via: enabled`.** Not
  counted as a violation: this session was ~entirely net-new file creation
  in a brand-new project (PRD through full app implementation) rather than
  navigating an *existing* indexed codebase — via's actual use case
  (symbol/relationship lookup in code that already exists) essentially
  never applied. The bash `grep`/`find` calls that did happen were for
  meta-investigation (checking sibling projects' judge tooling, Makefile
  targets) — not source-symbol lookups the AP-VIA-GREP rule targets, and
  correctly not flagged.
- **Iterative scratch-script debugging** (`.e2e_check.mjs`,
  `.screenshots.mjs`, both later deleted): ~7 edit+run cycles each while
  getting Playwright/WebRTC timing right against real external state (the
  public PeerJS broker). Judged as legitimate trial-and-error against a
  live system, not redundant tool calls — each edit changed a real
  assertion or fixed a real bug (wrong selector, missing `undefined` arg
  before Playwright's `options` param, static-server routing bug). Not a
  waste pattern; this is what debugging a genuinely new integration looks
  like.
- **2 exploratory `ToolSearch` calls for browser automation** (`chrome
  browser screenshot tab`, `claude-in-chrome browser navigate click`) came
  back empty before falling back to Playwright. Minor, reasonable
  exploration cost — not worth a deduction on its own but noted since it's
  the kind of thing a stronger tool-availability check up front could
  avoid next time.

## Step 5 verification (same live session, per the skill's own live-vs-completed guidance)
Re-ran `python3 agents/tools/trace_annotate.py --date 2026-08-15` after
Bob's doc fix: 318 calls now (grew, as expected mid-session), 2 flags.
Not chasing a fresh TES on the larger trace (per protocol) — checked
instead that (a) the original AP-MAKE-PIPE entry is still correctly
present/unchanged, and (b) nothing new and real crept in.

The 2nd flag (call [318]) is a **confirmed false positive**: it fired on
a Bash command whose `echo` message *contained the literal text* `"make
judge-trace"` (quoting the bug being fixed) with an unrelated `grep | grep`
pipe later in the same multi-line command — `MAKE_PIPE_RE` is a naive
text-search over the whole command string, not shell-aware, so it matched
"make" + eventually "|" without those being causally related. This is
exactly the kind of over-flag `agents/skills/judge/SKILL.md` already warns
about. Overriding this one — no code/habit change needed, it's an
artifact of writing about the bug in an echo string. Noted per-flag, not
dismissed blanket per protocol.

Doc fix confirmed clean: no instructional file (`judge/SKILL.md`,
`trin.docs/SKILL.md`, `neo.docs/SKILL.md`) still claims a `make
judge-trace` wrapper exists; only the corrective "there is no such
wrapper" notes remain, and `python3 agents/tools/trace_annotate.py` still
runs correctly standalone. Loop closed.

## Process/protocol adherence (from CHAT.md + state.md, not the trace tool)
Full bob-protocol sprint cycle observed end-to-end this session: init →
Cypher PRD/stories → Smith Gate 1 → Morpheus arch → Smith Gate 2 → Mouse
phase plan → Morpheus plan review → 5x (Neo → Trin → Morpheus) phase loop
→ Oracle groom → Smith close-out test (found + routed 3 real bugs through
Trin→Neo→Trin→Smith re-test) → full-team retro → Cypher launch. Every
persona switch had a state.md save + chat handoff before switching, per
protocol. No gate was skipped, no bug was fixed without a re-verify loop.
