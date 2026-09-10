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

---

## Side-quest: Recard Connectome (2026-09-10)

Direct user request: "make a cool modern viz of the code's connect-ome
... interactive code overlay and/or nested heatmap, go for the wow
factor." Published: https://claude.ai/code/artifact/856a2991-470b-434a-8a99-299f5b689e30

**Real data, not decoration.** `tools/codeConnectome/buildGraph.mjs`
statically extracts the actual import graph of `src/**` (regex-based,
verified against the real import style first - single-line
`import ... from '...'`/`export ... from '...'`, both forms present
and both captured) - 67 files, 120 edges, plus real fan-in/fan-out per
file and a genuine DFS cycle check (0 cycles - a real, verifiable fact
about this codebase, not a placeholder number).

**Design**: dark-first instrument-panel aesthetic (IBM Plex Mono +
IBM Plex Sans, both themes built properly per the artifact-design
skill), a validated 7-hue categorical palette (dataviz skill's
validator, both light/dark surfaces, PASS with the documented
light-mode contrast WARN mitigated by real text labels everywhere -
never color-alone). Two views: force-directed connectome (drag/zoom,
hover ego-network highlighting, click pins a detail panel with real
dependents/dependencies) and a nested-heatmap treemap (sized by LOC,
grouped by directory, same category colors).

**One look, one edit pass** (per the skill's own process, using the
project's own already-installed Playwright rather than the declined
Chrome extension): caught and fixed two real bugs neither showed up
in code review - (1) the force layout drifted subgraphs off the
bottom of the viewport at 67 nodes (fixed: boundary-clamped tick
handler + a proper zoom-to-fit after the simulation settles, not
more force-tuning), (2) switching to the treemap rendered through the
force view's leftover zoom transform (a wall of giant cropped
rectangles) - fixed with an explicit identity-transform reset on
entry to tree mode.

Minor, left as-is (did not keep iterating past the one edit pass): a
little label crowding near a few adjacent hubs in the force view, and
the legend panel corner-overlaps one treemap tile at certain window
sizes. Real polish, not correctness bugs - the user's to ask for if
it matters to them.
