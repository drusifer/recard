
## Sprint: Gin strategy bench/tournament/evolution (2026-10-03)

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
