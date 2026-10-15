# Smith — Sprint 1 End-to-End User Test Report

**Status: RE-TESTED AND CLOSED 2026-08-15.** All 3 bugs fixed by Neo,
re-verified by Trin (automated) and Smith (visual screenshot re-check):
join code is now `9KTJ57`-style (6-char, readable), host-setup form
disappears once the table exists, and the session-ended screen now
consistently disables Draw/hand and shows everyone as disconnected.
Approved for retro.

Method: actually ran the app (`python3 -m http.server` + Playwright,
mobile viewport 390x780), screenshotted every screen through a full
host+join+deal+play+draw+disconnect flow. Not a spec review.

## Bugs found (ranked worst first)

### 1. Session-ended state is contradicted by the rest of the screen
**CMD:** Host closes tab after dealing → join client shows the "Host
disconnected — session ended" banner (per Smith's Gate 2 condition — this
part works, and works fast, ~100ms on a graceful close).
**EXPECTED:** Once the session is over, the screen should make that
consistently true — no controls that still imply the game is live.
**ACTUAL:** The Draw button and hand cards remain fully clickable, and the
roster still lists the host as "Alice - connected (4 cards)".
**HCI HEURISTIC:** #1 Visibility of System Status (banner says one thing,
rest of screen says another) and #5 Error Prevention (clicking Draw/Play
now sends into a dead connection — should be prevented, not just ignored).
**VERDICT:** Fail. **Severity:** high — this is the one place a user could
hit an actual error, not just a rough edge.

### 2. Host-setup form stays live after the table is created
**CMD:** Host clicks "Create Table" → share code appears below the form.
**EXPECTED:** Once a table exists, the name/decks/jokers/Create-Table
controls shouldn't look interactive — deck config is already locked in.
**ACTUAL:** The whole form (including a second "Create Table" button)
stays visible and editable above the share section, with no indication
it's now inert.
**HCI HEURISTIC:** #1 Visibility of System Status, #5 Error Prevention
(false affordance — the UI implies you can still change these).
**VERDICT:** Fail. **Severity:** medium.

### 3. Join code is a raw 36-character UUID
**CMD:** Host share screen shows `cfe9178d-bbee-4739-a48b-fc22df5c68ee`.
**EXPECTED:** Something a person could read aloud across a room or type
by hand if Copy Link isn't usable (clipboard permission denied, reading it
off someone else's screen, etc.).
**ACTUAL:** A UUID — this is an internal PeerJS identifier being shown
directly to end users, not a "code" in any normal sense.
**HCI HEURISTIC:** #2 Match Between System and Real World.
**VERDICT:** Fail. **Severity:** medium. Copy Link mostly papers over this
(matches PRD's "zero-typing" intent), but it's a real fallback-path gap.

## Passed / no issues
- Landing screen: clear, minimal, two obvious choices (H8).
- Card rendering: red/black suits distinct, table/hand clearly separated.
- Disconnect banner itself: high-contrast, top-of-screen, plain language,
  fast (~100ms on a real closed tab). Exactly what Gate 2 asked for.
- Deck config is shown before players join (US-3 AC met).

## Minor note (not filing as a bug)
"Your hand" is the third section on the game screen, below the (often
empty) Table and the Players roster. For a game you interact with
repeatedly, consider putting the hand higher/closer to the thumb zone on
mobile. Low severity, product/UX polish call for Cypher — not blocking.
