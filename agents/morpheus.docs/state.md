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

### Progress — v1.3 "top-down table redesign" (current sprint)
- [x] Wrote docs/ARCHITECTURE.md D17-D19: personal zones are ordinary
      zones with an optional `ownerId` (additive to D12, zero new
      authorization surface since "not deletable" already holds for
      every zone by omission - no `DELETE_ZONE` action exists), seating
      is a per-viewer client-side rotation with no new state/protocol
      (nothing found that currently treats roster order as visual order),
      live card-drag extends D13's existing motion channel with one new
      `kind` - proved the privacy rule (`cardId` included iff
      `faceUp===true` at drag-start) is provably sufficient given the
      existing MOVE_CARD authorization rule already guarantees no
      receiver could ever legitimately see a card the dragger can't.
      Removed the now-superseded "full pixel-sync dragging deferred" item
      from Open Items Carried Forward - this sprint delivers it
      (best-effort, as the user explicitly accepted).
- [x] Posted decision to Oracle for recording
- [x] Smith Gate 2 approval
- [x] Mouse phase plan (7 phases: 21-27) reviewed and approved: phase
      boundaries line up cleanly with D17 (21), D18+US-26 (22),
      D17-UI+US-30 (23), US-28 (24), D19 (25) - each phase touches
      exactly one decision's surface, no phase requires reaching ahead
      into a later decision. Approved.
- [x] Phase 21 code review: matches D17 exactly - `ownerId` is truly
      additive (every existing zone consumer that doesn't know about it
      just doesn't read it), `makeZone()` correctly deduplicates
      construction logic instead of the two call sites drifting apart,
      the re-join dedup check (`zones.some(z => z.ownerId ===
      playerId)`) is the right guard and mirrors the existing
      scores/passed "preserved not reset" pattern exactly. The 6 fixed
      pre-existing tests are a genuinely good catch - a positional
      `zones[N]` assumption silently pointing at the wrong zone once a
      new zone-creating action (JOIN) was added is exactly the kind of
      thing that erodes test-suite trust over time if left. Approved.

### Progress — v1.2 "zones, presence, hand tools" (shipped)
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

- [x] Phase 22 code review: matches D18 exactly - seating is purely
      derived presentation (`seatedOrder()`/`seatPosition()` are both
      pure functions, no state/protocol touched), `#host-roster` staying
      unrotated/unseated (pre-deal, no table yet) is the right scope
      boundary. The pointer-events bug Neo found is a good example of
      why "WHERE something is drawn" isn't zero-risk even when "WHAT it
      shows" stays the same (Smith's own framing) - only the e2e suite
      actually clicking through the new layer caught it. Approved.

- [x] Phase 23 code review: `renderZones`'s new `allZones` param
      (defaulting to `zones` for backward compat) is the right shape -
      every existing caller keeps working unchanged, only main.js's two
      new split calls need to pass it explicitly. The overlap bug Neo
      found and fixed properly (bounded/centered shared-zone footprint,
      not a band-aid) matters architecturally: it's the difference
      between a radius-based seat layout that actually holds up as more
      zones/cards accumulate versus one that only looks fine in a
      screenshot with minimal content. Hand fan choosing rotation+arc
      over horizontal overlap is the right tradeoff given Smith's 44px
      AC - overlap would have needed much more careful per-card z-index/
      hit-region math to stay compliant, rotation sidesteps the problem
      structurally. Approved.

- [x] Phase 24 code review: `dropCardOnZone`'s hand-vs-table branching in
      main.js is the right place for that decision - the UI layer
      (`onDropCard`) doesn't need to know or care which action results,
      keeping `ui.js` a pure rendering layer. Draggable-exactly-where-
      MOVE_CARD-already-authorizes is correct and matches the existing
      pattern (same condition `moveToControl` already used) rather than
      inventing a parallel authorization check that could drift out of
      sync with the reducer's real rule. Approved.
- [x] `seating.js` extraction (response to the user's TDD/test-pyramid
      feedback): good architectural move, not just a testing exercise -
      `seatPosition`/`seatedOrder` are genuinely pure and were previously
      unit-untestable only because of *where* they lived, not what they
      do. Matches `handOrder.js`'s established precedent exactly (D14).
      No behavior change, confirmed by Trin. Approved.

- [x] Phase 25 code review: this is D19 built exactly as designed -
      `cardDragPayload`'s privacy predicate is the same one-condition
      rule from the architecture doc, now proven correct by actual unit
      tests rather than just my own written-out proof. `resolveVisibleCard`
      correctly never trusts the wire for card identity - it re-derives
      from the receiver's own already-known view, meaning even a
      hypothetical malicious/buggy sender couldn't push a fabricated
      `cardId` into a receiver's rendering (defense in depth beyond just
      "sender chooses not to send it"). TTL-based cleanup reusing the
      exact cursor pattern (not a parallel new mechanism) keeps this
      consistent with D13/D4. Approved. **D19 - the last of Sprint 4's
      three architecture decisions - is now fully implemented,
      test-covered, and reviewed.**

- [x] Phase 26 code review (final implementation phase): the density fix
      is architecturally sound - a CSS custom property driven by player
      count is the right mechanism (no new state, purely presentational,
      consistent with D18's whole "seating is derived, not stored"
      principle). More importantly: approve NOT overclaiming the fix as
      complete. Honestly reporting "improved but not fully resolved,
      likely needs a compact-seat redesign" instead of quietly shipping
      a half-fix as "done" is exactly the right call here - a
      score-button 44px floor genuinely can't be squeezed further
      without either dropping functionality from the seat card or a
      real redesign, and that's not a decision to make unilaterally
      mid-phase. Approved. **All 6 implementation phases of Sprint 4
      ("top-down table redesign") are now code-reviewed and passed.**

## Next Steps
### Immediate Next Action
Sprint 4 implementation is done. Handing to Oracle to groom docs, then
Smith for the Stage-3 close-out test - which should specifically
re-verify the 5+ player mobile density finding via her own Gate 1
requirement, and decide whether it's a Phase 27 fix-now item or a
backlog item for a proper compact-seat redesign.

- [x] Phase 27 code review: CSS-only, zero JS/state/protocol touched.
      Reusing the `[draggable="true"]` attribute selector to scope the
      cursor rule is the right call - it's derived from the same
      authorization condition Phase 24 already computes, so there's no
      way for the cursor affordance and the actual drag permission to
      drift out of sync with each other over time (a second hand-rolled
      condition would risk exactly that). `:active` instead of a JS
      class toggle is simpler and can't get out of sync with the real
      drag state either. Approved. **Sprint 4 ("top-down table
      redesign") is now fully implemented, test-covered, and reviewed -
      6 implementation phases + 1 close-out fix.**

## Next Steps
### Immediate Next Action
Handed back to Smith to re-test and close uat-report-sprint4.md, then
Sprint 4 retro, then Cypher launch.

### Waiting On
@Smith: re-test + close-out.

### Planned Work
- [ ] Sprint 4 retro.
- [ ] Cypher launch.

---
*Last updated: 2026-08-15 22:48*
