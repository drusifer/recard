# Agent State

## Current Task (2026-09-18) — US-119 Harness MCP server

Arch: `morpheus.docs/harness_mcp_arch.md`. Phase 1 (traffic log)
review PASSED: pure module + thin Session tap, per-Session lifetime is
the right call (a reconnect is a new transport). Watch in Phase 2: the
server must stay a thin layer over `tests/harness/multiplayer.mjs` -
no second copy of table setup.
- Phase 2+3 review PASSED; US-119 shipped as D136. Revisit: screenshot
  of one element / viewport option (backlog) - the capture is only as
  useful as the table's fit-zoom at 1280x720.

## Context

`*design multi-player test harness` (2026-09-18, direct user request).
Neo's D133/D134 session (table-zone overlap fix + per-preset layouts,
committed as 540ce88) surfaced the same pain repeatedly: every browser
test file hand-rolls its own Playwright click-through + a bespoke
inline `page.evaluate()` DOM query. Backlog already names the gap this
closes: "No real, automated two-peer end-to-end test harness" (D60
removed `tests/e2e.smoke.mjs`, nothing replaced it since - see
`docs/BACKLOG.md`'s Technical section).

Design happened as three sequential decisions with the user, each
narrowing the previous one - resume order matters, they build on each
other:
1. **Drive peers by protocol, not clicks** - `session.js`/`protocol.js`
   already define the wire format (`action`/`state`/`motion`/
   `identity`). A test should inject an `action` message directly
   instead of clicking through the UI to produce the same effect.
2. **Option B, confirmed**: the DOM-query request/reply endpoint stays
   LOCAL to the test process (`page.evaluate()`), not a new wire
   message added to `protocol.js`. Rejected extending the real WebRTC
   protocol with `{type:'query'}`/`{type:'query-reply'}` - the test
   controller already holds every peer's own Playwright `Page` object
   directly, so routing a DOM query over the game's own data channel
   would solve a problem that doesn't exist here (it would only earn
   its keep for a peer the controller does NOT directly control - a
   real remote/health-check use this ask never asked for).
3. **Every peer is a real headless Playwright page, confirmed** -
   rejected "layered" (logic-only Node robots for most peers, real
   pages only where DOM assertions are needed) even though it's
   cheaper for large player counts, and rejected "robots only, no
   DOM at all". One execution model, no new Node-side PeerJS/transport
   code to build or maintain - simplicity over the scaling benefit.
4. **Confirmed**: yes, wrap it as a `make` target following this
   project's own convention (`Makefile`'s own comment: "add the npm
   script first, then a one-line target here" - see `test-tablezoom`/
   `test-focuszoom` for the exact shape to copy).

## Current Task

**SHIPPED 2026-09-18 as US-118 / D135** (Tier 2 sprint). Implemented
per the design below with one refinement: the two role-specific entry
points became ONE `submitAction(action)` in main.js (the branch it
replaces was duplicated at 27 call sites, all migrated, no aliases).
Hook is `window.__recardHarness` {act, view, myId}. User put migrating
the existing browser tests onto the harness's server/launcher IN scope
- done. Arch record: `morpheus.docs/multiplayer_harness_arch.md`.

Revisit: the harness asserts cross-client STATE only; extending it to
`motion` messages is what unblocks the remote-cursor redesign backlog
item.

### Full design, for a cold implementer with zero other context

**Component 1 - `window.__harness`, exposed unconditionally by
`main.js` (no build-flag gating - this project has no build step,
D1).** Not a new security surface: a real player could already call
`session.send(...)` from devtools today, since the host authorizes
every action by the SENDING CONNECTION's bound identity
(`peerToKey.get(fromId)`, `main.js`'s host-side `session.on('data',
...)`), never by UI origin - see `state.js`'/D27's own reasoning.
Surface (names are proposals, not binding - pick something that
won't collide with a real global; `__harness` might already be too
generic, check first):
  - `dispatchLocal(action)` - HOST side only. Applies an action through
    the SAME local path a UI button already uses (main.js's `dispatch`
    wrapper, whatever it's actually called - confirm the exact name/
    call site before wiring this, don't guess) - so a host-authored
    test action exercises real code, not a shortcut around it.
  - `sendAction(action)` - GUEST side only. Calls the real
    `session.send({type:'action', action})` - literally what "remote
    control over the protocol" means. Goes over the real data channel,
    to the real host, through the real reducer, back down as a real
    `state` broadcast.
  - `getView()` - returns this peer's current `latestView` (guest) or
    the host's own `gameState`/derived view (host) - confirm exact
    variable names in `main.js` before wiring; the point is a
    STRUCTURED assertion surface ("does player 2's hand show 7 cards")
    that never touches the DOM.
  - `query(selectors)` - ONE canonical DOM-inspection helper (bounding
    rects, text content, attributes) for the selector list given.
    Replaces the ad hoc inline `page.evaluate(() => {...})` blocks
    duplicated across `tests/designLint.check.mjs`,
    `tests/uiActions.browser.mjs`, etc. - migrate incrementally, not a
    single big-bang rewrite of every existing browser test.

**Component 2 - `tests/harness/multiplayerHarness.mjs`** (new file,
Node-side, wraps Playwright). `createTable({ preset, players })`:
launches one headless Chromium page per player (host first, using the
SAME `launchChromium()`/system-Chromium-fallback pattern
`tests/designLint.check.mjs` already has - don't reimplement that),
has the host create the table, joins each guest via the real share
code (same flow every existing browser test already does by hand),
and returns `{ host, guests: [...] }` - each a thin wrapper object
exposing `.act(action)`, `.getView()`, `.query(selectors)` via
`page.evaluate()` calls into that page's own `window.__harness`. This
is the ONE place that knows how to stand up a table; every test built
on it stops reimplementing that boilerplate.

**Component 3 - rebuild `tests/e2e.smoke.mjs`'s role on top of this**
(D60 removed it; nothing has replaced it since). A scripted multi-
player play-through expressed as a sequence of `.act(...)` calls and
`.getView()`/`.query()` assertions, not clicks - genuinely closes the
standing backlog gap, not just a testing-convenience nicety.

**Component 4 - the `make` target**, following the Makefile's own
documented convention EXACTLY (see its header comment): add the npm
script first (`package.json`, e.g. `"test:multiplayer": "node --test
tests/multiplayerHarness.*.mjs"` or wherever the new scenario file(s)
land), THEN a one-line Makefile target (`test-multiplayer:\n\tnpm run
test:multiplayer`), THEN add it to `.PHONY` and the `help:` echo list
- copy `test-tablezoom`/`test-focuszoom`'s exact shape, don't
improvise a different pattern.

### Explicitly NOT decided yet (ask before guessing)
- Exact naming for `window.__harness` and its methods - proposals
  above, not binding.
- Exact `npm run` script name / new test file name(s).
- Whether existing browser test files (`designLint.check.mjs` etc.)
  migrate their own inline DOM queries onto Component 1's `query()`
  helper as part of this work, or that's separate/later cleanup - the
  user asked for the harness, not necessarily a refactor of every
  existing test file in the same pass. Ask before expanding scope.

## Next Steps (historical - done)
@Neo *swe impl multiplayer-test-harness - implement Components 1-4
above, in order (1 and 2 are the load-bearing pieces; 3 and 4 are
what make it real/discoverable). Confirm the "explicitly not decided"
naming questions with the user rather than guessing, same standing
project convention as everything else this session. Once implemented
and verified (real multi-peer scenario passing headless via `make
test-multiplayer`), record it as the next D-number in
`docs/DECISIONS.md` - same pattern D133/D134 followed today (write it
up AFTER it's real and verified, not before).

---

## Archived (2026-09-13, superseded by the above): Tighten/Loosen slider architecture review

`*lead review stackable` iteration 1 (D129 domain model). Reviewed the
code, not the summary. The hierarchy move and the offset formula are
right and I approve them; two seams the iteration did NOT touch will
break the wiring if they aren't settled first, and one of them changes
`offsetIn`'s interface — so this is APPROVED WITH CONDITIONS, and the
conditions are for iteration 2 before it writes a line of wiring.

### Old Current Task

**`*lead review stackactions` (iteration 4): APPROVED.**

The routing design is right and it is the user's, not mine: pile-level
Tighten/Loosen became "All" and FANS OUT to each stack rather than
writing one pile-wide number, so columns adjusted apart keep their
relative differences. `spread` joining `direction` in the same
metadata map means no new persistence shape for a genuinely new
capability.

**`ADJUST_PILE_SPREAD` taking an optional `stackKey` rather than
gaining a sibling action** follows D75/D103's "there can be only 1"
correction, and the `DEFAULT_STACK_KEY` detail is what makes it safe -
omitting the key can mean ALL precisely because the default stack has
a real name, so the two readings can never collide.

**Two findings worth carrying forward, both about bare instances and
empty collections:**
- `pileForKind` builds a BARE instance, so anything `disabledActions`
  reads off `this` is empty. That comment was already in the file, for
  `ChipPile`'s break rule, and this work walked straight into it
  anyway. Context-not-`this` is the rule for that method.
- `every()` on an empty list is vacuously TRUE, which disabled BOTH
  spread directions on an empty pile. Empty-collection defaults need
  stating explicitly, not inheriting from a fold's identity element.

**On the gear placement**, which took three attempts: this is the
clearest case yet for the browser layer existing at all. Nothing below
it can see that a control covers the thing it controls. Both failing
placements were reasonable on paper.

I am NOT treating the source growing here as a regression: +362/-238
non-comment lines across `src/` + `style.css` for the whole D129 arc,
which now includes a reducer action, per-stack metadata, a menu and an
emblem that did not exist before. The four collapsed layout mechanisms
are still four collapsed into one.

---

**`*lead review stackable` iteration 3 (full unification): APPROVED.**

Four layout mechanisms are now one, and the code got SMALLER doing it:
-24 lines of non-comment source across `src/` + `style.css`, with
`applyFanOffset`, the `options.fan` flag, `--column-depth`, the
per-card `layout` field, D21's second-card rule, `removePileable`'s
stale-layout strip, `withColumnLayout`, `<chip-tray>`'s own grouping
and positioning, and all four CSS overlap formulas deleted outright.
No aliases, no forwarders - the standing "no back-compat" rule held.

**FAN as the third layout was the right call** and I would not have
proposed it. A hand's POSITION came from a stack while its ARC came
from a transform helper, which is the same "two mechanisms describing
one thing" the whole rewrite exists to remove - it just did not look
like it because the arc was cosmetic. Making the droop a fraction of a
stride rather than a fixed `0.08rem` is a real fix riding along: the
old one silently stopped matching whenever a preset resized the cards.

**Per-stack direction as METADATA is the load-bearing decision.**
`pile.stacks` carries direction and nothing else, so it cannot
contradict `cards` about what is in a stack. That is what made mixed
directions in one pile expressible, and it is why the earlier nested
`pile.stacks = [[id, id]]` had to be rejected - it would have
duplicated ordering and needed reconciliation on every mutation.

**One thing I want on the record as a process finding**, since it has
now happened twice with identical shape: `Pile.getView()`'s explicit
field list silently dropped `stacks`, exactly as it once dropped
`spread` - reducer correct, model tests green, screen wrong. The new
category-level guard is the right fix. Any future pile-level field
that the LAYOUT reads must be added there, and the test will say so.

---

**`*lead review stackable` iteration 2 (wiring): APPROVED.**

The tray path is genuinely unified now - one formula, in
`Stackable.offsetIn`, reached through real `Stack` objects, with the
two bespoke `calc()` shapes deleted rather than corrected. The CSS
that remains does unit conversion only, which was the whole point of
Condition 2.

Two things I want on the record because they are the reason this
iteration is trustworthy where the last three attempts were not:
- The live tests are mutation-proved against BOTH original bugs, and
  the sign-flip mutation reproduces the user's own description
  verbatim. A test that can be shown to fail on the real defect is
  worth more than any amount of review.
- `LandsPile` had no live coverage at all before this. That, not the
  formula, is why the cascade broke twice unnoticed. Closing it is
  the durable part of this work.

**Accepting Smith's defect as a real one, and agreeing it is not
this task's to fix.** `LandsPile` inheriting a chip-calibrated
`defaultSpread` is a genuine design miss - `GroupedPile` documents
0.963 in explicitly chip terms and nobody re-derived it when a CARD
pile was added underneath. But retuning it is a visible behaviour
change nobody asked for, so it goes to the user, not into this diff.

**Outstanding architecture question, NOT to be guessed at.** The
battlefield/plain-row path still uses the old `layout`/margin
mechanism, so two mechanisms coexist against "rip and replace". Plain
rows are trivial to convert. The real fork is `layout:
'stack'`/`'overlap'` (horizontal drop intents) coexisting with
`'column'` in ONE pile - stacks of different directions, which
`stacksOf` cannot express since direction comes from the pile. This
model has now needed four user corrections, every one of them on a
question of exactly this shape. Ask.

---

**`*lead review stackable` iteration 1: APPROVED.** Conditions 1 and 2
were implemented and re-verified in the same iteration — both cleared,
so the conditional approval is now a clean one. Re-reviewed the
resulting shape: `offsetIn` taking no metrics at all is better than
what I asked for, because it removes the last per-direction arithmetic
from JS (direction now selects an axis and nothing else), and
`extent()` deriving from the same `layout()` the rendering uses closes
the second-path risk I flagged. The `stackId` strip landing in exactly
two destructures confirms `toHandCard`/`toDeckCard` really are the
choke points, and the over-stripping guard Trin called out is the
right test to have — it protects the capability, not just the code.

Original conditions, kept for the record:

What's right:
- `Stackable` between `Pileable` and the concrete types is the correct
  reading of the user's requirement, and the multiple-inheritance
  argument against a sibling is sound — there is no mixin anywhere in
  this codebase to follow, and D116 already set the push-it-up
  precedent.
- One absolute-from-origin formula instead of two margin-relative ones
  is the actual fix. The four competing `calc()`s were never four
  cases; they were one formula expressed against four accidental
  baselines. Index-driven offsets make the depth-compounding bug
  unrepresentable rather than fixed, which is the right kind of fix.
- Membership as a flat foreign key over a nested `pile.stacks`: agreed,
  and the "card in `cards` but missing from `stacks`" argument is the
  decisive one. Plain-records-at-rest (D93/D107) survives intact.
- `Stack` in `src/piles/` is acceptable — it is a Pile collaborator and
  the containment ladder puts it there — even though it is not a `Pile`
  subclass. Not worth a `src/stacks/` directory for one class.

### Condition 1 (BLOCKING, and it would have shipped silently)
**`stackId` must be stripped everywhere `layout` is stripped.**
`state.js`'s `toHandCard` (line ~561) and `toDeckCard` (line ~571)
both strip `layout` because it describes a placement that is
meaningless in the destination. `stackId` is the same class of stamp
and Neo's own plan has it SUBSUMING `layout` — so the moment `layout`
goes away and `stackId` doesn't inherit its strip sites, a card moving
into a hand or back to the deck carries a stale `stackId` and lands in
a phantom stack in its next pile. Every entry point named in
`toHandCard`'s comment (DEAL/DRAW/PICKUP/TAKE_PILE/PICKUP_SPLIT) is
affected. This needs a test per strip site, not one representative.

### Condition 2 (BLOCKING, changes `offsetIn`'s interface)
**`offsetIn` must NOT return px.** It currently takes numeric
`cardW`/`cardH`/`gap` and returns px offsets. But card metrics in this
project are rem-based custom properties (`--card-w: 2.7rem`) and are
REWRITTEN AT RUNTIME per preset (`ui.js:2429` sets `--card-w`
directly). A px-returning formula forces the wiring to either read
`getComputedStyle` per card per render — layout thrash, and untestable
without a browser — or freeze a px value that silently goes stale the
next time a preset changes the card size. That is a regression against
the resolution-independence the rem sizing exists to provide.

**Decision: `offsetIn` returns unitless STRIDE MULTIPLIERS**, and the
component writes them as `--stack-x`/`--stack-y`. One CSS rule does
the unit conversion:
`left: calc(var(--stack-x) * (var(--card-w) + var(--card-gap)))`.
The FORMULA — the thing that was wrong four times — stays in JS and
stays unit-tested; CSS keeps only a multiply it cannot get subtly
wrong, and preset-driven resizing keeps working for free. Rejected
"read computed styles in JS" (thrash + untestable) and "keep px and
recompute on resize" (a second invalidation path to forget).

This is not a walk-back of "style.css stops computing anything" — it
stops computing the LAYOUT. Converting a multiplier to a length is
unit arithmetic, and CSS is the correct place for it.

### Non-blocking notes
- `stacksOf` gives every stack in a pile the same `direction` and
  `spread`. Fine now; if per-stack Tighten (one column, not the whole
  tray) is ever wanted, `spread` moves onto the persisted stack rather
  than the pile. Not speculative work today — just don't design it out.
- `Stack` revives pileables in its constructor while `Pile` also
  revives. Harmless (a Pileable is a cheap view over its record), but
  don't let a third reviver appear.

## D130 — Infinity Table (US-117) arch pass (2026-09-10)

Cypher flagged US-117 as arch-significant (no zoom/pan camera exists
in this codebase today) and asked for a pass before Smith's Gate 1.
Answered its 3 open questions:
1. Zoom-out escape hatch is player-driven on top of an automatic
   auto-fit default — `min(autoFitZoom, playerZoomOverride)`.
2. Focus-zoom targets the Pile (matches D129's containment ladder),
   not its Zone — a Pile already has its own DOM panel to bind to.
3. No drag/drop coordination needed — `dropTarget.js` takes
   `getBoundingClientRect()` rects with no DOM dependency, and rects
   are already post-transform, so a CSS `transform` camera on a
   wrapper is invisible to existing drag math.

**Binding shape:** one wrapper around `#table-surface` carrying a CSS
transform, driven by local-only player state (zoom target Pile id,
auto-fit scale, player override). No data model change, no reducer
action, no persistence — camera position is as ephemeral as scroll
position. Full text: `docs/ARCHITECTURE.md` D130.

Handed to Smith for Gate 1 with the foundation settled; Gate 1 owns
transition timing/easing, hover-vs-click trigger balance, and what
"too cramped" means as an actual threshold.

## D131 — Infinity Table focus mechanic revised: grow the Pile, not a camera (2026-09-10)

Direct user correction, right after Smith's Gate 1 approved D130's
camera-wrapper design: "a better way to do the zoom mechanic is to
keep the table at full size and grow the piles to make them
interactable." This supersedes ONLY D130's camera-wrapper mechanism
for the focus interaction - D130's other two findings (focus targets
the Pile not the Zone; no drag/drop code changes needed) stand, and
the story's separate table-level auto-fit/zoom-out ACs are untouched.

**New shape: focus-zoom is a `position: fixed` overlay anchored at the
Pile's own `getBoundingClientRect()`, grown to working size in place.**
No shared camera wrapper at all. Grounded in an already-shipped
precedent I found in `style.css`: `.rtg-inspect` (Smith Gate-1
condition C1) is already a `position: fixed` element appended outside
a card's own DOM specifically to "escape the pile's overflow and the
zone's stacking context" - the exact clipping problem a grown-in-place
Pile hits if it stays in its Zone's flex/grid flow. `.pile-hover-host:
hover`'s existing small lift (D51, `translateY(-0.35rem) scale(1.02)`)
is the same family of interaction at a much smaller scale - this is
that pattern's full-size conclusion, not a new mechanism. Rejected
scaling the Pile in place inside normal flow: `transform: scale()`
doesn't reflow layout but does get clipped by ancestor `overflow` and
can't grow past its Zone's edges without colliding with whatever the
Zone's own layout put next to it.

Smith's 3 Gate-1 amendments from the D130 review (drag-suppression,
hover-intent delay, animate-don't-snap) carry over unchanged in
principle - none of them assumed a camera specifically, they just
retarget from "camera transform" to "the overlay's creation/scale/
position transition." Left one open question for Smith, not decided
here: does the overlay grow anchored exactly at the Pile's original
position (may clip a viewport edge for a pile near the table border),
or does it nudge itself to stay fully on-screen? A real HCI call, not
an architecture one. Full text: `docs/ARCHITECTURE.md` D131.

## Sprint plan review — US-117 (2026-09-11): APPROVED

Mouse's 5-phase breakdown (111 auto-fit, 112 zoom-out control, 113
focus-zoom core, 114 edge polish, 115 reserved bug-fix) matches D130/
D131's own AC groupings cleanly - no phase mixes D130's superseded
camera language with D131's overlay mechanism, and the 113/114 split
keeps the harder edge-clamp math from blocking sign-off on the core
hover/click/drag-suppress mechanism. Handed to Neo for Phase 111.

## Phase 111 code review (2026-09-11): APPROVED

Confirmed no dead references survive the `tableFit.js` -> `tableZoom.js`
swap (grepped for `tableFit`/`computeFitScale`/`--table-fit-scale`/
`recomputeTableFit` across `src/`, `style.css`, `index.html`, `tests/` -
none). `tableZoom.js` stays a pure module with no DOM dependency, same
shape as every other pure module this project favors. The
`designLint.check.mjs` fix is scoped correctly (`insideZones` only, so
it can't paper over a real regression in unrelated chrome) and Trin's
mutation check proves both new guards are load-bearing, not incidental.
The phase-113 forward-note in `style.css` (transform makes `#zones` a
containing block for `position: fixed` descendants - the D131 overlay
must append to `<body>`) is exactly the kind of thing that would
otherwise be rediscovered the hard way next phase.

## Phase 113 code review (2026-09-11): APPROVED

The pile-ID tracking + `reapplyFocusZoom` design is the right answer to
`renderZones`' wholesale rebuild - Trin's mutation check (neutering it
reproduces the exact duplicate-element failure) proves it's load-
bearing, not decorative. The `pointerleave`-on-the-overlay-itself fix
(rather than delegating through `#zones`, which stops receiving events
from a reparented-to-`<body>` element) is the correct read of the same
DOM-mechanics constraint the phase-111 `style.css` note already
flagged for `position: fixed` + transformed ancestors. Trin's caught
gap (none of the 5 original tests touched the re-render-survival claim
at all) is exactly the kind of thing a review from code alone would
have missed too - good catch on Trin's part, not just Neo's build.

**Noting for the sprint plan**: phase 114's T114.1 (viewport clamp) is
ALREADY DONE - `clampOverlayPosition` was wired into `applyFocusZoom`
from the start of 113, not deferred. Phase 114 reduces to T114.2 only
(confirm drag-OUT-of-a-focused-pile live, proving D130's "no drag/drop
code changes needed" claim) plus whatever live-browser check that
needs. Telling Mouse rather than silently shrinking the phase myself.

## Phase 114 code review (2026-09-11): APPROVED

The reparent-first-at-scale-1-then-measure fix is the right answer,
and I like that it's a REAL fix rather than a fudge-factor: it removes
the entire class of "predicted size vs. actual size" bug by never
predicting - one DOM move (no visual change, since it's pinned to the
exact original screen position) buys an accurate measurement before
anything grows. Trin's mutation check (reverting to the stale rect
reproduces the exact original failure) proves it, not just plausibly
explains it. The 1px test tolerance is the same, already-established
category of fix as phase 111's 44px-floor rounding - not a new
precedent, consistent with it.

D130's drag-out claim is now proven live (T114.2), not just argued from
reading `dropTarget.js`'s own header comment. US-117's implementation
is COMPLETE: phases 111/113/114 all shipped and reviewed. Phase 115
(reserved bug-fix slot) has nothing outstanding to consume - every real
bug found this sprint (the 44px auto-fit conflict, the re-render
duplicate-element gap, the clamp under-measurement) was fixed inline
in the phase that found it, same pattern as prior sprints' Phase
96/102 precedent.

## Next Steps
@Oracle *ora groom - sprint implementation is done, move to Stage 3
(sprint close): groom docs, then Smith's end-to-end test, then retro,
then Cypher launch.

---

Iteration 2 (Neo) is the WIRING ONLY — Conditions 1 and 2 are done.
D129 should be written up in `docs/ARCHITECTURE.md` (it is currently
only in CHAT.md and the state files); note that `docs/DECISIONS.md`
already stops at D20 while D21-D28 live only in ARCHITECTURE.md, so
follow ARCHITECTURE.md and do not start a third location. Smith's UX gate is correctly SKIPPED this iteration
(nothing is wired, so there is no observable surface) and is REQUIRED
in iteration 2 — overlap is the most directly user-visible thing on
the table, and `lint-design`'s 9 red violations are user-facing
layout failures, not lint noise.

---

## `*lead arch slider` (2026-09-13)

Tighten/Loosen slider (queued item #1). User answered the 3 real
design questions directly (via Smith's gate): live updates while
dragging, no numeric readout, slider-only (no +/- nudge buttons kept
alongside). One nuance in the live-update answer needs a real
architecture response, not just "wire it up":

> "Live but don't let the slider move while the stack tighten/loosen
> or it won't work"

Read as: whatever renders the slider's own handle position must not
get overwritten by the app's normal state-driven re-render while the
user's pointer is still down on it - a classic controlled-input
fight-the-user bug (set `.value` from incoming state on every render,
and the browser's native drag tracking loses against it, or worse, the
element gets torn down and rebuilt mid-drag and the OS-level pointer
capture is lost outright).

Checked whether this is already a risk in this codebase: `ui.js`'s
`openStackActionMenu`/pile-level menu build fresh DOM once per open,
appended to `document.body`, and `renderGameFromView` (`main.js`)
never calls `closeCardContextMenu()` - so an open menu already survives
a full state re-render untouched today. That's good news structurally,
but NOT a guarantee once a `<spread-slider>` element sits inside that
menu and Neo wires it to *reflect* the replicated spread value (needed
so a second tightened-by-someone-else's-slider stack still shows
correctly if you didn't open the menu yourself, and so a freshly
opened menu shows the CURRENT value) - that reflection path is exactly
where the bug would get introduced if built naively.

### Decisions
1. **New reducer action `SET_STACK_SPREAD`** (absolute value, not
   delta) alongside the existing `ADJUST_PILE_SPREAD` — same
   clamp-to-`[MIN_SPREAD, kind.maxSpread]` and same stack-routing
   rules (pile-level route-to-every-stack vs one `stackKey`), but takes
   a value because a `<input type=range>`'s native event already IS an
   absolute value; converting that to a delta and re-adding it every
   drag tick is unnecessary indirection and reintroduces exactly the
   float-drift `ADJUST_PILE_SPREAD`'s own comment warns about, at a
   much higher event rate (every drag tick vs one click). Chose a
   sibling action over overloading `ADJUST_PILE_SPREAD` with an
   `absolute` flag — two clear action shapes over one action with a
   mode switch.
   `ADJUST_PILE_SPREAD` stays for now (Tighten All/Loosen All step
   buttons at the pile level are staying step-based since the slider
   replaces per-stack + pile-level UI, not the underlying step
   semantics for anything not converted).
2. **`<spread-slider>` Web Component** (per [[feedback_encapsulate_webcomponents]]
   convention) owns its own interaction lifecycle:
   - Exposes a `value` property/attribute (the external, replicated
     spread) and `min`/`max` (from the pile kind's `maxSpread`).
   - Internally tracks whether IT is the thing being dragged (its own
     `pointerdown`→`pointerup`/`pointercancel` on the internal
     `<input>`), and while that's true, ignores/does not reapply an
     external `value` re-set — the component is the single source of
     truth for its own displayed position during an active drag, and
     only re-syncs from the external prop once the drag ends. This is
     the direct fix for the user's warning.
   - Fires a plain `input`-style custom event with the new absolute
     value on every native `input` event (live, per the user's
     answer) — Neo wires that to dispatch `SET_STACK_SPREAD`.
   - No numeric readout in the component's own markup (per the user's
     second answer) — CSS-only handle, no dependent text node to keep
     in sync.
3. Old Tighten/Loosen/Tighten All/Loosen All buttons (`pileActions.js`
   `tightenAll`/`loosenAll`/`tightenStack`/`loosenStack`) are REMOVED
   outright, not kept alongside — per the user's third answer and
   standing no-back-compat-shim convention. `ADJUST_PILE_SPREAD` itself
   stays (used internally by `SET_STACK_SPREAD`'s sibling clamp logic
   is duplicated, not reused via delegation, to avoid coupling an
   absolute-set path through a delta computation just to reuse code —
   Neo's call at implementation time if a cleaner shared-clamp helper
   emerges).

### Rejected
- Reusing `ADJUST_PILE_SPREAD` with a computed delta (`newValue -
  current`) - works but reintroduces float accumulation error at a
  much higher event frequency than clicks ever produced, for no
  benefit over a proper absolute-set action.
- A readonly reflected value using a MutationObserver or re-render
  hook. attribute-changed-callback + the pointer-active guard is
  simpler, is the standard custom-element pattern, and doesn't need to
  reach outside the component's own DOM.

## Next Steps
@Smith *user feedback arch (Gate 2) - then @Mouse *sm plan sprint. This
is small enough to likely be ONE phase like the check-story-numbers
sprint, but Mouse should confirm sizing since it touches state.js
(new reducer action), a new tools-adjacent Web Component file, AND
ui.js wiring across two menu call sites - slightly more surface than a
single pure-function tool.
