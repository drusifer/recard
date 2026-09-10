# Nit: deck/discard "double wide" panels — closed (2026-09-07)

Resumed from the 2026-09-04 carried-forward item in `mouse.docs/state.md`
("QUEUED, not started" was actually "investigated, reverted, unresolved" -
see `neo.docs/state.md`'s "Investigated, not fixed" entry for the original
root-cause writeup).

## What actually shipped

`.pile-title` (`style.css`) switched from `display: flex` + a
`flex-basis: 100%` line-break trick to plain block layout:
`.zone-name-text` is `display: block` (a block box always starts its own
line, no percentage math involved), and the header buttons after it stay
inline-level, wrapping like words. The container's shrink-to-fit width is
then just "the widest line" — the same well-defined computation a
paragraph's shrink-to-fit width already uses, not a flex-specific edge
case.

## Why the first two attempts didn't actually fix it

The original bug: a flex item's percentage `flex-basis` needs a definite
container size to resolve against; a shrink-to-fit container's size is
defined in terms of its items' sizes. The two can't both resolve first —
circular.

- `width: min-content` breaks the circularity but overshoots the other
  direction: min-content for a wrapping flex row is the width of its
  single widest *unbreakable* item (one button, ~44px) — every button
  wraps onto its own line, taller headers, which is what regressed
  `lint:design`'s scroll checks when this was tried and reverted
  2026-09-04.
- `width: max-content` also breaks the circularity and looked right on
  the first header tested (RtG's Deck panel, plain buttons only — 227px,
  matched a from-scratch clone measurement). But it was never actually
  fixing the underlying issue, just landing on the right number by
  coincidence for that specific button mix. Re-measuring RtG's *Discard*
  header (which adds a `.pile-action-enum` `<details>` control) showed
  the exact same 277px inflation the original bug report described —
  `max-content` fixes what the container's own preferred size resolves
  to, but the percentage basis *inside* it is still asking "100% of
  what?" during that same pass. Caught by mutation-checking against a
  second, different header configuration rather than trusting the first
  one that happened to measure correctly.

## Verification

- Cloned `.zone-name-text` outside the flex context to get its real
  natural text width (106px) vs. its in-place resolved width under each
  attempt (259px under both min-content and max-content, 146.6px — i.e.
  correctly stretched to the button row's own real width — under the
  block-layout fix).
- RtG "Alice's Discard" panel: 277px (bug) → 176px (fixed), matching the
  floor Neo's original investigation established by hiding the title or
  the buttons alone.
- `lint:design`: violation set unchanged from the pre-existing baseline
  (same 9 findings, same viewports/messages) — no new regressions.
- `bobp make test`, `test-rtg`, `test-ui`, `test-hostsetup`,
  `test-newgame`, and `lint` (style + design + js) all green.
- RtG's Decks-zone box (`presets.js`, 1400x570) needed no re-tuning —
  the `rtgPlaythrough.browser.mjs` sizing test still passes as-is.

## Not touched

The two other viewport regressions flagged 2026-09-04 alongside this
(desktop-1280x800/laptop-1024x768 "hand not fully visible" + forced
scroll) are **pre-existing**, not caused by this fix or its predecessors
— confirmed by measuring the unfixed baseline (`git show HEAD:style.css`)
before making any change: identical 9-violation set already exists on
`main`/`dev` today, unrelated to pile-title sizing. Still open on the
standing backlog, not part of this nit.
