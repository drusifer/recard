# Agent State

## Context
### Recent Decisions
- Recard v1 architecture locked in `docs/ARCHITECTURE.md`: static site (no
  backend/build), PeerJS + its public signaling broker for P2P connection
  setup, star topology (host = authoritative hub, others connect only to
  host), two message classes on the data channel (reliable "state"
  messages are the only source of truth; best-effort "motion" messages are
  purely cosmetic, throttled + latest-wins coalesced, and never carry info
  not already implied by the last state message). Resolves both of
  Cypher's PRD feasibility flags.
- Module layout decided: deck.js/state.js (pure, unit-testable),
  session.js/protocol.js (PeerJS wiring), ui.js, qrcode.js, main.js.
  Testing via Node's built-in `node --test` (node 24 available, no
  framework dependency).

### Key Findings
- Full-mesh P2P was considered and rejected for v1 — star topology (host
  as hub) is far simpler and still satisfies "P2P, no server infra" since
  the host is just another player's browser, not infrastructure we run.
- Two-tab localhost testing works for WebRTC (loopback), so Smith/Trin can
  manually verify the P2P flow via `python3 -m http.server` without any
  real network.

### Important Notes
- Revisit trigger documented: if PeerJS's public broker (0.peerjs.com)
  becomes unreliable, swap to self-hosted `peerjs-server` — isolated to
  one decision (D2), not a rearchitecture.
- v1 explicitly has no reconnect-after-refresh and no persistence (host
  tab closing ends the session) — documented, not hidden.
- v1.1 (D7-D11, 2026-08-15): resolved Flag 3 by generalizing the existing
  hand-privacy pattern (D3) to middle cards instead of inventing a new
  mechanism — `viewFor()` gets one redaction rule (`faceUp || owner ===
  viewer`) that produces all 4 visibility cases the PRD asked for. 3 new
  reducer actions (PLAY+visibility, REVEAL, PICKUP). Presets/rules-
  reference need zero state/protocol changes (pure client-side lookup
  tables) — kept them out of state.js on purpose, no reason to sync data
  that's identical on every client and never changes at runtime. Solo
  play (US-17) needs no code change at all, confirmed by Cypher's own
  grep before this was even handed to me — just needs a test.

## Current Task
**Status:** Architecture complete, awaiting Smith Gate 2
**Assigned to:** Morpheus
**Started:** 2026-08-15

### Task Description
Design and record v1 architecture for the Recard sprint, then pass through
Gate 2 (Smith UX review) before Mouse does phase breakdown.

### Progress — v1 (DONE, shipped)
- [x] Wrote docs/ARCHITECTURE.md (D1-D6), Gate 2, Mouse phases, all 5
      phases implemented/reviewed, launched.

### Progress — v1.1 "clear backlog" — DONE (all 6 phases shipped)
- [x] Wrote docs/ARCHITECTURE.md D7-D11 (Flag 3 resolution, new reducer
      actions, score model, presets/rules-reference module layout, solo
      play confirmation)
- [x] Posted decision to Oracle for recording
- [x] Smith Gate 2 approval
- [x] Mouse phase breakdown (6 phases: 6-11), reviewed and approved
- [x] Code-reviewed and approved all 6 phases (middle-zone data model,
      score tracking, solo regression + static content, middle-zone UI,
      score/preset/rules UI, final e2e verification)

### Blockers
None

### Oracle Consultations
Posted `*lead decide` with architecture summary; awaiting Oracle's archive
confirmation (non-blocking, Gate 2 can proceed in parallel).

## Next Steps
### Immediate Next Action
Wait for Smith's Gate 2 review/approve. If approved, hand to Mouse for
phase breakdown (`*sm plan sprint`), then review Mouse's phase plan before
kicking off Neo on Phase 1.

### Waiting On
Nothing — Sprint 2 implementation complete, handed to Oracle for groom.

### Planned Work
- [ ] Available if Smith's sprint-close testing surfaces anything needing
      an architecture-level look.

---
*Last updated: 2026-08-15 12:42*
