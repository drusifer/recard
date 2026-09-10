# Agent State

## Context

`*user test stackable` iteration 2 — the UX gate on the tray/cascade
rewrite. Tested against the REAL running app (a screenshot of a live
`LandsPile` after 9 real draws dropped through the real drop path),
not against the spec or the test output, because the whole defect
class here was "the numbers agreed while the screen was wrong".

## Current Task

**`*user test stackable`: PASSED, with one usability defect filed
(not blocking the fix, and NOT fixed unilaterally).**

What I verified on screen: the lands cascade renders top-down, the
steps are visibly even, cards overlap rather than separate, the
per-colour mana badge sits over its own column, and the columns sit
side by side without colliding. The reported defect ("3 cards
cascades weird", "cards FARTHER apart than before") is visibly gone.

### DEFECT (usability, pre-existing, exposed by the fix)

**A lands cascade is too tight to read.** `LandsPile` inherits
`GroupedPile.defaultSpread = 0.963`, which was calibrated for CHIPS -
a stack of identical discs where only the top one carries meaning and
the edges below are pure depth cue. Lands are CARDS: their identity
lives in the name and cost strip. At 0.963 each buried land shows
roughly a 2-3px sliver, so a 7-mana column is unreadable - you can
see THAT you have seven lands (the badge says so) but not WHICH.

The codebase already knows this: `Pile.maxSpread` is 0.85 for cards
specifically so "the covered card's own cost/name strip stays
visible", and `GroupedPile` raises the ceiling to 0.97 while
documenting the chip reasoning by name. Nobody re-derived the value
when a CARD pile (`LandsPile`) was added under that base class.

Recognition-over-recall: a player scanning their own board should not
have to tap or spread a column to learn what is in it.

**Not fixed here, deliberately.** Changing a default spread is a
visible behaviour change nobody asked for in this task, and the
project's standing rule is to ask before adding conditions or
retuning beyond the request. Recommend `LandsPile.defaultSpread`
around the card-legible range (`Pile.maxSpread`, 0.85) rather than
inheriting the chip value - but that is the user's call.

## Next Steps

- Await user decision on the lands cascade spread defect above.
- If the battlefield/plain-row path is converted next, re-test: the
  fan and hover-raise both compose `transform`, and moving wrappers
  to absolute positioning frees that property - a likely regression
  site for the hover-raise cue specifically.
