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

**Status:** D82-D90 all shipped, tested, documented, and QA'd (Trin
PASS on each `*fix`/`*nit` loop this session). `make check`/`lint-js`/
`lint-style` all green at the current baseline. **Nothing has been
committed this entire session** - 31 files modified, all uncommitted,
spanning this session's D82-D90 work plus earlier-session RTG/art-
pipeline work that predates it. Context being cleared for space; this
file is the full resume point.

## Next Steps

### 1. Nothing is currently in-flight - awaiting the user's next request
No open implementation thread. If resuming cold with no new user
message yet, there is nothing to continue - wait for direction.

### 2. Split(index)/Pickup(index) picker UI - still THE oldest deferred item
Reducer (`SPLIT_PILE`/`PICKUP_SPLIT`) is done, tested, and fully
functional - there is still NO way to trigger a split from the running
app (no header button since the old `'split'` UI was deliberately
removed, not left half-wired). Original request: clicking a pile's
Split/Pickup control raises its cards into a tight fan and KEEPS them
raised (toggle) until clicked again; hovering highlights the nearest
card/index with guides at 25%/50%/75% intervals; clicking commits.

Real architectural obstacle: this app tears down and rebuilds every
pile's DOM from scratch on every state broadcast - a toggled "stay
raised" mode needs real CLIENT-LOCAL UI state that survives a
re-render, similar to `panelLayout.js`/`layoutOverrides.js`'s existing
local-only prefs. Prototype that mechanism FIRST.

Plan (not started):
- New `ACTION_SPECS` shape for `split`/`pickupSplit` (not `enum: true`
  - needs something like `pickIndex: true`).
- `Pile.pileActions()`/`DeckPile.pileActions()` need to offer them
  again once the picker exists.
- Client-local "which pile is in split-picking mode" state in
  `main.js` (module-level, like `lastDealCount`).
- `ui.js`: a picker renderer building on `renderPileCards`'s (D90
  rename - was `renderZoneCards`) existing `fan: true` option.
- Dispatch `SPLIT_PILE`/`PICKUP_SPLIT` with the chosen `index` on
  commit - already fully wired reducer-side.

### 3. Possible follow-up from D90, not requested yet
The UI offer layer's `isOwner`/`isShared` gate in `Pile.pileActions()`
still hides Take/Split/Hide-Show/changePileType/remove buttons on
another player's personal pile even though the reducer permits all of
them under the Core invariant (flagged repeatedly since D85, never
acted on unprompted). Don't touch unless the user raises it.

### 4. Minor open threads (not blocking, not forgotten)
- `docs/DECISIONS.md` still stops at D20 (pre-existing gap, predates
  this session) - `docs/ARCHITECTURE.md` is current through D90.
  `agents/CHAT.md` is the authoritative day-to-day record either way.
- Opponent hand cards render a per-card owner tag in addition to the
  seat panel's own name label - cosmetic, never reported as a problem,
  leave alone unless raised.
- 31 files uncommitted, spanning this whole session - no commit made,
  awaiting explicit user request per this project's standing "only
  commit when asked" discipline.

### Resume instructions (cold start)
1. `git status --short` to confirm the 31-file uncommitted set is still
   there (nothing should have changed it since this file was written).
2. Confirm `bobp make check` and `bobp make lint-js` are still green/at
   baseline before touching anything (both were green as of this note).
3. Read `docs/ARCHITECTURE.md`'s Core invariant section + D86-D90 for
   full current-state reasoning if the user's next message touches
   drag-and-drop, pile types, card conservation, or zone/pile naming -
   don't re-derive from `agents/CHAT.md` alone, the doc is the binding
   spec and is fully current.
4. If the user's next message is about Split/Pickup or a "raise the
   pile into a fan" UI: this is Next Step #2 above, start there.
5. Do NOT use `git stash` for any before/after comparison in this repo
   - see "Lesson learned" above. Use `git diff`/`git show HEAD:<path>`
   or a worktree instead.
