# Handoff: Stackable encapsulation (2026-09-08, context nearly full)

## Where we are

Mid-session redesign of card overlap/cascade behavior. User confirmed
direction: **build a `StackableElement` base class** (not a mixin - no
mixin pattern exists anywhere in this codebase; the real precedent is
`GroupedPile`, D116: "they share a parent class though so let's push
some of that up"), extended by `<pile-panel>` and `<chip-tray>`
instead of each declaring `extends HTMLElement` directly.

User's last message (cut off by a `/context` interrupt, but clear):
**"yes and use tdd - no backcompat - rip and replace."**

## The bug that started this (STILL UNFIXED in working tree)

`git status` shows UNCOMMITTED changes (staged) collapsing the old
4-formula overlap CSS (`stack`/`overlap` fixed constants, `column`
spread-driven, `.chip-stack`'s own bespoke formula) down to 3 shapes
(full/part-vertical/part-horizontal), per direct user request. This
work is real and mostly right (dropTarget.js simplification, tests
already updated/passing), BUT the chip-stack "cascade" direction has a
live, CONFIRMED bug: `.chip-tray-downward` (LandsPile, non-reversed
flex-column) and the default reversed (`column-reverse`, chips/tokens)
directions were given DIFFERENT formulas that both turned out wrong in
different ways:

1. First attempt: reused the SAME `--column-depth`-multiplied formula
   in both directions. Broke chips (2-chip case coincidentally passed
   since depth=1 either way; 3+ would compound wrong - but the deeper
   issue below hit first).
2. Root architectural finding (confirmed via live computed-style
   debugging, not guessing): `BattlefieldPile`'s card-ROW context uses
   `margin-top` as a CROSS-axis override (baseline: margin=0 means
   "same position as row-anchor", i.e. fully overlapping - needs
   `(1-spread)` shape, depth-multiplied since cross-axis margins don't
   chain naturally in flex). `chip-stack`'s card-COLUMN context uses
   margin-top/bottom as the MAIN-axis margin (baseline: margin=0 means
   "natural small `--card-gap` separation", chains naturally on its
   own) - a COMPLETELY DIFFERENT baseline. Reusing the row's formula
   shape in the column context is fundamentally wrong at ANY spread
   value, not just an edge case - confirmed live: LandsPile's 3-card
   cascade showed ZERO overlap, cards FARTHER apart than before the
   "fix", because the formula only ever produces a POSITIVE (or barely
   negative) margin, and column-direction items need NEGATIVE margin to
   pull a later card up/onto an earlier one.

User's own diagnosis-request ("why aren't tests catching this") is
answered honestly in the transcript: no test asserts a PRECISE overlap
value for 3+ cards in either direction; the browser test only checks
chip 0 vs chip 1 (depth-1 bugs are invisible there), and my own manual
verification scripts eyeballed "did the number change" without
computing what the correct number should be.

## What to build next (TDD, rip-and-replace, no back-compat)

1. **Pure module** `src/cardStacking.js` (mirrors `dropTarget.js`'s own
   stated precedent: pure math, no DOM, independently unit-testable).
   Write tests FIRST. Needs to correctly express BOTH baselines above
   as one coherent, correctly-derived model - not two hand-patched
   variants. Suggested shape: a function taking `{ index, spread,
   cardSize, gap }` returning a signed offset, where the CALLER
   (Stackable) is responsible for knowing its own axis (row cross-axis
   vs column main-axis) and either applying `--column-depth`-style
   chaining (row/cross-axis, doesn't chain naturally) or NOT (column/
   main-axis, chains naturally on its own) - these are genuinely
   different physical situations, not two configurations of one
   formula. Get the math right and PROVEN by unit tests BEFORE wiring
   any CSS/DOM.

2. **`StackableElement` base class** (`src/components/Stackable.js`):
   `addCard(cardEl, {group})`, `removeCard(cardEl)`, `setSpread(spread)`
   - encapsulates per-group ordered lists and applies the computed
   offset directly (inline style / custom property), so style.css stops
   computing anything itself (no more per-context `calc()` duplication
   to get subtly wrong). `<pile-panel>` and `<chip-tray>` extend this
   instead of `HTMLElement` directly - RIP OUT their current direct
   `HTMLElement` inheritance and the CSS-selector-driven approach
   entirely, per "no backcompat, rip and replace."

3. Open design question flagged to user, not yet answered: should
   `Stackable` own dispatching state changes (call `insertPileable`
   itself) or strictly reconcile DOM to match state that flows in
   normally? Leaned toward the latter (state stays source of truth) but
   this needs confirming before the interface is finalized.

## Uncommitted work needing a decision

The staged 3-shape CSS collapse (dropTarget.js, GroupedPile.js,
style.css, 3 test files) should probably be REPLACED/superseded by the
Stackable work rather than committed as-is, since it still contains the
buggy chip-stack CSS. Don't commit it standalone - fold its correct
parts (dropTarget.js's simplification, which IS correct and tested) in
with the Stackable rewrite, and let Stackable's pure module replace the
CSS-formula parts entirely.
