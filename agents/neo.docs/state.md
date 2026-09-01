# Agent State

## Context

**Binding architecture**: `docs/ARCHITECTURE.md`'s Core invariant
(fully permissive drag-and-drop, no redaction) and D82-D95 are current
and binding. The `Pile` class hierarchy (`src/piles/*.js`) is now real:
instances, not plain data passed into static methods - `revivePile(data)`
and `pileInstanceFor(pile, viewerId)` (`src/piles/pileTypes.js`) are the
only two places a `kind` string turns into a live object anywhere in
the codebase. `state.piles` stays plain records at rest (free
serialization via each class's `toJSON()`, zero changes needed to
`session.js`/`persistence.js`).

## Current Task

**Status: D-item (universal-DnD guarantee test) shipped, awaiting Trin.**
`*impl continue morph refactor` resolved to Morpheus's own next-item
pick (`morpheus.docs/state.md` Next Steps #2): the DnD guarantee test,
smallest/most isolated of the three open refactor items. Added to
`tests/piles.test.js` (right after the existing "every concrete pile
class extends Pile" test, same file/style, no new test file): iterates
`Object.values(PILE_TYPES)`, constructs each with one visible card
(`faceUp: true`, `ownerId: 'someone-else'`), asserts `cardActions()`
includes `move` or `play`. `DeckPile` is explicitly named and skipped -
its own file comment (D34) says it never renders a per-card hover row
by design (Draw/Deal/Shuffle are pile-level, not per-card) - named
rather than silently excluded by a broader rule, so a genuinely new
future exception can't hide behind this one. Verified via `via` that no
other subclass overrides `cardActions` except `HandPile` (already
returns `move`/`play`) and `ExilePile`'s comment is stale history (it no
longer overrides `cardActions` at all, inherits base `Pile`). 512/512
tests (was 511), `lint-style` clean, `lint-js` unchanged at the
pre-existing 7-error cognitive-complexity baseline (all in `main.js`/
`ui.js`/`touchDrag.js`, none in the touched file). Handed to Trin for
`*qa uat`.

Not yet committed to git - waiting on Trin's UAT gate before that,
per this session's usual `*impl` sequencing (D93/D94/D95 pattern).

### What shipped this session (D91-D95, all in commit `f9d410b`)

- **D91**: card-back rendering made polymorphic (`Pile.showsFace`,
  `PlayerHandPile` for the viewer's own hand) after a rejected if/else
  first pass - direct user correction: "use Polymorphism... we have a
  Pile Hierarchy use it." Owner-name tags removed entirely (never
  actually requested). `RunPile`/`SetPile` finished and registered as
  real `changePileType` kinds (`run`/`set`).
- **D92**: Split/Pickup picker - a real guided fan-and-choose-a-gap
  picker for EVERY pile kind, deck included (`DeckPile.showsFace`
  keeps a deck's own fan showing backs, never real faces).
  `pickupSplit` was added then REMOVED per direct user correction
  ("there is not supposed to be a pickupSplit... Pickup is Take").
  Sort by rank/suit wired to a real `SORT_PILE` reducer action
  (previously offered by `HandPile.pileActions` with nothing behind
  it since D14's `handOrder.js` was retired - that dead file is
  deleted now too).
- **D93**: "THERE SHOULD BE NO CANONICAL PILES" (direct user
  directive, forceful). `DRAW`/`DEAL`/`SHUFFLE_DECK` no longer
  hardcode `DECK_PILE_ID` - every action is `pileId`-scoped like
  `MOVE_CARD`/`SPLIT_PILE` always were. Bigger follow-on, same
  session: the ENTIRE `Pile` hierarchy converted from plain-data-plus-
  static-methods to real ES class instances (constructor, instance
  methods, `toJSON()` for free serialization) - direct user override
  of an earlier architectural assumption ("undo the Piles are plain
  data objects decision... rich type hierarchy with domain
  abstraction"). `state.piles` itself stays plain at rest by design -
  `insertCard`/`removeCard` return plain shapes, so persistence and
  every existing plain-fixture test kept working unchanged.
- **D94**: `viewFor`'s old `switch (pileVisibility(pile))` (three
  near-identical branches post-D84) replaced by `Pile.getView()`/
  `contributeToView()` - real polymorphic dispatch, `viewFor` itself
  is now a one-line loop. The old `deckCount` top-level field (itself
  a canonical-pile vestige) is retired; `main.js` derives it from
  `view.piles` now.
- **D95**: card-count badges are a universal pile feature now, not a
  hand-only special case (that was the FIRST pass, corrected by direct
  user request: "make card counts a feature for ALL Piles"). One
  mechanism in `renderPileShell` (the one function every pile
  component funnels through) appends an absolutely-positioned corner
  badge for every kind. Deck's own old stack-card badge is suppressed
  inside a real pile (would double up) but still serves the standalone
  pre-game preview screen, which never reaches `renderPileShell`.

### Lessons from this session, worth remembering cold
- **Don't use `git stash` in this repo, ever** - violated TWICE this
  session (once documented in an earlier close-out, once again mid-
  session investigating a lint-complexity question). Both times
  recovered cleanly via `git stash pop`, but don't rely on a third
  clean recovery. Use `git diff`/`git show HEAD:<path>` or a worktree
  instead, unconditionally.
- When corrected on architecture ("polymorphism, not if/else";
  "no canonical piles"; "rich classes, not plain data"), the right
  response was to actually REDESIGN, not patch around the objection -
  each of D91/D93/D95 went through a rejected first pass before
  landing on the real fix. Don't defend the first pass; find what the
  correction is actually pointing at and fix that.
- SonarJS cognitive-complexity numbers on `main.js`'s `renderGameFromView`
  don't always move the way extraction-refactoring intuition predicts
  (verified empirically mid-session rather than assumed) - don't spend
  more than one honest check on a lint number that isn't blocking.

## Next Steps

**In-flight**: DnD guarantee test is with Trin for `*qa uat`. If Trin's
check passes, next per Morpheus's own sequencing is shell inlining
(`<pile-panel>`/`renderPile`, `<zone-panel>`/`renderZonePanel`) -
re-verify "zero other callers" still holds first (this session's other
changes may have added one). `zoneOptions` split (B) is last, and
`main.js`'s size should be re-measured before assuming the original
3-object shape still fits.

### Known open items, not currently assigned
1. **Morpheus's broader refactor plan** (`morpheus.docs/state.md`) has
   two steps not yet started: narrowing `main.js`'s `zoneOptions` into
   three layer-scoped objects (table/pile/card), and a universal-DnD
   guarantee test (`Object.values(PILE_TYPES)` iteration asserting
   `move`/`play` is always offered). Shell-component inlining
   (`<pile-panel>`/`<zone-panel>`) was scoped but not yet executed
   either - only the Deck-specific and viewFor pieces of that plan
   actually shipped this session.
2. **Layout Load/Save/Reset relabel** (direct user request, queued
   mid-session, never picked back up): "Load - reset to a saved custom
   state, Save/Save As - the usual, Reset - restore preset layout."
   Check `performResetLayout`/`performSaveLayout`/`performSaveLayoutAs`
   (main.js) against this framing before touching anything - the
   user's own words say today's Reset conflates two different things.
3. The UI offer layer's `isOwner`/`isShared` gate still hides some
   actions on another player's personal pile even though the reducer
   permits them (flagged repeatedly since D85, never acted on
   unprompted) - leave alone unless raised.
4. `docs/DECISIONS.md` stops at D20 (pre-existing gap) - `docs/
   ARCHITECTURE.md` is current through D95 and is the binding spec.

### Resume instructions (cold start)
1. `git log --oneline -3` should show `f9d410b` at HEAD on both
   `main`/`dev` - if not, something changed since this note, don't
   assume, check `git status`/`git log` fresh.
2. `bobp make check`/`lint-js`/`lint-style` should all be green at
   511/511 tests, 7-error baseline - confirm before touching anything.
3. Read `docs/ARCHITECTURE.md`'s Core invariant + D91-D95 for full
   current-state reasoning on anything touching Piles, card
   visibility, split/sort actions, or the deck.
4. Do NOT use `git stash` for anything in this repo, no exceptions.
