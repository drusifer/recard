# Smith — Sprint 3 ("zones, presence, hand tools") End-to-End User Test Report

**Status: RE-TESTED AND CLOSED 2026-08-15.** The mini-hand duplicate-count
bug is fixed and re-verified with the exact original repro scenario
(390px, long name, 7-card hand, pass marker toggled): roster row now
reads `BobsLongerNameTest - connected (7 cards) 🙅 Passed` followed by a
clearly-spaced fan of card-backs with no repeated digit. Trin
independently re-verified with a 9-card hand (past the fan's 5-card
visual cap) to confirm the exact count still shows correctly in text even
when the fan itself is capped. Approved for retro.

Method: actually ran the app (`python3 -m http.server` equivalent via a
local Playwright-driven static server), two real browser contexts on a
390×844 mobile viewport (the PRD's own target device class), populated a
realistic dense scene on purpose — 3 zones, 5 middle cards across all
three visibility states, a full 7-card hand, a pass marker toggled, and a
live cursor broadcast — specifically because this sprint's own Gate 1/
Gate 2 flagged real density/scalability risk (zones + opponent hands +
cursors all competing for screen space). Screenshots of both clients
attached in scratchpad (not committed — ad-hoc verification artifacts,
same convention as Neo's).

## Bugs found (ranked worst first)

### 1. Another player's hand count is shown twice, redundantly, with no visual separation — reads as one broken run of text/graphics
**CMD:** Dealt a 7-card hand to a second player ("BobsLongerNameTest"),
then looked at that player's roster row on the OTHER client's screen at
390px width.
**EXPECTED:** Each piece of information in a tightly-packed roster row
should appear once, with a legible gap from its neighbor (Nielsen #8,
Aesthetic and Minimalist Design — every extra unit of information competes
for attention and space, worse on a narrow viewport).
**ACTUAL:** The roster row text already renders `(7 cards)` (from
`renderRoster`'s own `count` string, `src/ui.js:310`). Immediately after
it, for every player who isn't "you", a *second*, separate compact
"mini-hand" fan + badge is appended (`src/ui.js:315-318`) that shows the
**exact same number again** (`renderMiniHand`'s badge is just `count`,
i.e. the same `handCount`). Worse, `.mini-hand` (`style.css:295-299`) has
no left margin, and it's appended as a sibling with no space character in
between — so it renders flush against whatever came right before it (the
"Passed" tag if present, or the roster text otherwise), reading as a
single garbled run: `...Passed[icon]7` or `(2 cards)[icon]2`. Confirmed
happening on **both** clients, with a long name and a short one
("Alice") alike — not a long-name edge case, this is the base-case
layout for any other player.
**HCI HEURISTIC:** #8 Aesthetic and Minimalist Design (redundant info),
#4 Consistency (the same fact now has two different visual
representations right next to each other with no relationship shown
between them), #6 Recognition (a user has to work out that the icon+digit
is the *same* number just seen in text, not new information).
**VERDICT:** Fail. **Severity:** medium — nothing is broken
functionally (data/actions are all correct), but it's a real readability
regression on the sprint's own explicitly-flagged risk area, and it's the
base case, not a corner case.
**Suggested fix (not prescriptive — Neo/Morpheus's call):** either drop
the redundant `(N cards)` text now that the mini-hand fan exists (the fan
+ badge already conveys the count, visually, for other players), or drop
the mini-hand's own count badge and rely on the existing text (the fan of
card-backs alone still conveys "they're holding cards" without repeating
the number) — plus in either case, add real spacing (a
`margin-left`/leading space) so `.mini-hand` doesn't run into whatever
text precedes it once the duplication itself is resolved.

## Passed / no issues
- **Zones (US-19):** created 2 new zones live, both propagated to the
  other client immediately, name+count always visible even when empty
  ("DISCARD (0)"), stacked cleanly with no overlap at 390px even with 3
  zones simultaneously on screen.
- **Middle-zone density:** 5 cards across public/shared-facedown/
  private-facedown-mine all rendered correctly and legibly at once, each
  with correct controls (Pick up / Turn over / Reveal / Move to…) and no
  visual overlap — this was the sprint's biggest named density risk and
  it held up.
- **Move to… control:** present only where it should be (a card with
  somewhere else to go), option list correctly excludes the card's
  current zone, worked from both clients.
- **Pass marker (US-25):** toggled live, propagated correctly to the
  other client's roster with a clear "🙅 Passed" tag, button label
  itself flips Pass/Unpass so the actor can tell their own state at a
  glance without reading the roster.
- **Hand sort (US-23) at a full hand (7 cards):** both sort buttons
  produced correct, immediately-legible results even with all 7
  face-down button pairs visible underneath — didn't feel cramped.
- **Live cursor (US-22):** appeared labeled with the sender's real name
  on the other client, real-time, and did not appear on the sender's own
  screen (verified both directions). Cursor rendering on top of other
  content (e.g. briefly over a heading) is expected/correct behavior for
  a cursor overlay, not a bug — that's what cursors are for.
- **Deck visual (US-20):** stack + remaining-count badge legible and
  correctly positioned at 390px alongside the "TABLE" heading.

## Filed to
@Trin for triage, then Neo for fix (expect this becomes Phase 20 per the
established Sprint 1/2 pattern — Cypher's process note says Smith
close-out findings get their own tracked phase, not absorbed into
Phase 19's tail).
