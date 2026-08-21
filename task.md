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

## Sprint 5 ("desktop table width") — SHIPPED 2026-08-16
Fast-Track sprint: single story (US-31), pure CSS per D20
(`docs/ARCHITECTURE.md`), no JS/state/protocol touched. Gates 1 and 2
both passed with amendments folded into the story/decision already —
one phase covers the whole sprint.

### Phase 28 — Desktop breakpoint tiers (only phase)
- [ ] T28.1 `style.css`: add two `@media` tiers on `#screen-game` per
      D20 — `min-width:1024px` → `max-width:1100px`,
      `min-width:1440px` → `max-width:1300px`. Below 1024px, existing
      480px/760px rules stay byte-for-byte unchanged. No changes to
      `#game-deck-area`/`#table-area` (13rem pot cap stays fixed) or any
      `.card`/`.mini-card-back` pixel dimensions.
- [ ] T28.2 `tests/e2e.smoke.mjs`: objective measurement, not just visual
      — assert `#screen-game`'s actual rendered width at 1023px (still
      760px cap), 1024px (now 1100px cap), 1439px (still 1100px), and
      1440px (now 1300px cap), i.e. test *at* both breakpoint boundaries
      per Smith's Gate 2 note, not just "looks fine somewhere in the
      1024-1440 range". Also assert no horizontal scroll
      (`document.documentElement.scrollWidth <=
      document.documentElement.clientWidth`) at 320px and 1920px.
Covers: US-31.

### Sprint 5 status
Phase 28: Done — Trin UAT passed, Morpheus reviewed and approved, Smith
close-out found no bugs (screenshotted the real app at 760/1024/1300/
1920px). Sprint launched 2026-08-16.

## Sprint 6 ("snap-to stack/overlap" + deck operations) — IN PROGRESS
US-32..36, architecture D21-D23 (docs/ARCHITECTURE.md), both gates
passed. D23 (Pile unification) is a user-directed mid-sprint addition,
sequenced first per Morpheus/Smith — the feature phases build on the
unified model, not the old three-slice one.

### Phase 29 — Pile unification (D23, foundation — must land first) ✅ DONE
- [x] T29.1 `src/state.js`: unified `deck`/`hands`/`zones` into
      `state.piles` (kind: 'deck'|'hand'|'zone', visibility *derived*
      from kind — see D23's "Neo implementation revision"). `viewFor`'s
      output shape byte-for-byte identical - `ui.js`/`main.js`/
      `protocol.js` needed **zero** changes, verified by grep + a full
      e2e pass. New generic `dealRoundRobin()` replaces `dealCards()`;
      `DEAL`/`DEAL_MORE` collapsed to one case + a `fresh` flag. New
      exported selectors `deckOf`/`handOf`/`handsOf`/`zonesOf`.
- [x] T29.2 Full regression: `npm test` 86/86 + `npm run test:e2e` green.
      **T29.2's original premise was impossible and was corrected**: it
      required all 86 tests to pass *unmodified*, but 117 assertion
      sites in `tests/state.test.js` read `state.deck`/`.hands`/`.zones`
      directly — i.e. they assert on *storage shape*, which is exactly
      what this phase changes. A storage refactor cannot leave
      storage-shape assertions untouched. Corrected guarantee, which
      **did** hold and is the real proof: every assertion against
      `viewFor` output (the actual behavioral contract, and the only
      thing that crosses the wire) is unmodified; only the internal-shape
      reads were mechanically migrated to the new selectors.
Covers: D23 foundation for everything below.

### Phase 30 — Position-aware PLAY/MOVE_CARD + layout field (D21 state layer)
- [ ] T30.1 `src/state.js`: shared `insertCard(cards, card,
      beforeCardId)` helper; `PLAY`/`MOVE_CARD` gain optional
      `beforeCardId`/`layout` params; same-zone no-op removed (real
      reorder now); `PICKUP` strips `layout` on return to hand;
      direction-agnostic rule from Smith's Gate 2 correction ("layout
      belongs to whichever card is second in the newly-adjacent pair,
      computed after insertion" - covers on-card/beside-before/
      beside-after with one rule, no branching).
- [ ] T30.2 `tests/state.test.js`: unit coverage for insert-before/
      insert-after/append-unchanged, same-zone reorder, the
      before-side-overlap direction case specifically (this is the bug
      Smith caught - needs its own explicit regression test, not just
      incidental coverage), and `PICKUP` clearing `layout`.
Covers: US-32, US-33 (state layer only).

### Phase 31 — Stack/overlap drag-drop UI + CSS
- [ ] T31.1 `src/ui.js`/`src/main.js`: drop-region detection in
      `renderZonePanel`'s drop handler - on-card body (stack, always
      insert-after) vs. beside-card halo before/after (overlap) -
      wired through `onDropCard`/`dropCardOnZone` into the new
      `playCard`/`moveCard` params from Phase 30.
- [ ] T31.2 `style.css`: negative-margin rendering for `layout: 'stack'`
      (tight, corner-peek only) and `'overlap'` (partial, fully
      readable) - reuses `.zone-drag-over`'s existing highlight pattern,
      extended per-card (glow on-card = will-stack, insertion-line
      beside = will-overlap) per Smith's Gate 1 mechanism.
Covers: US-32, US-33 (UI layer).

### Phase 32 — Zone room (D24, user-directed) ✅ DONE
- [x] T32.1 `style.css`: grow the pot (`#game-deck-area`/`#table-area`),
      `#table-area` max-height, and `.seat-zone` caps at D20's existing
      1024px/1440px breakpoints per D24's measured budget. Below 1024px
      byte-for-byte unchanged (mobile is already over-subscribed - the
      known open density item).
- [x] T32.2 `tests/e2e.smoke.mjs`: **required guard per D24** - measure
      with `getBoundingClientRect()` at each breakpoint that no personal
      seat zone intersects the pot. This invariant has been broken for
      real before (a zone covering a pot control), so growing the cap
      without measuring would trade a documented bug for a silent one.
Covers: D24 (unblocks US-32/33 being usable in practice).

### Phase 33 — Deck operations (US-34/35/36) ✅ DONE
- [x] T33.1 `src/state.js`: `SHUFFLE_DECK` (reuses `shuffle()`) and
      `SPLIT_DECK {pileCount}` (reuses Phase 29's `dealRoundRobin()`,
      guards `pileCount <= deck.length`) reducer cases, host-only.
- [x] T33.2 `index.html`/`src/main.js`: new `Shuffle`/`Split` controls
      under `#game-deck-area`, host-only visibility (matches
      `resetBtn`/`dealMoreBtn` pattern); `Split`'s pile-count input
      reuses the `deal-more-count` pattern (`min="2" max="20"`).
      `tests/state.test.js` coverage for both new reducer cases incl.
      the "not enough cards" guard.
Covers: US-34, US-35, US-36.

### Phase 34 — e2e verification (final implementation phase) ✅ DONE
Folded into phases 31-33 as each landed rather than deferred to a single
pass at the end: real-DragEvent stack/overlap coverage, the D24 pot/zone
overlap guard, and host-only + propagation checks for Shuffle/Split are
all in `tests/e2e.smoke.mjs` and green.
- [ ] T34.1 `tests/e2e.smoke.mjs`: real drag-and-drop coverage for both
      stack and overlap (both before/after sides - specifically
      exercising the direction case Smith's correction covers), Shuffle,
      Split (incl. the guard error), full regression pass, stable
      multi-run.
Covers: full-sprint verification.

### Phase 35 — Dedicated bug-fix phase (reserved, proactive per Sprint 3/4 pattern)
Populated from Smith's Stage-3 close-out test, if anything is found.

### Sprint 6 status
Phase 29: Done — Trin UAT passed (91/91, mutation-verified), Morpheus approved
Phase 30: Done — Trin UAT passed (mutation-verified), Morpheus approved
Phase 31: Done — Trin UAT passed (mutation-verified), Morpheus approved
Phase 32: Done — Trin UAT passed (guard mutation-verified), Morpheus approved.
          Pot 13rem->24rem, seat zones 9rem->12rem; fixed a PRE-EXISTING
          pot/zone overlap present on the committed baseline at every
          width; <1024px verified byte-identical
Phase 33: Done — Trin UAT passed (3 mutations verified), Morpheus approved
Phase 34: Done — e2e coverage landed with each phase (see above)
Phase 35: Reserved

## Sprint 7 ("host-only save/restore") — SHIPPED 2026-08-20
US-37, architecture D26. Both gates passed.

### Phase 36 — persistence module (pure, no browser)
- [x] T36.1 `src/persistence.js`: `snapshot(state, code)` (strips hand
      piles at save time per D26), `save/load/clear(storage)`, versioned;
      load returns `{ok:false, reason}` on missing/corrupt/wrong-version
      rather than throwing or half-restoring.
- [x] T36.2 `tests/persistence.test.js`: round-trip, hands absent from
      the serialized blob (asserted on the JSON string, not the object),
      version mismatch discarded, corrupt JSON discarded, `savedAt` age.
Covers: US-37 data layer.

### Phase 37 — wire into the host + restore prompt
- [x] T37.1 `src/main.js`: debounced save on every host dispatch; on
      load offer restore with Smith's required wording (hands *weren't
      saved*, save age, players must rejoin), landing on the share
      screen; re-request the saved table code with an explicit fallback
      message if the broker refuses it; decline keeps the save.
- [x] T37.2 `tests/e2e.smoke.mjs`: host reloads mid-game and restores -
      zones/scores survive, hands are empty, table code is re-claimed.
Covers: US-37 UI + session layer.

### Sprint 7 status
Phase 36: Done — Trin UAT passed (3 mutations verified), Morpheus approved
Phase 37: Done — real host-reload e2e: 7 zones restored, no hands resurrected

## Sprint 8 ("stable player identity / reconnect") — SHIPPED 2026-08-20
User's own design, adopted as proposed: host issues a UUID on connect,
both ends store it, client presents it on reconnect to get its cards back.
Architecture: D27.

### Phase 38 — identity module + handshake ✅ DONE
- [x] T38.1 `src/identity.js` (pure): `newPlayerKey`, `resolvePlayer`
      (unknown key -> fresh seat; key already live -> fresh seat, no
      hijack), `peerFor`. 7 unit tests.
- [x] T38.2 `src/session.js`: `playerKey` carried in the join handshake
      metadata and surfaced on the roster.

### Phase 39 — host wiring ✅ DONE
- [x] T39.1 `src/main.js`: `peerToKey` transport map; game state keyed by
      identity throughout (JOIN, actions, broadcast, motion relay);
      identity announced once the connection is open (avoids the known
      PeerJS still-connecting crash).
- [x] T39.2 `tests/e2e.smoke.mjs`: a guest refreshes mid-game and gets
      back the exact same card ids and the same seat (roster stays at 2).

### Sprint 8 status
Phase 38: Done — 142/142 unit
Phase 39: Done — real guest-refresh e2e green

### Phase 40 — remember the table (US-39) ✅ DONE
- [x] T40.1 `src/identity.js`: `rememberSession`/`recallSession`/
      `forgetSession` (+5 unit tests, incl. corrupt-record and hostile-
      storage cases). `hostName` added to the host snapshot.
- [x] T40.2 `src/main.js`: guest remembers code+name on join and
      auto-rejoins on reload (only for a table it was actually in - a
      bare shared ?join= link still asks for a name); host restore uses
      the remembered host name. Deep-link and resume merged into one
      end-of-module block, since it clicks Join and every handler must
      already be attached.
- [x] T40.3 `tests/e2e.smoke.mjs`: guest reloads with NOTHING typed and
      lands back in the live game with the same hand and seat; host
      restore no longer types a name.

---

## Sprint 9 ("touch parity" — v1.6) — SHIPPED 2026-08-20
US-40. Native HTML5 DnD is mouse-only, so five shipped interactions
(drag-to-play, hand reorder, stack, overlap, live drag ghost) do not
exist on the PRD's primary device. Architecture: D28.

### Phase 41 — extract the drop semantics (D28 precondition) ✅ DONE
- [x] T41.1 `src/ui.js`: lift the inline bodies of the zone `drop` and
      hand-reorder `drop` listeners into named `performZoneDrop` /
      `performHandReorder`; native listeners call them. Pure refactor —
      no behaviour change, no touch code yet.
- [x] T41.2 Existing suite + e2e stay green, proving the extraction
      changed nothing. This must be green *before* Phase 43 exists, so
      there is only ever one implementation of what a drop means.

### Phase 42 — the pure recognizer ✅ DONE
- [x] T42.1 `src/touchDrag.js`: DOM-free press-and-hold state machine
      (idle→pending→lifted→dragging→drop/cancel), 250ms hold, 8px slop,
      `pointercancel` ⇒ abandon.
- [x] T42.2 `tests/touchDrag.test.js`: the rules that carry the story —
      a scroll (moved before the hold) can never become a drag; a hold
      that stays still lifts; cancel is terminal; slop is measured from
      the *origin*, not the previous sample.

### Phase 43 — bind it to the DOM ✅ DONE
- [x] T43.1 `src/ui.js`: attach the recognizer to hand cards and zone
      cards; `setPointerCapture` + `elementFromPoint` hit-testing;
      floating `.touch-drag-ghost` clone offset above the finger
      (Smith Gate 2 #2); shared `showDropHint` feedback.
- [x] T43.2 Smith Gate 2 #1: move the D13 lift cue off raw `pointerdown`
      onto the recognizer's `lift`, so a scroll stops broadcasting a
      phantom lift and the holder isn't the last to know.
- [x] T43.3 `style.css`: `.card-dragging`, `.touch-drag-ghost`,
      `touch-action: none` applied only while lifted.

### Phase 44 — prove it on a real finger ✅ DONE
- [x] T44.1 `tests/e2e.smoke.mjs`: a `hasTouch` context driving
      `page.touchscreen` — hold-drag a card from hand onto a zone, and
      confirm a short swipe over a card scrolls instead of dragging.
- [x] T44.2 The discoverability hint (Smith Gate 1 #4).

### Sprint 9 status
Phase 41: Done — pure extraction; Trin found `performHandReorder` had no
          coverage at all and added a real drag-reorder e2e case first
Phase 42: Done — 13 recognizer tests, 4 mutations verified
Phase 43: Done — Morpheus caught a detached-source lift (a state broadcast
          mid-hold strands a ghost); guarded on `isConnected`
Phase 44: Done — real `hasTouch` + CDP touch e2e; mutation-verified twice
          (no-hold makes the swipe test fail; unbinding fails the drag test)

**Found en route, deliberately NOT fixed here (scope: US-40 is input, not
layout):** with 3 players at 1024px a personal seat zone overlaps the
shared pot. Surfaced when the touch client was briefly a third browser.
Real geometry, not a test artifact — D24's grown caps have only ever been
measured against a 2-player ring. Filed for Cypher's backlog.

**Close-out bug (Smith, fixed):** the drag ghost rendered 38px *below*
the finger despite code that reads as if it floats above — the `scale`
property composes outside `transform`, so the translate was itself
multiplied by 1.12. Now positioned with `left`/`top`; e2e asserts the
ghost/finger relationship and the assertion is mutation-verified.


---

## Sprint 10 ("deal on the deck; tables start themselves" — v1.7) — SHIPPED 2026-08-20
US-41 + US-42. Both requested straight after the user asked "how to
re-deal?" — which was the finding. Architecture: D29, D30.

### Phase 45 — pure pile-level actions ✅ DONE
- [x] T45.1 `src/pileActions.js`: `PILE_ACTIONS` + `pileLevelActions`,
      deliberately a SECOND table, not an extension of the per-card one
      (D29). `destructive` drives the confirm and the danger styling.
- [x] T45.2 `tests/pileLevelActions.test.js`: 6 tests, incl. a guard that
      `deal` never leaks into `actionsForPileKind`.

### Phase 46 — the deck control strip ✅ DONE
- [x] T46.1 `renderDeck`: stack and controls are now SIBLINGS, so the
      empty-deck short-circuit hides the cards only — Smith's Gate 1
      blocker dissolved by structure rather than a special case.
- [x] T46.2 Game screen only (Smith Gate 2 #2); confirm on Reshuffle &
      deal; `Deal More (no reset)` and its orphan input deleted.
- [x] T46.3 Uncaught over-deal throw caught and surfaced beside the deck.

### Phase 47 — auto-start ✅ DONE
- [x] T47.1 Optional `expectedPlayers`, host-local (D30), + the
      "waiting for N" status line (Smith Gate 1 #3).
- [x] T47.2 `tests/e2e.smoke.mjs`: auto-start with no host click,
      reshuffle & deal behind a confirm, empty-deck controls, and a
      ghost-seat regression assertion.

### Sprint 10 status
Phases 45-47: Done. 166 unit + full e2e green, lint clean.
Three real bugs found by running it: a dead once-only guard, an uncaught
over-deal throw, and auto-start dealing to a still-`connecting` peer
(ghost seat holding everyone's cards).


---

## Sprint 11 ("restart waits for the table" — v1.8) — SHIPPED 2026-08-20
US-43/44/45, from the user's request. Architecture: D31 (reverses D26),
D32, D33.

### Phase 48 — persistence keeps hands ✅ DONE
- [x] T48.1 `src/persistence.js`: hands persisted, `SNAPSHOT_VERSION` 2,
      new pure `expectedReturners()` (Smith's Gate 1 blocker as a
      function). D26's test inverted in place, not deleted.

### Phase 49 — the host waits, and names who's missing ✅ DONE
- [x] T49.1 Restore KEEPS the saved roster (marked away) — wiping it was
      what orphaned every restored hand.
- [x] T49.2 Waiting panel naming each player back/missing, auto-resume on
      connected count, "Start anyway" sharing the same once-only flag.

### Phase 50 — clients reconnect on their own ✅ DONE
- [x] T50.1 `host-lost` split from `session-ended`; `forgetSession` moved
      off the disconnect path; backoff ladder (~51s) + per-attempt
      timeout; `Session.close()` so attempts don't leak peers.

### Phase 51 — the wording sweep + e2e ✅ DONE
- [x] T51.1 Restore prompt, README and D26 all corrected/superseded.
- [x] T51.2 e2e: host reload → named wait list → guest returns unaided →
      auto-resume → same card ids, two seats, no ghost.

### Sprint 11 status
Phases 48-51: Done. 171 unit + full e2e green, lint clean.
Four bugs found by running it: a stalled retry loop (await with no
timeout), an unregistered `host-lost` event, restore orphaning hands via
a stale comment, and the manual Deal path seating unsettled peers.

---

## Sprint 12 ("piles are the interaction" — v2.0) — IN PROGRESS
US-46, the user's own design, straight from the button-geometry chase
in the design-lint fix. Architecture: D34-D37.

**Scope note (Mouse):** Reset (whole-table) and Reset Scores
(player-level) are NOT pile actions - neither has a single pile as its
subject, so they're explicitly out of this redesign and stay as
existing host-only controls. Add Zone is also excluded: it CREATES a
pile, so there's nothing to hover yet: stays a small persistent control.

### Phase 52 — generalize the pile-level action table (pure) ✅ DONE
- [x] T52.1 `src/pileActions.js`: `pileLevelActions()` now covers hand
      (sort-rank, sort-suit, pass, owner-only) and deck (draw, deal,
      reshuffleDeal - draw open to everyone, dealing stays host-only).
      `drawFaceDown` NOT implemented - flagged as a real scope conflict
      (needs a `state.js` reducer change, which Cypher's story
      explicitly excluded) rather than guessed at; needs its own
      decision before Phase 54. STATIC `singleTarget: true` on `draw`
      only (Smith Gate 2 #1), never computed from live pile counts.
- [x] T52.2 Unit tests + mutation-verified (Neo AND independently by
      Trin) that `move`/`pickup` never carry `singleTarget`. Also fixed
      a real gap found along the way: `targetsForAction` only checked
      `ACTIONS`, so a dragged Draw would have had no legal drop target
      at all - now checks `PILE_ACTIONS` too. 196/196 unit green.

### Phase 53 — the pile anchor (generalized, not deck-only) ✅ DONE
- [x] T53.1 `src/ui.js`: `renderPileAnchor` generalizes D29's
      `deck-controls-strip` pattern into a pile-anchor usable by ANY
      pile kind - fixed to the pile's own container, never card-relative
      (Smith Gate 1 #2). Hover (mouse) / tap (touch, `:focus-within`,
      Smith Gate 1 #1) reveals the popover - reuses D25's existing
      CSS-only mechanism, not a new one.
- [x] T53.2 Hand's anchor wired (Sort rank/suit, Pass) - 3 buttons
      replaced by one. Diagnosed and fixed a real pre-existing e2e
      blocker along the way (not caused by this phase, just newly
      reached): #table-center's own transform-created stacking context
      was trapping z-index against #seat-zones, silently swallowing a
      click on the Deal button.
- [x] T53.3 `npm run lint:design`: the anchor toggle itself clears 44px
      (base `button` rule, no exemption needed). The page-wide
      no-scroll gate carries 9 PRE-EXISTING violations, confirmed via
      `git stash` to predate this sprint's own commits entirely - not
      this phase's regression, not touched.

### Phase 54 — Draw: the worked example (drag + static tap shortcut) ✅ DONE
- [x] T54.1 Draw through the deck's pile anchor: draggable via the
      action-token protocol (D35, `attachPileActionTouchDrag` reuses
      `touchDrag.js`'s pure `step` unchanged) AND a plain tap shortcut
      (D36, `PILE_ACTIONS.draw.singleTarget` - static, from Phase 52).
      `drawFaceDown` dropped per the open decision above (D37 groom
      note has the full reasoning) - never implemented, never shipped.
      Caught a real bug before it shipped: the deck's `onPileAction` was
      `dealFromDeck`, which silently routed 'draw' into its DEAL_MORE
      branch - found live (a direct click left the hand count
      unchanged, no error), fixed with a dedicated callback.
- [x] T54.2 e2e: drag Draw onto the hand draws a card; tapping Draw
      (revealed) also draws, with no drag - both asserted directly.

### Phase 55 — reveal becomes a tap on the card ✅ DONE
- [x] T55.1 D25's hover button for `reveal` removed (filtered out of
      `actionMenuEl`'s own action list, not a separate deletion); a
      direct tap on a revealable card performs it instead. Found a real
      gap on the first pass: `redactMiddleCard` (D7) never redacts a
      card from its own owner, so a private-facedown card's OWNER sees
      a real `.card` face, not a `.card-back` - the tap handler needed
      wiring onto BOTH shapes, not just the redacted one. Confirm dialog
      unchanged (Smith Gate 2 #2).
- [x] T55.2 e2e: confirm-cancel/confirm-accept reveal flow re-verified
      via tap, both the shared (`.card-back`) and private (owner's real
      face) cases.

### Phase 56 — remaining deck pile-level actions migrate to the anchor ✅ DONE
- [x] T56.1 Shuffle, Split, Deal, Reshuffle & deal all moved onto the
      one deck anchor (host-only, unchanged authorization). Shuffle/
      split were newly modeled as real `PILE_ACTIONS` entries (they'd
      shipped as plain buttons outside `pileLevelActions` entirely).
      `renderPileAnchor` gained grouped count-input support (Deal +
      Reshuffle & deal share one; Split gets its own) and confirm-gating
      for destructive actions. `deckControls` (the strip-builder) is
      fully deleted, not hidden - zero remaining callers. Hit the SAME
      stacking-context bug as Phase 53 a second time, against a
      DIFFERENT sibling (`#game-roster`'s seat `<li>`, z-index:2, not
      `#seat-zones`) - the earlier z-index:2 escalation tied and lost on
      DOM order; bumped to 3. New, real, disclosed lint:design finding:
      removing the shuffle/split row's bulk legitimately shrinks
      `.deck-column`, which shifts the pot upward in normal flow below
      1024px (a tier that was never given the desktop centering fix) -
      a mobile-only, pre-existing-gap regression, not chased further.

### Phase 57 — move/pickup stay drag-first, unconditionally ✅ DONE
- [x] T57.1 Confirmed, not reimplemented - no app code changed. Two
      unit tests pin the exact 2-zone/early-game geometry Gate 2 warned
      about (`targetsForAction('move', ...)` genuinely returns one
      target there) alongside the static absence of `singleTarget` on
      `ACTIONS.move`/`pickup`. `actionMenuEl` (ui.js) never reads
      `singleTarget` for card-level actions at all - structurally, not
      just by an unset flag - and the existing e2e suite already
      exercises this live (its first `pickup` runs before CREATE_ZONE).

### Phase 58 — remove the old buttons, full regression ✅ DONE
- [x] T58.1 sort-rank-btn, sort-suit-btn, pass-toggle-btn, draw-btn, and
      the whole legacy shuffle/split row (#deck-controls) deleted from
      index.html for real, plus their now-dead listeners and CSS
      (`.deck-controls-strip`, `.deck-controls`). Named functions each
      button called are kept - the anchors call them directly.
      Reset/Reset Scores/Add Zone untouched (out of scope).
- [x] T58.2 `npm test` (202/202) and `npm run test:e2e` are both green.
      `npm run lint:style` is clean. `npm run lint:design` is **NOT**
      clean (10 violations) - said plainly, not glossed: 5 predate this
      sprint (Phase 53's own `git stash` confirmation); the rest are
      Phase 56's disclosed mobile pot/zone-overlap finding, continuing
      as more legacy bulk comes out. Both are ring/pot geometry, out of
      this sprint's actual scope (pile-anchor UI) - see D37's groom note
      in ARCHITECTURE.md for the full reasoning and why a `--table-min-h`
      number can't fix it without reopening the scroll violation from
      the other side (measured directly, Phase 56's commit).

### Sprint 12 status — SHIPPED
All 7 phases (52-58) done. 202/202 unit + full e2e green, `lint:style`
clean. `lint:design` carries 10 open violations, ALL disclosed and
explained in place (Phase 53/56/58's own notes above, D37's groom note
in ARCHITECTURE.md) - none are pile-anchor UI defects; all are
ring/pot geometry, pre-existing or newly-exposed-but-out-of-scope.
`drawFaceDown` was dropped, not implemented (see D37 groom note) -
`draw` (the AC's actual worked example) shipped as designed.

The Phase 53 blocking note (e2e RED at the deck-controls-strip Deal
button) is resolved - see that commit's message for the diagnosis (a
personal seat zone's stacking context trapping a z-index, unrelated to
this sprint's own cause but newly reached because it was the next
thing blocking forward progress).

---

## Sprint 13 ("Pile becomes a real type" — v3.1) — SHIPPED

US-47, Tranche 1 of D39 (queued at Sprint 12 close from a user/Morpheus
architecture sidebar - see ARCHITECTURE.md's v3.0/v3.1 sections for the
full design). Architecture: D41 (splits D39 into read-side now /
write-side deferred), D42 (the pile-type module contract).

### Phase 59 — pile-type modules (pure, no wiring) ✅ DONE
- [x] `src/piles/{deckPile,handPile,zonePile,pileTypes}.js`:
      visibility/dropRule/cardActions/pileActions per type. 16 new
      tests + an exhaustive characterization matrix (every kind/owner/
      card/viewer combo) against the still-live originals - 0 drift.
      218/218 unit green (202 + 16 new).

### Phase 60 — wire state.js/pileActions.js through the registry ✅ DONE
- [x] `state.js`'s `pileVisibility()`/`viewFor()` and `pileActions.js`'s
      `actionsForCard()`/`pileLevelActions()` now read `PILE_TYPES`
      instead of their own tables (`PILE_VISIBILITY`, `redactMiddleCard`,
      `actionsForPileKind` all deleted - no orphaned duplicates).
      `pileLevelActions()` deliberately kept its exact `(kind, ctx)` call
      shape rather than the `(pile, viewerId, ctx)` first drafted in
      ARCHITECTURE.md - checked both real call sites first and neither
      had a pile object in scope; doc corrected to match the code.
      `dropTarget.js`'s caller in `ui.js` is NOT wired to `dropRule` -
      the view shape has no `kind` field, a Tranche-2/wire-format
      question, disclosed rather than silently skipped.
- [x] Mutation-verified the wiring itself, not just the new modules:
      broke `viewFor`'s redaction dispatch, the PRE-EXISTING D7 privacy
      test caught it immediately (real regression protection).
      218/218 unit + full e2e (real WebRTC) both green.

### Phase 61 — reserved bug-fix ✅ DONE, nothing found
- [x] Full regression clean. `lint:design` unchanged at 10 violations -
      the exact set Sprint 12 already disclosed as pre-existing/
      out-of-scope ring/pot geometry - confirmed via `git stash`
      comparison that this sprint (zero CSS/DOM touched) didn't move it.

### Sprint 13 status — SHIPPED
Zero user-visible behavior change, as specified. Tranche 2 (reducer
mutation dispatch through canAccept/insert/canRemove/remove, plus the
in-place-action gap D41 named: Reveal/Shuffle/Split/Pass don't fit that
shape) is unscheduled - see the Sprint 13 backlog entry in
`docs/USER_STORIES.md`.
