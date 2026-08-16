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

### Progress — v1.2 "zones, presence, hand tools" (current sprint)
- [x] Wrote docs/ARCHITECTURE.md D12-D16: zones generalize table (D12),
      cursor+lift-cue motion on the existing D4 channel (D13, no new
      transport), pure-client hand-order module (D14, pays down Sprint-1
      debt), DEAL_MORE (D15), pass marker reusing existing actor-auth
      with zero new code (D16)
- [x] Posted decision to Oracle
- [x] Smith Gate 2 (D12-D16 approved earlier in this sprint)
- [x] Phase 18 code review: sort/Deal More/pass-toggle all reuse existing
      D14/D15/D16 architecture with zero new protocol surface, exactly as
      designed (DEAL_MORE and TOGGLE_PASS were already in state.js from
      Phase 13 - Phase 18 is pure UI wiring, no reducer changes needed).
      dealMoreCountEl.hidden mirrors the established resetBtn/
      resetScoresBtn/dealMoreBtn host-only-visibility pattern - consistent,
      not a one-off. The e2e.smoke.mjs native-DnD fix stays inside the
      test file only, doesn't touch production code, and Neo's isolation
      evidence (same failure on unmodified turn-start code) is convincing
      that it's a headless-Chromium environment gap, not something Phase
      18 introduced. Approved.

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

- [x] Phase 19 code review (final implementation phase): the formal e2e
      additions are test-file-only, no production code changed beyond
      Phase 18's already-approved main.js work. Zone/DEAL_MORE/pass/sort/
      cursor coverage all reuse the star-topology host-authoritative
      pattern this whole architecture is built on - nothing here needed a
      new decision. Trin's DEAL_MORE mutation-test (temporarily
      reintroducing the wipe-hand bug to prove the assertion catches it)
      is exactly the kind of verification that should gate a phase like
      this. Approved. **All 8 implementation phases of Sprint 3 ("zones,
      presence, hand tools") are now code-reviewed and passed.**

- [x] Phase 20 code review: a UI-only fix, no state/protocol touched.
      Approve the specific choice made (drop the badge, keep the roster
      row's own text as the single source of truth) over the alternative
      (drop the row text, keep the badge) - the row text already had to
      handle the "you" case (no mini-hand renders for yourself), so
      keeping it as the one place a count is ever shown, for every
      viewer, is the more consistent rule; a badge-only approach would
      have left "your own" row with no visible count at all unless
      special-cased. Dead-CSS removal (`.mini-hand-count`) was verified
      grepped-first, not just deleted on assumption. Approved. **All 8
      implementation phases + the Phase 20 close-out fix for Sprint 3 are
      now code-reviewed and passed.**

## Next Steps
### Immediate Next Action
Handed back to Smith to re-test and close uat-report-sprint3.md, then
Sprint 3 retro, then Cypher launch.

### Waiting On
@Smith: re-test + close-out.

### Planned Work
- [ ] Sprint 3 retro.
- [ ] Cypher launch.

---
*Last updated: 2026-08-15 21:27*
