# Smith — Full UX Audit (user request: "the ux is dog shit")

**Status: FIXED AND RE-VERIFIED 2026-08-15.** All 5 findings resolved:
real button hierarchy, panel-grouped sections with a felt-tinted table,
corner-index playing cards, a wider desktop game screen, grammar fixed.
Re-screenshotted at both 390px and 1280px — confirmed genuinely different,
not just technically-changed CSS. Closed.

Method: ran the actual app across mobile (390×844) and desktop (1280×800)
viewports, screenshotted every screen, evaluated against Nielsen
heuristics. This is a holistic design audit, not a spec-compliance check
— everything below is real (functionally correct, all previous UAT
passes stand), the complaint is about visual/interaction quality.

## Findings (ranked worst first)

### 1. Zero visual hierarchy — every button is identical
**ACTUAL:** "Host a table", "Create Table", "Deal & Start", "Draw", the
score +/- chips, and "Reshuffle & Reset" / "Reset Scores" (destructive!)
all render as the exact same solid blue button. There's no way to tell
at a glance which action is the primary next step vs. a minor utility vs.
something that discards state.
**HEURISTIC:** #4 Consistency and Standards (same visual weight should
mean same importance, and it doesn't), #5 Error Prevention (destructive
actions should look different from routine ones).
**VERDICT:** Fail. **Severity:** high.

### 2. No section separation — screens are a flat stack of same-background elements
**ACTUAL:** "Table", "Players", "Your hand" on the game screen (and the
share-code/roster/deal-controls block on the host screen) all sit
directly on the page background with only a heading between them. There
is no panel/card treatment to show where one logical group ends and the
next begins.
**HEURISTIC:** #8 Aesthetic and Minimalist Design (poor grouping actually
adds cognitive load, not less — you have to infer structure from spacing
alone).
**VERDICT:** Fail. **Severity:** high.

### 3. Cards look like debug output, not playing cards
**ACTUAL:** Cards render as a single concatenated string ("K♦") centered
in a small colored box — functional, but nothing like a real card's
corner-index layout, and doesn't read as "a deck of cards" at a glance.
**HEURISTIC:** #2 Match Between System and Real World.
**VERDICT:** Fail. **Severity:** medium.

### 4. Desktop/wide viewports waste most of the screen
**ACTUAL:** The single mobile-width column centers correctly (not a
layout bug), but on a laptop-width screen the app is a narrow strip of
content in a large empty field — no adaptation for the extra room.
**HEURISTIC:** #8 Aesthetic and Minimalist Design (not literally
"minimalist" here — the empty space isn't purposeful, it's just unused).
**VERDICT:** Fail. **Severity:** low (PRD targets phones primarily, but
hosts on a laptop are a real case per the target user).

### 5. Minor copy issue
"1 deck(s), 0 joker(s)" — awkward auto-pluralized grammar.
**VERDICT:** Fail. **Severity:** trivial, fix while touching this code.

## Not filing as bugs
- All prior functional/privacy/e2e behavior is untouched and correct —
  this audit is purely visual/interaction design.
- The 🂠/🔒 icon rendering-as-generic-glyph issue (noted in Sprint 2) is
  an environment font limitation, not something to redesign around.

## Routing
All 5 items are UI-only (CSS + minor markup + one small ui.js/main.js
change for card corner-index and pluralization) — no state/protocol
changes. Routing straight to Neo.
