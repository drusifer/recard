# Agent State

## Context

Older sprint-by-sprint history (pre-D82) truncated from this file - it
had grown to 1121 lines of stale per-sprint review logs no longer
load-bearing. Full reasoning for anything before D82 is in
`agents/chat_archive/` (`*ora report` archives) and `docs/ARCHITECTURE.md`
itself, which is the current binding spec through D91. This file now
tracks only active/recent architectural work.

**Binding architecture**: `docs/ARCHITECTURE.md`'s Core invariant
(fully permissive drag-and-drop, no redaction) and D82-D91 are current.
The `Pile` class hierarchy (`src/piles/*.js`, `PILE_TYPES` registry,
`src/piles/pileTypes.js`) is real and sound - polymorphic dispatch for
`cardActions`/`pileActions`/`canAccept`/`disabledActions`/`showsFace`
all genuinely differ per subclass, proven working this session (Neo
reworked card-back/owner-tag rendering onto this exact mechanism after
a rejected if/else first pass).

## Current Task

**Status:** User (direct, `*chat @morpheus`) raised a code-quality
concern: `main.js` has "an enormous kitchen-sink `zoneOptions`" and
`ui.js`'s `renderZones` path is "the opposite of encapsulation."
Asked for a refactor PLAN (not implementation) using the existing
Table->Zone->Pile->Card hierarchy, real WebComponents encapsulating
behavior, a structural guarantee on universal drag-and-drop, and
specifically questioned Deck's inclusion in the universal
`changePileType` set ("WTF Deck?"). Reminded: YAGNI, KISS, DRY.

Investigated directly (file sizes, `zoneOptions`' actual shape, and the
Deck question) before writing anything - findings below are grounded in
real numbers, not impression.

### Diagnosis (concrete, not vibes)

1. **`main.js` (1790 lines) / `ui.js` (1921 lines)** are the two
   outliers in the codebase (every other file is under 340 lines,
   `state.js` at 1722 is the one other large file but it's a single
   cohesive reducer, not a grab-bag). `zoneOptions` (`main.js`,
   `renderGameFromView`) is a flat 23-property object - 17 callbacks
   (`onPlay`/`onReveal`/`onRotate`/`onPickup`/`onMoveCard`/`onCardLift`/
   `onDropCard`/`onSplitCommit`/`onPileAction`/`onRenamePile`/
   `onRenameZone`/`onRemoveZone`/`onMovePile`/`onReorderPile`/
   `onDropCardOnZone`/`onMovePanel`/`onResizePanel`) plus data fields,
   threaded UNFILTERED through every rendering layer: `renderZones` ->
   `<zone-panel>` -> `<pile-panel>`/`<fan-pile>`/`<deck-stack>` ->
   `renderPileShell` -> `renderPileCards` -> each card. A CARD-level
   renderer receives `onMovePanel`/`onResizePanel` it will never call;
   a ZONE-level renderer receives `onRotate`/`onSplitCommit` it will
   never call. Real Interface Segregation Principle violation - not a
   style complaint, an actual coupling cost (every layer can reach
   every callback, so nothing stops a future edit from wiring a
   card-level action straight to a zone-level effect by accident).

2. **Every "Web Component" in `src/components/*.js` is a thin shell**,
   not a real encapsulation boundary. Checked all six
   (`PilePanel`/`FanPile`/`DeckStack`/`ZonePanel`/`HeaderActions`/
   `ScoreZone`, 24-123 lines each): every one's `.render()` does
   nothing but forward straight into one of `ui.js`'s giant exported
   functions (`renderPile`/`renderPileShell`/`renderPileCards`/
   `renderZonePanel`/`renderActionHeader`/`renderSplitPicker`/
   `renderDeckStack`). The REAL polymorphic model (`PILE_TYPES`, item
   above) exists one layer down and is sound - but the rendering layer
   never asks it anything beyond `componentFor(kind)` (which DOM tag to
   use). Two real models coexist: a good one (the class hierarchy) and
   a procedural one (everything in `ui.js`) that doesn't use it. THAT
   is the "opposite of encapsulation" - not that WebComponents are
   missing, but that the ones present are hollow.

3. **The Deck bug ("WTF Deck?"), confirmed real and reachable**:
   `state.js`'s deck-finding logic (`deckOf`, `DRAW`, `DEAL`,
   `SHUFFLE_DECK`, `RESET`) is entirely ID-based - `pile.id ===
   DECK_PILE_ID`, NEVER `pile.kind === 'deck'`. `CHANGE_PILE_TYPE` has
   NO guard against converting the canonical deck pile's `kind` away
   (only an unrelated accident blocks `-> 'hand'`: the hand-target
   ownerId guard, since the deck is ownerless). Convert the deck to
   `'foundation'`/`'battlefield'`/`'run'`/etc TODAY and it keeps
   rendering as that new kind while `DRAW`/`DEAL`/`SHUFFLE_DECK` keep
   silently reading/writing it by id, unaware its `kind` changed. Two
   different models of "what makes a pile a deck" (id-based reducer,
   kind-based UI/registry) disagree, and "universal changePileType"
   was built assuming kind is always the right axis without checking
   whether an id-based structural role exists underneath. This is a
   real correctness bug, not a taste question.

### Proposed direction (YAGNI/KISS/DRY - explicitly NOT a rewrite)

The class hierarchy underneath is already good and proven working.
This is "finish moving the rendering layer onto polymorphism that
already exists, and narrow the options bag along real interface
boundaries" - not "throw it out and rebuild."

**A. Fix the Deck bug - CORRECTED per direct user override ("THERE
SHOULD BE NO CANONICAL PILES", all-caps, unambiguous).** My original
A.1 (make the deck permanently un-convertible) was REJECTED - it would
have preserved a canonical-id assumption instead of removing it. The
actual, bigger bug this surfaced: `DRAW`/`DEAL`/`DEAL_MORE`/
`SHUFFLE_DECK` are ALL hardcoded to `DECK_PILE_ID` today, not just
`CHANGE_PILE_TYPE`. Confirmed via RTG specifically: `DeckPile.pileActions`
offers `draw`/`deal`/`reshuffleDeal`/`shuffle` on EVERY deck-kind pile
(host-only, unconditional on kind alone) - RTG has 15 simultaneous
deck-kind piles, none of them `DECK_PILE_ID` (RTG's `tableZone: false`
means that pile never exists), so those buttons render on every one of
RTG's 15 decks today and either throw ("Cannot draw: deck is empty")
or silently no-op - a real, live false-affordance bug, not hypothetical.

**Real fix**: parameterize `DRAW`/`DEAL`/`DEAL_MORE`/`SHUFFLE_DECK` by
an explicit `pileId`, the same pattern `MOVE_CARD`/`SPLIT_PILE`/every
other pile-targeted action already uses - no implicit "the" deck
constant read out of thin air. The UI already knows exactly which pile
was clicked (`<deck-stack>` always renders from a real `pile.id`) - it
just isn't forwarding it today (`main.js`'s `dealFromDeck` drops it).
`resolveHandPileId` (state.js) is the RIGHT existing precedent for this
- kind+ownership lookup first, a fixed string only ever as a last-resort
MINT default (hand-only; deck piles are never lazily minted, so deck's
version doesn't even need that fallback). `RESET`'s own deck-recreation
(assigning `DECK_PILE_ID` to a freshly built pile from `gameConfig`) is
NOT the same problem - that's declaring a preset's own starting id, not
reading a singleton by assumption - leave it alone.
`CHANGE_PILE_TYPE` then needs NO deck-specific guard at all once reads
are pileId-scoped - a converted-away former-deck pile simply stops
being any deck-scoped action's target, exactly as it should, with zero
special-casing.

**Framing correction, direct user request - this is the model going
forward, not just for A:** "A deck is just a pile of cards." Cards get
unique ids ONCE at game init (presets/YAML deck configs, organized by
DeckType - `deck.js`/`DECK_TYPES`, unchanged, already correct). A
card's id never changes for its whole life, regardless of which pile
holds it or what kind that pile is - moving cards and `changePileType`
already never touch card identity today (verified: `CHANGE_PILE_TYPE`
only ever writes `{...p, kind, name}`, `MOVE_CARD`/`transferCard` only
ever relocate/re-stamp `{owner, faceUp}`, no path mutates `id`). This
app simulates a card TABLE - Zones/Piles exist to organize that table
on a screen, nothing more; pile-level actions (Draw/Deal/Shuffle/Split/
Take) are CONVENIENCE SHORTCUTS for common table-organizing moves a
player could otherwise do by hand, one drag at a time - never
privileged game mechanics bound to one blessed pile. Litmus test the
user gave directly: gather every card into one pile, convert it to
`kind: 'deck'`, and the table is back to its initial state - nothing
about that sequence should need special-casing anywhere.

**Consequence for A, beyond the pileId plumbing**: `DRAW`/`DEAL`/
`SHUFFLE_DECK` should not hard-require `pile.kind === 'deck'` at the
REDUCER either - that would just re-introduce a privileged-pile
assumption under a kind check instead of an id check. Reducer stays
fully permissive (Core invariant: works on whatever pile
`action.pileId` names, no matter its kind) - `DeckPile.pileActions()`
(and only it, by default) is what decides which kind's HEADER offers
these buttons, same offer-vs-authorization split (D43) every other
action in this codebase already respects. A future kind offering Draw/
Deal too is then a one-line addition to that class's `pileActions()`,
never a reducer change - this is what "shortcuts to keep the table
organized" actually buys.

**B. Narrow `zoneOptions` into per-layer interfaces** (mechanical
regrouping of existing callbacks into 3 plain objects, NOT a new
DI/options-provider framework - that would itself be a YAGNI
violation):
- `tableOptions` - layout persistence, zone create/remove/rename, panel
  move/resize. Consumed by `<zone-panel>` only.
- `pileOptions` - pile-level actions, split picker, deal count,
  drop-on-pile. Consumed by `<pile-panel>`/`<fan-pile>`/`<deck-stack>`.
- `cardOptions` - play/reveal/rotate/pickup/move/drag. Consumed by the
  per-card renderer only.
A component's `.render()` receives ONLY the slice it actually uses.

**C. Migrate remaining `pile.kind === 'deck'` branches in `main.js`/
`ui.js` onto the `Pile` hierarchy**, opportunistically (not a forced
sweep) - the same migration this session already did for
`showsFace`/`pileActions`/`disabledActions`. E.g. `handlePileAction`'s
deck-instant-split-vs-picker branch belongs on the class, not an
`if (pile.kind === 'deck')` in main.js.

**D. Universal drag-and-drop as a structural GUARANTEE, not scattered
convention**: one small test iterating `Object.values(PILE_TYPES)`,
asserting every concrete subclass's `cardActions` for a visible card
includes `move` (or hand's `play`) - so a FUTURE pile type that
accidentally restricts drag-and-drop fails CI immediately. Same
"executable guarantee, not folklore" instinct already proven by
`assertCardsConserved`.

**E. Shell components - concrete, immediate action** (user asked
directly "what are you doing about the shell components" - not
satisfied by C's "opportunistic" framing alone, correctly). Audited
every `src/components/*.js` for OTHER callers of the function it
forwards to, before touching anything:
- `<pile-panel>`/`renderPile` and `<zone-panel>`/`renderZonePanel` -
  ZERO other callers each (grepped, confirmed). Pure 1:1 passthrough
  shells - inline the function body directly into the component's own
  `.render()` method, delete the standalone export. Real encapsulation:
  the component owns its rendering, not a name-matched indirection to
  a same-shaped free function.
- `<deck-stack>`/`renderDeckStack` - genuinely shared: `main.js`'s
  pre-game preview screen (`#host-deck-area`) calls it directly too, no
  component involved there. Stays a standalone exported function -
  inlining it would just move the duplication problem, not remove it.
  `<fan-pile>`'s own render function needs the same check before
  touching it (not yet done).
- This is the FIRST real step of C too, not separate from it - once a
  component owns its own render body, a `pile.kind === 'deck'` branch
  that only matters to `<deck-stack>` naturally has nowhere else to
  leak into.

### Explicitly NOT recommending (YAGNI)
- A full `main.js`/`ui.js` rewrite in one pass - too much blast radius
  for a codebase with no continuous e2e coverage; this session's own
  history shows small verified steps beat big-bang rewrites here.
- A dependency-injection/options-provider framework for (B) - three
  plain objects assembled once in `main.js` is enough.
- Moving Zone/Table logic into the Pile hierarchy or vice versa - the
  Zone/Pile separation (D55) stays; this is about interface WIDTH, not
  merging concerns that are correctly separate today.

### Sequencing (small, independently verifiable, Neo+TDD, Trin gates each)
1. Deck pileId-parameterization fix (A, corrected) - ships alone.
2. Shell inlining, pile-panel + zone-panel (E) - ships alone.
3. Universal-DnD guarantee test (D) - ships alone, zero behavior change.
4. Options-bag split (B) - one component at a time.
5. Remaining kind-check migration (C) - folded into work touching those
   spots as it's encountered, not a dedicated pass.

User has already overridden my original A.1 recommendation and directed
E concretely.

## Session close-out: what actually shipped vs. this plan (2026-08-31)

**Shipped, committed, pushed (`f9d410b`, both `main`/`dev`), recorded
as D93/D94 in `docs/ARCHITECTURE.md`:**
1. Deck pileId-parameterization (A, corrected) - done, then the user
   pushed FURTHER than this plan anticipated: the entire `Pile`
   hierarchy is real ES class instances now (constructor, instance
   methods, `toJSON()`), not plain data through static methods. This
   plan's own diagnosis (item 2, "hollow shell components... the real
   polymorphic model exists one layer down") is now moot in its
   original form - the model isn't one layer down any more, it's the
   direct call shape (`revivePile(pile).cardActions(...)`) everywhere.
2. `viewFor`'s own `switch` (flagged in this plan's diagnosis as one of
   the two concrete monstrosities, alongside `zoneOptions`) - replaced
   by `Pile.getView()`/`contributeToView()`. Direct user request, not
   originally item 5 (kind-check migration) but the same category of
   fix, arrived at directly.

**NOT done - still real, open work, not abandoned:**
- Shell inlining (E: `<pile-panel>`/`renderPile`,
  `<zone-panel>`/`renderZonePanel` collapsing into their own
  `.render()` bodies) - scoped in this plan, never executed. Re-verify
  the "zero other callers" facts still hold before starting (this
  session's other changes may have added a caller).
- Universal-DnD guarantee test (D) - never written. Still a genuinely
  good, small, isolated addition - `Object.values(PILE_TYPES)` +
  `.prototype.cardActions` iteration.
- `zoneOptions` split into 3 layer-scoped objects (B) - the original
  "kitchen sink" complaint's most direct fix, never started. `main.js`
  is bigger now (D93's class-conversion touched it), worth re-measuring
  before assuming the same 3-way split is still the right shape.

**The original complaint's root causes ARE substantially addressed**,
even though the specific sequencing in this plan wasn't followed
literally - "hollow shell components over a real model underneath" is
now "real polymorphic dispatch, directly" (piles are instances, not
just a class registry nobody calls into). The remaining open items
(shell inlining, DnD test, options split) are smaller, more mechanical
follow-ups on a now-solid foundation, not blocked on anything.

## Session update (2026-08-31): item D shipped

`*impl continue morph refactor` resolved to this file's own sequencing
note (item D, DnD guarantee test - smallest/most isolated). Full
Neo->Trin->Morpheus gate cleared:
- Neo: `tests/piles.test.js`, iterates `PILE_TYPES`, asserts
  `move`/`play` on a visible card for every kind except `DeckPile`
  (named exception, D34 - deck never renders a per-card hover row).
- Trin: 512/512 independently re-run, mutation-killed the test itself
  (temporarily broke `HandPile.cardActions` -> the new test failed by
  name, not a coincidental other failure), restored byte-identical.
- Morpheus (me): matches this plan's item D exactly, zero behavior
  change. Fixed one misleading comment (`"D95 refactor plan item D"`
  conflated the count-badge decision number with this plan's own A-E
  lettering) to a plain-language reference instead.

**Real finding, disclosed not silently fixed**: `docs/ARCHITECTURE.md`
is NOT actually current through D95 as this file (and Neo's) claimed -
grepped, only D91 exists as a header, file's own "Last updated" stamp
is 2026-08-29. D92-D95 were broadcast to CHAT.md and summarized in
state files but never written into ARCHITECTURE.md itself - same drift
`docs/DECISIONS.md` already has at D20. Posted to CHAT.md, addressed to
User, asking whether to backfill now or backlog - not fixed unprompted,
this is a separate, larger job than the DnD test itself and wasn't
asked for.

Item D committed to git after this state save (see Next Steps).

## Session update (2026-09-01): two direct-correction fixes, unplanned but real

Two user corrections landed outside this plan's own item list, both
Neo->Trin->Morpheus gate-cleared, PASS, not yet committed:

1. **Deck's D34 `cardActions` exception struck** - "it is absolutely
   permissable to put cards back on the deck and take cards off." Real
   architecture fix, not cosmetic: needed a `canRemoveCard` override
   (`draw` isn't a per-card `cardActions` entry) and a `cardActions`
   override that's unconditional rather than the base `faceUp === false`
   rule (a deck card never carries `faceUp` at all).
2. **HandPile split into `PlayerHandPile`/`OpponentHandPile`** - "I
   don't like the special ownership property for hand... make PlayerHand
   and OpponentHand as separate classes." Bigger than it looks: exposed
   that `state.js` was calling `revivePile` (viewer-agnostic) for 3
   genuinely viewer-aware checks that used to work only because
   `HandPile` computed `this.ownerId === viewerId` internally - switched
   those 3 to `pileInstanceFor(pile, viewerId)`, confirmed load-bearing
   via mutation test (PLAY breaks immediately without it).
   `pileActions` correctly stayed shared/ctx-based on `HandPile` itself
   - it was never the offending pattern (every other kind's
   `pileActions` already takes `{isOwner}`), and `pileLevelActions`'s
   one caller with no real pile/viewerId (pre-game deck preview)
   structurally can't use the class-selection mechanism anyway.

Also scoped (discussion only, not implemented): a YAML-backed pile-
capabilities table, following `tools/rtg/compile.mjs`'s exact
authored-YAML -> compiled-committed-ES-module pattern, covering ONLY
the unconditional per-kind baseline - explicitly NOT the dynamic
gating logic, to avoid rebuilding the "rules engine" this codebase has
repeatedly, deliberately rejected. See `neo.docs/state.md` for the
fuller writeup. Not started.

## Session update (2026-09-01, continued): MERGE_PILE shipped

Direct user request: dropping a pile directly onto another pile merges
all its cards into the target (target keeps its own kind) and removes
the emptied source. New `MERGE_PILE` reducer case + real drag-drop
wiring in `ui.js`/`main.js`. Neo->Trin->Morpheus gate cleared, PASS,
514/514, mutation-tested. Reuses `REMOVE_PILE`'s own deck/hand/Table
exemption set rather than inventing new rules.

**One real architectural judgment call, not explicitly specified by the
user - approved but flagged**: a pile dropped onto another pile in the
SAME zone still reorders (pre-existing, separately-requested feature,
left unchanged); only a CROSS-zone pile-on-pile drop now merges,
replacing what used to bubble up as a reparent-into-that-zone
(`onMovePile`). Dropping onto a Zone's own empty space is untouched
(still always a sibling, Smith's Gate 1/D55). If the user actually
wanted same-zone drops to merge too, that's a one-line UI change
(`renderPileShell`'s drop handler) - revisit if raised.

**Resolved same session**: user did want it simplified - "remove the
weird zone distinction, KISS." The flagged judgment call above is gone;
every pile-on-pile drop merges now, no zone check. Also fixed a real
bug the flagged review missed: the per-card `transferCard` loop reversed
merge order into prepend-style targets (deck/discard) - now a plain,
order-preserving concat. `onReorderPile`/`performReorderPile` correctly
removed as dead code (their one caller is gone); `REORDER_PILE` the
reducer stays, untouched, in case a future gesture wants it.

## Next Steps

1. **Item D done.** Two plan items remain, not currently assigned:
   - Shell inlining (E): `<pile-panel>`/`renderPile`,
     `<zone-panel>`/`renderZonePanel` collapsing into their own
     `.render()` bodies - re-verify "zero other callers" still holds
     first (D93's class-conversion may have added one).
   - `zoneOptions` split into 3 layer-scoped objects (B) - re-measure
     `main.js`'s current size/shape before assuming the original
     3-object design still fits; do this one last per this file's
     established sequencing.
2. **Open, unresolved**: the ARCHITECTURE.md D92-D95 backfill question
   above - waiting on User's call, don't assume either way.
3. Post each step's completion as its own decision broadcast, same
   discipline as this session.
