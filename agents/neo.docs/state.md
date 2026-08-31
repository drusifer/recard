# Agent State

## Context

### Architecture (binding, documented in docs/ARCHITECTURE.md - D82 through D90, all current)
**Core invariant** (top of ARCHITECTURE.md): Piles are arrangements of
Cards/TableObjects. All cards can be moved (drag and drop) by ANY
player, ANY time, from ANY pile to ANY pile, no matter what. D82-D85
made this fully literal (no per-card ownership/visibility gate, no
per-pile authorization gate, card redaction deleted entirely). Detailed
reasoning for D82-D85 lives in ARCHITECTURE.md and `agents/CHAT.md` -
not restated here, this file indexes forward from D86.

- **D86**: `CHANGE_PILE_TYPE` fixed - pile `kind` IS the look
  (`PILE_TYPES[kind].component`: `pile-panel`/`fan-pile`/`deck-stack`),
  not just game-rules. `deck`/`hand` joined as valid TARGETS.
- **D87**: Superseded D86's source/target asymmetry - `CHANGE_PILE_TYPE`
  is fully symmetric now, `CHANGE_PILE_TYPE_KINDS = Object.keys(PILE_TYPES)`
  used both ways (any kind ↔ any kind). `ensureHandPile` hardened to
  mint a fresh `randomPileId()` instead of reusing a canonical id
  already claimed by a converted-away pile (real id-collision fix).
- **D88**: Card conservation is now an ALWAYS-ON runtime invariant.
  `reduce()` (`state.js`) checks after every action except `RESET` that
  the exact multiset of card ids across all piles is unchanged - throws
  immediately naming exactly what's missing/duplicated/appeared. Caught
  a real bug on the first pass: a second `DEAL` was silently destroying
  cleared hand cards - fixed (`DEAL` now reclaims via new `toDeckCard`
  before redistributing).
- **D89**: Reinstated `CHANGE_PILE_TYPE`'s ownerId-required guard for
  `hand` target (D86's original, D87 had dropped it) - orphaned
  (ownerless) hand piles are structurally impossible again, per direct
  user request ("no need to support orphaned piles since that should
  now never happen") rather than keep correctly handling a state that
  doesn't need to exist.
- **D90 (biggest, just finished): full zone/pile naming conflation
  fix.** User's own framing: "the shape is Table->Zone->Pile->Card.
  KISS, simplify... I don't want any kind of thing that conflates
  zones and piles." Full audit + mechanical rename, no behavior change:
  - Pile kind `'zone'` → `'plain'` (`SNAPSHOT_VERSION` 3→4, old saves
    with the old kind string discarded on load, not migrated).
  - `state.js`: `zonesOf()`→`pilesOf()`, `findZoneAndCard()`→
    `findPileAndCard()` (`{zoneId,card}`→`{pileId,card}`), `PLAY`'s
    `action.zoneId`→`pileId`, `MOVE_CARD`'s `action.toZoneId`→
    `toPileId`, `DEFAULT_ZONE_ID`→`DEFAULT_PILE_ID`.
  - `viewFor`'s wire shape: the per-pile view array (was confusingly
    named `zones`) → `piles`; the REAL Zone registry (was forced into
    `zoneRecords` to avoid colliding with the field above) → just
    `zones`, as it should always have been.
  - `ui.js`/`main.js`: `renderZoneCards`→`renderPileCards`,
    `performZoneDrop`/`showZoneDragOver`/`clearZoneDragOver`→
    `performPileDrop`/`showPileDragOver`/`clearPileDragOver`,
    `dropCardOnZone`(main.js)→`dropCardOnPile`, `data-zone-id` DOM
    attribute→`data-pile-id`, every `zone`-named param/local actually
    holding a pile→`pile`/`allPiles`. Shared `.zone-drag-over` CSS
    class (used on both a real Zone box AND a Pile row, by design) →
    level-neutral `.drag-over`.
  - `pileActions.js`: `ACTION_SPECS`' `target`/`from: 'zone'` tag
    (meaning "any table-side pile") → `'table'` (matches the existing
    `tableSide` vocabulary already in this codebase).
  - **Left alone on purpose** (already meant the real Zone entity):
    `CREATE_ZONE`/`RENAME_ZONE`/`REMOVE_ZONE`, `MOVE_PILE`'s
    `targetZoneId`, `CREATE_PILE`'s `zoneId`, every pile's own `zoneId`
    field, `TABLE_ZONE_ID`, `<zone-panel>`, `.zone` CSS,
    `GameConfig.zones`. `CREATE_ZONE` double-checked specifically - it
    DOES create a real Zone record (`makeStandaloneZone`), bundled with
    a starter pile as a UX convenience; not a naming bug.
  - **One real live bug caught mid-refactor**: `main.js`'s
    `playerAnchorRect` still queried `[data-zone-id="hand:<id>"]` after
    the DOM attribute rename - would have silently broken the
    cursor-motion anchor (falling back to the whole screen) had the
    full-tree grep sweep not caught it.
  - Verified: 509/509 tests, `make check`/`lint-js`/`lint-style` clean
    (7 pre-existing cognitive-complexity baseline, unchanged),
    `lint-design` violation set unchanged in content (pre-existing
    Table-Zone/Bob overlap + scroll debt, not touched by this rename -
    a `git stash` comparison had a near-miss with an auto-appended
    CHAT.md conflict from the `make` skill hook, recovered cleanly; see
    "Lesson" below). Trin mutation-killed the `PLAY.pileId` rename (16
    tests fail if reverted) and swept the full tree for stray old names
    - zero live references left, only correctly-historical comments.

### Lesson learned this session: `git stash` is dangerous mid-session
The `make` skill's `bobp make <target>` wrapper auto-appends a build
status message to `agents/CHAT.md` on every run. `git stash` reverts
ALL tracked files including CHAT.md; if any `bobp make` call happens
between the stash and the pop, CHAT.md diverges and `git stash pop`
refuses (conflict), leaving your real work sitting in the stash while
the working tree looks deceptively close to normal (only CHAT.md shows
as modified). Recovered cleanly this session by diffing CHAT.md against
HEAD, discarding the disposable auto-appended entry (`git checkout --
agents/CHAT.md`), then popping cleanly. **Going forward: don't use `git
stash` for baseline comparisons in this repo - use a worktree, a throwaway
branch, or `git diff`/`git show HEAD:<path>` instead.**

### Working conventions confirmed this session (still holding)
- TDD: write/update tests FIRST when feasible, confirm red, then fix.
- `bobp make check` (not raw npm) after every real change; `bobp make
  lint-js` periodically - compare against the KNOWN pre-existing
  baseline (7 cognitive-complexity errors in dropTarget.js/main.js
  x2/touchDrag.js/ui.js x3 - stable all session, never touched).
- e2e (`npm run test:e2e`) still not run this session (frugal, standing
  user preference) - `node --test tests/*.test.js` (via `make check`)
  is the default; live Playwright/devserver spot-checks reserved for
  UI-surface changes no unit test could cover (not needed this pass -
  D86-D90 were all reducer/naming work with full unit coverage).
- Decisions get broadcast to `agents/CHAT.md` in the same turn they're
  made, kept under 512 chars with a pointer to the full text in
  `docs/ARCHITECTURE.md` - the long-form reasoning always goes in the
  doc, never only in chat.
- User's style: gives a directive, pushes further in the SAME direction
  almost every time, then does a genuine step back to question the
  underlying MODEL (e.g. "is deal a PileAction?", "are piles and zones
  the same thing?", "what's the purpose of a zone?") before issuing the
  next directive - those model-check questions are worth answering
  carefully and honestly (I corrected myself once this session on a
  wrong claim about `CREATE_ZONE` after over-trusting a subagent audit
  without verifying it myself) since they often precede the next big ask.

## Current Task

**Status:** D82-D90 committed as `14ddf1a` (confirmed on cold-start,
see below). Mid-`*fix` on a real bug in Gin Rummy the user found by
playing it: hand cards showed an owner-name tag AND a "face-down" text
label under every card (clutter), and face-down cards rendered their
real rank/suit instead of a back (D84's redaction removal never meant
to touch the VISUAL, only who the DATA reaches - `ui.js`'s
`renderPileCards` never distinguished the two).

First pass fixed it with `pile.kind !== 'hand'` / `card.faceUp`
if-checks inline in `renderPileCards` - user explicitly rejected this
("not clean code... use Polymorphism... we have a Pile Hierarchy use
it"). Reworked (current state, handed to Trin):
- `Pile.showsFace(pile, card, viewerId)` (base: `card.faceUp !== false`)
  and `Pile.showsOwnerTag()` (base: `true`) - new static hooks on the
  existing Pile hierarchy, same calling convention as `cardActions`/
  `canRemoveCard` etc.
- `HandPile` overrides both `false`/`false` (a hand's own `faceUp` is
  never a real orientation regardless of who's asking; opponent hands
  now correctly render as backs, no owner clutter).
- **New** `src/piles/PlayerHandPile.js` extends `HandPile`, overrides
  `showsFace` `true` - the ONE case (viewer looking at their own hand)
  that needs the opposite of the generic hand rule.
- `src/piles/pileTypes.js`'s new `pileClassFor(pile, viewerId)` picks
  `PlayerHandPile` vs `PILE_TYPES[pile.kind]` - the one place that
  decision is made; `ui.js`'s `renderPileCards` calls
  `pileClass.showsFace(...)`/`showsOwnerTag(...)` with ZERO
  `pile.kind === 'hand'` branching left in the render loop.
- Real, measurable payoff, not just taste: `renderPileCards`'s
  cognitive-complexity lint number went 25 (before)->26 (first
  if-check pass)->25 (polymorphic version) - back to the EXACT
  pre-existing baseline, not just "not worse."

Follow-up `*nit` (direct user request, "remove owner tags completely
that is not a requested feature"): the owner-name tag was never asked
for, only inherited from the pre-D84 redaction-era code. Removed
entirely - `ui.js`'s `ownerTag()` helper + its one call site,
`Pile`/`HandPile`'s `showsOwnerTag` hook (now dead with no caller left),
`.owner-tag` CSS rule, and the `resolveOwnerName` destructure in
`renderPileCards` (now unused there - `options.resolveOwnerName` is
still used directly elsewhere, e.g. zone-panel headers, untouched).
`renderPileCards` cognitive-complexity: 25 (original baseline) -> 26
(first if-check pass) -> 25 (polymorphic version) -> 22 (owner-tag
removal) - net improvement over the pre-existing baseline, not just
neutral.

Follow-up `*impl` (direct user request, "finish the Meld pile types" -
prompted by the user asking what happened to battlefield/exile/stack's
type-specific behavior, then noticing melds specifically): `RunPile`
was fully built (D56) but never registered - only reachable through
`FoundationPile extends RunPile`. `SetPile` was a placeholder with no
`canAccept`. Implemented `SetPile.canAccept` (same-rank, any suit -
suit-uniqueness is structurally free from a single deck) and registered
both `run`/`set` in `PILE_TYPES` (`src/piles/pileTypes.js`) - no
`SNAPSHOT_VERSION` bump (additive only), no preset wiring (manual
`changePileType`, same convention as every other kind). TDD: wrote the
registry-count/canAccept/label tests first (confirmed red), then
implemented.

All of this thread's work (card-back polymorphism, owner-tag removal,
Meld finishing) is now written up as D91 in `docs/ARCHITECTURE.md` and
posted as a decision broadcast to CHAT.md.

513/513 (4 new: registry-count, RunPile/SetPile canAccept, SetPile's
inherited Meld behavior, pileKindLabel), `make check`/`lint-js`/
`lint-style` all clean, 7-error baseline unchanged (`renderPileCards`
itself improved: 25->22 net over this whole thread). Handed to Trin
(`*qa uat`) per the `*impl` chain - not yet QA'd, Morpheus review still
pending after that.

Follow-up `*nit` (direct user request, "we're missing a bunch of pile
actions, like sort by rand [sic], sort by suite, and split pile"):
- **Sort by rank/suit - DONE.** New `SORT_PILE` reducer (`state.js`):
  owner-only, `action.by` picks the primary key (`RANKS`/`SUITS`
  index), the OTHER key breaks ties, `Array#toSorted`. Wired through
  `main.js`'s `performSortPile` -> `onPileAction`/`handlePileAction`.
  Real replacement for D14's retired `handOrder.js` - that file (and
  its test) is DELETED now (`reconcileOrder`/`sortByRank`/`sortBySuit`
  had no caller left anywhere but its own test).
- **Split/Pickup picker - DONE** (user explicitly chose the FULL
  fan-raise/hover-to-pick-index picker over a minimal button, as its
  own `*impl`). See below.

### Split/Pickup picker - implementation notes (D91-follow-up)
- `ACTION_SPECS.split`/`pickupSplit` (`pileActions.js`) - non-
  destructive buttons (they only TOGGLE the picker, nothing splits
  until a gap is clicked).
- `Pile.pileActions()` offers both (disabled below 2 cards, matching
  `splitPileAt`'s own minimum, in `disabledActions`). `MeldPile.
  pileActions()` offers both too (its own doc comment had already
  anticipated this - "a meld is bulk-splittable too"). Deliberately
  NOT added to `CascadePile`/`RankAdjacentPile`/`StackPile`/
  `BattlefieldPile`/`ExilePile`/`HandPile`/`DeckPile` - none had an
  anticipatory comment for it, and several (`HandPile`, `Battlefield`)
  structurally exclude bulk split already. Don't add unprompted.
- `main.js`: `splitPicker` (module-level, `{pileId, mode} | null`) is
  the client-local "which pile is mid-split" state the old plan called
  for - same pattern as `lastDealCount`. `toggleSplitPicker`/
  `performSplitCommit`/`rerender` are the three functions around it.
  `handlePileAction(view, pileId, actionId, value)` is `onPileAction`'s
  entire dispatch table, extracted to a top-level function (was inline
  in `renderGameFromView`) - partly for this feature, partly because
  that closure was getting unwieldy.
- `ui.js`: `renderSplitPicker` (new) - a `fan-row` reusing the hand's
  own raise/overlap CSS, with `.split-picker-guides` (25/50/75% marks)
  and `.split-picker-highlight` (follows the pointer to the nearest
  gap, `nearestGap`/`gapX`). `renderPile` branches to it when
  `options.splitPicker?.pileId === pile.id`. Real bug caught and fixed
  before it ever ran: cards must NOT be real `disabled` buttons inside
  the picker row - a disabled button never fires `click` in a browser,
  which would have silently swallowed every click landing directly on
  a card instead of the gap between two. Fixed with `pointer-events:
  none` on `.split-picker-card .card` (style.css) so hit-testing
  passes through to the row.
- **Known, disclosed cost, not silently absorbed**: `main.js`'s
  `renderGameFromView` cognitive-complexity lint number went from the
  session's stable 65 baseline to 77 over this whole `*nit`+`*impl`
  thread (sort + split combined) - confirmed genuinely higher, not a
  lint-cache artifact (`npx eslint --no-cache` matches `bobp make
  lint-js`). Extracting `handlePileAction` to a top-level function did
  NOT claw this back the way it should have in theory (SonarJS's
  cognitive-complexity model apparently doesn't behave the way I
  expected here - spent real effort confirming this empirically rather
  than assuming, see the `git stash` mishap below). This is a real
  increase in an ALREADY-violating pre-existing baseline entry (not a
  new violation location - still 7 total error locations), but it's
  worse than it was, and Trin/Morpheus should know that rather than
  have it slide by as "unchanged baseline."
- **Mid-session mistake, corrected**: used `git stash` to isolate this
  exact complexity question, directly against my own "Lesson learned"
  note above (`git stash` is dangerous mid-session in this repo).
  Recovered cleanly this time too (`git stash pop`, no conflict,
  verified 509/509 after) - but the lesson clearly needs to be
  stronger than a comment in this file: don't use `git stash` here,
  full stop, use `git show HEAD:<path>`/`git diff` instead, no
  exceptions for "just checking one thing."
- 509/509 (net: sort added 5 tests, split picker added none - `ui.js`
  has no unit-test harness for DOM rendering, same established gap as
  the card-back/owner-tag work earlier this session - handOrder.test.js's
  9 tests removed with the file), `make check`/`lint-style` clean,
  `lint-js` 7 error LOCATIONS (matching count) but main.js's own number
  is worse (65->77, see above). NOT yet QA'd by Trin, NOT yet reviewed
  by Morpheus, NOT smoke-tested live (no dev-server/browser check done
  this thread - genuinely recommended here, this is real new UI/DOM
  behavior no unit test touches).
- No ARCHITECTURE.md D-entry written yet for sort+split (would be D92,
  since D91 already covers the earlier card-back/owner-tag/meld thread)
  - write it once Trin/Morpheus have signed off, not before.

### Queued, not started: layout Load/Save/Reset relabel (direct user request)
User's own words: "*nit reset layout is wrong it should reset the
current layout to the original preset. Maybe add a Load to make it
less confusing. Load - reset to a saved custom state, Save/Save As -
the usual, Reset - restore preset layout." Current `#reset-layout-btn`
(`performResetLayout`, main.js) - CHECK what it actually does against
this ask before assuming it's simply mislabeled; the user's framing
implies today's Reset conflates "restore my saved custom layout" with
"restore the built-in preset default." Look at `layoutOverrides.js`/
`panelLayout.js` and the three button handlers
(`performSaveLayout`/`performSaveLayoutAs`/`performResetLayout`)
together before touching anything - this is a *nit-sized relabel/
re-wire, not a redesign, but get the actual current behavior right
first.

### Split picker follow-up (user feedback, addressed)
Three pieces of direct feedback after the picker landed:
1. **"we don't need the split behavior with the pickup action, keep
   that one simple"** - `pickupSplit` no longer opens the picker at
   all. `main.js`'s `handlePileAction` calls a new
   `performInstantSplit('PICKUP_SPLIT', pileId, pile)` directly -
   `Math.floor(count/2)`, one click, matching `pileCountInput`'s own
   comment which had ALREADY recorded "always splits in half, one
   click" as this project's established precedent from before the
   picker existed. `split` (non-deck) still opens the real picker -
   only pickup was asked to simplify.
2. **Real UX bug, found from live use**: the picker's guide/highlight
   lines were anchored to `container` (`renderSplitPicker`, ui.js) -
   the WHOLE `.pile-section` including its header/title bar, not just
   the card row - so they visually stretched from behind the header
   down through the cards, reading as stray residual lines. Fixed:
   anchored to `row` itself instead (`.split-picker-row` is
   `position: relative` now, guides/highlight `inset`/`bottom` relative
   to it) - exactly the cards' own box, nothing else. Also fixed a
   related double-subtraction: guide/highlight `bottom` offsets used to
   redundantly re-subtract clearance the row's own `padding-bottom`
   already reserves.
3. **"add the split pile action to the Deck Pile type"** -
   `DeckPile.pileActions` now offers `split` (host-only, alongside
   deal/reshuffleDeal/shuffle). Deliberately NOT the interactive picker
   - a deck's cards are anonymous/hidden (`visibility: 'hidden'`), so
   there's no gap to hover between. Routes through the same
   `performInstantSplit` as the simplified pickup above (dispatches
   `SPLIT_PILE` instead of `PICKUP_SPLIT`). `pickupSplit` deliberately
   NOT added to the deck - never asked for.

510/510 (1 new: deck `disabledActions`), `make check`/`lint-style`
clean, `lint-js` unchanged from the prior handoff (still 7 locations,
main.js's own number still 77 - not made worse by this follow-up, but
not clawed back either). Handed to Trin again (`*qa uat`).

## Next Steps

### 1. Split/Pickup picker - awaiting Trin QA + Morpheus review
Not yet handed past Neo's own pre-handoff checks. Cold-start resuming
here: post the `*qa uat` handoff to Trin if it wasn't already done in
the live session, per the `*impl` chain (Neo -> Trin -> Morpheus).
Flag the complexity regression and the lack of live/browser
verification explicitly - don't let either slide silently.

### 2. Layout Load/Save/Reset relabel - queued *nit, start after #1
See "Queued, not started" above for the full ask and where to look
first.

### 3. Possible follow-up from D90, not requested yet
The UI offer layer's `isOwner`/`isShared` gate in `Pile.pileActions()`
still hides Take/Split/Hide-Show/changePileType/remove buttons on
another player's personal pile even though the reducer permits all of
them under the Core invariant (flagged repeatedly since D85, never
acted on unprompted). Don't touch unless the user raises it.

### 4. Minor open threads (not blocking, not forgotten)
- `docs/DECISIONS.md` still stops at D20 (pre-existing gap, predates
  this session) - `docs/ARCHITECTURE.md` is current through D91 (D92
  pending, see above). `agents/CHAT.md` is the authoritative day-to-day
  record either way.
- Nothing has been committed this entire session (spans D82-D91+ work).
  Awaiting explicit user request per this project's standing "only
  commit when asked" discipline - do not commit unprompted.

### Resume instructions (cold start)
1. `git status --short` - many files modified, nothing should be
   force-reverted; if it looks smaller/different than expected, diff
   against HEAD before assuming anything, don't guess.
2. Confirm `bobp make check`/`lint-js`/`lint-style` match this note's
   own numbers before touching anything (509/509, lint-style clean,
   lint-js 7 locations with main.js's own number at 77, not 65).
3. Read `docs/ARCHITECTURE.md`'s Core invariant section + D82-D91 for
   full current-state reasoning if the user's next message touches
   drag-and-drop, pile types, card conservation, zone/pile naming, card
   face/back rendering, or split/sort actions - don't re-derive from
   `agents/CHAT.md` alone, the doc is the binding spec.
4. If the user's next message is about the picker not working right,
   or about Trin/Morpheus feedback on it: Next Step #1 above.
5. If about layout Save/Load/Reset: Next Step #2 above - read the
   user's exact words in this file first, don't re-derive the ask from
   memory.
6. Do NOT use `git stash` for ANYTHING in this repo, no exceptions -
   see "Lesson learned" above AND the split-picker note above it (this
   was violated a SECOND time this session, recovered both times, but
   don't rely on a third clean recovery). Use `git diff`/`git show
   HEAD:<path>` or a worktree instead, always.
