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

---

## Sprint 22 ("Zone/Pile polymorphism, proven by Solitaire + Spit") — US-56..59, D53

Phase numbering resumes at 62 - task.md went stale after Sprint 13
(Phase 61); Sprints 14-21 tracked phase-by-phase progress in
`agents/CHAT.md`/`docs/ARCHITECTURE.md` instead. Disclosed here rather
than silently reusing numbers or renumbering history.

### Phase 62 — Foundation: retire `dropRule`, wire `canAccept`+`resolveDropTarget` polymorphism (zero behavior change) ✅ DONE
Covers: US-59 (partial — the refactor half only, no new pile kinds yet).
- [x] Each existing pile module (`deck`/`hand`/`zone`/`discard`) grows
      `resolveDropTarget(cardBoxesInRow, point)`, moved out of `ui.js`'s
      `dropRule === 'FAN' ? ... : ...` branch. `zonePile.js` delegates to
      `dropTarget.js`'s existing pure halo math; the other three return
      `{}` (no geometry), matching their exact prior behavior.
- [x] `canAccept(pile, card)` added to all four (unconditional `true`),
      wired into `state.js`'s `transferCard` as a real gate — zero
      behavior change today, real infrastructure for Phase 63/64.
- [x] `dropRule` export deleted from all four modules; `dropRuleFor()`
      replaced by `resolveDropTargetFor()` in `pileActions.js`; `ui.js`
      makes one polymorphic call (`showZoneDragOver`/`performZoneDrop`
      now take `kind`, not a pre-resolved `dropRule` string) — zero
      kind-branching left in `ui.js`. Dead `resolveDropTarget` import
      removed from `ui.js`.
- [x] 261/261 unit tests green (net +1: `dropRule` tests replaced by
      `canAccept`/`resolveDropTarget` coverage in `piles.test.js` and
      `pileActions.test.js`). Trin UAT passed, Morpheus reviewed the
      actual diff (7 files, scoped exactly to the refactor, no stray
      changes). e2e deferred to Phase 66 per the user's standing
      frugal-e2e preference.

### Phase 63 — `foundation` + `cascade` pile kinds (Solitaire) ✅ DONE
Covers: US-56, US-57.
- [x] `src/piles/foundationPile.js`: `canAccept` (empty→Ace, else
      same-suit rank+1), `canRemoveCard` always `false`, `cardActions`
      always `[]` (silent-lock, per Smith's Gate 2 note - no new UI).
- [x] `src/piles/cascadePile.js`: `canAccept` (empty→any, else opposite
      color + rank-1), `insertCard` auto-applies D21's `layout:
      'overlap'` to every card after the first.
- [x] Registered both in `pileTypes.js` - 6 kinds total now.
      `CREATE_ZONE{kind:'foundation'|'cascade'}` worked with ZERO
      `state.js` changes (D45's `tableSide` gate already generalizes),
      confirming D53's polymorphism claim again.
- [x] 12 new tests: module-level accept/reject + insertCard/layout
      (`piles.test.js`), `targetsForAction` tableSide generalization
      (`pileActions.test.js`), and 3 full reducer end-to-end tests
      (`state.test.js`) proving Phase 62's `canAccept` wiring rejects
      for real (not just returns `true` everywhere) - a non-Ace on an
      empty foundation and a same-color card on a cascade both throw
      `/cannot accept/` through the actual `PLAY` dispatch.
- [x] 273/273 unit green.

### Phase 64 — `rankAdjacent` pile kind (Spit) ✅ DONE
Covers: US-58.
- [x] `src/piles/rankAdjacentPile.js`: `canAccept` (empty→any, else
      `abs(rank diff) === 1` or the K↔A wrap), STACK `insertCard` (top
      = index 0, matching `discardPile`'s convention — `canAccept`
      reads `pile.cards[0]` accordingly, not the array's last element).
      `ownerId: null` always holds by construction — `CREATE_ZONE`
      never takes an `ownerId` param, no extra enforcement needed.
      No new authorization — confirmed existing `MOVE_CARD` auth
      already covers "any player, any reachable card."
- [x] 8 new tests (module-level accept/reject + wrap + STACK order,
      1 full-reducer end-to-end). 280/280 unit green.

### Phase 65 — `GameConfig.zones` + Solitaire/Spit presets
Covers: US-59 (remainder). ✅ DONE
- [x] `GameConfig.zones: [{kind, ownerId, count}]`, additive, defaults
      `[]` (verified: `createInitialState`/`persistence.js`/`JOIN`
      round-trip tests all confirm zero behavior change for every
      pre-Sprint-22 preset).
- [x] Table-build logic: shared (`ownerId: null`) entries build in
      `createInitialState` (game creation); `'perPlayer'` entries build
      per player in `JOIN` (count isn't knowable any earlier). Both
      idempotent on reconnect, matching D17's existing personal-zone
      pattern exactly.
- [x] Two new presets: "Solitaire" (4 `foundation` + 7 `cascade`,
      `cardsPerPlayer: 0`), "Spit" (2 `rankAdjacent` + a per-player
      `cascade`, `cardsPerPlayer: 0`) — plus matching `RULES_REFERENCE`
      entries (Smith Gate 1's existing linkage requirement).
- [x] Smith Gate 2: preset preview text now names the declared table
      layout (`describeConfiguredZones`, main.js) alongside the
      existing deck/deal prefill, visible the instant the host selects
      the preset — before Create Table, not only after.
- [x] Real finding, disclosed: `cardsPerPlayer >= 1` was an existing
      test invariant: Solitaire/Spit legitimately need `0` (the whole
      deck goes to declared zones, not a hand) — relaxed to `>= 0` with
      the reason written into the test, not silently loosened.
      `#cards-per-player`'s HTML `min` also updated 1→0 to match.
- [x] 15 new tests across `state.test.js`/`presets.test.js`. 288/288
      unit green. `lint:design`: same 3 pre-existing violations as the
      unmodified baseline (confirmed via `git stash` comparison) — zero
      regression, nothing this phase touched CSS/layout.

### Phase 66 — e2e verification ✅ DONE
- [x] Full `tests/e2e.smoke.mjs` run confirms Phase 62's refactor causes
      zero regressions (every existing zone/discard drop assertion
      passes unchanged).
- [x] Two new scenarios added: Solitaire preset builds its real table
      (4 foundation + 7 cascade zones, verified via `.zone[data-kind]`
      in the live DOM) reachable from host setup; Spit preset builds 2
      shared rankAdjacent piles + one cascade per player as each joins.
      Both go through the real host-setup form (preset select → preview
      text → Create Table → Deal), proving the DOM/UI wiring unit tests
      can't reach.
- [x] **Scope note, not silently dropped**: the accept/reject rule
      itself (legal move succeeds, illegal one throws) is NOT
      re-proven via simulated drag in this pass - `state.test.js`
      already proves it through the exact `reduce()` dispatch the host
      runs (3 dedicated end-to-end tests added in Phase 63/64), and a
      real Playwright drag would need a seeded/known deck to land a
      specific rank+suit, adding real flakiness risk for coverage this
      project already has at the correct layer.
- [x] Real, disclosed flake found while running this gate (unrelated to
      Sprint 22): the guest-identity-reconnect scenario
      ("the host must have issued the guest an identity to remember",
      ~line 1217) failed intermittently (2 of 5 runs total, including
      one on the unmodified baseline via `git stash`) - a timing race
      in the real WebRTC/PeerJS identity-announce path, not caused by
      this sprint's diff (zero session/identity/roster code touched).
      Confirmed not new: baseline fails at the identical assertion too.
      Logged to backlog below, not fixed here - out of this sprint's
      scope and pre-existing.
- [x] 2 full suite runs green after the new scenarios were added and
      fixed (join-flow selectors, `deal-btn` needed to reach the game
      screen before `.zone` elements render).

### Phase 67 — reserved bug-fix ✅ DONE, nothing found
- [x] Final regression pass: 288/288 unit green, 2 full e2e runs green,
      `lint:design` unchanged (same 3 pre-existing violations as
      baseline). No real findings to fix - same clean outcome as
      Sprint 13's Phase 61.

### Sprint 22 status — SHIPPED
6 phases (62-67), zero user-visible regressions on any existing kind,
3 new Pile kinds (foundation/cascade/rankAdjacent) proven against
Solitaire and Spit specifically per the user's own direction, `dropRule`
enum fully retired in favor of real polymorphism. One pre-existing e2e
flake found and disclosed (not caused by this sprint, not fixed here -
see USER_STORIES.md backlog).

## Sprint 23 ("pile-level actions, generalized") — US-60..63, D55 — PLANNED

Pure-logic-first, same discipline as every prior sprint. 68/69 (reducer
cases) before 70 (their UI). 71 (the new `groupId` field + `MOVE_PILE`,
pure) before 72 (its drag-and-drop UI) — Morpheus's D55 sequencing note:
US-63 is strictly larger than the other three and depends on nothing
they build, so it gets its own pure/UI pair rather than folding into 70.

### Phase 68 — `SPLIT_PILE` + `TAKE_PILE` reducer cases, `zone`/`discard` gain both in `pileActions` ✅ DONE
- [x] `SPLIT_PILE(pileId)`: guards kind (`zone`/`discard` only, same
      eligibility as `MOVE_PILE`) + ownership (personal pile: owner
      only) + `cards.length >= 2` (throw with a clear message);
      original pile keeps `ceil(n/2)`, new pile (`makeTableSidePile`,
      same `zoneId` - a sibling in the source's own Zone) gets
      `floor(n/2)`.
- [x] **Real design correction found mid-implementation, not in the
      original plan:** `TAKE_PILE`'s guard is NOT "every card satisfies
      `cardActions(...).includes('pickup')`" as originally specced -
      `discardPile.cardActions` is unconditionally empty by design
      (D45's "drop-only" single-card rule), so that check would make
      `take` permanently impossible on every discard pile, including
      Gin Rummy's - the story's own named use case ("picking up all of
      a discard pile"). Real fix: `TAKE_PILE` checks per-card
      visibility directly (`faceDown`/`faceUp`, the same "hidden"
      predicate `zonePile`/`discardPile` each already duplicate) and is
      NOT built on `transferCard` (the single-card MOVE_CARD/PICKUP
      machinery) at all - it's a genuinely different, bulk pile-level
      operation with its own ownership+visibility guard. Full record:
      `src/state.js`'s `TAKE_PILE` doc comment.
- [x] `zonePile.pileActions`/`discardPile.pileActions` gain `split`/
      `take`, gated `ctx.isOwner` (personal) or `ctx.isShared` (a new
      ctx field, `ui.js`'s call site - `isOwner` alone can't tell
      "shared" from "someone else's personal pile", both are `false`).
      `deck`/`hand`/`foundation`/`cascade`/`rankAdjacent` unchanged.
- [x] **Real bug caught before it shipped, not left for Trin to find:**
      offering `take` without a matching `ACTION_SPECS.take` entry
      crashed the entire app on deal (`ACTION_SPECS[id].destructive`
      reading `.destructive` off `undefined`) - `pileActions.js` gained
      a minimal `take` spec (`destructive: true`, no `target` - a
      button, not a drag gesture, same shape as `deal`/`shuffle`) as
      part of this phase rather than deferring the whole spec to Phase
      70, since the offer-layer change alone was already live and
      broken without it. `split`'s existing spec hint also generalized
      (was deck-specific wording) since `zone`/`discard` share it now.
- [x] TDD: 8 new tests (kind/ownership/size guards for both actions,
      odd-card rounding, no-partial-take, discard-pile-specifically,
      `pileActions` ctx dispatch). Mutation-verified the hidden-card
      guard has teeth.
- [x] **Disclosed, not fixed - grows an already-tracked backlog item:**
      `lint:design` 14 -> 15 at `phone-390x844` only (`Table Zone`
      newly overlaps `Bob Score-+`) - the new split/take buttons widen
      the Table Zone's header at narrow widths. Confirmed via
      `git stash` this is new to this diff, not pre-existing drift.
      Same root cause/category as the already-open "Table Zone overlap
      sizing"/per-seat anchor geometry items (`docs/ARCHITECTURE.md`
      Open Items) - one more entry in that same bucket, not a new
      distinct defect; not fixed here, that item's own scope.

### Phase 69 — `SET_PILE_ORIENTATION` reducer case (pure) ✅ DONE
- [x] `SET_PILE_ORIENTATION(pileId, faceUp)`: sets every card's
      `faceUp` uniformly. Reducer independently re-checks Smith's
      host-only(shared)/owner-only(personal) rule — not just trusting
      the offer layer, same D43 discipline as every other write-side
      guard. New `state.hostId` field (set once, at the first JOIN —
      the host always joins its own table before a share code exists
      for anyone else to reach it, D3) is what makes this check
      possible; DEAL/SHUFFLE_DECK deliberately NOT retrofitted with the
      same check (disclosed scope boundary, not an oversight).
- [x] `zonePile.pileActions`/`discardPile.pileActions` gain `hide`/
      `show` (mutually exclusive per current pile state — an all-face-up
      pile offers `hide`, anything else offers `show`, an empty pile
      offers neither).
- [x] TDD: authorization tests (non-host on shared pile rejected,
      non-owner on personal pile rejected), kind-eligibility test,
      redaction proven via the existing `redactCard` path (no new
      redaction logic needed). 336/336 unit green, both new guards
      mutation-verified.

### Phase 70 — Split/Take/Hide/Show reach the UI ✅ DONE
- [x] `ACTION_SPECS` gains `hide`/`show` (`target: null`, `destructive:
      false`). `take` already had a spec (Phase 68's crash-fix); `split`
      reuses the deck's existing entry, now also offered by `zone`/
      `discard`.
- [x] **Real bug found and fixed, not in the original plan:** the
      confirm dialog's hardcoded "Every player's current hand will be
      cleared" sentence (written for `reshuffleDeal` specifically) was
      silently inherited by `take` the moment it became `destructive`
      (Phase 68) - nonsensical for a pile take. Fixed for real: the
      confirm text is now built from each spec's own `hint` (which
      already states its real consequence), not a second hardcoded
      sentence.
- [x] Confirm-dialog wiring: `take` confirms unconditionally EXCEPT a
      1-card pile (Smith's ruling — identical in effect to that card's
      own un-confirmed `pickup`) via a new `opts.noConfirm` list,
      computed at the `renderPile` call site from the pile's own card
      count.
- [x] `main.js`: `onPileAction` now resolves the acted-upon pile's own
      `kind` before dispatching `split` — the deck's `SPLIT_DECK` and a
      zone/discard's `SPLIT_PILE` share the action id but are different
      reducer actions. New `performSplitPile`/`performTakePile`/
      `performSetPileOrientation`, host-local + guest-relay branched
      (open to any player, unlike the deck's host-only actions) with a
      try/catch + `window.alert` on the host-local path (Nielsen #9,
      matching `performSplit`'s existing precedent).
- [x] Verified live via real Playwright browser session (not just unit
      tests): played a card into the Table zone, confirmed
      Split/Take/Hide render in its `<header-actions>` row, clicked
      Hide → button flips to Show and the card's DOM gains `card-back`
      (real redaction round-trip), clicked Split on an empty pile →
      the reducer's rejection reaches the user via `window.alert` with
      its real message. Zero console/page errors. 336/336 unit green,
      `lint:design` unchanged (5, same pre-existing baseline).

### Phase 71 — real `Zone` entity (`state.zones`), `zoneId` field, `MOVE_PILE` reducer case, `<table-zone>` hardcode removed ✅ DONE
- [x] **Corrected mid-plan (direct user rejection of the original
      `groupId`-on-pile design, twice, same session):** Zone and Pile
      are different types, not the same thing wearing two names, and
      zone membership must come from config, not a hardcoded bundle in
      `main.js`/`ui.js`. See `docs/ARCHITECTURE.md` D55's corrected
      US-63 section for the full record of both corrections.
- [x] New additive `state.zones: [{id, name, ownerId}]` array — a real,
      independent entity. Every table-side pile gains a `zoneId` (a
      Zone's id, not another pile's id) naming which Zone's
      `<zone-panel>` box it renders inside.
- [x] `CREATE_ZONE` creates a Zone record + its first pile together
      (unchanged UX — "Add Zone" still adds one zone).
- [x] **Reverted the divergence above, direct user correction ("drop
      the old rules, layout is declarative now"):** `defaultZoneIdFor`
      still branched on `kind` - it had moved the special-casing from
      `ui.js` into `state.js`, not actually removed it. Replaced for
      real: only the deck and the default Table pile (the two
      ALWAYS-present structural piles) have their starting Zone named
      by a plain id-keyed constant (data, not a conditional); every
      other pile's Zone comes from its OWN declaration - Gin Rummy's
      discard now declares `zoneId: 'table-zone'` explicitly in
      `presets.js`. A live `CREATE_ZONE` (no declaration to read) is
      ALWAYS standalone now, including `kind: 'discard'` - a real,
      intentional behavior change from the retracted kind-based rule.
      Full record: `docs/ARCHITECTURE.md` D55, third correction.
- [x] **4th correction, direct user request ("we need an entity for
      zone - so zones can have names and types in the config"):**
      `GameConfig.zones` is now real Zone entities (`{id, name, type}`),
      independent of pile declarations - the pile-declaration field
      (old `zones` meaning) renamed to `GameConfig.piles`. `type`
      (`'shared'`/`'perPlayer'`) is a Zone's own derived type, dispatched
      through new `src/zones/zoneTypes.js` (`ZONE_TYPES`, mirrors
      `PILE_TYPES`) instead of `ui.js` branching on `ownerId`. A pile's
      `zoneId` is now VALIDATED against the declared registry at
      table-creation time - an undeclared reference throws, a real
      config error. Full record: `docs/ARCHITECTURE.md` D55, 4th
      correction. 322/322 unit green (4 new tests incl. the validation
      throw, mutation-verified), lint:design 14/14 identical, verified
      live (Solitaire + Gin Rummy screenshots, zero page errors).
- [x] `main.js`/`ui.js` read `zoneId` generically to group piles into
      `<zone-panel>`s. `<table-zone>`'s bespoke Deck+Table+Discard
      bundling code is DELETED - `renderZones` is one generic
      group-by-`zoneId` operation now, zero special-casing.
- [x] `MOVE_PILE(pileId, targetZoneId)` sets the dragged pile's
      `zoneId` directly; restricted to `zone`/`discard` kinds only
      (`deck`/`hand`/`foundation`/`cascade`/`rankAdjacent` rejected —
      `deck` explicitly, per D55's found-by-identity note). Dropping
      always creates a new sibling pile in the target Zone, never a
      merge (Smith's ruling).
- [x] Ungrouping = a fresh standalone Zone record created for the
      dragged pile, `zoneId` pointed at it — every table-side pile
      belongs to exactly one Zone always, never a null/no-zone state.
- [x] TDD: 10 new tests (Zone creation across every pile-creation path,
      `MOVE_PILE`'s eligibility/target/ungroup cases, `viewFor`'s
      `zoneRecords`). Mutation-verified the eligibility guard has teeth.
      `SNAPSHOT_VERSION` bumped 2->3 (an old snapshot's piles lack
      `zoneId`, would silently mis-render). 318/318 unit green,
      `lint:design` 14/14 confirmed byte-identical to the `git stash`
      baseline. Live-verified via ad-hoc Playwright script + screenshot:
      Solitaire's 11-zone table renders pixel-identical to before.

### Phase 72 — Pile-title drag-and-drop between zones (UI) — DONE (bloop, 2026-08-26)
- [x] Drag handle is the pile's own `<header-actions>` title bar (D54),
      not the pile body — must not be confused with a card drag. Native
      HTML5 DnD (`draggable`/`dragstart`), a `pile-drag:<id>` payload
      distinct from a card's own bare id and from a pile-ACTION token
      (`pile-action:<id>`, Draw) — every drop target tells all three
      apart at drop time (`pileDragFromDrop`/`pileActionFromDrop`,
      `ui.js`). Only a `reparentable` kind's title becomes draggable at
      all (`isReparentable`, `pileActions.js` — reads each Pile class's
      own `static reparentable`, D56).
- [x] Drop-target highlight reuses `.zone-drag-over` (Smith's Gate 2
      note #1) while dragging over an eligible target Zone's box.
- [x] An explicit, equally-visible "drop here to ungroup" target (an
      open area of `#zones`) for pulling a grouped pile back out
      (Smith's Gate 2 note #2) — creates a fresh standalone Zone per
      Phase 71's ungrouping design (`MOVE_PILE` with no target).
- [x] Verify live via screenshot: drag a standalone pile's title into
      another Zone, confirm it renders as a sibling there; drag it back
      out via the `#zones` background, confirm it's standalone again;
      confirm the Table Zone (Deck+Table) still renders identically to
      before. Done — see `agents/CHAT.md`/state files for the session.
- **Real gap found+fixed along the way**: `MOVE_PILE`'s own eligibility
      check was a hardcoded `pile.kind !== 'zone' && pile.kind !==
      'discard'` literal — D56's `reparentable` flag existed and was
      documented but never actually wired to it, and was WRONG on 3
      classes (`FoundationPile`/`CascadePile`/`RankAdjacentPile`
      inherited the base `Pile` default `true` instead of `false`).
      Fixed both: the flag values, and `MOVE_PILE` now reads
      `PILE_TYPES[pile.kind]?.reparentable` instead of its own copy.
- **Extension beyond the original AC, direct user request** ("piles,
      zones and cards must all be Movable... a card dropped in a zone
      will create a new pile"): new `CREATE_PILE` reducer action
      (`state.js`) — a card dropped on a Zone's own empty space (not
      onto any existing pile) atomically spawns a new pile there,
      seeded with that card, reusing `transferCard`'s full
      authorization/`canAccept` pipeline (same PLAY-vs-MOVE branching
      `dropCardOnZone` already makes, so hand-sourced drops get PLAY's
      visibility transform and table-sourced drops keep their existing
      owner/faceUp).

### Phase 73 — reserved bug-fix + full regression
- [ ] Full regression: unit + `lint:design`. (`npm run test:e2e` no
      longer exists — `tests/e2e.smoke.mjs` was removed in the
      tech-debt sprint, 2026-08-27, having drifted into asserting
      against DOM containers retired well before Phase 72; see
      `docs/ARCHITECTURE.md`'s Testing Strategy.)

---

## Sprint: Tech Debt — lints, dead code, DRY (US-64..68, D58)

### Phase 74 — ESLint wired in (US-64) ✅ DONE
- [x] `eslint` + `eslint-plugin-unicorn` + `eslint-plugin-sonarjs`
      installed. `eslint.config.js` (flat config) per D58. `npm run
      lint` gains `lint:js`. Baseline: 1021 findings.

### Phase 75 — fix all lint findings (US-65) ✅ DONE
- [x] 1021 → 7 findings. Real fixes applied (autofix pass reviewed by
      hand, manual renames/rewrites, dead code removed as found). 7
      remaining are all `sonarjs/cognitive-complexity` - deliberately
      flagged, not fixed under pressure (D58's own AC). Several rules
      disabled with documented per-rule justification where they
      genuinely conflicted with this codebase's architecture (D59) or
      would have been actively wrong (e.g. `unicorn/no-null` vs the
      wire/persistence layer's real use of `null`).
- [x] Two near-miss regressions caught and reverted before shipping,
      not applied blind: `passed?.[p.id]` (value check, not existence -
      `Object.hasOwn` would have been wrong) and
      `Number.parseFloat(cs.maxWidth)` (CSS px-string parsing -
      `Number()` would return `NaN`).
- [x] `npm test` green throughout every batch.

### Phase 76 — cut dead code (US-66) ✅ DONE
- [x] Reference-audited every exported JS symbol (1 dead: `cardLabel`)
      and every CSS class selector (8 orphaned rules from retired
      features). No back-compat aliases kept.
- [x] `npm test` green after each deletion batch; `lint:design`
      confirmed identical pre-existing violations (no visual
      regression).

### Phase 77 — cut dead/superseded tests (US-67) ✅ DONE
- [x] Found something much bigger than a routine dead-test trim:
      `tests/e2e.smoke.mjs` (1692 lines, monolithic) asserted against
      DOM ids (`#hand-area`/`#table-area`/`#seat-zones`) retired by
      D51/D52 and absent from the current app entirely - escalated to
      the user rather than deciding unilaterally (see D60). User chose
      deletion over deferring a rewrite or attempting one now.
- [x] No net loss of coverage for code that's still live - the unit
      suite (358 tests) never depended on the removed file.

### Phase 78 — DRY pass + final regression (US-68) ✅ DONE
- [x] Found and consolidated real duplication: the entire pointer/touch
      event-wiring block was copy-pasted between `attachTouchDrag` and
      `attachPileActionTouchDrag` (`ui.js`) - extracted into one shared
      `wireTouchDragEvents()`. No speculative new abstractions attempted
      beyond this one confirmed, already-present duplication.
- [x] **Found and fixed a real live bug while consolidating**: the two
      copies had drifted - one was missing a guard, and the pile-action
      drop handler checked `#hand-area` (also retired by D51/D52,
      unrelated to but same root cause as Phase 77's finding). Touch-
      dragging a pile action onto your hand had done nothing since that
      redesign shipped. Fixed to `[data-kind="hand"]`; verified via a
      live bisection (broken on the pre-fix baseline, working after).
- [x] Full regression: `npm test` 358/358, `npm run lint` (style +
      design + js) all consistent with the established baseline
      (`test:e2e` no longer exists - D60). Sprint-close groom next.

---

## Sprint: Save Layout, Remove Zone/Pile, changePileType (US-69..73, D61-D63)

Data-layer phases (79-81, pure reducer/module logic, no DOM) before UI
phases (82-84), same split pattern as prior sprints. Phase 85 reserved
bug-fix, carried forward per standing convention.

### Phase 79 — REMOVE_ZONE / REMOVE_PILE reducer actions (US-71/72, D62) ✅ DONE
- [x] `REMOVE_PILE`/`REMOVE_ZONE` implemented per spec, plus a live
      catch: the default Table pile (`id: 'table'`, `kind: 'zone'`)
      wasn't exempt from `REMOVE_PILE` even though its Zone record is
      exempt from `REMOVE_ZONE` - added a matching exemption.
- [x] TDD, 15 new tests (happy path + every throw condition, incl. the
      Table-pile exemption).

### Phase 80 — CHANGE_PILE_TYPE reducer action (US-73, D63) ✅ DONE
- [x] `CHANGE_PILE_TYPE` + `ACTION_SPECS` entries (`remove`,
      `changePileType`), wired into `Pile.pileActions()` base method
      (covers `zone`/`discard`, both inherit it unchanged).
- [x] TDD, 7 new tests. lint:js caught 3 real findings in the new code
      (boolean naming, condition order) - fixed immediately.

### Phase 81 — `src/layoutOverrides.js` module (US-69/70 foundation, D61) ✅ DONE
- [x] Module built as specified: `saveLayoutOverride`/
      `loadLayoutOverrides`/`deleteLayoutOverride`/`overridesForPreset`/
      `stableLayoutSubset`, storage-injected like `panelLayout.js`.
- [x] TDD, 14 new tests incl. `stableLayoutSubset` excluding a
      random-UUID id and a per-player id. lint:js caught 4 findings,
      fixed.

### Phase 82 — Remove Zone/Pile UI wiring (US-71/72 UI) ✅ DONE
- [x] `remove` reaches the pile's own ActionBar automatically (offered
      by `Pile.pileActions()`, Phase 80) - `performRemovePile`
      (main.js) dispatches `REMOVE_PILE`. Zone removal is a new heading
      action (`renderZonePanel`, ui.js), `performRemoveZone` dispatches
      `REMOVE_ZONE`. Both exempt `table-zone`/the default Table pile at
      the UI layer too (found live while smoke-testing: an
      always-offered-then-always-rejected button on the one pile every
      game has - fixed by filtering `remove` out for `zone.id ===
      'table'`, matching the Table-Zone exemption already in
      `renderZonePanel`).
- [x] `window.alert(error.message)` surfaces the reducer's block
      message verbatim - same precedent `performSplitPile`/
      `performTakePile` already established (Gate 1 Nielsen #9).

### Phase 83 — changePileType UI wiring (US-73 UI) ✅ DONE
- [x] Landed together with Phase 82 (same `onPileAction` dispatch
      table) - `performChangePileType` toggles `zone`<->`discard`
      based on the pile's current kind.

### Phase 84 — Save/SaveAs/Reset Layout UI (US-69/70 UI, Gate 1 + Gate 2 conditions) ✅ DONE
- [x] Save/SaveAs/Reset Layout buttons + persistent disclosure caption
      (`#layout-controls`, index.html/style.css), host-only (hidden for
      guests - `updateLayoutControlsVisibility`, since a saved override
      is keyed to `selectedPreset`, host-local knowledge).
- [x] Save/SaveAs both confirm via `alert` naming the saved layout
      (Gate 1). SaveAs prompts for a name (prefilled via the browser
      prompt's default arg = preset name), confirms before overwriting
      an existing name.
- [x] "Layout" selector added next to the preset dropdown
      (`#host-layout-row`, hidden until a preset is chosen), populated
      from `overridesForPreset` on preset change; the chosen override's
      `layout` (or the preset's own built-in one) feeds
      `applyPresetLayout` at table-create, unchanged call shape.
- [x] design-lint caught a real regression while wiring this: the new
      control bar forced 1px of scroll at the 1024x768 viewport -
      trimmed margins/font-size, confirmed clean (3 pre-existing
      baseline violations, no new ones).
- [x] Live-verified (Playwright against the real dev server, not
      assumed): Save Layout on War shows the exact confirmation
      dialog; SaveAs on Gin Rummy prompts, saves under a custom name;
      Reset confirms then reports; zero page exceptions throughout.
      Confirmed visually that the Table pile's ActionBar shows
      split/take/changePileType but NOT remove (the live-caught fix
      above, verified working).

### Phase 85 — reserved bug-fix + full regression ✅ DONE
- [x] Filled by a run of direct post-launch *nits, not a formal Trin/
      Smith close-out pass - all still went through TDD + live
      Playwright verification before being called done:
      - **D64**: deck reparentable (drag between Zones) - Sprint 23's
        exclusion re-checked against the actual code and reversed.
      - **D65**: real bug fix - Draw's drag-to-hand was silently
        clobbered by the pile-title's own drag (`dragstart` bubbling,
        no `stopPropagation`).
      - **D66 -> D67**: two iterations to get pickup/drop semantics
        right. D66 widened Draw's action-token drag to the card visual;
        direct correction ("drop isn't triggering an action, it's
        moving cards") led to D67, which retired the action-token
        mechanism outright and exposed a hidden pile's real top-card id
        (deliberate, disclosed narrowing of D23's privacy rule) so the
        deck's card uses the EXACT SAME generic per-card drag/drop
        every other pile already had. No new reducer action needed.
      - Remove/changePileType buttons now disabled (hidden, same
        mechanism as Deal at 0 cards) unless the pile/zone is actually
        empty (Nielsen #5, error prevention over error messages).
      - Deal-count input widened + restyled as a pill (matches
        deck-count-badge); a real overlap bug this surfaced (badge's
        shifted position was never reserved for) fixed at the cause.
      - `lastDealCount` now initializes from the preset's own
        `cardsPerPlayer` instead of a hardcoded 1.
- [x] Full regression: `npm test` 396/396, `npm run lint` (style/
      design/js) baseline unchanged throughout every change (7
      pre-existing `cognitive-complexity` findings, 3 pre-existing
      `lint:design` overlaps).

---

## Sprint: Convert Pile Actions (US-74, D71)

Single Fast-Track phase (Phase 86) - matches Sprint 5's precedent:
small, well-scoped, one file family of changes (pileTypes.js constant +
state.js reducer + 3 pile-class pileActions overrides + main.js cycle
logic), no multi-phase data/UI split needed.

### Phase 86 — changePileType 5-kind cycle (US-74, D71) ✅ DONE
- [x] `CHANGE_PILE_TYPE_CYCLE` constant (`pileTypes.js`), single source
      of truth for reducer + UI.
- [x] `CHANGE_PILE_TYPE` reducer widened to cycle membership (both
      source/target); `isDefaultPileName`/`defaultKindName` helpers;
      auto-rename on conversion per Gate 1.
- [x] `MeldPile` (covers `FoundationPile`)/`CascadePile`/
      `RankAdjacentPile.pileActions()`: add `changePileType`, same
      `isOwner`/`isShared` gate as `Pile`'s own.
- [x] `main.js`'s `performChangePileType` dispatch: advances to the
      NEXT kind in `CHANGE_PILE_TYPE_CYCLE` (wrapping), not the old
      hardcoded 2-way flip.
- [x] TDD, 12 new tests. Live-verified (Playwright): cycling through
      all 5 kinds wraps correctly against the real running app;
      confirmed the built-in "Table" pile is correctly NOT
      auto-renamed (not a D70 default pattern). Auto-rename itself
      covered by 2 dedicated unit tests (unnumbered + numbered
      default); a live drag-to-create-then-convert check was
      inconclusive (same Playwright drop-target flakiness noted at
      D70) - disclosed, not forced.
- [x] Full regression: `npm test` 408/408, lint baseline unchanged (7
      pre-existing `cognitive-complexity`, 3 pre-existing
      `lint:design`).
