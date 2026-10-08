
## Sprint: Gin strategy bench/tournament/evolution (2026-10-03/04) — CLOSED 2026-10-06

**Superseded mid-sprint, kept below for the record (struck through in spirit, not
deleted — the plan-vs-actual gap is itself the lesson).** The original plan sketched
below (`fakeJudge.mjs`, a seeded heuristic judge, `tools/ginBench.mjs`) was replaced by
direct user correction before Phase 1 landed: "put two players in a game, have them play
through, then score the game play when they are finished" — the REAL harness/API end to
end, no fake judge, no simulator. What actually shipped: `games/gin/scoring.yaml` +
`tools/gin/{scoring,scoreMachine,scoreLibrary}.mjs` (Phase 1a), `tools/gin/match.mjs` +
CLI (Phase 1b, live-verified twice incl. real TypeSafe API), `tools/gin/tournament.mjs`
+ CLI (Phase 2), `tools/gin/evolve.mjs` + CLI (Phase 3, 10-generation hard cap). Full
build log: `agents/neo.docs/state.md`'s "Sprint: Gin bench/tournament/evolution" entries;
task-board record: `task.md`'s "Sprint: Gin strategy bench, tournament, and evolution"
(entered retroactively at close — this sprint ran without ever being planned in task.md,
see the gate-gap note there).

**Outcome vs. plan**: all 3 phases delivered, but through live play against a real table
and (where a Jev strategy was in the pairing) the real API, not seeded simulation — the
"reproduces bit-for-bit" / "seeded hands" framing below never applied once the real-API
correction landed. 3 real bugs/architecture gaps found and fixed live (process-spawn
name-registry gap, module-level mutable counter, orphaned child process on test
timeout) — see `agents/oracle.docs/lessons.md`'s dated section.

**Gate gap, disclosed at close, not silently absorbed**: this sprint did not run through
the normal Neo → Trin → Morpheus `*impl` chain the plan below describes — it was direct,
live-verified-by-Neo-himself work. No Trin or Morpheus review ever ran on it. Flagged in
`task.md` at close rather than back-filled as if it had happened.

---

### Original pre-sprint plan (2026-10-03), superseded — kept for the plan-vs-actual record

Phase 1 - Engine: `table.mjs` (two-sided in-memory table over the real
  reducer), `fakeJudge.mjs` (seeded heuristic judge), `playHand.mjs`
  (one full hand, seeded). Trin: unit tests + a mutation check (neuter
  a rule, confirm the outcome actually changes).
Phase 2 - Tournament: `tournament.mjs` (round robin, N seeded hands per
  pairing), leaderboard output (JSON + readable table). Trin: a known
  mismatch (e.g. knock-early vs a deliberately-crippled variant) shows
  up as a lopsided win rate, not noise.
Phase 3 - Evolution: `evolve.mjs` (mutate/recombine/select, capped
  generations, seeded), CLI entry (`tools/ginBench.mjs`, `bobp make
  gin-bench/gin-tournament/gin-evolve`), docs (`docs/GIN_STRATEGY.md`
  gets a bench/evolution section). Trin: a full seeded run reproduces
  bit-for-bit on a second run; the winning generation's reported
  params actually beat the original roster in a fresh tournament.

Each phase: Neo -> Trin -> Morpheus, same as every other `*impl` chain.
The costed Jev track (real TypeSafe evolution of jev-balanced/
jev-cagey) is explicitly NOT a phase here - gated on this sprint
proving the mechanism, per the user's own scoping.

---

## Sprint: SaveAs naming UI + Builder menu (US-148/149, D170/D171) — 2026-09-30 — CLOSED 2026-10-04

Fast-track (Tier 2) sprint, both stories small enough for a single combined
Cypher+Morpheus pass at scoping time. Shipped: `src/layoutSave.js`'s `performSaveLayoutAs`
(inline input replaces `window.prompt()`, reuses the `header-actions` rename idiom) and
`src/builderMenu.js` (Add Zone/Add Pile, UI entry point for the already-existing
`CREATE_ZONE`/`CREATE_PILE` reducer actions, D171 — found live with no UI path at all).
Full phase detail: `task.md`'s "SaveAs naming UI + Builder menu" entry.

Smith's sprint-close gate (2026-10-04): **APPROVED, no defects.** Live-ran both features
against the real app — not just the already-green `test-layoutsave`/`test-buildermenu`
suites — including AC4's specific requirement (Builder menu working from the
from-scratch `Blank` preset, not only as an addition to an existing preset). Full gate
notes: `agents/smith.docs/state.md`.
