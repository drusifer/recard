# Fix: Move action reveals real drop targets (2026-09-07)

Direct user correction, after an earlier over-engineered attempt at
extending drag-and-drop geometry (reverted, unused): "we already have
all the layouts we need... K.I.S.S. Use the Move card action to reveal
the ACTUAL targets within the piles okay?"

## What shipped

`beginCardTargetPick` (the right-click → Move → click-a-lit-pile flow,
D101) used to always plain-append on commit, regardless of where in
the lit pile you clicked - lighting up a whole pile told you WHERE you
could go, but nothing about what would actually happen once you got
there. It now:

- Tracks mouse movement while a pile is lit, and shows the SAME live
  drop hint (`showDropHint`/`resolveDropTargetFor`) a native drag
  already produces - onto/below/beside/adjacent a specific card, not
  just a lit panel.
- Commits with that SAME resolved placement, not a blind append -
  `onMoveCard` (ui.js) → `moveCard` (main.js) already accepted a
  `placement` argument (drag-and-drop's own `onDropCard` always used
  it), it just was never passed from the click flow.

No new geometry, no new layout values - purely wiring the EXISTING
`resolveDropTargetFor`/`showDropHint` machinery into the click flow
that never used it.

## A real bug this exposed, not caused

`tests/rtgPlaythrough.browser.mjs`'s shared `moveTo()` helper clicks a
lit pile's own PANEL center, unconditionally - previously harmless
(panel clicks always appended blind), but once panel clicks resolve to
a REAL card-relative placement, clicking a crowded pile's center can
land ON an existing card instead of open space. In the "mark a
permanent" test this caused a real cascading mis-click: a token placed
via `overlap` onto an existing card ended up visually covered by a
LATER card in the same array (D21 doesn't rewrite an existing card's
`layout` when something new is inserted ahead of it), so a SUBSEQUENT
right-click intended for the token actually hit the card covering it,
moving the wrong thing.

Fixed the test helper, not the feature: `moveTo()` now clicks the
pile's own TITLE BAR (`.pile-title`) instead of the panel as a whole -
never part of the card row, so it's guaranteed empty space regardless
of how crowded the pile is, preserving the helper's actual intent
("just get it into this pile, position doesn't matter for this test").
A test that wants a specific per-card target computes its own point
directly, same as the column/adjacent tests already do.

## Verification

- Live-verified via a throwaway script: right-click → Move → hover a
  non-empty pile shows the real `drop-onto` hint on the card under the
  cursor; clicking there produces `data-layout: stack`, matching what a
  drag to the same spot would do.
- `bobp make test` (693), `test-rtg` (12, run 3x clean - this is
  exactly the suite the mis-click surfaced in), `test-ui` (18),
  `test-hostsetup` (7), `test-newgame` (5), `lint` (baseline unchanged)
  - all green.
