# Smith — Sprint 2 ("clear backlog", v1.1) End-to-End User Test Report

**Status: RE-TESTED AND CLOSED 2026-08-15.** Both bugs fixed and
re-verified with real measurements: `.fd-btn`/`.score-btn`/`.reveal-btn`/
`.pickup-btn` all now measure 44px+ on the same 390px viewport (was
~25×20 / ~19×17). Reset Scores now shows a native confirm dialog before
firing, matching Reveal's precedent — verified via the e2e suite's
updated dialog-handling step. Approved for retro.

Method: actually ran the app (`python3 -m http.server` + Playwright,
mobile viewport 390×844), interacted with the new middle-zone/score/
preset/rules-reference surfaces, and measured real rendered element sizes
— not a spec review.

## Bugs found (ranked worst first)

### 1. Secondary buttons (face-down play, score +/-) are too small to
   reliably tap on a phone
**CMD:** Measured real rendered size via `boundingBox()` on a 390px-wide
mobile viewport (a plausible real phone width).
**EXPECTED:** Interactive touch targets should be roughly 44×44px
(iOS HIG) / 48×48dp (Material) — the accepted floor for reliable tapping
without mis-hits.
**ACTUAL:** `.fd-btn` (the two face-down-play buttons under each hand
card) measured **~25×20px**. `.score-btn` (+/- on each roster row)
measured **~19×17px**. With a full hand dealt (e.g. Gin Rummy's 10 cards),
that's 20 of these tiny buttons packed two-per-card across the hand row —
see attached screenshot reasoning below.
**HCI HEURISTIC:** #5 Error Prevention (small, tightly-packed targets on
touch devices cause accidental taps — playing a card face-down by mistake
when you meant to tap the adjacent one is a real, game-affecting mistake,
not a cosmetic one).
**VERDICT:** Fail. **Severity:** high — this is an interaction-accuracy
problem on the primary target device class (phones, per the PRD's own
target user), not a visual nit.

### 2. "Reset Scores" has no confirmation, unlike the equally-irreversible "Reveal" action
**CMD:** Clicked "Reset Scores" after adjusting a score.
**EXPECTED:** The sprint's own Gate 1 UX requirement established that
irreversible, information/state-losing actions get a confirm step
(that's why revealing a *private* card requires `window.confirm()`).
Zeroing every player's accumulated score across a whole game session is
the same class of action — one misclick loses real, hard-to-recreate
state (nobody remembers everyone's exact running score by memory).
**ACTUAL:** Fires immediately on a single tap, right next to "Reshuffle &
Reset" and "Draw" with identical visual weight.
**HCI HEURISTIC:** #3 User Control and Freedom / #5 Error Prevention —
inconsistent with the precedent this same sprint already set for
irreversible actions.
**VERDICT:** Fail. **Severity:** medium.

## Passed / no issues
- Rules reference: consistent goal/setup/turns format across all 5
  entries, reads well, correctly reachable from the landing screen before
  any session exists, closing it back to the game screen preserved hand/
  table state exactly (verified in Phase 10, re-confirmed here).
- Preset selector: picking "Gin Rummy" filled decks/jokers immediately
  and showed an accurate preview ("1 deck(s), 0 joker(s), 10
  cards/player") before commit — exactly what was asked for at Gate 1.
- Middle-zone privacy held up under actual visual inspection: a
  privately-owned face-down card's owner tag is visible, its rank/suit is
  not, to a non-owner.
- Score display and public-info conventions (deck count, connection
  state) are consistent with v1's existing roster patterns — no new
  mental model required.

## Minor note (not filing as a bug)
The hand row gets visually dense with a 10-card deal (Gin Rummy) — 30
total tap targets (10 cards × 3 buttons) in a small area. Bug #1's fix
(bigger buttons) will make this worse before it's better unless spacing
is also revisited. Flagging as context for whoever fixes #1, not a
separate item.
