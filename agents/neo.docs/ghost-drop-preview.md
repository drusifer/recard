# Fix: WYSIWYG ghost-card drop preview (2026-09-07)

Direct user report: "there are still a bunch of conflicting drop zones
that are making this hard... I expect the blue solid would overlap and
the blue outline would land aside but it almost always overlaps... I
expect to see the overlap targets ACTUALLY overlap the card so one can
SEE where the card will go before they select that target - get it?"

## The problem

Four separate CSS decorations (`drop-onto` glow, `drop-below` bar,
`drop-before`/`drop-after` line, `drop-adjacent-before`/`-after` hollow
line) each meant a different outcome, but none of them showed the
actual outcome - just an abstract marker on the TARGET card. Telling
"this will overlap" from "this will sit beside it" apart required
recognizing which of four small decorations was showing, under a
moving cursor, with no visual confirmation of the real result.

## The fix

Replaced all four decorations with ONE reusable ghost card
(`ui.js`'s `showDropPreview`/`clearDropPreview`), inserted as a REAL
sibling in the row with the SAME `data-layout` a real drop would set.
Because it's a genuine `.middle-card[data-layout=...]` element, it
renders through the exact same CSS margin rules a real inserted card
would - "will this overlap or sit beside it" is answered by literally
watching a translucent, dashed-outline card do exactly that, live, as
the mouse moves.

One case needed special handling: a `side: 'before'` placement (D21)
puts the resolved `layout` on the EXISTING target, not the ghost (the
target is what would visually shift onto the newly-placed predecessor)
- so for that case the target's own `data-layout` is toggled to match
for the preview's duration and restored in `clearDropPreview`. This is
the one imperfection disclosed rather than chased: if the target being
previewed-before is itself already a column member, the preview
transiently overrides its real layout attribute (restored correctly
after), a minor visual-only edge case not worth extra machinery for.

Single module-level ghost element (not one per row) - only one drop
target can ever be under the cursor at a time, so `showDropPreview`
just relocates the same node rather than managing several.

Used by both gestures that resolve a placement: native drag
(`showPileDragOver`/`clearPileDragOver`) and the Move click-flow
(`beginCardTargetPick`'s `onMouseMove`/`commit`/`cancelOnEscape`) -
one target vocabulary, one preview mechanism, not two.

## Verification

Screenshotted all four zones live (RtG battlefield-style plain pile,
synthetic drag): stack shows the ghost tightly overlapping card A;
overlap shows a looser fan-style overlap; adjacent shows a real gap,
no overlap at all; column shows the ghost below, vertically
overlapping. All four are now immediately visually distinguishable
from each other, matching the actual drop outcome exactly.

`bobp make test` (693), `test-rtg` (12), `test-ui` (18),
`test-hostsetup` (7), `test-newgame` (5), `lint` (baseline unchanged) -
all green. No unit-test changes needed - `resolveDropTarget`'s own
geometry/placement values are unchanged, only how they're VISUALIZED
changed.
