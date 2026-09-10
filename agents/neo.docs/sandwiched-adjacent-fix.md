# Fix: "adjacent" reachable between two cards (2026-09-07)

Direct user report: "why no side by side in the battlefield pile?"

## Root cause

The previous fix (`OVERLAP_EDGE_ZONE`, a fixed 14px "close to the
edge" zone replacing the old half-the-halo split) solved the OPEN-END
case fine, but never actually tested the case that matters most: two
EXISTING cards at their normal resting gap (`--card-gap`, ~8px on a
real battlefield). A point in the MIDDLE of an 8px gap is only ~4px
from either neighbour - well inside even a "small" 14px zone - so
`adjacent` was STILL only ever reachable past the very end of a row,
never between two already-placed cards, which is exactly where a
player naturally reaches for it (confirmed live: reproduced the exact
8px gap on a real RtG battlefield, gap-midpoint always resolved
`overlap`).

## The fix

`isSandwiched(cardBoxes, box, point, isBefore)`: is `point` flanked by
ANOTHER card on the opposite side, within one card-width (the same
reach the halo itself uses)? If so, it's genuinely BETWEEN two
neighbours, not near an open row end - and overlap shrinks to a much
smaller `SANDWICHED_OVERLAP_EDGE_ZONE` (3px, close enough to read as
"touching that specific edge on purpose") instead of the ordinary 14px
zone. The open-end case (only one neighbour nearby) is unaffected -
it already had room, and still uses `OVERLAP_EDGE_ZONE`.

## Verification

- 3 new unit tests (`dropTarget.test.js`) with a dedicated tight-gap
  fixture (12px gap, deliberately larger than the exact-boundary-risk
  4px/8px case so the test itself isn't fragile): the gap's middle is
  adjacent, right at either edge still overlaps, and an open end past
  the last card keeps the wider zone. Mutation-checked both
  `SANDWICHED_OVERLAP_EDGE_ZONE` and `isSandwiched` itself (forced each
  off, watched the right tests fail, reverted).
- Live-verified against the EXACT reported scenario: two RtG cards on
  a real battlefield, 8px gap (`--card-gap` at rest). Before: hovering
  the gap's midpoint always resolved `overlap`. After: resolves
  `adjacent` (no layout key), screenshotted - the ghost card now sits
  cleanly between the two existing cards with a real gap, not
  overlapping either.
- `bobp make test` (696, +3), `test-rtg` (12), `test-ui` (18),
  `test-hostsetup` (7), `test-newgame` (5), `lint` (baseline unchanged)
  - all green.
