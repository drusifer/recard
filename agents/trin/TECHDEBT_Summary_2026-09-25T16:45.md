# US-132 tech-debt findings (2026-09-25)

Tools: `bobp make dead-code` (knip), `bobp make test-audit`, eslint (already in check).

| Finding | Verdict |
|---|---|
| 18 exports used only inside their own file (`copyText`, `clearPileTargets`, `effectiveSpread`, `discardOptions`, `CARD_TYPES`, ...) | removed the `export` (knip --fix) |
| `src/zones/ScoreZone.js` - 20-line placeholder, wired nowhere (D56) | removed |
| `test_audit.md`, `test_audit_graph.html` tracked, though generated and "not committed" by their own header | untracked + gitignored |
| `tools/gin/strategies.mjs` per-strategy exports | keep: D148 retires them with the benchmark (knip ignore, reason in config) |
| `tools/codeConnectome/*`, `tools/gin/examples.mjs` | keep: `make connectome`, GIN_STRATEGY.md section 7 (declared as entries) |
| `peerjs` devDependency | keep: `buildStandalone` vendors it |
| test-audit "redundancy" (93k pairs) and "lowest unique value" units | NO deletions: pairs assert different behaviors (BREAK_CHIP value / ids / 5->1s ...); the audit's own methodology says overlap is not proof |
| skipped / todo / commented-out / assert-true tests | none exist |
| `src/ui.js` 2766 lines, 31.7% unit-covered | design call -> BACKLOG, not done |
