# Task Board — Recard

## Sprint 1 ("v1 playable deck") — SHIPPED 2026-08-15

Maintained by Mouse. Single source of truth for sprint task status.
Architecture: `docs/ARCHITECTURE.md`. Stories: `docs/USER_STORIES.md`.

## Phase 1 — Deck engine ✅ DONE
- [x] T1.1 `src/deck.js`: Card + Deck model, build/shuffle/deal (pure, no DOM/network)
- [x] T1.2 `tests/deck.test.js`: node:test coverage for build/shuffle/deal edge cases
Covers: US-3 (deck config), US-4 (shuffle/deal) logic only.

## Phase 2 — Authoritative state engine ✅ DONE
- [x] T2.1 `src/state.js`: host-side state model + reducer for actions
      (deal, play, draw, reset, roster) — per-connection view (only the
      owning player's hand contents ever leave the reducer for that player)
- [x] T2.2 `tests/state.test.js`: reducer unit tests, incl. privacy
      invariant (hand never appears in another player's view)
Covers: US-4, US-5, US-6, US-7, US-8, US-9 logic only.

## Phase 3 — P2P session wiring ✅ DONE
- [x] T3.1 `src/session.js`: PeerJS host/join, connection roster w/
      connecting/connected/disconnected states, host-disconnect ⇒
      explicit "session ended" signal (Smith Gate 2 condition)
- [x] T3.2 `src/protocol.js`: message envelope (state vs. motion), motion
      throttle + latest-wins coalescing
Covers: US-1, US-2, D2-D6.

## Phase 4 — UI + wiring ✅ DONE (verified via real e2e browser test)
- [x] T4.1 `src/ui.js`: render hand/table/roster/connection status/host-
      disconnected banner
- [x] T4.2 `src/qrcode.js`: join-code/link share helper (QR image descoped
      to v1.1, see CHAT.md 2026-08-15 Neo→Cypher; renders large code +
      Copy Link instead)
- [x] T4.3 `src/main.js` + `index.html` + `style.css`: host screen, join
      screen, game screen; wires session + state + ui together
- [x] `tests/e2e.smoke.mjs`: real 2-browser-context Playwright test over
      the actual PeerJS broker/WebRTC — host+join+deal+play+draw+host-
      disconnect all verified live, not just code-reviewed (`npm run test:e2e`)
Covers: US-1, US-2, US-3, US-6, US-7, US-8, US-10.

## Phase 5 — Motion sync + polish ✅ DONE (e2e-verified)
- [x] T5.1 Wired US-11 live motion (hand drag) through protocol.js
      throttler + session relay (host relays guest<->guest in star
      topology) + ui.js roster indicator ("✋ organizing hand"), with a
      2s TTL auto-clear if the end-event is dropped (genuinely
      best-effort). Verified live in tests/e2e.smoke.mjs via a real
      mouse-drag gesture in Chromium: cue appears on the other client and
      clears on drag end.
- [x] T5.2 Reset/reshuffle control (US-9, host-only button) + deck-config
      display (US-3, shown on host screen before players join)
- [x] T5.3 README.md: what this is, how to run/test, known v1 limitations
Covers: US-9, US-11, README.

### Sprint 1 status
Phase 1-5: DONE — all phases complete, shipped.

---

## Sprint 2 ("clear backlog" — v1.1) — IN PROGRESS

Covers US-12..18. Architecture: `docs/ARCHITECTURE.md` D7-D11.

### Phase 6 — Middle-zone data model ✅ DONE
- [x] T6.1 `src/state.js`: extend table entries to `{...Card, owner,
      faceUp}`; `PLAY` takes a `visibility` param
      (`public`/`shared-facedown`/`private-facedown`) computing owner/
      faceUp per D7; new `REVEAL {playerId, cardId}` action with
      authorization (shared → anyone, private → owner only, per Smith
      Gate 1); new `PICKUP {playerId, cardId}` action (face-up only)
- [x] T6.2 `src/state.js`: `viewFor()` redaction rule for middle cards —
      `faceUp || owner === viewer` (D7); redacted entries still expose
      `owner` (visible-but-anonymous, per Smith's ownership-visibility
      UX requirement)
- [x] T6.3 `tests/state.test.js`: full coverage — redaction (all 4
      visibility cases), REVEAL authorization (accept/reject paths),
      PICKUP (face-up only), regression that plain PLAY still defaults
      to public (no behavior change for existing US-6 callers). 30/30
      passing (9 new tests), npm run test:e2e still green (no regression).
Covers: US-12, US-13, US-14 (data layer).

### Phase 7 — Score tracking ✅ DONE
- [x] T7.1 `src/state.js`: `scores: {playerId: number}` init to 0 on
      `JOIN` (preserved across re-join); `ADJUST_SCORE {targetPlayerId,
      delta}` (delta ±1 only, per Smith's "just +/- buttons" AC);
      `RESET_SCORES`; confirmed `RESET` (US-9) does not touch `scores`
- [x] T7.2 `tests/state.test.js`: score init/adjust/reset-scores coverage
      + regression that `RESET` (deck reshuffle) leaves scores untouched.
      7 new tests (37/37 total), npm run test:e2e still green.
Covers: US-16 (data layer).

### Phase 8 — Solo regression + static content modules ✅ DONE
- [x] T8.1 `tests/state.test.js`: dedicated 1-player full-round test
      (deal/play/draw/score/reset with a single joined player) —
      regression guarantee for US-17, no new implementation needed (D11)
- [x] T8.2 `src/presets.js`: static preset list (War, Gin Rummy, Hearts,
      Poker 5-Card Draw, Texas Hold'em) with `usesMiddle` flag
- [x] T8.3 `src/rulesReference.js`: static per-game rules content, one
      consistent shape (goal/setup/turns) per Smith's Gate 1 AC. Added
      `tests/presets.test.js` (new file) verifying every preset has a
      matching, consistently-shaped reference entry — not just eyeballed.
      41/41 total tests passing, e2e still green.
Covers: US-17, US-15 + US-18 (data layer).

### Phase 9 — Middle-zone UI ✅ DONE (visually verified live, real WebRTC)
- [x] T9.1 `src/ui.js`: render middle cards (face-down placeholder with
      owner marker vs. full card), visibility-choice UI on play — main
      card tap = public (unchanged, one tap), two small secondary
      buttons per hand card for shared/private face-down (Smith Gate 1
      AC — common path unchanged, rare path costs one extra tap on a
      different, smaller button rather than a multi-step menu)
- [x] T9.2 `src/ui.js`: reveal action — `window.confirm()` gate for
      private-card reveal, single-tap "Turn over" for shared (Smith Gate
      1 AC); "Pick up" action on any face-up middle card
- [x] T9.3 `src/main.js`: wired REVEAL/PICKUP through both dispatch paths
      (host-local `dispatch()`, guest `session.send()`), extended PLAY
      call sites to carry `visibility`; session-ended now also freezes
      the table (not just hand/draw) so no reveal/pickup button looks
      live post-disconnect (same discipline as Sprint 1's Gate-close fix)
- Ad-hoc 2-browser Playwright check (not yet folded into the formal
  suite — that's Phase 11): public/shared/private all render correctly
  per-viewer, reveal live-propagates cross-client in real time, owner
  tags show correctly on both sides. Zero console/page errors besides
  the expected favicon 404.
Covers: US-12, US-13, US-14 (UI layer).

### Phase 10 — Score + presets + rules-reference UI ✅ DONE (visually verified)
- [x] T10.1 `src/ui.js` + `src/main.js`: score +/- buttons per player in
      the roster, wired to `ADJUST_SCORE`; host-only "Reset Scores" button
- [x] T10.2 `index.html` + `src/main.js`: preset selector on host-setup
      screen sourced from `presets.js`; selecting one fills decks/jokers
      immediately and shows a text preview (Smith Gate 1 AC), applies
      cards-per-player once the (post-creation) field exists
- [x] T10.3 `src/ui.js` + `index.html`: rules-reference overlay — a fixed
      full-screen div toggled independently of `showScreen()`, confirmed
      by test that closing it leaves the game screen and hand exactly as
      they were (Smith's "must not lose table state" requirement)
- Visual check: preset preview text, score increment, and rules-overlay
  state-preservation all confirmed live in a real browser.
Covers: US-15, US-16 (UI layer), US-18.

### Phase 11 — e2e verification (final) ✅ DONE — SPRINT 2 COMPLETE
- [x] T11.1 `tests/e2e.smoke.mjs`: extended with the full middle-zone
      flow — public play (existing), shared-facedown play + reveal by
      the OTHER client (propagates live), private-facedown play +
      confirm-cancel (stays hidden) + confirm-accept (reveals,
      propagates live), pickup into hand
- [x] T11.2 `tests/e2e.smoke.mjs`: score — a GUEST adjusting the HOST's
      own score propagates to both clients, Reset Scores propagates to
      both. Solo/1-player deliberately NOT duplicated into e2e (it's pure
      state-layer logic already covered thoroughly in state.test.js; a
      second e2e pass would add runtime, not coverage — documented in the
      test file so the omission reads as a decision, not a gap)
- [x] T11.3 Full regression: `npm test` (41/41) + `npm run test:e2e`
      (3/3 stable runs) both green — zero v1 behavior broken (plain
      public PLAY, draw/reset, motion sync, disconnect handling all
      still pass unchanged)
Covers: full-sprint verification.

### Sprint 2 status
Phase 6-11: DONE — all phases complete.
