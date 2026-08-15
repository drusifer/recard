# TES — "tool and skill usage" — 2026-08-15

Source: `agents/trin.docs/judge_usage_trace.md` (real 288-call JSONL
trace) + CHAT.md/state.md protocol-adherence review.

## Scoring

Start: 100

**Correctness & Success:** 0 deductions. Every delivered scenario
(sprint gates, all 5 phases, bug-fix loop, retro, launch) reached its
goal; environment-discovery false starts (browser executable path,
`--project` flag semantics, etc.) each resolved with a working outcome
and aren't "the target failed," they're normal iterative engineering
against an unfamiliar sandbox/live external system (real PeerJS broker,
real WebRTC). Not penalizing honest trial-and-error as if it were a
correctness failure — that would punish the exact behavior (actually
verifying against reality) that made this sprint's e2e testing strong.

**Resource Waste:** -10
- **-5**: `node --test tests/` (directory form) run twice, back-to-back,
  with zero new information between the two calls (`pwd; ls` doesn't
  explain why a repeat would succeed). Genuinely redundant, not discovery.
- **-5**: the Playwright chromium-launch-executable-not-found problem was
  independently rediscovered and re-solved three separate times across
  three different scripts (`.e2e_check.mjs`, the first draft of
  `tests/e2e.smoke.mjs`, `.screenshots.mjs`) instead of the fallback
  pattern being established once and reused. The *first* discovery is
  legitimate debugging; the second and third are avoidable repetition of
  a now-known fix.
- Not deducting for: the `--project` flag mis-scoping on `trace_annotate.py`
  (one honest misread of a tool's own interface, self-corrected
  immediately, not a pattern of misuse), the EADDRINUSE/backgrounding
  friction (tool-mechanics learning cost, self-corrected by switching to
  `run_in_background`, not repeated after that), or the QR-library path
  guessing (reasonable exploration, quickly escalated to the GitHub API
  when the direct guess 404'd).

**Standard Project Automation:** -2. `AP-MAKE-PIPE` (Trin confirmed true
positive): piped `bobp make judge-trace | tail -60` instead of running it
unpiped — mild, single instance, and arguably moot since the target
didn't exist yet anyway, but the habit itself is the thing the rule
exists to catch.

**Protocol & Persona Adherence:** 0 deductions. Every persona switch this
entire sprint (Cypher→Smith→Morpheus→Smith→Mouse→Morpheus→[Neo→Trin→
Morpheus]×5→Oracle→Smith→retro→Cypher, plus this judge loop) had a
state.md write before the chat handoff. Verified against CHAT.md/state.md
sequencing, not just trusted.

**Efficiency/Design Bonus:** +10 (capped)
- Deterministic seeded-PRNG shuffle tests instead of mocking `Math.random`.
- The reliable-state / best-effort-motion message split (D4) cleanly
  resolved a real product-vs-architecture tension.
- Formalizing ad-hoc scratch scripts into a real, reusable
  `tests/e2e.smoke.mjs` with a self-contained `node:http` static server
  (no external `python3` dependency) once the pattern proved out.
- Real 2-browser-context Playwright verification against live WebRTC —
  upgraded the architecture's own stated testing strategy mid-sprint
  rather than accepting "not automatable" at face value.
- Resilient chromium-launch fallback chain in the *final* formalized
  script (the fix for the -5 above): try bundled → probe system paths —
  good once it existed, just took three tries to get written down once.

## Total: 100 − 10 − 2 + 10 = **98**

## Bugs/defects cataloged
See `agents/smith.docs/bugs.md` — one real defect found, not a scoring
deduction against this session's usage (the agent handled it correctly by
diagnosing and fixing it), but it needs a real fix upstream: the
`bob-protocol`/`judge` skill docs assert `make judge-trace` as a
"Required tool" that's actually wired via a Makefile target — checked six
projects total (recard + 5 siblings) and **none of them** have that
Makefile target. The skill's wording doesn't match reality anywhere.

## Decision
TES = 98 ≥ 90, but a real skill-documentation defect remains open (not
"no bugs/anti-patterns remain"). Routing to Bob to fix the skill docs
before closing the loop — this isn't a code bug (nothing to hand Neo),
it's a prompt/skill accuracy issue.
