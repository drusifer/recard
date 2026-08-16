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

---

## Sprint 3 ("zones, presence, hand tools") — SHIPPED 2026-08-15

Covers US-19..25. Architecture: `docs/ARCHITECTURE.md` D12-D16. Bigger
than sprints 1-2, so more phases; includes a **dedicated bug-fix phase**
(20) instead of tailing fixes onto the last implementation phase, per the
2-sprint-escalated retro process note.

### Phase 12 — Zones data model ✅ DONE
- [x] T12.1 `src/state.js`: `table` → `zones: {id,name,cards}[]` with a
      default zone; `CREATE_ZONE {name}`; `MOVE_CARD {playerId, cardId,
      toZoneId}` (auth mirrors REVEAL: hidden-private → owner only,
      visible → anyone); `PLAY` gains optional `zoneId` (defaults to the
      default zone — no existing call site needs to change)
- [x] T12.2 `src/state.js`: `REVEAL`/`PICKUP` search across all zones by
      card id (ids are globally unique, D12) — signatures unchanged
- [x] T12.3 `tests/state.test.js`: zone creation, move-card authorization
      (both allow/deny paths), cross-zone reveal/pickup, regression that
      existing single-zone PLAY/REVEAL/PICKUP calls still work unmodified.
      12 new tests, 49/49 total passing first try. Added a transitional
      `view.table` alias (= default zone's cards) so `npm run test:e2e`
      stays green through phases 12-14 with zero UI changes yet — removed
      once Phase 15 migrates ui.js/main.js to the real `zones` array.
Covers: US-19 (data layer).

### Phase 13 — Incremental dealing + pass marker ✅ DONE
- [x] T13.1 `src/state.js`: `DEAL_MORE {cardsPerPlayer}` — factored the
      round-robin distribution logic out of `DEAL` into a shared
      `dealCards()` helper both actions call, rather than duplicating it
- [x] T13.2 `src/state.js`: `state.passed`, init `false` on `JOIN`,
      `TOGGLE_PASS {playerId}`, `RESET` clears `passed` (regression:
      confirmed `RESET` still leaves `scores` untouched, per D9)
- [x] T13.3 `tests/state.test.js`: DEAL_MORE (incl. not-enough-cards
      guard), pass toggle/reset, regression on scores-vs-passed RESET
      behavior diverging correctly. 6 new tests, 55/55 total, first try.
      e2e still unchanged/green.
Covers: US-24, US-25 (data layer).

### Phase 14 — Hand order module ✅ DONE
- [x] T14.1 `src/handOrder.js`: `reconcileOrder(prevOrder, currentCards)`,
      `sortByRank(cards)`, `sortBySuit(cards)` — pure, no DOM
- [x] T14.2 `tests/handOrder.test.js`: reconcile keeps existing positions/
      appends new/drops removed; sort correctness for both axes. 10 new
      tests, 64/64 total, first try. e2e unaffected (no UI touched yet).
Covers: US-23 (logic layer, fixes Sprint-1 tech debt).

### Phase 15 — Zones UI ✅ DONE (verified live, real WebRTC)
- [x] T15.1 `src/ui.js`: `renderZones()` replaces `renderTable()` —
      every zone gets its own labeled sub-panel (name + live count),
      removed the transitional `view.table` alias from state.js now that
      main.js/ui.js are fully migrated (re-ran full test+e2e suite after
      removal to prove it was safe, not just assumed)
- [x] T15.2 `src/main.js` + `index.html`: zone creation control (name
      required, no auto-numbering, per Smith Gate 1), move-card
      interaction via a per-card "Move to…" select (only shown when
      there's another zone to move to, and only for cards the viewer has
      authority/visibility over)
- Live 2-browser check: zone creation propagates to both clients,
  MOVE_CARD zone-to-zone propagates live, screenshotted and visually
  confirmed correct (zone names/counts always visible, per Gate 1).
Covers: US-19 (UI layer).

### Phase 16 — Deck + opponent hands visualization ✅ DONE (visually verified live)
- [x] T16.1 `src/ui.js`: `renderDeck()` — face-down card stack + count
      badge (US-20), used in both the host lobby and the game screen
- [x] T16.2 `src/ui.js`: `renderMiniHand()` — compact fan (max 5 visible
      backs + a count badge) per other player, alongside (not replacing)
      the existing text count (US-21, Smith Gate 1)
- Caught and fixed a real visual bug during screenshot verification: mini
  hand card-backs were the exact same color as the roster row background
  (`--surface-2` on `--surface-2`), rendering them invisible. Not
  hypothetical - seen directly in a screenshot, fixed, re-verified
  visible in a second screenshot before calling this done.
Covers: US-20, US-21.

### Phase 17 — Cursor + lift-cue motion ✅ DONE (verified live, real WebRTC)
- [x] T17.1 `src/main.js`: broadcast normalized (0-1) pointer position
      while the pointer is down anywhere on the game screen, throttled
      via the existing `motionThrottler` (D13 — no protocol.js changes
      needed, exactly as architected)
- [x] T17.2 `src/ui.js`: `updateRemoteCursor()`/`removeRemoteCursor()` —
      labeled, lightweight dot, auto-clears via TTL if updates stop
      arriving (best-effort, same pattern as the existing hand-motion cue)
- [x] T17.3 `src/main.js` + `src/ui.js`: card-lift cue via
      pointerdown/up/leave on zone cards (not HTML5 drag-and-drop — a
      "held" state is simpler and works uniformly for touch/mouse);
      `setCardLifted()` toggles a cosmetic CSS state. Verified privacy-
      safe: only the card id is broadcast (already known to every viewer
      even in redacted form), so this works identically for face-down
      and face-up zone cards with no rank/suit leak.
- Live 2-browser check: remote cursor appears/labeled correctly/clears on
  pointer-up, card-lift highlight propagates live — both screenshotted.
Covers: US-22.

### Phase 18 — Hand sort, Deal More UI, pass marker UI
- [x] T18.1 `src/ui.js` + `src/main.js`: "Sort by rank"/"Sort by suit"
      buttons wired to `handOrder.js`; existing drag-reorder updated to
      share the same order list (Smith Gate 1: sort and drag must not
      fight each other)
- [x] T18.2 `index.html` + `src/main.js`: "Deal More" control, styled/
      placed distinctly from "Deal & Start" (Smith Gate 1 AC)
- [x] T18.3 `src/ui.js` + `src/main.js`: pass-marker toggle button +
      "Passed" tag in the roster
Covers: US-23 (UI layer), US-24 (UI layer), US-25 (UI layer).

### Phase 19 — e2e verification (final implementation phase)
- [x] T19.1 `tests/e2e.smoke.mjs`: zones (create, move card zone→zone,
      pickup from a non-default zone), DEAL_MORE, pass-marker propagation
- [x] T19.2 `tests/e2e.smoke.mjs`: hand sort persists across a state
      update (regression-proves D14 actually fixed the old bug), cursor
      broadcast basic check
- [x] T19.3 Full regression (`npm test` + `npm run test:e2e`, stable
      multi-run) + a visual screenshot pass at mobile/desktop viewports —
      this sprint has real density/scalability risk (Smith flagged it),
      check before declaring done, not just after Smith finds it
Covers: full-sprint verification.

### Phase 20 — Dedicated bug-fix phase
Populated from Smith's Stage-3 close-out test (`agents/smith.docs/
uat-report-sprint3.md`):
- [x] T20.1 `src/ui.js` (`renderRoster`/`renderMiniHand`) +
      `style.css` (`.mini-hand`): another player's hand count currently
      renders twice - once as the roster row's own `(N cards)` text
      (`src/ui.js:310`), again as the mini-hand fan's count badge
      (`src/ui.js:301`, same `handCount` value) - with no spacing between
      the two, so they visually run together (`.mini-hand` has no left
      margin, `style.css:295-299`). Drop the duplicate count from one of
      the two places, and add real spacing regardless.
Covers: Sprint 3 close-out bug fix (US-21).

### Sprint 3 status
Phase 12: Done
Phase 13: Done
Phase 14: Done
Phase 15: Done
Phase 16: Done
Phase 17: Done
Phase 18: Done
Phase 19: Done
Phase 20: Done — Smith re-tested and closed the report

---

## Sprint 4 ("top-down table redesign") — IN PROGRESS

Covers US-26..30. Architecture: `docs/ARCHITECTURE.md` D17-D19. Splits
data (21), structural layout (22-23), interaction (24-25), verification
(26), and a **dedicated bug-fix phase** (27) — the Phase 20 pattern that
worked last sprint, carried forward proactively rather than waiting for
a 3rd retro to ask for it again.

### Phase 21 — Personal zone data model ✅ DONE
- [x] T21.1 `src/state.js`: `zones` entries gain optional `ownerId`;
      `JOIN` auto-creates one personal zone per joining player (reusing
      `CREATE_ZONE`'s zone-construction logic internally, not duplicated)
- [x] T21.2 `tests/state.test.js`: personal zone created on JOIN, has the
      right `ownerId`, behaves exactly like any other zone for
      PLAY/MOVE_CARD/REVEAL/PICKUP (D17)
Covers: US-27 (data layer).

### Phase 22 — Top-down table layout + seating ✅ DONE
- [x] T22.1 `src/ui.js`/`src/main.js`: per-viewer seat rotation (viewer
      always seated at the bottom, others distributed around the rest of
      the table in join order) — pure presentation, D18
- [x] T22.2 `index.html`/`style.css`: table drawn as one visual surface
      with seats around its edge; explicit "You" marker on the viewer's
      own seat (Smith Gate 1)
Covers: US-26.

### Phase 23 — Personal zones on the table + hand spread ✅ DONE
- [x] T23.1 `src/ui.js`: render each player's personal zone at their
      seat (D17's `ownerId`); shared zones stay in the table's center
- [x] T23.2 `src/ui.js`/`style.css`: hand rendered as a fanned/overlapping
      spread (US-30) — cards stay individually identifiable (rank+suit
      visible) and individually tappable at the existing ≥44×44px floor
      (Smith Gate 1)
Covers: US-27 (UI layer), US-30.

### Phase 24 — Drag-and-drop play and move ✅ DONE
- [x] T24.1 `src/ui.js`/`src/main.js`: dragging a hand card onto a zone
      plays it there (`PLAY`); dragging a table card onto another zone
      moves it (`MOVE_CARD`); existing tap-to-play and "Move to…"
      dropdown keep working unchanged (US-28)
- [x] T24.2 `src/ui.js`/`style.css`: valid drop targets highlight while a
      drag is over them, revert otherwise (Smith Gate 1) — invalid drops
      are a no-op, card returns to its origin
Covers: US-28.

### Phase 25 — Live card-drag broadcast ✅ DONE
- [x] T25.1 `src/main.js`: new `'card-drag'` motion kind on the existing
      throttled channel — `cardId` included iff `faceUp === true` at
      drag-start (D19's privacy rule), omitted otherwise
- [x] T25.2 `src/ui.js`: render the live ghost (real face if `cardId`
      present, anonymous back otherwise) at the broadcast position on
      every other client; TTL-based cleanup on an incomplete/dropped drag
      (reuses the existing cursor staleness pattern)
Covers: US-29.

### Phase 26 — e2e verification (final implementation phase) ✅ DONE
- [x] T26.1 `tests/e2e.smoke.mjs`: personal zones on JOIN, drag-and-drop
      play/move (dispatched as real `DragEvent`s per the Sprint 3
      headless-Chromium lesson, not raw mouse synthesis), drop-target
      highlight state
- [x] T26.2 `tests/e2e.smoke.mjs`: card-drag broadcast privacy — a
      not-yet-public card shows as anonymous to another client during the
      drag, a public card shows its real face; ghost clears on an
      incomplete drag (done test-first in Phase 25, already in the suite)
- [x] T26.3 Full regression (`npm test` + `npm run test:e2e`, stable
      multi-run) + mobile/desktop screenshot pass **at both a 2-player
      table and Smith's flagged ~8-player density case** — the risk was
      real (8 players badly overlapped on a 390px screen); applied a
      genuine fix (table surface scales with player count, smaller seat
      cards) — confirmed improved but **not fully resolved at 5+ players
      on mobile**, a real remaining geometric constraint (44px
      score-button touch targets leave no more room to shrink). Flagged
      explicitly for Smith's close-out, not glossed over.
Covers: full-sprint verification.

### Phase 27 — Dedicated bug-fix phase
Populated from Smith's Stage-3 close-out test (`agents/smith.docs/
uat-report-sprint4.md`). Finding #2 (5+-player mobile density) is
deliberately NOT included here — Smith/Trin/Morpheus agreed it needs a
real compact-seat design pass, not a rushed close-out fix, and it's
escalated to Cypher's backlog for proper sprint scoping instead.
- [x] T27.1 `style.css`: draggable card wrappers (`.hand-card`,
      `.middle-card` where draggable) get `cursor: grab`; `cursor:
      grabbing` while a drag is actually in progress (toggle a class on
      `dragstart`/`dragend`) — the only visual cue a mouse user has that
      dragging is possible at all (Smith Gate-close finding #1).
Covers: Sprint 4 close-out bug fix (US-28).

### Sprint 4 status
Phase 21: Done
Phase 22: Done
Phase 23: Done
Phase 24: Done
Phase 25: Done
Phase 26: Done
Phase 27: Done — Smith re-tested and closed the report; finding #2 (density) escalated to Cypher's backlog, not fixed here
