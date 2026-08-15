# Agent State

## Context
### Recent Decisions
- `node --test tests/` (directory form) fails to discover files in this
  environment ("Cannot find module '.../tests'") even with
  `"type": "module"` in package.json — use the glob form
  `node --test tests/*.test.js` instead. `npm test` wraps that.
- No test framework dependency needed — Node 24's built-in `node:test` +
  `node:assert/strict` is sufficient for pure-logic unit tests.

### Key Findings
- deck.js is fully pure (no DOM/network), so it was safe to TDD tightly:
  wrote tests/deck.test.js first (7 cases: build counts/ids, jokers +
  multi-deck scaling, rank/suit validity, shuffle immutability + same
  multiset + reordering, shuffle determinism under seeded rng, round-robin
  deal + remainder, deal overflow throws), then implemented src/deck.js
  to satisfy them. All 7 pass.

### Important Notes
- `deal()` uses round-robin dealing (one card to each player per round) to
  mirror how a physical deal actually looks/feels, not chunked slicing.

## Current Task
**Status:** Phase 1 complete, starting Phase 2
**Assigned to:** Neo
**Started:** 2026-08-15

### Task Description
Phase Bloop for Recard sprint 1 — implementing task.md phases in order.

### Progress
- [x] Phase 1 (T1.1, T1.2): src/deck.js + tests/deck.test.js — 7/7 passing
- [x] Trin UAT phase 1 PASS, Morpheus review PASS
- [x] Phase 2 (T2.1, T2.2): src/state.js authoritative reducer + view
      redaction + tests/state.test.js — 17/17 passing (full suite)
- [x] Trin UAT phase 2 PASS, Morpheus review PASS
- [x] Phase 3 (T3.1, T3.2): src/protocol.js (tested, 22/22 full suite) +
      src/session.js (PeerJS host/join, roster, session-ended on host
      loss). Trin UAT conditional-pass, Morpheus review found+fixed a
      real bug (record.connection field collision - see phase-3 review).
- [x] Phase 4 (T4.1-T4.3): src/ui.js, src/qrcode.js (QR image descoped to
      v1.1, replaced with join-code + Copy Link), src/main.js,
      index.html, style.css. Wrote tests/e2e.smoke.mjs (Playwright, real
      Chromium x2 + real PeerJS broker/WebRTC) covering the full host/
      join/deal/play/draw/disconnect loop end-to-end - genuinely verified
      working, not just reviewed. Found+fixed a real main.js bug along
      the way (guest's own peer id was never captured, so a guest's own
      hand count showed as 0 in their roster view - fixed by having
      Session.join resolve with the guest's own peer id).
- [x] Trin UAT phase 4 PASS, Morpheus review PASS
- [x] Phase 5 (T5.1-T5.3): US-11 motion sync wired end-to-end (throttler +
      host relay + roster indicator + TTL auto-clear), Reset button
      (US-9), deck-config display (US-3), README.md. Extended
      tests/e2e.smoke.mjs with a real drag gesture - motion cue verified
      propagating live and clearing on drag-end, 3/3 stable runs.
      npm test (22/22) + npm run test:e2e both green.
- [ ] Trin UAT phase 5 (final phase)

### Sprint status: all 5 phases implemented, e2e-verified, groomed by
Oracle. Smith's sprint-close *user test* found 3 real bugs (see
agents/smith.docs/uat-report-sprint1.md) - all fixed:
- #1 (HIGH): session.js now uses a 6-char human-readable join code
  (generateShortCode()) instead of the raw PeerJS UUID, with a graceful
  error+retry path on the rare collision case (peer 'error' now wired
  into Session.host's ready() rejection, which wasn't handled before).
- #2 (MED): host-setup form now hides after table creation
  (`#host-form.hidden = true`), no more false affordance.
- #3 (HIGH): session-ended now disables Draw + hand cards and forces the
  roster to show 'disconnected' for everyone, instead of contradicting
  the banner. New `sessionEnded` flag guards all action dispatch paths
  (playCard, drawBtn, motion interval).
All 3 verified via updated tests/e2e.smoke.mjs (new assertions for
disabled controls + roster state) + visual screenshot re-check. npm test
22/22, npm run test:e2e green, 3/3 stable runs.

### Blockers
None

### Oracle Consultations
None yet

## Next Steps — Sprint 2 ("clear backlog", v1.1)
### Progress
- [x] Phase 6 (T6.1-T6.3): src/state.js middle-zone model — PLAY now
      takes `visibility` (public/shared-facedown/private-facedown)
      computing owner/faceUp per D7; new REVEAL action (authorization:
      shared→anyone, private→owner-only, no-op if already face-up); new
      PICKUP action (face-up only, strips owner/faceUp when moving to
      hand); viewFor() redaction extended to table entries (same rule as
      hands: faceUp || owner===viewer, owner stays visible even redacted).
      9 new tests (30/30 total passing), npm run test:e2e still green -
      confirmed zero regression to existing public-PLAY callers.

- [x] Trin UAT phase 6 PASS, Morpheus review PASS
- [x] Phase 7 (T7.1-T7.2): src/state.js scores — init to 0 on JOIN
      (preserved on re-join, not reset), ADJUST_SCORE ±1 only (throws on
      other deltas), RESET_SCORES, confirmed RESET (deck reshuffle)
      leaves scores untouched (spread-through, no explicit code needed
      since scores was never in RESET's returned diff). 7 new tests,
      37/37 total, npm run test:e2e still green.

- [x] Trin UAT phase 7 PASS, Morpheus review PASS
- [x] Phase 8 (T8.1-T8.3): solo-play regression test (deal/play/draw/
      score/reset, single player, no code changes needed - confirms D11),
      src/presets.js (5 presets: War/Gin Rummy/Hearts/5-Card Draw/Hold'em,
      usesMiddle flag), src/rulesReference.js (matching consistent-shape
      entries). New tests/presets.test.js cross-checks every preset has a
      matching, well-shaped reference entry (not just eyeballed). 41/41
      total, e2e still green.

- [x] Trin UAT phase 8 PASS, Morpheus review PASS
- [x] Phase 9 (T9.1-T9.3): middle-zone UI. Hand cards: primary tap =
      public play (unchanged v1 behavior), two small secondary buttons
      per card for shared/private face-down. Middle cards: card-back +
      owner tag for redacted entries, "Turn over" (no confirm, shared
      only) / "Reveal" (window.confirm gate, private-owner only) /
      "Pick up" (any face-up card) as appropriate. Session-ended now
      also freezes the table, not just hand/draw. **Did an ad-hoc real
      2-browser Playwright check before calling this done** (not the
      formal suite yet, that's Phase 11) - confirmed live over real
      WebRTC: correct per-viewer rendering of all 3 visibility states,
      live cross-client reveal propagation, correct owner tags both
      sides, zero console errors. One cosmetic-only note for Smith: the
      🂠/🔒 button icons render as generic glyphs in this headless
      Chromium's font set (likely missing color-emoji font in the
      sandbox, not a code bug - real devices ship emoji fonts).

- [x] Trin UAT phase 9 PASS (incl. independent confirm-cancel test I
      hadn't covered), Morpheus review PASS
- [x] Phase 10 (T10.1-T10.3): score +/- buttons in roster (host-only
      Reset Scores button), preset selector (fills decks/jokers
      immediately + text preview, applies cards-per-player once that
      field exists post-creation), rules-reference overlay (independent
      toggle, not a showScreen swap - verified by test that closing it
      leaves game state untouched). Visually verified live: preset
      preview, score increment, overlay state-preservation all correct.

- [x] Trin UAT phase 10 PASS (incl. independent 2-client cross-
      propagation check), Morpheus review PASS
- [x] Phase 11 (final): folded all ad-hoc middle-zone/score checks into
      the real tests/e2e.smoke.mjs suite - shared-facedown play+reveal
      (by the OTHER client), private-facedown play+confirm-cancel+
      confirm-accept, pickup, guest-adjusts-host-score cross-propagation,
      Reset Scores cross-propagation. Hit 2 test-logic bugs while writing
      it (wrong pickup-btn counts, not accounting for the already-public
      card from earlier in the flow) - fixed, not implementation bugs.
      41/41 unit + e2e 3/3 stable runs, zero v1 regressions.

### Sprint 2 status: ALL 6 PHASES COMPLETE + Smith sprint-close bug round.
Smith's `*user test` found 2 real bugs (agents/smith.docs/uat-report-
sprint2.md) - both fixed:
- #1 (HIGH): `.fd-btn`/`.score-btn` measured ~25x20px / ~19x17px on a
  real 390px mobile viewport, well under the ~44px touch-target floor -
  bumped both to 44px, and applied the same fix to `.reveal-btn`/
  `.pickup-btn` too even though Smith only measured the first two (same
  root cause, same small-button pattern - fixing one and leaving an
  identical sibling unfixed would've been its own consistency bug).
  Re-measured: all four now hit 44px+ for real.
- #2 (MED): Reset Scores now confirm-gated (`window.confirm()`), matching
  the precedent already set by private-card reveal.
Updated tests/e2e.smoke.mjs's Reset Scores step to handle the new confirm
dialog. 41/41 unit + e2e all green, re-verified visually (denser hand
layout from bigger buttons is a real but acceptable tradeoff - still
fully usable, just wraps to more rows).

### Immediate Next Action
Handing to Trin for Phase 11 (final) UAT.

### Waiting On
@Trin: UAT sign-off on Phase 11.

### Planned Work
- [ ] Phase 10: score buttons + preset selector + rules-reference overlay UI
- [ ] Phase 11: e2e verification + full regression

---
*Last updated: 2026-08-15 12:44*
