# Agent State

NOTE 2026-09-19: user overrode my "Bot (<strategy>)" naming condition - a Jev
player now joins named just `<strategy>` (e.g. "equilibrium").

## Current Task (2026-09-19) - `*user test gin-bot` (US-120): PASS, 3 findings

Real flow: MCP hosted a Gin table (standing in for the user's browser),
`bobp make gin-bot CODE=.. STRATEGY=knock-early` joined as "Bot (knock-early)",
host re-dealt, I played 10 host turns. Bot drew, took useful upcards
(takeUpcardIfGain/IfMelds), knocked at deadwood 4 face down, said
"Knock! 2♣ 2♦ 2♠ · A♦ A♥ A♠ · 9♣ 10♣ J♣ | deadwood 4: 4♥" - visible in the
host's Table Talk panel; runner exited 0 after 1/1 hands.
Findings: (1) first hand logged as "hand 2" - FIXED (pre-deal look isn't a
hand); (2) summary showed raw ids ("4-clubs-0") - FIXED (card names).
(3) PRE-EXISTING, NOT FIXED, reported to user: in the Gin Rummy preset the
Table (discard) pile renders BELOW the table zone's box (cards at y~577,
zone ends ~540) - the host cannot see discards or the face-down knock card
at the default layout. SIMPLE_LAYOUT's 190px zone height; user's call.
Root cause (Neo, 2026-09-19): past ~7 cards the Table pile wraps to a 2nd row
below the zone box. User then asked to fix: FIXED (bigger zone + tableSpread 0.7).

## Current Task (2026-09-18, spin 2) - `*user test harness-mcp` via REAL MCP tools

recard-harness loaded after `/mcp` reconnect. 1-player War: start -> status
(piles 47+5=52 conserved) -> DRAW -> MOVE 10C,10S to table -> wait -> screenshot
(matches state) -> stop. All 3 earlier concerns VERIFIED FIXED in real use:
pile directory in game_status; "Pile nowhere does not exist"; wait timeout
"...myHand.length is now: 4". PASS.

New concerns (not filed as bugs - awaiting user):
A. #1 player_query omits form values: deck's deal-count <input> shows "26" on
   screen, query text "". Fix: include `value` for input/select/textarea.
B. #8 player_query reports hidden elements like visible ones: 3 closed
   `.pile-action-menu`s come back with 293px rects. Fix: `visible` flag (or
   skip hidden) per match.
C. #9 minor: a predicate that throws returns bare "TypeError: Cannot read
   properties of undefined (reading 'length')" - prefix "predicate threw:".
D. #8 minor: `text` concatenates children with no separator ("PileDeckHand...").
Still backlogged: small render at 1280x720 (table uses ~1/4 of the frame).

## Earlier (2026-09-18) - first stdio test

`*user test harness-mcp` 1-player run: PASSED with 3 concerns (not filed as
bugs yet - awaiting user). recard-harness was NOT loaded as Claude tools
this session (Connection closed), so I drove tools/mcp/harnessServer.mjs
over real stdio with the MCP SDK Client (driver kept in scratchpad only,
nothing left in repo). Flow: tools/list -> game_start{players:1} ->
view -> DRAW -> player_wait(hand 6) -> MOVE real card to table ->
player_query -> screenshot -> game_stop -> game_status(running:false).
All worked; screenshot shows card on table, 2 in hand.

Concerns:
1. #6/#8 No cheap pile directory: had to probe `piles.N.id` one call at a
   time; `piles` dumps every deck card. Fix idea: game_status (or a
   view summary) lists pile id/name/kind/count.
2. #9 player_act errors carry the Playwright `page.evaluate:` prefix and
   an in-page stack trace; the first line ("Card QQQ is not in any pile",
   "Unknown action type: BOGUS") is good - strip the rest.
3. #9 player_wait timeout says only "page.waitForFunction: Timeout
   1500ms exceeded" - no predicate echo, no current value at `path`.
Known/backlogged: cards ~19x26px at 1280x720 (still true). Config:
.mcp.json ${CLAUDE_PROJECT_DIR} arg likely unexpanded (Neo resume note).

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

## US-117 Gate 1 review (2026-09-10): Approved with amendments

Cypher drafted, Morpheus ran an arch pass first (D130 - camera is a
pure local CSS-transform layer, no drag/drop code changes needed) and
asked for Gate 1 with that foundation settled. Reviewed against
Nielsen's heuristics.

**Two amendments, both BLOCKING, folded into the AC (not left as
implementation taste):**
1. **Heuristic #3 (User Control and Freedom)**: hover-zoom must be
   suppressed while a card drag is in progress - otherwise crossing
   piles en route to a drop target would zoom the camera in and out
   repeatedly mid-gesture, which is disorienting exactly when the
   player most needs a stable view. Gates on the same active-drag
   signal `isDragging()` in `src/ui.js` already provides for
   touch-drag suppression - no new state needed. The existing
   drop-target hover highlight is untouched by this.
2. **Heuristic #5 (Error Prevention)**: hover-triggered zoom needs a
   ~150-200ms hover-intent delay (exact figure is Neo/Trin's to tune)
   so passing the cursor over a pile doesn't fire an unwanted zoom;
   click-triggered zoom fires immediately since a click is
   unambiguous intent.

Also resolved open question 3's UX half myself (D130 already answered
the technical half): dragging a card back out of an already
focus-zoomed pile stays enabled, no forced zoom-out first - forcing
one would fight the player's own gesture.

Non-blocking: the transition must animate, never snap instantly
(Heuristic #1) - exact duration/easing left to implementation, match
the feel of the existing hover-raise transform rather than inventing
a new timing scheme.

`*user approve` posted. Full amendments in `docs/USER_STORIES.md`
US-117. Handed to Mouse for sprint planning.

## Next Steps
None on US-117 - it's Mouse's move now. Watch for the sprint plan to
confirm these amendments land in whatever phase actually builds the
hover/click trigger logic, not just get acknowledged and dropped.

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

---

## US-117 D131 follow-up (2026-09-10): amendments confirmed + anchor ruling

Morpheus revised the focus-zoom mechanism after direct user feedback:
a `position: fixed` overlay grown at the Pile's own rect, not a camera
transform (D131 supersedes that part of D130). Asked me to confirm my
3 Gate-1 amendments still apply and to rule on one new open question.

**Confirmed: all 3 amendments retarget cleanly, no re-review needed.**
None of them (drag-suppression, hover-intent delay, animate-don't-
snap) assumed a camera specifically - they were always about WHEN a
size-change interaction fires and HOW it transitions, not about what
kind of transform carries it.

**Ruled on the anchor-vs-nudge question: clamp-nudge, not exact
anchor.** An overlay that grows exactly at a pile's original position
and clips off the viewport for every edge/corner pile fails the whole
feature for exactly the piles most likely to sit at an edge (personal
zones, hand trays). Heuristic #5 (Error Prevention) rules that out.
Clamp the MINIMUM translation needed to stay on-screen - not a full
re-center, which would break the visual continuity of "growing from
where I pointed" (Heuristic #6). A pile already fully on-screen at
auto-fit size needs no nudge. Full text: `docs/ARCHITECTURE.md` D131.

## Next Steps
None on US-117 - handed back to Mouse for sprint planning, now with
both design rounds (D130 camera, D131 grow-in-place) and all HCI
amendments settled before a single line of code.

---

## US-117 end-to-end user test (2026-09-11): PASSED, with 2 findings filed

Ran the real app rather than trusting the automated suites alone -
screenshotted the default view, S/XL presets, and a focus-zoomed pile
against a live 7-card solo hand.

**Core ACs verified visually, not just by assertion**: the dial and
S/M/L/XL presets all visibly resize the table; the M default and S
preset keep everything (table + own hand) comfortably on-screen;
hover-growing a pile visibly enlarges it in place without moving
anything else on the table.

**Finding 1 (non-blocking, Heuristic #2/#7)**: at XL, the table grows
downward from the top (by design, `transform-origin: top center`) far
enough to push the player's OWN hand below the fold, needing a scroll
to see it. This runs against a standing project principle from an
earlier sprint's own design-lint check comment - "see the table and my
cards at the same time." Not filed as a defect: XL is an explicit,
deliberate player choice to trade overview-of-everything for a bigger
table, and scrolling to see a deliberately-oversized view is a
reasonable, well-understood trade-off - but worth the user's awareness
since it's the one preset where the standing principle visibly bends.

**Finding 2 (non-blocking, Heuristic #8, Aesthetic and Minimalist
Design)**: a focus-zoomed pile visually overlaps its own parent Zone's
own border/label (e.g. hovering the hand pile lets "YOU"'s zone label
and dashed resize-handle border peek out from behind/around the grown
"HAND" panel) - reads as slightly cluttered rather than clearly
"lifted above" the table. A stronger shadow or a dimmed backdrop behind
the grown overlay (similar to how a modal dims its background) would
likely read more clearly, but that's a real visual-design call, not
mine to make unilaterally - filing per the lands-cascade-spread
precedent (found, described, NOT fixed without asking) rather than
guessing at a treatment.

Neither finding blocks the sprint - both are genuine "would be nicer"
polish items on a feature that otherwise works exactly as specified.

## Next Steps
@all *sprint retro, then @Cypher *pm launch US-117. Both findings above
go to Cypher's backlog, not a fix-loop - they're real but not blocking,
same standard as every other disclosed-not-fixed finding this sprint.
