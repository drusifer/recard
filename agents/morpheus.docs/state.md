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
E concretely - both now IN PROGRESS with Neo, not awaiting further
confirmation.

## Next Steps

1. Handed to Neo for steps 1-2 (deck pileId-parameterization, shell
   inlining) - in progress. Do NOT let Neo batch ahead into (B)/(C)
   before 1-3 ship and are Trin-verified; each step in the sequencing
   list is independently shippable on purpose.
2. Post each step's completion as its own decision broadcast (D92+) in
   `docs/ARCHITECTURE.md` when it actually ships - this state.md entry
   is the PLAN, not yet a recorded decision.
3. Review Neo's work on all 5 steps for architecture correctness once
   Trin gates each - this is Morpheus's own review obligation, don't
   skip it just because the plan originated here.
