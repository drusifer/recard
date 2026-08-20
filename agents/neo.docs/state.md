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

### Sprint 3 ("zones, presence, hand tools") in progress
- [x] Phase 12 (T12.1-T12.3): src/state.js zones model — CREATE_ZONE,
      MOVE_CARD (auth mirrors REVEAL), PLAY+optional zoneId,
      REVEAL/PICKUP search all zones by globally-unique card id (zero
      signature change). RESET preserves zone structure, clears cards
      only. 12 new tests, 49/49 total, first-try pass. Kept e2e green via
      a transitional `view.table` alias — confirmed working, `npm run
      test:e2e` unchanged/green with zero UI code touched yet.
- [x] Trin UAT phase 12 PASS, Morpheus review PASS
- [x] Phase 13 (T13.1-T13.3): DEAL_MORE (factored `dealCards()` shared
      helper out of DEAL rather than duplicating round-robin logic),
      pass marker (state.passed, TOGGLE_PASS, RESET clears passed but
      not scores - regression-tested that divergence explicitly). 6 new
      tests, 55/55 total, first try. e2e still green.
- [x] Trin UAT phase 13 PASS, Morpheus review PASS
- [x] Phase 14 (T14.1-T14.2): src/handOrder.js — reconcileOrder (keeps
      existing/appends new/drops removed), sortByRank/sortBySuit (JOKER
      always last, suit tiebreak on rank sort and vice versa). Pure, no
      DOM - this is the actual fix for the Sprint-1 "drag reorder doesn't
      persist" tech debt, ready to be wired into main.js/ui.js in phase
      18. 10 new tests, 64/64 total, first try. e2e unaffected (data-
      layer phases 12-14 all complete now).

**All 3 data-layer phases done — moving to UI phases 15-18 next.**
- [x] Trin UAT phase 14 PASS, Morpheus review PASS
- [x] Phase 15 (T15.1-T15.2): renderZones() replaces renderTable(),
      removed the transitional view.table alias (full suite re-run after
      removal proved it safe). Zone creation control + per-card "Move
      to…" select (only shown when relevant). Live 2-browser check:
      zone creation and MOVE_CARD both propagate correctly over real
      WebRTC, screenshotted and confirmed. npm test 64/64, e2e green.
- [x] Trin UAT phase 15 PASS (incl. independent privacy-authorization
      test I hadn't covered), Morpheus review PASS
- [x] Phase 16 (T16.1-T16.2): renderDeck() visual stack+badge (lobby +
      game screen), renderMiniHand() compact opponent-hand fan. Caught
      and fixed a REAL bug via screenshot verification: mini-hand cards
      were invisible (same background color as their container) - fixed,
      re-screenshotted to confirm visible before calling it done, not
      just assumed fixed from reading the CSS diff.
- [x] Trin UAT phase 16 PASS (incl. independent 0-cards/0-opponent edge
      case checks), Morpheus review PASS
- [x] Phase 17 (T17.1-T17.3): pointer-down cursor broadcast (normalized
      0-1, existing motionThrottler, zero protocol changes per D13),
      updateRemoteCursor/removeRemoteCursor (labeled dot, TTL auto-
      clear), card-lift cue via pointerdown/up/leave on zone cards
      (privacy-safe - only id broadcast). Live 2-browser check: cursor
      appears/labeled/clears correctly, card-lift propagates live, both
      screenshotted. npm test 64/64, e2e green.

### Post-launch UX overhaul (2026-08-15, user: "the ux is dog shit")
Smith ran a full audit (agents/smith.docs/uat-report-ux-audit.md), 5
findings. Fixed all 5, UI-only (no state/protocol changes):
- Design system: replaced the single flat blue-everywhere button with a
  real hierarchy (`.btn-primary` solid blue, default = neutral secondary,
  `.btn-danger` red-outlined for Reshuffle/Reset Scores).
- `.panel`/`.panel-felt` wrap every logical section (Table/Players/Your
  hand, host-share, forms) instead of a flat unstructured stack - Table
  gets a subtle green felt tint as a nod to a real card table.
- Cards redesigned as proper corner-index playing cards (rank+suit
  top-left, big centered suit pip, rounded corners, shadow) instead of a
  bare concatenated string - restructured `cardEl()` in ui.js into
  corner/pip child spans; no test depended on the old flat textContent,
  confirmed via grep before changing it.
- `#screen-game` gets a wider max-width (760px) than form-style screens
  (480px) so cards/roster/hand actually use desktop space instead of
  sitting in a narrow column in a sea of black.
- Fixed "1 deck(s), 0 joker(s)" grammar via a small `describeDeckConfig()`
  pluralization helper, reused in both places it was duplicated.
Verified via fresh screenshots at both 390px and 1280px - genuinely
different, not just "technically changed." 41/41 unit + e2e green
throughout (zero functional regressions, this was pure CSS/markup/one
small ui.js restructure).

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

- [x] Phase 18 (T18.1-T18.3): sort-rank/sort-suit buttons wired to
      handOrder.js (main.js's `orderedHand()` calls reconcileOrder on
      every render, sort buttons + drag's `onReorder` callback both write
      into the same `handOrderIds`, matching D14/Smith Gate 1 - verified
      live that a Deal More after sorting keeps the sorted 5 in place and
      appends the new card at the end, not just eyeballed). Deal More
      button + count input both host-only-hidden (found and fixed a
      stray-input gap myself: the count input wasn't hidden alongside its
      button for guests, a Smith Gate-close-style "no orphaned control"
      issue). Pass toggle dispatches TOGGLE_PASS (self only, matches
      US-13 precedent), roster tag already existed from Phase 13's data
      layer, button label flips Pass/Unpass on state.

      **Found + fixed a real pre-existing bug while regression-testing**:
      tests/e2e.smoke.mjs's US-11 drag-motion assertion (mouse.down/move
      raw input) timed out deterministically - confirmed via isolation
      (swapped back to the exact turn-start main.js/ui.js, still failed)
      that this was NOT caused by Phase 18. Root cause: Chromium's native
      HTML5 drag-and-drop arbitration doesn't fire from Playwright's raw
      synthetic mouse input in this headless host (no Xvfb/DISPLAY
      available) - a browser/environment limitation, not an app bug.
      Fixed by rewriting that one assertion to dispatch real `DragEvent`s
      (`dragstart`/`dragend` with a `DataTransfer`) directly instead of
      relying on native low-level-input drag arbitration - still exercises
      the real app-level dragstart/dragend handlers, just doesn't depend
      on the flaky browser internal. 3/3 stable e2e runs after the fix.

      Also ran an ad-hoc 2-browser Playwright check (screenshots saved to
      scratchpad) confirming all 3 features live over real WebRTC before
      calling this done - sort-by-rank/suit produce correct order, Deal
      More preserves existing hand order, pass marker propagates to the
      OTHER client's roster and clears on second toggle.
      npm test 64/64, npm run test:e2e 3/3 stable.
- [x] task.md checkboxes/status line updated for Phases 12-18 (they were
      stale - said "Not started" despite being done and CHAT'd).

- [x] Phase 18 UAT PASSED (Trin), code review PASSED (Morpheus) - see
      CHAT.md 20:50/20:51.
- [x] Phase 19 (final implementation phase, T19.1-T19.3): folded every
      ad-hoc-verified Phase 18 behavior into the formal
      tests/e2e.smoke.mjs suite instead of leaving it only manually
      checked:
      - Zones (US-19/D12): CREATE_ZONE propagates live, MOVE_CARD
        relocates a card between zones (verified via the zone's own
        count going 0->1), PICKUP from that non-default zone (not just
        the default one - D12's actual point, that REVEAL/PICKUP search
        ALL zones by card id).
      - DEAL_MORE (US-24/D15): hand grows by the exact requested count
        AND an explicit assertion that every pre-existing card id is
        still present (not just a count check - actually proves nothing
        got discarded), roster count propagates to the other client.
      - Pass marker (US-25/D16): toggle propagates, clears on second
        toggle.
      - Hand sort persistence (US-23/D14) - **the actual regression test
        Sprint 1's retro item was asking for**: sort, then trigger a
        real state broadcast (Draw), assert the sorted prefix is
        byte-for-byte unchanged and the new card only appends at the
        end. This is the test that would have caught the original bug.
      - Cursor broadcast (US-22/D13): real pointerdown+move (not native
        drag - plain pointer events fire fine from synthetic input, only
        HTML5 DnD arbitration doesn't), asserts the label matches the
        sender's name AND that a client never renders its own cursor
        back at itself (both halves of the requirement, not just the
        happy path).
      Hit one real test-authoring bug while writing the cursor check:
      first attempt anchored mouse coordinates to an `<h2>`'s
      boundingBox() without scrolling it into view first - by that point
      in the test the page had scrolled and the box came back with a
      negative y (off-screen), so the synthetic mouse events silently
      landed nowhere and the test hung. Fixed by calling
      `scrollIntoViewIfNeeded()` before reading the box - a good example
      of why "it times out" always deserves a real root-cause look, not
      a bigger timeout.
      Also did the T19.3 visual pass this sprint's density risk warranted
      (Smith flagged zones/hand-tools stacking up as a scalability risk):
      screenshotted a populated game screen (2 zones, hand + face-down
      buttons, Deal More, sort/pass row) at 390px and 1280px - both clean,
      no overflow, everything wraps sensibly. Screenshots in scratchpad
      (not committed, ad-hoc verification artifacts).
      npm test 64/64, npm run test:e2e 3/3 stable runs, both independently
      re-run after every fix, not just once.

### Immediate Next Action
Handed to Trin for Phase 19 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 19 (final implementation phase). After that:
Morpheus review, then Stage 3 close (Oracle groom -> Smith end-to-end
test -> Phase 20 bug-fix phase if Smith finds anything -> retro ->
Cypher launch), matching the Sprint 1/2 close-out pattern.

- [x] Phase 20 (T20.1): fixed Smith's mini-hand duplicate-count finding.
      Chose to drop the redundant count from `renderMiniHand`'s own badge
      (removed it entirely) rather than from the roster row's `(N cards)`
      text, since the row text is the one place that already serves BOTH
      "you" and other players consistently (the mini-hand fan only ever
      renders for others) - keeping it means every player's count is
      still shown exactly once, in exactly one place, regardless of
      viewer. The fan of card-backs alone still conveys "they're holding
      cards" (US-21's actual point) without repeating the exact number.
      Also added `.mini-hand { margin-left: 0.5rem }` so it no longer
      runs flush against whatever text precedes it. Removed the now-dead
      `.mini-hand-count` CSS rule (grepped first to confirm no other
      caller). Re-ran Smith's exact dense repro scenario (390px, 3 zones,
      full hand, pass marker, long name) and visually confirmed: clean
      spacing, count shown once. npm test 64/64, e2e 3/3 stable.

### Immediate Next Action
Handed to Trin for Phase 20 UAT.

### Waiting On
@Trin: UAT sign-off on the mini-hand fix, then Morpheus review, then back
to Smith to close out uat-report-sprint3.md.

### Planned Work
- [ ] None pending - Sprint 3 is fully shipped.

## Sprint 4 ("top-down table redesign")
### Progress
- [x] Phase 21 (T21.1-T21.2): `zones` entries gain optional `ownerId`;
      extracted `makeZone(name, ownerId)` so `CREATE_ZONE` and `JOIN`'s
      new personal-zone creation share one construction path instead of
      duplicating id-generation logic. `JOIN` guards against creating a
      second personal zone on re-join (checks `zones.some(z => z.ownerId
      === playerId)` first), same "preserved not reset" spirit as
      scores/passed.

      **Found and fixed 6 existing tests with a real correctness gap**
      while regression-testing, not just a cosmetic one: several
      pre-Phase-21 tests captured `state.zones[1].id` as "the zone I just
      created" (e.g. `discardZoneId`), which was only correct because no
      players had personal zones yet. Once JOIN started appending
      personal zones, `zones[1]` silently became a DIFFERENT player's
      personal zone in several tests instead of the named zone the test
      claimed to be exercising - most of these didn't fail (the
      assertions were self-referential enough to still pass), they just
      quietly started testing the wrong zone. Fixed all 6 by looking
      zones up by name (`zones.find(z => z.name === 'Discard')`) instead
      of position - robust regardless of how many other zones exist.
      Added 5 new dedicated tests for D17 itself (creation, uniqueness
      across players, re-join doesn't duplicate, full PLAY/MOVE_CARD/
      REVEAL/PICKUP parity, viewFor exposes ownerId). 69/69 unit tests
      (was 64), e2e still green 2/2 stable runs (personal zones show up
      as ordinary extra zones in today's UI for now - Phase 22/23 gives
      them their spatial seat placement, this phase was data-layer only
      per the sprint plan).

### Immediate Next Action
Handed to Trin for Phase 21 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 21.

- [x] Phase 22 (T22.1-T22.2): `seatedOrder()` in main.js rotates the
      roster so the viewer is always first (D18); `renderRoster` grew a
      `seated` option that positions each `<li>` absolutely around the
      new `.table-surface` oval via `seatPosition(index, count)` (pure
      geometry, radius 42% to stay inside the surface), plus an explicit
      "🧑 You" text tag + a border highlight on the viewer's own seat
      (Smith Gate 1 - two independent signals, not just position). Host-
      setup screen's roster (`#host-roster`, pre-deal) deliberately
      untouched - stays a flat list, this redesign is scoped to the game
      screen per US-26.

      **Found and fixed a real bug via the e2e suite, not just
      eyeballed**: the absolutely-positioned `<ul>` (needed as a
      positioning frame spanning the whole surface) was silently
      intercepting clicks meant for zone buttons underneath it -
      `pointer-events: none` on the list, `auto` back on individual
      seats, fixed it. Caught because the e2e suite actually tries to
      click through it, not because it looked wrong in a screenshot.

      **Found and worked around a second real bug, pre-existing and
      unrelated to this phase**: simultaneous (not sequential) Joins
      crash the host with a stack overflow inside PeerJS's own msgpack
      packer - reproduced identically on the last commit, so not
      something I broke. Filed to Cypher's backlog (Phase 27 candidate),
      worked around it in my own verification script by joining
      sequentially like the existing e2e suite already does.

      Verified visually at 390px (3-player) and 1280px (2-player): D18's
      per-viewer rotation genuinely works - Alice's own screen seats
      Alice at the bottom, Bob's own screen seats Bob at the bottom,
      confirmed via two independent screenshots from two different
      clients in the same session. One known rough edge, expected and
      scoped to Phase 23: personal zones (Phase 21) still render in the
      flat zone stack for now, crowding the seats visually at 3 players -
      Phase 23 moves them onto the seats themselves, which should
      resolve this. 70/70 unit, e2e 3/3 stable after the pointer-events
      fix.

### Immediate Next Action
Handed to Trin for Phase 22 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 22.

- [x] Phase 23 (T23.1-T23.2): `renderZones` now takes an optional
      `allZones` override so it can render a FILTERED (shared-only) list
      while still offering every zone (incl. personal ones) as a "Move
      to…" destination. New `renderSeatZones()` places each personal zone
      at its owner's seat using the same `seatPosition()` geometry as
      roster seats, just a smaller radius (26 vs 42) so it sits toward
      the center - "in front of" the seat rather than at the table's edge.

      **Found and fixed a second real bug via e2e, more serious than
      Phase 22's**: once personal zones moved to their own absolute
      position, they visually overlapped the shared zones' in-flow
      content and started covering real buttons (not just a stray full-
      surface pointer-events issue this time - actual spatial collision
      between two different zones' cards). Fixed properly, not just
      patched: gave `#table-area`/`#game-deck-area` a bounded, centered
      footprint (`max-width`, `max-height` + scroll) instead of letting
      shared content grow into the personal-zone ring. This is the real
      fix for the crowding I'd flagged as a known rough edge in Phase 22
      - confirmed resolved, not just deferred again.

      Hand spread (US-30): rotation + a slight vertical arc per card
      (`transform-origin: bottom center`, pivoting like cards actually
      fanned in a hand), deliberately NOT horizontal overlap - overlap
      would shrink a covered card's real tap target below the 44px floor
      Smith's Gate 1 amendment requires, rotation alone never touches
      hit-testing. Hit a real layout bug fanning this into flex-wrap:
      the 5th+ card wrapped onto a visually-broken second row once
      rotated - fixed by making the hand scroll horizontally instead of
      wrapping (verified via script: all 7 cards of a 7-card hand stay in
      the DOM and reachable, `scrollWidth > clientWidth` confirmed, none
      lost - just requires a swipe on a big hand, a legitimate mobile
      pattern, not a fanciness-over-usability tradeoff. No affordance
      hinting "more cards to the right" yet - flagging for Smith's
      close-out review rather than guessing at a fix now).

      70/70 unit, e2e 3/3 stable throughout both fixes.

### Immediate Next Action
Handed to Trin for Phase 23 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 23.

- [x] Phase 24 (T24.1-T24.2): factored zone-panel rendering into a
      shared `renderZonePanel()` (was duplicated between `renderZones`/
      `renderSeatZones`) so the new drop-target wiring only needed to be
      written once. Zones gained `dragover`/`dragleave`/`drop` handlers
      (`onDropCard(cardId, zoneId)`); main.js's new `dropCardOnZone()`
      checks whether the card is currently in the viewer's hand (PLAY)
      or already on the table (MOVE_CARD) and dispatches accordingly -
      the drop target itself doesn't need to know which. `playCard()`
      grew an optional `zoneId` param (state.js's `PLAY` reducer already
      supported this since D12, just never had a caller use it) so a
      drag can actually land a card in a SPECIFIC zone, not just the
      default one. Middle-cards became draggable exactly where
      `MOVE_CARD`'s own authorization would already permit a drop to
      succeed (mirrors precisely where the existing "Move to…" control
      is shown, so no new authorization surface). Drop-target highlight
      via a `.zone-drag-over` class, cleared on drop/dragleave. Verified
      no conflict with the existing card-lift pointer-based cue (a risk
      I flagged going in, given middle-cards are now ALSO draggable) -
      confirmed via a real click-drag test that the lift cue still fires
      cleanly. Tap-to-play and the Move-to dropdown both independently
      re-verified still working unchanged. 70/70 unit, e2e 3/3 stable.

      **User asked to switch to TDD partway through this phase** -
      Phase 24 itself was implemented-then-verified (same order as
      Phases 21-23). Adopting test-first for Phase 25 onward: writing
      the e2e assertions for live card-drag broadcast BEFORE wiring the
      feature, confirming they fail for the right reason first.

### Immediate Next Action
Handed to Trin for Phase 24 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 24.

- [x] Phase 25 (T25.1-T25.2), done test-first per the user's TDD request:
      1. Wrote 5 unit tests for `cardDragPayload()` (new pure function in
         protocol.js) BEFORE it existed - confirmed the import itself
         failed first, then implemented until all 5 passed. The privacy
         rule collapses to one condition (`card.faceUp === true`),
         proven sufficient by the same MOVE_CARD-authorization argument
         Morpheus's D19 architecture already made.
      2. Wrote the e2e assertions (real face while dragging a public
         card, anonymous back for a still-hidden one, ghost clears on
         dragend, dragger never sees their own ghost) directly into
         `tests/e2e.smoke.mjs` BEFORE wiring the feature - confirmed the
         suite failed at that exact point (no `[data-card-drag-id]`
         anywhere yet), then implemented until it passed.
      3. Implementation: `renderHand`/`renderZoneCards` gained an
         `onCardDrag` callback fired on the native `drag` event (fires
         continuously during a real drag, unlike `dragstart`/`dragend`);
         `dragend` sends a `card: null` "stopped" signal so the ghost
         clears promptly on a normal drop instead of waiting out the
         full TTL. `updateCardDragGhost`/`removeCardDragGhost` in ui.js
         mirror the existing cursor pattern exactly. main.js's
         `resolveVisibleCard()` looks up a broadcast `cardId` against the
         receiver's OWN already-known view (the broadcast itself never
         carries rank/suit, by design - minimal data, and the same
         reasoning D19 used: nothing here is a second path to leak
         information beyond what `viewFor`'s existing redaction already
         allows this viewer to see).

      Hit two real test-authoring bugs while writing the e2e checks (not
      implementation bugs) - both self-caught before reporting: (a) first
      checked `[data-card-drag-id="<cardId>"]` when that attribute
      actually holds the DRAGGING PLAYER's id, not the card's - fixed to
      match the existing `[data-cursor-id]` presence-check pattern; (b) a
      throwaway visual-verification script computed the drag's screen
      coordinates from the WRONG client's viewport (host's 390px-wide
      screen used to compute a position later applied within join's own,
      differently-sized, screen) - caught because the ghost rendered
      nearly off-screen in a manual screenshot check, not because
      anything errored.

      86/86 unit (was 81), e2e 3/3 stable.

### Immediate Next Action
Handed to Trin for Phase 25 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 25.

- [x] Phase 26 (T26.1-T26.3, final implementation phase): folded personal
      zones (US-27) and drag-and-drop play/move + drop-target highlight
      (US-28) into `tests/e2e.smoke.mjs` - T26.2 (card-drag privacy) was
      already there from Phase 25's test-first work, nothing new needed.
      Ran the T26.3 density pass Smith's Gate 1 specifically asked for
      (~8-player table, mobile + desktop) and **found the risk was
      real**: 8 players badly overlapped on a 390px screen, cards
      genuinely illegible in places. Applied a real fix, not a token
      gesture - `.table-surface`'s height now scales with player count
      (`--seat-count` CSS var, set from `renderRosterOnly`) and seat
      cards got more compact (smaller max-width/font/padding). Re-checked
      after the fix: meaningfully better, but **honestly not fully
      resolved starting around 5 players on mobile** - the 44px
      score-button touch-target floor (an existing, non-negotiable
      convention from Sprint 2) puts a hard floor under how compact a
      seat card carrying score controls can get, and taller/8-per-row
      seats crowding the same narrow top band can't be solved by height
      alone. Did not paper over this - flagged clearly in task.md and
      here for Smith's close-out test, which has exactly this check
      built into her own Gate 1 amendment. A full fix likely needs a
      genuine compact-seat-mode design (e.g. drop score buttons from the
      seat itself, adjust scores elsewhere) - real scope, not something
      to rush unilaterally mid-phase without design input.
      86/86 unit, e2e 3/3 stable throughout.

### Immediate Next Action
Handed to Trin for Phase 26 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 26 (the final implementation phase - after
this, Sprint 4 moves to Stage 3 close: Oracle groom -> Smith end-to-end
test, which should specifically re-check the mobile density finding).

- [x] Phase 27 fix (T27.1), test-first: added the cursor-affordance
      assertion to `tests/e2e.smoke.mjs` before touching CSS, confirmed
      it failed (`got "auto"`), then fixed. `.hand-card` (always
      draggable) and `.middle-card[draggable="true"]` (the attribute
      selector already tracks exactly the same authorization condition
      the draggable-wiring in Phase 24 used, no separate logic needed)
      get `cursor: grab`, `:active` gets `cursor: grabbing` - pure CSS,
      no JS class-toggling needed. 86/86 unit, e2e stable.

### Immediate Next Action
Handed to Trin for Phase 27 UAT.

### Waiting On
@Trin: UAT sign-off on Phase 27.

### Planned Work
- [ ] None pending - all Sprint 4 work (6 implementation phases +
      Phase 27 close-out fix) will be complete once Phase 27 clears
      UAT/review.

---

## Sprint 5, Phase 28 (only phase) — DONE

### Progress
- [x] TDD: added the 6 width/scroll assertions to `tests/e2e.smoke.mjs`
      first (US-31/D20), confirmed they FAILED against the unmodified
      CSS (`at 1024px, #screen-game must grow to the 1100px desktop
      cap, got 760px`), then implemented T28.1 - two `@media` tiers on
      `#screen-game` in `style.css` per D20 exactly
      (min-width:1024px->1100px, min-width:1440px->1300px). Re-ran:
      green. No changes to `seating.js`/`main.js` - confirmed not
      needed, geometry is already percentage-based.
- [x] Pre-handoff validation: `npm test` 86/86 unit tests pass
      (unaffected, pure CSS change); `npm run test:e2e` stable,
      including the new US-31 assertions and the full existing flow
      (host/join/deal/play/drag/disconnect all still pass — confirms
      the new viewport-resize calls on the `host` page mid-test don't
      break anything downstream).

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Trin for Phase 28 UAT — only phase this sprint, so a Trin
pass here is effectively also the sprint's last implementation gate
before Oracle groom.

### Waiting On
@Trin: UAT sign-off on Phase 28.

### Planned Work
None pending beyond Phase 28 clearing UAT/review.

---

## Sprint 6, Phase 29 (Pile unification, D23) — impl DONE

### Progress
- [x] T29.1: rewrote `src/state.js` around `state.piles` (one Pile shape
      for deck/hands/zones). `viewFor` output byte-identical. Verified
      by grep that **no** other `src/` module ever touched
      `state.deck`/`.hands`/`.zones` (only `viewFor` output crosses to
      ui/protocol — `makeStateMessage(view)`), so `ui.js`/`main.js`/
      `protocol.js` are genuinely untouched, not just believed to be.
- [x] T29.2: `npm test` 86/86, `npm run test:e2e` fully green including
      real WebRTC 2-client flow, drag-and-drop, privacy, and the Sprint 5
      width assertions.

### Two findings raised rather than silently absorbed
1. **T29.2's premise was impossible as written** (see task.md): "all 86
   tests pass unmodified" can't hold for a *storage* refactor when 117
   assertion sites read the storage shape directly. Corrected the
   guarantee to the one that's actually meaningful and that did hold:
   **every `viewFor` assertion unmodified** (the behavioral contract /
   wire format); internal-shape reads mechanically migrated to new
   selectors via a scripted sed, then diff-audited to confirm no
   view-side assertion changed.
2. **Deviated from D23's "every card uniformly carries `{owner,faceUp}`"**
   — implemented visibility as *derived from `pile.kind`* instead.
   Reasons in ARCHITECTURE.md D23 "Neo implementation revision":
   it removes a data clump (a hand card's `owner` would always duplicate
   its pile's `ownerId`), matches the user's own pile-level framing
   ("A Pile can be open..., In Hand..., and Mixed"), avoids `viewFor`
   having to strip fields back off to stay wire-identical, and shrinks
   the diff (deck/hand cards keep their plain shape). **Flagged for
   Morpheus to accept or reject at code review — not applied silently.**

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Trin for Phase 29 UAT.

### Waiting On
@Trin: UAT on Phase 29. Then Morpheus review (which must also rule on
the D23 deviation above).

---
*Last updated: 2026-08-16 (Sprint 6 Phase 29)*

## Sprint 6, Phase 30 (position-aware PLAY/MOVE_CARD + layout, D21) — impl DONE

### Progress
- [x] TDD: wrote all 10 D21 tests first, confirmed red (8 failed; the 2
      that passed were the back-compat and authorization ones, which
      *should* already hold - a useful signal that the new tests were
      targeting real gaps rather than restating existing behavior), then
      implemented. 101/101 unit + e2e green.
- [x] `placeCard()` + `withLayout()` in `state.js`, shared by `PLAY` and
      `MOVE_CARD` so placement and the layout rule can't drift.
      Smith's Gate 2 direction rule lives in exactly one branch.
- [x] `MOVE_CARD` same-zone no-op removed; remove-then-insert is now one
      shared path for both same-zone and cross-zone (index math computed
      against the array the card has already left, otherwise inserting
      relative to a card sitting after the moved one is off by one).
- [x] `PICKUP` also strips `layout` alongside `owner`/`faceUp`.

### Flagged for review (2)
1. **D21's documented params can't express its own rule.** D21 specifies
   `beforeCardId` + `layout`, but Smith's Gate 2 correction requires
   knowing *which card the user targeted* and *which side* - a bare
   `beforeCardId` loses that (inserting "before T" and "after T's
   predecessor" are the same insertion point but need the layout written
   to different cards). Implemented as `targetCardId` + `side` +
   `layout`, with before-card insertion kept as the internal primitive.
   This is the minimal change that makes D21's own stated rule
   implementable - flagged for Morpheus rather than quietly redefining
   the action shape.
2. **Real intermediate behavior change**: dropping a card back onto its
   own zone used to be a silent no-op; it now moves that card to the end
   of the zone. Phase 31 makes this deliberate (drop regions), but
   between Phase 30 and 31 the existing drag-drop UI has a new,
   unintended effect. Not a defect in the state layer, but Trin/Smith
   should know it exists rather than discover it live.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Trin for Phase 30 UAT.

### Waiting On
@Trin: UAT. Then Morpheus (ruling on flag 1).

---
*Last updated: 2026-08-16 (Sprint 6 Phase 30)*

## Sprint 6, Phase 31 (stack/overlap drag-drop UI + CSS) — impl DONE

### Progress
- [x] New `src/dropTarget.js` — pure drop-region geometry, no DOM, its
      own unit tests (8). **Applied Sprint 4 retro item 13 proactively**:
      gave the new pure logic a dedicated module *before* writing it
      rather than extracting it reactively like `seating.js`.
- [x] `ui.js`: `data-card-id`/`data-layout` on zone card wrappers, rect
      collection off the `.card` face (not the wrapper, which includes
      the controls below and would make the "on the card" region reach
      into its own buttons), live drop hints on dragover per Smith's
      Gate 1 affordance requirement.
- [x] `main.js` + `style.css`: placement forwarded through
      `dropCardOnZone`/`playCard`/`moveCard`; stack/overlap rendering
      via negative margins keyed off `data-layout`.
- [x] 109/109 unit + e2e green, incl. 2 new e2e checks driving real
      `DragEvent`s at real coordinates, asserting the layout round-trips
      to the *other* client over WebRTC and that a before-side drop puts
      the layout on the target (Smith's Gate 2 rule, end to end).

### Findings
1. **Integration bug that no unit test could have caught.** `main.js`
   wired `onDropCard: (cardId, toZoneId) => dropCardOnZone(...)` — a
   2-arg arrow silently swallowing the new 3rd `placement` argument.
   Every unit test passed; the reducer was correct; the UI hit-test was
   correct; the feature simply did nothing. Only found by *running it
   and looking*. Fixed. Worth a retro note: arity-mismatch in a callback
   wiring is invisible to JS and to layer-local tests.
2. **Zone size now materially limits the feature's value — needs a
   decision, flagging rather than deciding.** The user's ask was to make
   it "easier to layout runs and sets in your zone", but shared zones are
   capped at `max-width: 13rem` / `max-height: 9rem` and personal seat
   zones — literally "your zone" — at `max-width: 9rem` (~2.5 cards
   wide). Stacking helps density, but a run of 4-5 cards still has
   nowhere to go. I had to temporarily widen the container just to
   screenshot the feature working. Those caps are deliberate (D20 notes
   the pot is bounded so the seat ring and the pot don't collide), so
   loosening them is a geometry decision for Morpheus with a UX read
   from Smith — not something to quietly change in a UI phase.

### Blockers
None for Phase 31 itself; finding 2 affects how useful US-32/33 actually
are in practice.

## Next Steps
### Immediate Next Action
Handed to Trin for Phase 31 UAT.

### Waiting On
@Trin: UAT. Then Morpheus/Smith on finding 2 (zone sizing).

---
*Last updated: 2026-08-16 (Sprint 6 Phase 31)*

## Sprint 6, Phase 32 (zone room, D24) — impl DONE

### Progress
- [x] Pot 13rem -> 20/24rem wide, seat zones 9rem -> 11/12rem, surface
      min-height 26rem -> 48/52rem, pot centred in the surface — all
      scoped to D20's existing 1024/1440 breakpoints.
- [x] Guard test (required by D24) measuring real pot/seat-zone
      intersection at 1024/1440/1920. 109/109 unit + e2e green.

### Findings
1. **The guard test failed before I changed anything — the pot/zone
   overlap already existed.** Confirmed against the committed baseline
   (extracted HEAD into a temp dir and measured it): *both* personal
   zones overlap the pot at 900/1024/1440/1920px today. So this wasn't a
   risk introduced by growing caps; it was a live bug the cap was
   believed to be preventing and wasn't.
2. **Two of my own D24 premises were wrong and measuring caught both**
   (now corrected in ARCHITECTURE.md rather than quietly fixed): the pot
   was not centred (normal flow, near the top), and clearance is bounded
   by *height*, not width — the 26% ring is a flat ellipse on a wide,
   short surface, and a loaded personal zone is ~218px tall on its own.
   Budgeting from an empty zone would have shipped an overlap.
3. **I broke my own "<1024px unchanged" promise once and caught it by
   measuring**: centring at all widths took 900px from one overlapping
   zone to two. Re-scoped to >=1024px; 900px now byte-identical to
   baseline, verified.
4. Remaining, not addressed (out of D24's scope): the *seat card* (roster
   row, radius 42%) still slightly overlaps its own personal zone at the
   bottom seat. Different pair of elements than D24's pot-vs-zone
   invariant. Visible in the Phase 32 screenshot; worth Smith's read.

### Blockers
None.

## Next Steps
### Immediate Next Action
Phases 31 and 32 both need Trin UAT (31 was handed off just before 32
was inserted).

### Waiting On
@Trin: UAT on phases 31 + 32.

---
*Last updated: 2026-08-16 (Sprint 6 Phase 32)*

## Sprint 6, Phase 33 (deck operations, US-34/35/36) — impl DONE

### Progress
- [x] TDD: 5 reducer tests written first (red), then `SHUFFLE_DECK` and
      `SPLIT_DECK`. 116/116 unit + e2e green, incl. 2 new e2e checks
      (host-only visibility, and a Split propagating 3 face-down piles
      to the other client with no identity leak).
- [x] `SPLIT_DECK` reuses Phase 29's `dealRoundRobin()` in
      exhaust-the-stock mode; the "every pile gets >=1 card" guard is one
      condition covering both empty-deck and too-many-piles.
- [x] Honoured D24's invariant: Split leaves an **empty deck pile in
      place** rather than removing it, with a test asserting `DRAW` then
      fails with "deck is empty" rather than a TypeError.
- [x] Deck controls placed with the deck; `Draw` deliberately left by the
      hand (Smith's Gate 1 reversal of US-34's first draft).

### Three real bugs found by running it, not by tests
1. **`.btn-row[hidden]` didn't hide.** A class selector's `display: flex`
   outranks the UA stylesheet's `[hidden] { display: none }`, so the
   host-only deck controls were **visible to guests**. Caught by the e2e
   host-only assertion. Fixed generally for any `.btn-row`, not just
   this one.
2. **`redactMiddleCard` dropped `layout`.** Arrangement never reached
   any viewer for face-down cards, so every face-down pile rendered
   un-stacked. This affected US-32/33 too, not just Split. `layout`
   now survives redaction - it describes arrangement, not identity, and
   D21 makes arrangement shared state. Test asserts the redaction still
   leaks no rank/suit.
3. Split piles now carry D21's `stack` layout on every card after the
   first, so a pile draws as a pile instead of N loose card-backs each
   with its own controls - pure reuse of Phase 31, no new concept.

### Finding (not fixed - flagging)
With 4+ piles you must scroll the pot to see them all: the pot is capped
at 12rem tall by D24's seat-ring clearance, and each stacked pile is
~11rem wide, so only about two zones fit at once. Split works and the
piles are all reachable, but "split into 4 and see 4" doesn't hold.
Options (a Morpheus/Smith call, not mine): a tighter peek for face-down
piles specifically, or piles rendered as a single back + count like the
deck stack already does. Not silently claiming this is finished.

### Blockers
None.

## Next Steps
### Immediate Next Action
Handed to Trin for Phase 33 UAT.

### Waiting On
@Trin: UAT on Phase 33; then Morpheus/Smith on the pile-density finding.

---
*Last updated: 2026-08-16 (Sprint 6 Phase 33)*

## Sprints 7-8 + UI follow-ups (2026-08-20) — DONE

### Shipped
- **Sprint 7 (US-37/D26)** host-only localStorage save. `src/persistence.js`
  (pure, injectable storage). Hands stripped **at save time**, so the blob
  never contains private cards.
- **Sprint 8 (US-38/D27)** stable identity, the user's own design:
  host issues a UUID, both ends store it, client presents it on
  reconnect. `src/identity.js`. **Game state is now keyed by playerKey,
  not peer id** - peer id lives only in `peerToKey` in main.js. This
  closed the reconnect-after-refresh backlog item open since Sprint 1.
- **US-39** remember code+name; guest auto-rejoins on reload with nothing
  typed; host snapshot carries `hostName`.
- Landing screen is now Resume / Host / Join (Resume disabled when there's
  nothing to resume; covers both host and guest). Table code shown for the
  whole game via `showGameCode()`.
- Earlier same day: D25 pile actions (hover -> action -> highlighted
  targets), compact cards + font-minimum robustness, wide/short zones,
  seat `[-] info [+]`, deck centred and rendered as a real card back.

### Traps hit (all fixed - listed so they aren't re-learned)
1. **Callback arity**: `onDropCard: (a,b) => f(a,b)` silently swallowed a
   3rd argument; every unit test passed while the feature did nothing.
2. **`redactMiddleCard` dropped `layout`** - arrangement never reached
   viewers for face-down cards.
3. **`.btn-row[hidden]` didn't hide** - a class's `display:flex` outranks
   the UA `[hidden]` rule. Host-only controls were visible to guests.
4. **Mechanical extraction over-captured** (`wireHostSession` swallowed
   unrelated handlers). `node --check` caught it; run it after any
   scripted refactor.
5. **Module-order**: resume logic clicked `#join-btn` before its listener
   existed. It now lives at the end of main.js with a comment saying why.
6. **Stylesheet structure**: two unclosed/duplicated rules. `npm run lint`
   (stylelint) exists now and catches these.
7. **Dev-server caching**: `python3 -m http.server` sends no
   `Cache-Control`, so edits looked like no-ops in the browser.
   `npm run dev` is now `tools/devserver.mjs` with `no-store`.

### Verified green at shutdown
147 unit tests, full e2e (incl. host reload restore, guest auto-rejoin,
stack/overlap drag, Shuffle/Split), stylelint clean.

### Next / open
- **Hands are still not persisted** (D26). Now that they're keyed by a
  stable identity this is safe to do - it's the last piece before a host
  crash is fully recoverable. Deliberate follow-on, not an oversight.
- Mobile: drag-and-drop and the new hover-revealed actions have no touch
  equivalent. Compounding with the 5+-player density item.
- Pile density: only ~2 zones fit the pot, so "Split into 4 and see 4"
  isn't true; needs a design call (tighter face-down peek, or draw a pile
  as one back + count).
- Pre-existing crash reproduced on the committed baseline: sequential
  join-then-deal can hit PeerJS "Maximum call stack size exceeded".
  Backlog lists it as simultaneous-joins-only; it's easier to trigger
  than recorded.

---
*Last updated: 2026-08-20 (shutdown prep)*
