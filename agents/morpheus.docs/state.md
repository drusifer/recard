# Agent State

## Context

`*lead review stackable` iteration 1 (D129 domain model). Reviewed the
code, not the summary. The hierarchy move and the offset formula are
right and I approve them; two seams the iteration did NOT touch will
break the wiring if they aren't settled first, and one of them changes
`offsetIn`'s interface — so this is APPROVED WITH CONDITIONS, and the
conditions are for iteration 2 before it writes a line of wiring.

## Current Task

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

## D130 — Infinity Table (US-110) arch pass (2026-09-10)

Cypher flagged US-110 as arch-significant (no zoom/pan camera exists
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

## Next Steps

@Smith owns next move: `*user review US-110` (Gate 1), armed with
D130's answers. Not yet planned into a sprint — that's Mouse's step
after Gate 1 passes.

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
