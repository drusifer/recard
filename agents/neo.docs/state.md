# Agent State

## Current Task (2026-09-24) - D156 colorless-lands fix: DONE (uncommitted)

Fixed Smith's live F1: manaAvailable (tools/rtg/playState.mjs) summed by
land.colors (colour IDENTITY, derived from cost - always [] for a land,
since cost is always "") instead of landColorSources(card) (rules-text
parse, deckSchema.mjs, already existed for lint:decks). describe() now
attaches produces to a land alongside its unchanged colors. Verified live
against the real catalog (node -e against src/decks/rtg/catalog.js): all
25 lands produce >=1 colour; Sunlit Expanse (the exact card from the live
session) -> W. tests/rtgPlayState.test.js: +4 tests (mana-by-colours
rewritten to use describe(), a BUG reproduction test, a dual-land test, a
drawback-clause test), mutation-proved (revert -> 5 fail). Caught my own
mistake mid-fix: I'd cited a fabricated "US-130" in comments/tests before
confirming it existed - replaced with D156 (no story was opened for this,
a direct *fix request outside the sprint loop). make check 1120 green.

## Next Steps
Not re-tested LIVE with real bots (the MCP bridge from the earlier
session was stopped). Smith's live report follow-up section updated.
Nothing committed yet - awaiting the user.

## Current Task (2026-09-23) - D155 dice + RtG first turn: DONE (uncommitted)

src/dice.js (parseRoll/rollDice/rollTalk), tableTalk.js hostLine (host rolls, strips
claimed dice data), main.js publishTalk uses it; TableTalk placeholder+title hint.
RtG: questions i_go_first/game_has_begun, rules.first_player, me.name in state,
turn.yaml pregame/judging_first/asking_first, verdict guard `of`. Fixed a racy
harnessMcp talk test (await stamp). make check 1117; harness-mcp 5/6 clean
(1 unexplained game_start timeout - BACKLOG); jev-runner 3/3.

## Current Task (2026-09-23) - US-129 P4 DONE

games/gin/{questions,turn}.yaml + players/{jev-balanced,jev-cagey}.yaml (JSON
strategies migrated, verified identical read/move/floor/description, JSON
deleted). gin/strategyFile.mjs now reads games/gin (listStrategies/loadStrategy
kept - Gin's loader). tools/gin/library.mjs: gin_look, gin_step, gin_phase,
note_hand_over. GinBot: nextMove/hands/log removed, look() added, waitForTurn
kept for MCP. gin/adapter ginSeat(). tests/ginTurn.test.js (3). FIXED: questionsFor
merged a Score's list rewording into an object (test added). Removed the
'OPTION description' test (loader rejection now proven in jevGameFiles).
1096 unit, test-gin 1/1, test-harness-mcp 12/12.

## Previous - US-129 P3 DONE

games/rtg/{rules,questions,turn}.yaml + players/{rules,aggressive}.yaml (from
game.json by script; applies_to replaces constraintsFor). tools/jev/gameFiles.mjs
(loadGameFiles, questionsFor; checks literals, rule citations, player
description/escalation/floor/wording). tools/rtg/library.mjs (rtgHooks project/
options/propose/act + heard_attack/hear_attackers). tools/rtg/adapter.mjs rtgSeat();
checkOptions validates the turn before joining. DELETED rtg seat/decide/turnOrder/
gameFile/game.json + their tests; ported content tests to rtgFiles.test.js.
BUGS FIXED: turn never reached combat/ended (now turn.yaml); playState describe()
dropped card id -> every live RtG action targeted a NAME (found by combat test).
Seat: own moves not news (markSeen after step). 1096 green.

## Previous - US-129 P2 DONE

tools/jev/seat.mjs MachineSeat: table memory (#look: heard excl own, changed,
quietFor; first look seeds), TABLE/STEP events, settle on !busy, record via
services.onRecord, markSeen after ask. tools/jev/library.mjs genericLibrary(services):
guards verdict/table_changed/quiet_table/counted/played; actions count/track/
reset/say; actors judge/ask_table/play. Game hooks: project/options/verify?/act.

## Previous - US-129 P1 DONE

xstate ^5.33.2 dev dep. tools/jev/machine.mjs parseTurn/loadTurn: flat states;
checks targets/guards/actions/actors/questions (params.question|questions and
invoke.with) with nearest-name; compile: with->input({...with,context,event}),
invoke->busy tag, safe->always leave to reserved final `left`; root QUIT ->
mark_leaving; context from YAML + actor input. Library entry {doc, fn|assign}.

## Next Steps
P5: make jev-library + docs/JEV_LIBRARY.md (staleness test), STRATEGY= help text.

## Current Task (2026-09-23) - lint in `make check` + lint debt: DONE

check = cards test lint lint-decks secrets (help text updated). 144 eslint
+ 1 stylelint -> 0: autofix (60), then by hand. Non-mechanical: ui.js
renderRosterEntry split (rosterLabel, scoreButton); rtg/options.mjs
legalOptions -> MY_PHASE map + defending() (order kept: lands before
spells, now a test); onlyPassing -> isOnlyPassing; ThoughtBubble dead
#decisions removed; ginJevPlayer dead early-return -> assertion; unused
judgmentsFrom import removed. No eslint rule disabled.
Verified: make check (1088), test-thoughts/spectator/addbot/motion/gin/
jev-runner green. Gap (pre-existing): no test clicks score +/- buttons.

## Current Task (2026-09-22) - US-128 Phase 6 DONE (6 of 6)

T6.2 done as a REPEATABLE browser test, not a hand-driven probe:
tests/jevRunner.browser.mjs (`bobp make test-jev-runner`, port 8223) runs
the real CLI as a child: Gin knock-early joins, offers both strategy kinds,
draws+discards after a real deal (C1); Gin quit before deal -> GOODBYE,
exit 0 (C4); RtG (needs TYPESAFE_API_KEY, skips without) answers add-bot
refusal + quit (AC4). 3/3 green on 3 consecutive runs.
Honest scope: Gin proof is one TURN (draw+discard), not a full hand.

## Previous - US-128 Phase 5 DONE (P5 of 6)

tools/rtg/seat.mjs RtgSeat (join, nextMove one-look-per-call, step; clock/
pollMs/quietMs/answerMs injectable). tools/rtg/adapter.mjs (strategies:
rules; STEPS validated; summaryLine). rtg/player.mjs DELETED; jevPlayer has
one path (run(adapter)); rtg STRATEGY special case gone. rtg/table.mjs:
WHOSE_TURN -> TURN_QUESTION 'Is it my turn now?' (both the unsure-judgment
escalation AND the quiet-table ask). FIXED 2 LATENT BUGS: (a) RtG ask could
never hear a reply (resolver filled by a blocked loop) -> tools/jev/table.mjs
askPeer listens itself; (b) found in TDD: own question+answer re-triggered
the unsure judgment -> endless asking; now checkedTalkTo covers the exchange.
Makefile jev-player now forwards DECK/STEPS (RtG usage documented DECK= but
it was never passed). 1087 green, new code eslint-clean.

## Previous - US-128 Phase 4 DONE (P4 of 6)

tools/jev/runner.mjs: UsageError, GOODBYE, playSeat({seat,shouldStop,record}),
serveSpawnRequests({...,game,strategies}), run(adapter, options). Adapter =
{game, strategies(), checkOptions, sit, summaryLine} (summaryLine added to
D153's sketch - output formatting is per game). tools/gin/adapter.mjs.
GinBot: nextMove({shouldStop}) + hands/log opts; waitForTurn stays PUBLIC
(MCP gin_turn calls it with its own waitMs). FIXED LATENT BUG: waitForTurn
honoured shouldStop in the discard phase -> a quit between draw and discard
left 11 cards; now only at a turn boundary (regression test in ginBot.test).
gin/player.mjs deleted. jevPlayer: gin -> run(adapter); rtg still
rtg/player.play (temporary, P5 removes) and imports UsageError from runner.
Logs now build/<game>/ for every game. 1078 green, new files eslint-clean.

## Previous - US-128 Phase 3 DONE (P3 of 6)

tools/jev/decide.mjs: decide({judge,state,read?{questions,into},choice{key,
instructions,criteria},floor,verify?(id,state)->{state,questions,question}|null,
escalation,fallback,unsure}) -> {picked, option, state, model, question,
answers{read,choice,verify}, confidence, distribution, belowFloor, checks,
asked, blocked{rule,why}}. Gin decideByQuestions: ESCALATION=floorFallback()
const, key __move__. RtG decideStep: askTable(ask), key __step__, verify via
verification(); record shapes unchanged (old tests byte-identical). 1075 green.

## Previous - US-128 Phase 2 DONE (P2 of 6)

tools/jev/escalate.mjs: UNSURE=0.35, verdictOf(noul)->yes|no|unsure,
askTable(ask).resolve(q) / floorFallback().resolve() -> {accepted,
answered, why}. Wired: rtg/decide.mjs (constraint verification),
rtg/turnOrder.mjs (isOver/unclear via verdictOf), gin/jevStrategy.mjs
(floor). Existing tests unchanged + green (1068). P1 nit fixed.

## Previous - US-128 Phase 1 DONE

tools/jev/strategyFile.mjs: checkInstruction, rejectLiterals (new: the
shared "throw naming WHERE" loop both loaders had), resolvePath (loop,
not reduce). gin/strategyFile.mjs keeps only listStrategies/loadStrategy;
rtg/gameFile.mjs uses rejectLiterals - the rtg->gin import is gone.
tools/jev/table.mjs: shouldAskTable, readAnswer, trackChange. rtg/table.mjs
keeps readAnnouncement + WHOSE_TURN (RtG words). No re-exports at old paths.
Tests moved: tests/jevStrategyFile.test.js, tests/jevTable.test.js.
Deviation from T1.1 wording: no generic "loader taking a directory" -
the loaders share only the literal check; Gin loads by name from a dir,
RtG by path + a rules-citation check. Unit 1063/1063 green.
via index has NO entries for tools/**/*.mjs - grep was the fallback.
Lint: 165 pre-existing errors repo-wide (make check has no lint) - posted.

## Next Steps
None assigned - sprint close (Oracle groom, Smith test, retro).

## Current Task (2026-09-20) - US-125 done, all 4 phases

New: tools/gin/playState.mjs (projection, 11 fixed slots),
strategyFile.mjs (loader + checkInstruction + resolvePath),
strategies/*.json (jev-balanced, jev-cagey), jevStrategy.mjs (project ->
ask once -> act), strategyKinds.mjs (one lookup, both kinds).
bot.step() branches once on strategy.kind; CLI and MCP both offer all
six names. tests/helpers/ginFakeTable.mjs extracted (not copied).

## Next Steps
Nothing assigned. Live play + a bench are the next things (BACKLOG).

## Context

**D129 (user-confirmed, this session) is the binding model for stacking.**
Reached by three successive user corrections of my own wrong models —
worth reading, because each wrong turn is a trap that is easy to walk
back into:

1. I first built `src/cardStacking.js` with `crossAxisOffset` /
   `mainAxisOffset` — "two baselines, one with a depth multiplier."
   **Wrong**: that distinction is not a fact about stacking at all, it
   is an artifact of computing overlap as flex MARGINS inside two
   differently-shaped containers. I took the accidental structure of
   the DOM and enshrined it in a supposedly-pure math module, which
   reproduced the original bug's root cause instead of removing it.
   DELETED, along with its tests.
2. I then designed `StackableElement` as a CONTAINER base class for
   `<pile-panel>`/`<chip-tray>` to extend. **Wrong, inverted**: user —
   "A Stackable is the object being Stacked (is a Pileable). The
   webcomponent contains a list of Stackable objects." There is no
   `StackableElement`; the components keep `extends HTMLElement`.
3. I proposed `Stack` be fully DERIVED from `pile.cards`. **Wrong**:
   user — "i don't think derived will work if there is more than one
   stack in a pile (like lands pile)." Correct: derivation via
   `GroupedPile.sortValue` only works while membership is a function of
   the thing itself (chip denom, land colour). A stack a PLAYER formed
   by dragging cards out has nothing to derive from, and an unrecorded
   placement is lost on reload and never reaches other clients.

**The settled model (D129):**

    containment:  Table -> Zone -> Pile -> Stack -> Stackable
    class:        Pileable -> Stackable -> Card/Chip/Token Pileable

- `Stackable extends Pileable` and the concrete types re-parent onto
  it. `Stackable` sits BETWEEN deliberately: `Pileable` stays the
  behaviour-free root D107 says it is, which is the room the user
  explicitly asked to leave for future FREE-FORM (non-stacked) piles.
  A sibling `Stackable` was rejected — a card would have to be both a
  `CardPileable` and a `Stackable` at once, i.e. multiple inheritance,
  which JS won't do and which has no mixin precedent anywhere here.
- Overlap is VERTICAL or HORIZONTAL only. A cascade and a run are the
  same object at different directions/spreads. Grouping/columns/grid is
  NOT Stackable's concern — that layer composes N Stacks.
- `Stack` is LIVE; membership is PERSISTED as a flat `stackId` field on
  each Stackable. Rejected nested `pile.stacks = [[id, id], [id]]`:
  `pile.cards` already holds the ordering, so nesting duplicates it and
  admits a state where a card is in `cards` but missing from `stacks`.
  A foreign key on the child has one source of truth and keeps records
  plain at rest (D93/D107) — no wire/localStorage change, no migration
  across 15 pile kinds.
- The PILE chooses direction (cascade vertical, run horizontal), so it
  stays polymorphic in the `Pile` hierarchy. Nothing branches on it.

**New hazard found, worth generalizing (extends D107).** A class FIELD
on a Pileable subclass silently clobbers the record. `Pileable` is a
view over its record (`Object.assign(this, record)` in the base
constructor) and class fields initialize AFTER `super()` returns — so
`stackId = undefined;` on `Stackable` overwrote every record's real
value with `undefined`. Caught by the round-trip test, NOT by review.
D107 names the method-vs-field NAME collision; this is the same trap
via field declaration, and the rule is stricter: **a Pileable subclass
declares no instance fields at all, only statics and methods.**

## Current Task

`*impl stackable` — COMPLETE. One layout mechanism, everywhere. The
reported cascade bug is fixed, with live regression tests proven to
catch it.

**Iteration 3 (this one) finished the unification:**
- **Smith's defect fixed**: `LandsPile.defaultSpread = MAX_SPREAD`
  (0.85) instead of inheriting the chip-calibrated 0.963. Scoped to
  lands - a chip tray SHOULD stay tighter than any card pile, and a
  test guards that it still is.
- **Direction is PER STACK**: `pile.stacks = { [stackId]: { direction } }`,
  a metadata map carrying direction ONLY - never membership, never
  order - so it cannot desynchronise from `cards`. One pile can now
  hold a vertical column beside a horizontal run, which is what was
  forcing a second layout mechanism to exist.
- **`layout` is GONE** from state and the DOM. A drop's `column`/
  `stack`/`overlap` hint is translated by `Pile.insertPileable` into
  stack membership plus that stack's direction, and nothing persists
  it. D21's "layout belongs to whichever card ends up second" rule
  went with it, as did `removePileable`'s stale-layout strip - a
  shorter stack is simply correct.
- **FAN is the third stack layout** (direct user question). A hand is
  a horizontal stack that arcs. `applyFanOffset`, the `options.fan`
  flag and its plumbing are deleted; the droop is now a fraction of a
  stride rather than a fixed `0.08rem`, so it scales with per-preset
  card resizing, which the old one did not.
- **`renderPileCards` renders every pile as a row of stacks** and
  returns them. `<chip-tray>` no longer builds columns or positions
  anything - it adds badges. All four CSS overlap formulas plus
  `--column-depth` are deleted; CSS does unit conversion only.

Net effect on source: **-24 lines of non-comment code** (192 added,
216 removed across `src/` + `style.css`), with four layout mechanisms
collapsed into one.

Suites: 761 unit / 18 browser / 13 rtg, all green. `make check`
PASSED. `lint-style` clean. `lint-js` 10 (down from the 13 baseline).

Shipped this iteration:
- `src/pileables/Stackable.js` — `VERTICAL`/`HORIZONTAL`, `offsetIn()`.
  ONE formula both directions: a thing sits `index` visible strides
  along the direction, absolute from the stack origin (so depth chains
  by arithmetic and cannot compound), spread clamped 0..1. Throws on an
  unknown direction.
- `src/piles/Stack.js` — `Stack` (owns direction+spread, delegates
  every offset to the Stackable, plus `extent()` so a pile can size
  itself honestly) and `stacksOf(pile)` (groups the flat list by
  `stackId`, first-appearance order so re-renders never reshuffle
  columns under the cursor; no-`stackId` things collect into one
  default stack).
- `CardPileable`/`ChipPileable`/`TokenPileable` re-parented onto
  `Stackable` (import + extends only, no behaviour change).
- `tests/stackable.test.js` (15) + `tests/stack.test.js` (14).

Then both review conditions, same iteration:
- **Condition 2 (interface change): `offsetIn` returns unitless STRIDE
  MULTIPLIERS, not px.** It no longer takes metrics at all. Direction
  now decides only WHICH AXIS the multiplier lands on - the multiplier
  itself is the same number either way, so there is no per-direction
  arithmetic left in JS to get wrong. The caller writes `--stack-x`/
  `--stack-y` and one CSS rule converts:
  `left: calc(var(--stack-x) * (var(--card-w) + var(--card-gap)))`.
  `Stack.layout()`/`Stack.extent()` lost their metrics arguments to
  match; `extent()` now reports the LAST thing's offset (the caller's
  CSS adds one card) and is derived from the same `layout()` the
  rendering uses, never recomputed from the count.
- **Condition 1: `stackId` now strips everywhere `layout` strips.**
  `state.js`'s `toHandCard` and `toDeckCard` are the only two choke
  points (verified: every DEAL/DRAW/PICKUP/TAKE_PILE/PICKUP_SPLIT
  path routes through one of them), so the fix is two destructures.
  4 new tests in `state.test.js`, all going through the REAL reducer
  actions rather than calling the helpers - including a deliberate
  over-stripping guard (`stackId` must SURVIVE a table-to-table MOVE,
  or player-formed stacks could never persist at all, which is the
  capability D129 exists to provide).

Verified: `bobp make test` 733/733 pass. `lint-style` clean.
`lint-js` back at its pre-existing 13-error baseline (I introduced 2,
both fixed; none of the 13 are in files I touched).

### StackActions — BUILT (direct user decision on the GUI)

User's call, verbatim shape: "I like the badge idea but since this is
universal for stacks use an additional emblem using the gear symbols
to pull up the stack action menu. note keep pile level tighten/loosen
as tighten all / loose all PileActions that route each stacks
tight/loosen action."

- **`spread` moved onto the stack**, beside `direction` in the same
  metadata map - no new persistence shape. Falls back stack -> pile ->
  kind default, so an untouched pile looks exactly as it did.
- **`Stack.stackActions({ maxSpread })`** returns `tightenStack` /
  `loosenStack` / `flipStack` plus disabled ids. A stack of ONE offers
  nothing - three controls that visibly do nothing is the same false
  affordance `ChipPile` refuses for `changePileType`.
- **`Stack.flippedDirection()`** - a FAN flips to VERTICAL, not
  HORIZONTAL: a fan already IS horizontal, so flipping it to a plain
  horizontal stack would look like nothing happened while silently
  discarding the arc.
- **`ADJUST_PILE_SPREAD` gained an optional `stackKey`**, following
  the existing "one action, signed delta" precedent (D75/D103) rather
  than adding a second action. Omitting the key means EVERY stack -
  that is the routing. It cannot mean "the default stack", because
  that stack has a real key (`DEFAULT_STACK_KEY`) precisely so the two
  are never confused.
- **`FLIP_STACK`** is new - replicated like every other presentation
  change, since everyone at the table sees the same arrangement.
- **`tighten`/`loosen` -> `tightenAll`/`loosenAll`** everywhere (six
  pile subclasses declared their own copies). "All" is disabled only
  when EVERY stack has hit the limit - one column at the ceiling must
  not stop the others, which is the point of routing.
- **The gear emblem** (`.stack-gear`, `stackGearFor`) on every stack
  that has something to offer, opening `openStackActionMenu` - which
  reuses the card menu's own list styling and single closer rather
  than inventing a parallel look (D101's rule).

**Two real bugs found building it, both worth remembering:**
1. An EMPTY pile has no stacks to route to, so Tighten All became a
   silent no-op the pile then forgot. Both the reducer and
   `disabledActions` now treat an empty pile as one default stack -
   and note `every()` on an empty list is vacuously TRUE, which was
   disabling both directions on a pile that adjusts perfectly well.
2. The gear was first sized to the 44px interactive floor. A card is
   about 43px wide, so it covered the entire stack and swallowed every
   click meant for the cards - five card-menu tests went from passing
   to 30-second timeouts. Sized to the badge (1.3rem) instead; the
   floor is enforced on `.pile-action-btn`/`.pile-action-menu-item`,
   and this UI pass is mouse-only by standing decision.

## Next Steps

**Superseded - StackActions are built.** Original note kept below for
the reasoning only.

### Tap/Untap per stack — BUILT (direct user request, "only if it's easy")

It was easy: same shape as `FLIP_STACK`/`ADJUST_PILE_SPREAD`, both of
which already existed to copy from.

- `Pile.supportsStackTap` (false by default, true on
  `BattlefieldPile`/`LandsPile` - the two kinds that already declare
  pile-level `untapAll`). Same opt-in-static shape as `groupBadge`/
  `stacksDownward` - tapping a chip or a hand card is not a real
  concept, so this is gated by pile kind, unlike tighten/loosen/flip
  which are universal to every stack.
- `Stack.stackActions({ maxSpread, canTap })` gained `tapStack`/
  `untapStack`, offered for a stack of ONE (unlike tighten/loosen/flip,
  gated on count>=2) - a single permanent is still tappable on its
  own. Disabled the same way tighten/loosen are (a no-op on every card
  in the stack), not `orientationActions`' strict hide/show XOR - a
  MIXED stack has real work for both directions.
- `SET_STACK_ORIENTATION` reducer action - ONE action taking
  `orientation` rather than a `TAP_STACK`/`UNTAP_STACK` pair, the same
  D75/D103 correction `ADJUST_PILE_SPREAD` already follows. Filters by
  `stackKeyFor(card.stackId) === action.stackKey`; pile-level
  `UNTAP_ALL` is completely untouched, per the user's own instruction
  ("keep pile level for all stacks").
- `tapStack`/`untapStack` specs, `stackGearFor` passes `canTap` from
  `PILE_TYPES[kind]?.supportsStackTap`, `main.js` dispatch.

11 new tests (5 `Stack.stackActions`, 6 reducer in `rtgPiles.test.js`
alongside the existing `UNTAP_ALL` tests) + 1 live browser test on a
REAL 3-card battlefield column (reuses the column the existing cascade
test builds): taps the whole stack, confirms a card OUTSIDE it stays
untouched, untaps it back. 781 unit / 20 ui / 14 rtg green, `make
check` PASSED, lint-js still at the 10-error baseline. The user asked
whether they are needed for consistency. `Pile` has `pileActions` and
`Pileable` has `pileableActions`/`sortActions`; a `Stack` has none, so
Tighten/Loosen still act on the whole PILE even though direction is
now per stack. That is a real inconsistency: a battlefield with a
vertical column beside a horizontal run can only be tightened as a
unit. Recommend `Stack.stackActions()` offering tighten/loosen/flip
direction, which would move `spread` onto the stack beside `direction`
(same metadata map, no new persistence shape). NOT started - ask
first.

**Queued:** `@Bob *learn no one-off tests - use automation test
pyramid` (direct user request, logged to CHAT.md, not started).

**`lint-design`'s 9 violations remain, and are NOT this work's.**
Identical 9 exist at HEAD. Separate responsive-layout task.

**Uncommitted:** everything above, plus the original staged
`dropTarget.js` simplification, which is correct and should stay.

---
## Session close (2026-09-10, evening) — bloop queue processing

Long session: Oracle groom (D117-D129 backfill, a real duplicate D116
+ D111/D112 order bug found+fixed by a new `tools/checkDecisionOrder.mjs`),
then a `*bloop queue till done` run through the accumulated CHAT.md
queue. All committed and pushed (`dev` and `main` both up to date,
tree clean).

### Shipped, verified, closed
- **RtG stack gear clipped/oversized** — `.stack-gear` was rendering at
  the global 44px touch-target floor instead of its documented 1.3rem,
  and the battlefield's `overflow-y:auto` row reserved no space for
  anything outside a stack's own box. Fixed both.
- **Gear moved to top-right** (was bottom-right) — mirrors
  `.chip-stack-badge`'s pin-outside-the-card pattern.
- **Stack-hover shadow overlap** — real bug: `.middle-card:hover` forced
  `position:relative` over the stack's own `position:absolute` (D129),
  same specificity + later source order. Hovering a stacked card fell
  into flex flow, width ballooned to the unrelated 8.5rem max-width,
  painting a giant disconnected shadow. Removed `position` from the
  hover rule entirely.
- **Found+fixed a real test flake** while stress-testing the gear fix:
  a dismiss-click raced `openStackActionMenu`'s `setTimeout(0)`
  listener in ~1/3 of runs. Zero-tolerance-for-flakes held - didn't
  ship until 8/8 stress runs were clean.
- **Can't re-fan hand after Flip** — `Stack.flippedDirection()` only
  ever toggled vertical↔horizontal; a FAN-default pile (hand) flipped
  once could never flip back. Now takes the pile's own default
  direction, making FAN-default piles a genuine 2-state toggle.
- **Deck panel too wide / fold actions into rows** — `.pile-title` had
  no width cap, so Deck's 6 actions + enum forced the whole panel open
  to fit one unbroken row. Capped at 11rem (tuned empirically against
  `lint:design`'s scroll baseline, not guessed - 9rem was narrower but
  regressed it).
- **All players get all pile actions** (generalized mid-session from
  "deck actions for every player" to a full authorization removal):
  stripped `isOwner`/`isShared` from 10 pile classes' `pileActions()`
  and `isHost` from `DeckPile`, plus 3 reducer checks (`SORT_PILE`,
  `UNTAP_ALL`, `SET_STACK_ORIENTATION`). **Found two real latent bugs
  this exposed**: Shuffle/Reset/Reshuffle-Deal had never been wired
  with the host-dispatch/guest-relay split every other action uses -
  invisible until removing the host gate let a guest reach them. Fixed
  both. Full writeup: `agents/neo.docs/all-players-pile-actions.md`.
- **New Game zone-recreation report** — investigated, could NOT
  reproduce in the single-client path; added a real regression test
  proving the reducer creates every player's Zone correctly. Left OPEN
  - likely candidate is the guest-side broadcast path, blocked on the
  standing no-2-peer-harness gap.

Verification throughout: unit suite ended at 787/787 (net down from
794 - 15 old restriction-tests deleted/rewritten, not just patched),
all 4 browser suites green (68 tests), lint-js/lint:design both at
their pre-existing baselines (unchanged byte-for-byte).

### Queued, NOT started - real feature/design work, not fixes
(also tracked in `docs/BACKLOG.md` as of the 2026-09-17 consolidation -
add new items to both, or just to BACKLOG.md if this section stops
getting read)
1. ~~**Tighten/Loosen as a slider**~~ DONE 2026-09-13 (`/sprint sliders`):
   `<spread-slider>` (`src/components/SpreadSlider.js`), shared between
   the pile-level menu and the per-stack gear menu, replaces the old
   button pair outright. `SET_STACK_SPREAD` (absolute value) replaces
   `ADJUST_PILE_SPREAD` (signed delta), which is deleted - nothing else
   called it once both menu sites converted. See `agents/cypher.docs/
   state.md` and `agents/morpheus.docs/state.md` for the full design
   record (user answered 3 real visual-design questions at Smith's gate:
   live updates, no numeric readout, slider-only no nudge buttons).
2. **Flip as a radio box with preview icons** — replace the single
   Flip action with a radio control listing orientations directly,
   each with a small icon/image showing the resulting arrangement.
3. **Zone-level privacy** (architecture change; corrected 2026-09-17,
   see below) — a pile inside a player's own PlayerZone should default
   to hidden-from-everyone-but-owner (like a hand card), revealable via
   the existing hide/show toggle. **Not actually a D83/D84 conflict**:
   D84 only governs the DATA (every viewer's own `view` always carries
   the real card, full stop) - RENDERING is a separate, per-viewer
   question that's always been allowed to differ, which is exactly what
   `HandPile`'s own `showsFace()` split already does (`PlayerHandPile`
   always renders the owner's real face; `OpponentHandPile` always
   renders a back, regardless of the card's own `faceUp`). The actual
   work is generalizing that same owner/opponent rendering split to
   piles inside a `PerPlayerZone` generally, not just the built-in
   Hand kind - a rendering-class change, not a data-model one.
4. **Remote-cursor redesign** (no back-compat) — replace exact-
   coordinate/transform mirroring with an animate-to-target model: on
   pointer-enters-pile/zone, glide the OTHER clients' cursor indicator
   onto that pile/zone rather than following live pixel coordinates.

### Next steps
Any of the 4 queued items above can start directly (`@Neo *swe impl
<item>`). #3 (zone privacy) is the most architecturally significant -
probably wants a `@Morpheus *lead arch` pass first given it moves a
concept from Pile to Zone. #1/#2 are UI builds with real visual design
decisions the user may want to weigh in on before implementation
(slider styling, preview-icon rendering) rather than a fix-loop
guessing them. #4 is a protocol simplification, self-contained to
`session.js`/`protocol.js`/cursor-rendering in `ui.js`.

`git`: `dev` and `main` both pushed and in sync, tree clean (only the
pre-existing untracked screenshot and `test-results/` remain, neither
from this session's work).

---

## US-117 Phase 111 (2026-09-11): table zoom - DONE, with a real mid-phase pivot

Built auto-fit-to-content first (`src/tableFit.js`, `computeFitScale`,
9 unit tests) exactly as originally planned. Wiring it in live exposed
a real conflict: shrinking the table for real also shrinks buttons
below the 44px floor, and `lint:design` caught it immediately at the
same viewports it already tests. Put the trade-off to the user rather
than picking a number - they rejected both proposed resolutions and
replaced the whole mechanism: manual dial + S/M/L/XL presets, no
content-based computation. See D132.

**Deleted `tableFit.js` + its tests outright** (no back-compat, dead
code) and built `src/tableZoom.js` instead: `TABLE_ZOOM_PRESETS`
(S/M/L/XL), `TABLE_ZOOM_MIN/MAX`, `clampTableZoom`, `presetScale` - 8
unit tests. `wireTableZoomControls` (`main.js`) wires a dial + 4 preset
buttons once at startup (local-only view state, nothing per-render).

**The 44px tension didn't vanish - same math, any zoom below 1,
including the M default.** Fixed it at the RIGHT layer instead of
picking a number: `tests/designLint.check.mjs` Check 4 now divides a
button's rendered size by the player's own live `--table-zoom` before
comparing to 44px, for any button inside `#zones`. This checks what
the invariant always meant (was this control AUTHORED at >=44px), not
"is it drawn at >=44px at whatever zoom the player picked right now" -
the same category of fix as the existing `.card`/`.pile-action-btn`
exemptions already documented there, generalized to a live scale
instead of a fixed selector. Needed rounding before comparing: dividing
a sub-pixel-rendered size back out by a non-integer scale (0.85) landed
a fraction of a px under an exact 44 on a couple of buttons - a
measurement artifact, not a real miss.

New live-browser suite `tests/tableZoom.browser.mjs` (7 tests,
`npm run test:tablezoom`/`bobp make test-tablezoom`) against a real
solo table: default applies before interaction, all 4 presets set both
the dial and the live scale, dragging the dial directly works, every
control itself clears 44px. 795/795 unit green, lint-js at its
pre-existing 10-error baseline, lint:design actually IMPROVED (10 -> 8
violations, same pre-existing categories - scroll overflow, zone
overlap - unrelated to this phase, not touched).

## Next Steps
Handed to Trin for Phase 111 UAT.

---

## US-117 Phase 113 (2026-09-11): focus-zoom overlay core mechanism - DONE

Built the D131 grow-in-place mechanism: `src/focusZoom.js`
(`clampOverlayPosition`, `FOCUS_ZOOM_SCALE`, `HOVER_INTENT_MS` - 7 unit
tests) plus `main.js` wiring (`wireFocusZoom`, `applyFocusZoom`,
`growPileInPlace`, `shrinkFocusedPile`, `reapplyFocusZoom`).

**Correction to my own earlier design doc**: D130's Gate-1 review text
said drag-suppression would "reuse `ui.js`'s `isDragging()` signal" -
checked while implementing, no such function exists; `ui.js`'s drag
tracking is a per-call closure variable passed as a callback parameter
to `wireTouchDragEvents`, not a reusable exported predicate, and that
whole path is touch-drag anyway (irrelevant here - desktop-only). Drag
state is tracked directly via `document`-level `dragstart`/`dragend`
in `main.js` instead, self-contained.

**The real architectural constraint this phase had to solve**:
`renderZones` rebuilds `#zones` wholesale on every state-driven render
(any player's move can trigger one, not just the local player's own
actions), which would silently orphan a focus-zoomed pile's DOM if
nothing accounted for it. Solved by tracking `focusedPileId` (a pile
ID, never a DOM reference) and calling `reapplyFocusZoom()` after every
`renderZones` call - it discards whatever survived the old render and
re-grows the same pile fresh from the new one, or drops focus if that
pile no longer exists. This is exactly the class of bug D129 warns
about (reads correct in isolation, breaks the moment a re-render lands
mid-interaction) - caught by DESIGN here, not by a test finding it
after the fact.

**Honest mutation-testing finding, not glossed over**: the
`isDragInProgress` guard inside `growPileInPlace` itself turned out
unreachable via the test I wrote - `dragstart`'s own `clearTimeout`
already cancels the pending hover-intent timer before growPileInPlace
would ever be called, so removing that inner guard didn't fail the
test. Kept it (real defense against a future caller that skips the
pre-checks the current two call sites already do), but recorded as
disclosed-not-proven rather than claimed as independently
mutation-verified - the honest line project standards ask for.

5 new live-browser tests (`test:focuszoom`), stress-run 3x clean.
802/802 unit, lint-js baseline, lint:design unchanged (8).

## Next Steps
Handed to Trin for Phase 113 UAT.

---

## US-117 Phase 114 (2026-09-11): edge-case polish - DONE, found a real bug

T114.1 (viewport clamp) was already wired into phase 113's
`applyFocusZoom` from the start, per Morpheus's review note - but
writing the small-viewport live test this phase called for FOUND A
REAL BUG in it, not just confirmed it: the clamp math itself was
correct, but it was clamping against a PREDICTED size (the pile's
rect captured while still flex-constrained in `#zones`) that
under-counted the pile's true natural size once freed from its old
flex siblings - by ~70px in the worst case on a cramped layout, enough
to clip a grown pile off the edge despite the clamp formula never
being wrong.

**Fixed at the root, not patched**: `applyFocusZoom` now reparents to
`<body>` FIRST at scale 1, pinned to the pile's exact original screen
position (a pure DOM move, no visible change - not a guess), measures
its TRUE unconstrained size there, and only THEN computes the grown
size and clamp from that real number. Replaced an earlier "predict,
then re-measure and correct" two-pass attempt that only partially
worked (residual ~1px rounding remained, which the live test's
tolerance now correctly treats as measurement noise, not a real clip -
same class of fix as phase 111's 44px-floor rounding).

T114.2 (drag-out proof) reuses the synthetic dragover/drop mechanism
`rtgPlaythrough.browser.mjs` already established as necessary
(Playwright can't synthesise a real native HTML5 drag) - a card
dragged out of an already-reparented, focus-zoomed pile lands in its
destination with zero `dropTarget.js`/`touchDrag.js` changes, proving
D130's claim live rather than by code inspection.

2 new live-browser tests (8 total in the file), stress-run 3x clean.
802/802 unit, lint-js/lint:design baselines held throughout.

## Next Steps
Handed to Trin for Phase 114 UAT.

---

## Queue status after US-117 launch (2026-09-11): stopped, not empty

User instruction was "keep sprinting till done then close out and
commit/merge, then work the queue till empty" and then went offline.
US-117 is done, committed, and pushed (`dev` f19c2cd, `main` 3207e8d
merged and pushed, both green). Looked hard at all 4 standing queued
items before touching code on any of them - stopped rather than guess,
because every one of them has a real blocker only the user can resolve,
not busywork to push through:

1. **Tighten/Loosen slider** - explicitly flagged (this file, prior
   entry) as needing the user's own visual-design input (styling,
   layout) before implementation, not a fix-loop's to guess.
2. **Flip as a radio box with preview icons** - same category: "preview
   icon rendering" is a real visual-design call, not specified enough
   to build without guessing.
3. **Zone-level privacy** - checked it against the CURRENT architecture
   before starting, and found a real conflict: this item (queued
   before D83/D84) describes hiding a personal pile's contents from
   other players, but D83/D84 is explicit and later - "no per-viewer
   restriction of any kind... a viewer sees every card's real identity,
   always." Implementing the queued item as written would REVERSE a
   standing, deliberate architectural decision, not extend it. Posted
   to CHAT.md rather than picking a side - this needs the user to say
   which one is still true, not an autonomous judgment call.
   **Correction (2026-09-17, direct user clarification):** this
   analysis conflated the DATA question (D84's, settled) with the
   RENDERING question (never actually settled either way) - the user
   pointed out `HandPile`'s own owner/opponent `showsFace()` split
   already renders differently per viewer without touching the data
   D84 protects. No real conflict; see the queue entry above for the
   corrected scope.
4. **Remote-cursor redesign** - "no back-compat" means the existing
   D19/D68 coordinate-mirroring code gets deleted outright, and this
   project has a standing, repeatedly-flagged gap: no 2-peer browser
   harness exists to verify ANY live cross-client behavior. A protocol
   redesign to how one player's cursor renders on another's screen is
   exactly the kind of change that reads correct in code and wrong
   live (this whole session's own D129 lesson) - too risky to ship
   unverified and unsupervised.

**Not treating "queue till empty" as license to guess on things
flagged as needing the user's judgment**, especially with no one
online to redirect a wrong guess the way US-117's own two design
pivots (D130->D131->D132) were only possible BECAUSE the user was
actively steering in real time. Stopping here with a clean, pushed
tree rather than manufacturing motion on items where the honest
answer is "this needs you, not more autonomy."

### Next Steps
Awaiting the user. When back: item 3 needs a direct call (does D83/D84
still stand, or does zone-privacy supersede it for PlayerZones
specifically); items 1/2 need a look at what "the slider"/"the radio
box" should actually look like; item 4 needs either a live 2-person
test session with the user watching, or an explicit "I accept the risk,
build it alone."

---

## `*fix table-zoom-wheel` + focus-zoom bugs (2026-09-16)

Direct user feedback, iterated live across several messages rather than
planned upfront - each correction narrowed the actual ask:

1. "the infinitable slider should be a wheel not a slider. like the
   zoom wheel on a mouse" - clarified via AskUserQuestion: replace the
   `<input type=range>` table-zoom dial entirely with scroll-driven
   zoom; S/M/L/XL presets stay.
2. "can it be a manual control 'like' a mouse wheel. I don't want to
   overload mouse scrolling but maybe pinch zoom on touch screens?" -
   reversed the real scroll-wheel idea: a dedicated widget instead, so
   it never fights ordinary page/panel scrolling. Pinch-to-zoom for
   touch confirmed as the touch equivalent (built the pure math,
   `zoomFromPinch` - NOT wired to a live touch listener this pass, no
   real touch device to verify against; flagged below).
3. "make it a verticle control where the 'tred' of the wheel can be
   spun up to zoom in or down to zoom out" - the final, built design.
4. "we'll also need to pan with drag on table" - a second, genuinely
   new mechanism (no pan/camera code existed anywhere in this codebase
   before this).
5. "*fix bug zooming in on the pile looks great but it goes bonkers
   when trying to interact with the fit slider or drag a card out" -
   two real, reproducible bugs in the EXISTING US-117 focus-zoom
   feature, found by the user in actual use, not by any test.

### What shipped
- **`tableZoom.js`**: `zoomFromWheelDrag` (vertical drag delta ->
  absolute zoom, `WHEEL_DRAG_RANGE_PX` spans MIN..MAX), `zoomFromPinch`
  (ratio-based, built+tested, not yet wired), `maxPan`/`clampPan` (pan
  bound grows linearly past 1x zoom, zero at/below 1x - a deliberate
  heuristic, not measured from real content, same spirit as the zoom
  range itself being player-driven).
- **`index.html`**/**`style.css`**: `#table-zoom-dial` deleted outright
  (no back-compat shim); `#table-zoom-wheel` (`role="slider"`,
  vertical) with a `repeating-linear-gradient` "tread" for the wheel
  look. `#zones`' transform is now `translate(pan) scale(zoom)` -
  translate OUTSIDE scale so a screen-pixel drag reads as the same pan
  distance regardless of current zoom.
- **`main.js`**'s `wireTableZoomControls`: pointer-drag wheel (+
  ArrowUp/ArrowDown keyboard equivalent, `role="slider"` implies it),
  and table-pan (pointerdown on `#table-surface`/`#zones` THEMSELVES
  only, never a descendant pile/card/button, so it can never compete
  with existing drag-and-drop).
- **Bug 1 fixed**: `wireFocusZoom`'s `dragstart` listener unconditionally
  called `shrinkFocusedPile()`, reparenting the pile back into `#zones`
  - including when the drag's OWN source card lived inside that exact
  pile, moving the native drag's source node mid-gesture (browsers
  handle that very badly). Now skips the shrink when the drag started
  from inside the currently-focused overlay.
- **Bug 2 fixed**: a plain `pointerleave` on the grown pile shrank it
  the instant the pointer crossed its (enlarged, fixed-position)
  boundary - including mid-drag on the pile's own Tighten/Loosen
  slider. Now checks `event.buttons !== 0` (a button still held) and
  waits for a `pointerup` (anywhere on `document`) instead of shrinking
  immediately. Centralized the cleanup for both watchers into
  `shrinkFocusedPile`/`reapplyFocusZoom` (module-level
  `clearFocusPointerWatchers`) - the original one-off version leaked a
  `document`-level listener on every re-render path that didn't happen
  to be the one that attached it.
- **Bug 3, found not reported**: while live-testing bug 1/2's fix, the
  existing "grown pile never extends past viewport" browser test
  failed - a REAL regression from last sprint's Tighten/Loosen slider
  (a wider pile header pushed `FOCUS_ZOOM_SCALE` (1.6x) past a small
  viewport for at least one pile kind). `clampOverlayPosition`
  (`focusZoom.js`) only ever repositions, never resizes - added
  `clampFocusZoomScale` (caps the EFFECTIVE scale to fit, never below
  1x) alongside it, wired into `applyFocusZoom` before the position
  clamp runs.
- **Test-timing bug found alongside it**: that same viewport test
  measured the overlay's `boundingBox()` only 50ms into `.focus-zoomed`'s
  own 150ms CSS transition - mid-animation, not at rest. Extended the
  wait; unmasked by bug 3's fix producing different geometry, not
  itself something bug 3 caused.

### Verification
851/851 unit (`tableZoom.test.js` + `focusZoom.test.js` additions),
`test:tablezoom` (9/9, wheel drag direction, pan, card-drag-does-NOT-pan),
`test:focuszoom` (10/10, both new regression tests + the pre-existing
viewport one), `test:ui` full run in progress at handoff. `lint-js`/
`lint-style` at their unchanged pre-existing baselines; `lint-design`'s
8 violations confirmed pre-existing via a scoped `git stash` comparison
against the last commit, not a regression from this work.

### Explicitly NOT done this pass
- **Pinch-to-zoom is NOT wired** to a real touch listener - `zoomFromPinch`
  exists and is unit-tested, but there is no touch device to verify
  against live, and this project's own standing convention is not to
  ship an unverified live-interaction change unsupervised. Flagged for
  the user rather than guessed into place.
- No `overflow: hidden` added to `.table-surface` for panned/zoomed
  content - matches the EXISTING (pre-this-session) zoom behavior,
  which already doesn't clip either (Smith's own backlog item #2 from
  the US-117 retro: "XL zoom pushes the hand below the fold" - a known,
  accepted trade-off, not something this pass changed either way).

## Next Steps
*fix bloop closed (Neo->Trin->Morpheus->Oracle all passed, see CHAT.md)
- this was a `*fix`, not a `/sprint`, so no Smith/retro/launch ceremony
ran. 851/851 unit, test:tablezoom 9/9, test:focuszoom 10/10, full
test:ui confirmed no new regressions (the one remaining failure set is
the pre-existing, already-filed, unrelated focus-zoom/context-menu bug -
see cypher.docs/state.md backlog).

Committed and pushed as of 2026-09-17 (2 commits: check-story-numbers
tool, then the cardTransforms polymorphism refactor + Tighten/Loosen
slider + table-zoom wheel/pan + focus-zoom fixes bundled together -
`state.js`'s own diff wasn't cleanly separable by feature). `dev`
merged forward from `main` first to catch up 7 commits `dev` had
fallen behind by.

Standing, NOT started - now tracked in `docs/BACKLOG.md` (consolidated
2026-09-17, along with every other backlog list that had been
scattered across this project): pinch-to-zoom wiring, the queued items
2-4 above (flip radio-box, zone privacy vs D83/D84, cursor redesign).
The focus-zoom/context-menu bug mentioned in earlier entries here was
fixed 2026-09-17 (see `docs/BACKLOG.md`'s "Not carried forward" section
and `agents/oracle.docs/memory.md`'s 2026-09-17 row) - no longer open.

## `*fix Table-Zone-overlap` (2026-09-17, same day, later session): DONE, not yet committed

Trin recalled a standing `lint:design` finding ("the 7 failures we keep
ignoring" - traced to a 2026-09-13 filing, 5 of 7 already fixed
earlier today via the focus-zoom-context-menu fix, 2 re-scoped as the
deck-resize bug). Separately, `lint:design`'s "Table Zone overlaps
Bob/You" zone-overlap findings (a DIFFERENT, also-standing issue - the
Makefile's own baseline comment said 3, actual had grown to 5) turned
out to be the SAME issue as a backlog item marked "Dropped - not
pursuing" earlier this same session ("per-seat anchor geometry overlap
at some desktop widths/player counts"). Direct user request reversed
that: "we can actually fix it by updating the presets with a table
zoom that can fit all the zones."

**Root cause** (see `docs/DECISIONS.md` D133 for the full writeup):
`#zones` filled whatever `.table-surface` the viewport left (`inset:
0`), so the seat ring (`seating.js`, percentage-of-container) and every
preset's fixed-pixel panel coordinates (`presets.js`) only agreed at
one calibration size. Confirmed via a live geometry probe (Playwright,
not guessed) that uniform zoom alone cannot fix this - scale preserves
whether two rects intersect, only shrinks the overlap. **Fix, in
order**: (1) `#zones` now a FIXED local canvas (`TABLE_CANVAS_SIZE`,
`tableZoom.js`, 1280x950), (2) `SIMPLE_LAYOUT`'s table-zone/score
panels repositioned (`y: 290 -> 480`, `presets.js`) to clear the top
seat's own zone WITHIN that canvas - a real geometry fix, verified live
via probe, not just a bigger number, (3) `computeFitZoom` scales that
now-correct canvas down to fit whatever viewport is real, replacing the
flat `TABLE_ZOOM_DEFAULT_SCALE` as the STARTING zoom (`main.js`'s
`wireTableZoomControls`) - re-applied on every render/resize until the
player manually zooms (`hasUserSetZoom`), never afterward.

**Verified:** 860/860 unit (new `computeFitZoom` tests,
`tableZoom.test.js`), 7/7 `test:tablezoom` (one assertion updated to
compare against the computed value; the "zoomed in" drag test's
viewport pinned to 1440x900 - the repositioned panel no longer fits
Playwright's 720px-tall default at max zoom, not a regression in what
that test verifies). `lint:design`: zone-overlap findings gone at all
3 tracked breakpoints, only the 2 pre-existing unrelated "forced
scroll" findings remain. `lint:js`/`lint:style` at baseline (one new
var caught by `unicorn/consistent-boolean-name`, renamed
`hasUserSetZoom`). `make check` PASSED.

**Found, not fixed, filed to `docs/BACKLOG.md` instead** (scope
discipline - this was already a big enough change): "dragging the
pile's own spread slider outside its bounds does not shrink the pile
mid-drag" (`tests/focusZoom.browser.mjs`) is flaky - confirmed
PRE-EXISTING via an 8-run baseline against unmodified `dev` (1/8
failed) before touching anything, so explicitly NOT attributed to this
fix. Also queued (not investigated) via `*queue nit`, both in
`docs/BACKLOG.md`: dropping a card on a hand stack splits instead of
merging; pin a focus-zoomed pile open with an explicit X-close button.

**Not committed yet** - awaiting Trin's `*qa test` gate per protocol
(this was real architecture work: a D132 partial reversal, new D133
entry, `#zones`' sizing model changed). Files touched: `Makefile`,
`docs/BACKLOG.md`, `docs/DECISIONS.md`, `src/main.js`, `src/presets.js`,
`src/tableZoom.js`, `style.css`, `tests/tableZoom.browser.mjs`,
`tests/tableZoom.test.js`.

## `*fix all-presets-layout` (2026-09-18): DONE, folded into the same pending Trin handoff

Direct user request, same day, continuing straight from the D133 work
above (not yet committed): "update all the presets to have a
reasonable zoom level and neatly organized table zones." When RtG's
own layout turned out genuinely hard to reconcile with the shared
canvas (5 piles per player, never measured against the ring before),
the user pre-authorized the fallback before I asked: "if hard to get
the layout right change the preset to use a grid for the initial
layout and the players can organize and save their presets" -
`panelLayout.js`'s existing Save Layout feature (D61) is the intended
per-table escape hatch, not a promise every default is perfect.

**D134** (`docs/DECISIONS.md` has the full writeup): `gameConfig.
tableCanvasSize` (optional, additive, same shape as `cardSize`) lets a
preset declare its own canvas when the shared 1280x1050 default
doesn't fit its content. War (26-card hand) and Recard the Gathering
(15 decks + 5-pile player zones) got their own; Solitaire got a
tighter one (its own content is much smaller than the 2-seat default).

**Two real bugs found live, neither part of the original ask:**
1. `state.js` reconstructs `gameConfig` via an explicit per-field
   allowlist in TWO places (`createInitialState` AND `viewFor` - the
   one a GUEST's render actually reads) - `tableCanvasSize` silently
   fell back to the shared default the first time this was tried
   because it wasn't in either list yet. Added to both.
2. `#zones`' CSS centering (`top/left:50%` + negative margin) and its
   `scale()` transform used MISMATCHED pivot points
   (`transform-origin: top center`, a leftover from the old `inset:0`
   approach) - harmless at the shared canvas' modest height, badly
   misaligned `#zones` for War's taller dedicated canvas (confirmed
   live: rendered 177px above the visible table surface entirely).
   Fixed: `transform-origin: center`, matching the margin centering.

**`tests/designLint.check.mjs` gained a permanent preset sweep** (one
fresh host+guest table per preset, 1280x800, overlap check only) -
the standing viewport sweep only ever exercised whichever preset the
host form defaults to (War), so every OTHER preset's `layout` went
completely unchecked by any automated gate until now. First run found,
for real: Gin Rummy's `layout` was a years-stale raw DevTools capture
full of dead per-connection-id entries (replaced with the shared,
verified `SIMPLE_LAYOUT` - the game needs nothing beyond table-zone/
score); Chips & Tokens had NO `layout` at all; Solitaire's and Spit's
column widths (140/150/160) were silently widened to 176px by
`.pile-section`'s own `min-width: 11rem` floor, closing the gaps
between adjacent columns and causing real overlaps.

**Two known, accepted exceptions** (in `KNOWN_EXCEPTIONS`, still
LOGGED by the sweep, not counted toward its exit code): Recard the
Gathering (Smith's own Gate-1 C3 crowding finding, pre-existing) and
Solitaire (genuinely solo-designed, but nothing stops a second player
from joining and claiming a ring position the solo grid never
accounted for - a real fix needs a "disallow extra players"
`GameConfig` capability this project doesn't have).

**Verified:** 860/860 unit (2 exact-shape `gameConfig` assertions in
`state.test.js` updated for the new field), 7/7 `test:tablezoom` (the
default-zoom test now reads the ACTIVE preset's canvas size live
instead of assuming the shared constant), `test:focuszoom` 10/11 and
`test:ui` 19/20 (both single failures pre-existing/backlogged,
confirmed not regressions), `make check` PASSED, `lint:js`/`lint:style`
at baseline. `lint:design`: 2 pre-existing "forced scroll" findings
only - every zone-overlap finding outside the two documented
exceptions is gone across every preset, not just the default.

Additional files touched beyond the D133 list above: `src/state.js`,
`tests/designLint.check.mjs`, `tests/state.test.js`.

## Next Steps
Still hand off to Trin (`*qa test`) for ONE combined gate covering both
D133 and D134 - nothing has been committed yet, this is all one
uncommitted working-tree change. `docs/DECISIONS.md` D133/D134 revise
D132 and touch shared sizing (`#zones`) plus every preset's own
layout, which is exactly the kind of change this project's own
protocol wants a second set of eyes on before it lands. If Trin
passes, this is still `*fix`-shaped (found live, root-caused, fixed,
verified) - no Smith/retro/launch ceremony needed, just commit + push.
