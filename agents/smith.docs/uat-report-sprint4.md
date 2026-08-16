# Smith — Sprint 4 ("top-down table redesign") End-to-End User Test Report

**Status: RE-TESTED AND CLOSED 2026-08-15.** Finding #1 (cursor
affordance) fixed and re-verified with the exact original repro: both a
draggable hand card and a draggable middle-card now report
`getComputedStyle(el).cursor === "grab"`. Finding #2 (mobile density) is
**intentionally still open** — escalated to Cypher's backlog per the
disposition below, not a close-out blocker. Approved for retro.

Method: actually ran the app, real Playwright-driven interactions (not a
spec review) at both 390px mobile and 1280px desktop, host + guest
clients over real WebRTC. Specifically re-checked the density risk this
sprint's own Gate 1 flagged, since Neo/Trin already found and precisely
measured it during Phase 26 - my job here is to independently confirm
severity/disposition, not re-derive the same number.

## Findings (ranked worst first)

### 1. Draggable cards give zero visual cursor affordance on a mouse-driven client
**CMD:** Measured the real computed `cursor` CSS property on a draggable
hand card and a draggable middle-card at 1280px (desktop, mouse input).
**EXPECTED:** An element that responds to a native HTML5 drag gesture
should visually communicate that via cursor shape on hover (`grab`, or
`move` while actively dragging) - the standard convention every desktop
OS and browser drag-and-drop implementation follows, precisely so a user
discovers "this is draggable" without having to already know to try it
(Nielsen #6, Recognition rather than recall).
**ACTUAL:** `getComputedStyle(el).cursor` returns `"auto"` (browser
default, i.e. no override at all) on both `.hand-card` and
`.middle-card` wrappers - hovering a card looks and feels identical
whether or not dragging it would do anything.
**HCI HEURISTIC:** #6 Recognition rather than recall. This is a real
discoverability problem specifically for the sprint's headline feature:
US-28/US-29 (drag-and-drop, live drag broadcast) were explicitly scoped
as *additional* to tap-to-play (Smith Gate 1, Phase 24 AC) so the simple
path stays simple - but if nothing hints that dragging is even possible,
a mouse user has no organic way to discover it exists at all, making a
meaningful chunk of this sprint's work invisible to anyone who doesn't
already know to try it.
**VERDICT:** Fail. **Severity:** medium - doesn't block the existing
tap-based flow (which still works, per Gate 1's own requirement), but
undermines this sprint's actual headline deliverable for anyone using a
mouse.
**Suggested fix (not prescriptive):** `cursor: grab` on draggable card
wrappers, `cursor: grabbing` while a drag is in progress (`:active` or a
class toggled on `dragstart`/`dragend`) - a small, contained CSS-only
change.

### 2. Seated-player layout overlaps starting at 5 players on mobile (re-confirmed, not new)
**CMD:** Independently re-ran the density check at 390px, 2 through 8
players, both by eye and by re-reading Trin's `getBoundingClientRect()`
measurement from Phase 26 UAT.
**EXPECTED:** Per this sprint's own Gate 1 requirement (added after the
sprint was scoped as carrying real density risk): the seated layout
should remain legible at the PRD's stated soft-cap player count (~8) on
the primary target device class (phones).
**ACTUAL:** Confirmed Trin's numbers hold: clean through 4 players, 1
overlapping seat-card pair at 5, climbing to 6 at 8. Neo's fix (table
surface scales with player count) measurably helped versus the
pre-fix state but does not eliminate overlap at realistic mid-size
tables (5-6 players is a completely ordinary card-game group size, not
an edge case like the full 8-player soft cap).
**HCI HEURISTIC:** #8 Aesthetic and Minimalist Design / #6 Recognition -
overlapping seat cards can hide another player's connection status, "You"
marker positioning becomes ambiguous relative to physically overlapping
neighbors, and score buttons on a partially-obscured card become harder
to hit accurately.
**VERDICT:** Fail (re-confirmed, already known). **Severity:** high -
unlike finding #1, this affects the CORE redesign (seeing who's at the
table) at an entirely ordinary group size, not just an edge case, and
already has team consensus that it needs a real design pass (compact
seat mode) beyond a CSS tweak.
**Disposition:** given Neo/Morpheus already correctly identified this
needs a genuine redesign (dropping score buttons from the seat card
itself, or a fundamentally different compact layout) rather than a quick
fix, and given the existing fix is a real, verified improvement over
nothing - **not blocking this sprint's launch**, but escalating to a
dedicated backlog item for the next sprint's planning rather than
attempting a rushed Phase 27 fix that risks the same "improved, not
resolved" outcome again. Recommend Cypher scope this as its own small
sprint/story next, not squeeze it into this sprint's closing hours.

## Passed / no issues
- **Personal zones (US-27):** auto-created for every player on join,
  correctly positioned at their seat, correctly excluded as a move-to
  option for the card already sitting there (only OTHER zones offered).
- **Drag-and-drop mechanics (US-28), once discovered:** dropping a card
  on a zone plays/moves it correctly, drop-target highlighting works and
  reverts cleanly, invalid drops are genuine no-ops. The interaction
  itself is sound - finding #1 above is about *discovering* it exists,
  not how it behaves once found.
- **Live card-drag broadcast privacy (US-29):** verified visually at
  both viewport sizes - a still-hidden card never shows its face to
  another client mid-drag, a public card's ghost is legible and clearly
  distinct from the committed table state.
- **"You" seat marker (US-26):** unambiguous at normal (2-4 player)
  table sizes - the explicit text tag plus border both read clearly.
- **Hand fan (US-30):** cards stay individually tappable and
  identifiable even fanned; the horizontal-scroll fallback for a large
  hand works, though (noted by Neo, not re-litigating here) it currently
  has no "more cards this way" affordance - low priority next to the two
  findings above.

## Filed to
@Trin for triage. Finding #1 (cursor affordance) is a small, contained
CSS fix - recommend Phase 27. Finding #2 (mobile density) is
re-confirmed and already correctly scoped by the team as bigger-than-
one-phase work - recommend NOT Phase 27, escalate to Cypher's backlog
for proper design treatment instead.
