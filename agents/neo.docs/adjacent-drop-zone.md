# Fix: a real "adjacent" drop zone (2026-09-07)

Direct user request, after clarifying: "when i drop a card or move a
card to a pile i want to target either overlap on the side, overlap
from below, exactly on top/full overlap, or next to the target card
with a little space in between... the stack behavior is what I want
for exactly on top. just keep it simple and give me clear drop targets
that work consistently."

## What existed already vs. what was missing

Three of the four targets already existed:
- "exactly on top" = `stack` (upper half of a card) - unchanged.
- "overlap from below" = `column` (lower half) - unchanged.
- "overlap on the side" = the halo beside a card - unchanged.

The fourth - "next to the target card with a little space in between"
- didn't exist as a deliberate target. Dropping anywhere in the halo
(a full card-width) always produced `overlap`; a no-overlap placement
next to a SPECIFIC card only ever happened by accident, if you missed
the halo of every card entirely and landed in open space.

## The fix

`dropTarget.js`'s halo branch now splits by distance, same halving
idea `isLowerHalf` already uses for stack/column: the near half of the
halo (distance <= box.width/2) still overlaps; the far half (distance
> box.width/2, still within the halo) is the new **adjacent** target -
still resolves to a specific `targetCardId`/`side`, just with no
`layout` key at all, so `insertPileable` places it with a plain gap and
no overlap.

No changes needed in `Pile.js`/`state.js` - `layout` undefined already
meant "no overlap" everywhere in the existing machinery; the halo
branch just never produced that value before.

`ui.js`/`style.css`: a target with no `layout` gets its own hint
(`drop-adjacent-before`/`-after`) - a HOLLOW ring rather than the
overlap line's solid bar, sitting further out from the card's edge, so
the four zones read as four different things during drag, not just two
visually identical outcomes with different real effects.

## Verification

- `tests/dropTarget.test.js`: updated one existing test whose fixed
  x-coordinate happened to land in what's now the far half (moved it
  into the near half, since its actual point was "still overlaps if
  close enough", not "at exactly this distance"), added 2 new tests
  (far half is adjacent, the near/far midpoint itself still overlaps -
  boundary belongs to the closer behavior). Mutation-checked (forced
  the split back to always-'overlap', watched the boundary test fail).
- Live-verified in a real browser: dragged a card into the far half of
  another card's halo, confirmed the `drop-adjacent-after` hint
  appeared mid-drag (screenshotted - a hollow bar, not the solid
  overlap line), then confirmed the actual drop produced `data-layout:
  null` and a real ~8px gap (`--card-gap`) between the two cards.
- `bobp make test` (693, +2), `test-rtg` (12), `test-ui` (18),
  `test-hostsetup` (7), `test-newgame` (5), `lint` (style+js clean,
  design at the pre-existing 9-violation baseline) - all green.
