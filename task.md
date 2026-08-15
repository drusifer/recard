# Task Board — Recard Sprint 1 ("v1 playable deck")

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

---
## Status
Phase 1: DONE
Phase 2: DONE
Phase 3: DONE
Phase 4: DONE
Phase 5: DONE — all phases complete
Phase 2: Not started
Phase 3: Not started
Phase 4: Not started
Phase 5: Not started
