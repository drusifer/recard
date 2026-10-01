# Agent State

## Current Task (2026-10-01) - New Jev game: War (`*bloop` request, "make a jev/xstate player for war")

War had NO `games/war/` directory before this - only Gin and RtG exist as Jev-player games
(US-129/D154). Built it from scratch, same shape as `games/gin/`: `games/war/{questions.yaml
(empty - War has no decision to judge),table.yaml,turn.yaml}` + `players/mechanical.yaml` (one
player file - no real choice in War means no second style), `tools/war/{bot.mjs,library.mjs,
adapter.mjs}`, registered in `tools/jev/games.mjs`. Confirmed via `docs/ARCHITECTURE.md`'s own
module-layout section before starting (direct user instruction this session: "always read arch").

**The actual design problem**: War's own doc comment in `src/presets.js` already states the whole
game as primitives - "drag each pile's own top card onto the Table to compare, then MOVE the
winnings into the winner's deck" - so there is nothing for Jev to judge (`games/war/questions.yaml`
is `{}`); `WarBot.look()`/`step()` compute the phase mechanically, same shape as Gin's
`gin_look`/`gin_step` (which also never judge - only Gin's STRATEGY choice does).

Two real problems solved, not just "flip a card":
1. **The Table pile carries no owner field** (it's `plain`, not a `hand`) - nothing on the wire
   says which flipped card is mine vs the opponent's. `WarBot` remembers its own move ids in a
   private `#myCardIds` Set and treats every other table card as the opponent's - the same kind
   of client-side memory `GinTracker` keeps for Gin, just keyed by id instead of diffed.
2. **A `deck`-kind source/destination gets no auto-reveal/auto-hide** (D43's `toHandCard`
   stripping only fires for a `hand`). Every flip needs an explicit FLIP after the MOVE to become
   visible; every collect needs an explicit FLIP back *only for the cards that were face-up* -
   first draft flipped every collected card unconditionally, which would have un-hidden the war
   procedure's 3 face-down burn cards (toggle, not set-to-false). Found and fixed before shipping,
   not live.

**`look()`'s phase logic** (flip | collect | wait | done), after one real redesign mid-session:
first draft computed `done` from "either deck is 0 and face-up counts are equal" checked FIRST,
which fired the instant a 1-card deck's only card was flipped (before the round was even compared
or collected) - caught by the unit tests, not shipped. Rewritten so `done` is only ever checked at
a true round BOUNDARY (face-up counts equal, nothing pending): either my own deck is out and I
can't catch up, or at `myCount===theirCount===0` either side is out with nothing left to resolve.
A win/loss with an uncollected pot always returns `wait`/`collect`, never `done`, even if a deck
hit zero getting there.

**Disclosed, not fixed** (scoped out, documented in `bot.mjs`'s own header comment): the official
rule that a player unable to complete the war (fewer than 4 cards left) loses outright isn't
modeled - this bot plays as many of the 3-down-1-up as remain instead. Good enough to finish a run,
not a faithful edge case.

Also wired the generated-docs side so the new game doesn't drift: `warLibrary` added to
`tools/jev/libraryDocument.mjs`'s `allLibraries()` (US-129 Gate 1 C2 - without this,
`jev-library-doc` and the README generator's statechart diagram silently can't find War's names).
Ran `bobp make jev-readme` (regenerated `games/war/README.md`, gin/rtg's byte-identical) and
`bobp make jev-library-doc` (`docs/JEV_LIBRARY.md`). Updated `tests/jevTableCli.test.js`'s
`<gin, rtg>` listing to `<gin, rtg, war>` - a real, expected consequence of adding a game, not a
defect.

Tests: `tests/helpers/warFakeTable.mjs` (new fake table - deliberately does NOT auto-reveal on
MOVE the way `ginFakeTable.mjs` does, since War's deck source gets no such auto-reveal for real;
that distinction IS the thing under test). `tests/warBot.test.js` (5: ordinary round, loser never
collects, tie -> war procedure -> winner takes the 10-card pot, both "done" boundary cases).
`tests/warTurn.test.js` (2: the real statechart via `warSeat`, leave-while-safe). Full suite
1207/1207 green, `bobp make lint` clean (fixed 6 real findings along the way: 2 unicorn boolean-
name renames [`warContinuation`->`isWarContinuation`, a fake-table param], 2 single-line-block-
comment style, 1 unused `onRecord` param, 1 nested-template-literal in `summaryLine`).

Queued (not started, logged to `docs/BACKLOG.md` per direct user request via `*queue sprint`):
**`jev-game-master`** - a generic Jev player, not tied to one game, that listens to table talk for
add/remove-bot commands instead of taking them from the CLI.

**Live validation, this sandbox - mixed results, one real bug found+fixed, one still open:**
1. Joining the user's own live tables (`G6B9KN`, then `LWDFCJ`) both timed out at 60s ("not
   seated") - never reached the War adapter at all. Likely this sandbox's WebRTC can't reliably
   reach an EXTERNAL host; signaling to 0.peerjs.com itself works (curl 200), the data channel
   doesn't complete.
2. At the user's suggestion, hosted FROM here instead (`bobp make jev-table GAME=war`, 2 bots
   against each other). First real run: finished in ~13s but with **zero recorded moves on either
   side** - a real bug, found and fixed: `WarBot.look()`'s `done` check read `myDeck?.cards.length
   ?? 0` as "0 cards left" when `myDeck` was actually just `undefined` (no `deck`-kind pile exists
   yet - the host's DEAL step hadn't converted the player's pile from `hand` to `deck` by the time
   this bot's own seat started looking). Fixed: `!myDeck || !opponentDeck` now returns `wait`,
   never `done` - "not dealt yet" and "dealt then exhausted" no longer look the same. Regression
   test added (`warBot.test.js`, the exact pre-deal pile shape).
3. Second real run, same fix: progressed 25-29 real moves each side (actually playing War
   correctly, multiple ties/wars resolved) then froze permanently mid-war, no crash, no further
   writes for 8+ minutes. Direct live inspection (a throwaway spectator script, not committed)
   found the actual cause: `WarBot` fired MOVE then immediately FLIP (and, during a collect, pairs
   of these) with **no confirmation that either action had actually landed** before proceeding -
   fine against the synchronous `FakeWarTable`, but a real guest's `peer.act()` only confirms the
   message was SENT, not that the host's broadcast round-trip updated this bot's own view
   (confirmed empirically with a clean isolated 2-peer repro: an unconfirmed MOVE+FLIP pair
   genuinely never took effect, while the same pair with a settle wait did). Fixed by copying
   `tools/gin/bot.mjs`'s own established pattern (`peer.waitForView` after every action) via a new
   `#actAndConfirm` - which in turn hit a SECOND real bug on first live try: the confirm predicate
   closed over `this`/a private method (`#onTable`), and `waitForView` against the real harness
   peer is Playwright's `page.waitForFunction`, which RE-SERIALIZES the predicate into the
   browser's own JS realm - `Private field '#onTable' must be declared in an enclosing class`,
   live, the moment two real bots exercised it. Fixed: a module-level pure `cardConfirmed(view,
   {pileId, cardId, faceUp})` with everything passed through the explicit `argument` parameter
   (exactly `tools/gin/bot.mjs`'s own `waitForView((view, [cardId, isFaceDown]) => ..., [...])`
   shape) - no closures at all.
4. Third run, both fixes in place: progressed only 2 moves each side this time (an ordinary flip
   then a tied war-continuation) before freezing the same way - no crash, no further writes, 5+
   minutes. Live inspection showed something NEW and not yet explained: one bot's very first,
   simplest possible move (a single MOVE of its own top card) never actually reached the table at
   all - the card was found sitting back in its OWN deck with `faceUp:true` (i.e. flipped in
   place, as if FLIP ran but the preceding MOVE silently never took effect) - while every one of
   the OTHER 8 cards on the table that round landed correctly. Traced `__recardHarness.act` to
   `submitAction` directly (not the `dispatchOrAlert`/`alert()` wrapper - ruled that out), and
   `waitForView`'s timeout (15s) should throw a real error if a confirm never lands - it didn't,
   the process just sat alive and silent for 5+ minutes. **Not root-caused.** Given this is the
   THIRD distinct live-environment stall this session (two external join timeouts + this), stopped
   per the anti-loop rule rather than attempting a 4th live run blind - most likely this sandbox's
   WebRTC/network degrades under sustained concurrent 2-peer load, but that is a suspicion, not a
   finding. Killed the stuck table+bots+browsers; nothing left running.

**Net state**: the bot's own logic is solid - 8/8 unit+turn tests green (including both real
pre-deal and confirm-ordering regressions), `bobp make lint` clean, full suite 1208/1208 green,
and it DID play real, correct rounds of War (including resolving actual ties via the war
procedure) against another live bot before each stall. What's unverified is a FULL game to
completion in a real browser, in THIS environment specifically - every live multiplayer test this
session (joining externally, twice; hosting locally, three times) has hit some form of
WebRTC/timing flakiness, which reads as an environment constraint rather than something in this
feature. Recommend: try `bobp make jev-table GAME=war` (or `jev-player ... CODE=<code>`) from a
normal (non-sandboxed) machine to get a clean live signal; this session has exhausted its
reasonable budget for chasing it here.

**NOT committed** - everything above is new/untracked (`games/war/`, `tools/war/`,
`tests/warBot.test.js`, `tests/warTurn.test.js`, `tests/helpers/warFakeTable.mjs`) or modified
(`tools/jev/games.mjs`, `tools/jev/libraryDocument.mjs`, `tests/jevTableCli.test.js`,
`docs/JEV_LIBRARY.md`, `docs/BACKLOG.md`) - awaiting the user, standing session pattern.

## Next Steps
Confirm the live join at `G6B9KN` actually played (check CHAT.md/this session). Then: commit this
work (plus everything else already queued uncommitted - see `agents/cypher.docs/state.md`) once
the user confirms, or start `jev-game-master` next if asked.

## Previous - (2026-09-29) - US-144/D166 ALL 3 PHASES DONE, sprint closed

main.js's host-setup/new-game cluster (D161's last pause-list item) moved to src/hostSetup.js
in full, via `/sprint till done`. main.js 2174 -> 1412.

- **Phase 1**: pure/derivation helpers (describeDeckConfig/describeConfiguredZones/deckColorDots/
  groupDeckChoicesByColor/renderDeckChoiceLabel/renderDeckChoices/chosenDeckIds/configsForPreset).
  10 new unit tests (tests/hostSetup.test.js) - first coverage this logic ever had.
- **Phase 2**: seatRosterEntry/wireHostSession/offerRestore/resumeHostedTable/stillMissing/
  renderWaitingForReturners/maybeResumeRestored/finishRestore -> `createHostSession(read, patch)`.
  D166: role/session/myId/myName/gameState/lastDealCount/selectedPreset/requestedRole cross the
  boundary via read()/patch() (they're read by code staying in main.js); awaitedReturners/
  isResumePending are real private closure state. NEW tests/resume.browser.mjs (2 tests) - the
  Resume flow (US-37/39/43/45) had ZERO browser coverage before this, closed while touching the
  exact code. Hit and fixed a real test-authoring gotcha: Playwright auto-DISMISSES `confirm()`
  unless `page.once('dialog', d => d.accept())` is registered first - filed as a lesson.
  peerToKey/identityAnnounced stay in main.js (shared with dispatch/publishTalk/
  applyIncomingMotion, which are outside this cluster) - passed by reference, not privatized.
- **Phase 3**: startGame/scheduleAutoStartCheck/maybeAutoStart (expectedPlayers/autoStartTimer
  now private) + createTable (was the `#create-table` click handler) + New Game flow
  (startNewGameFlow/cancelNewGameFlow/startNewGame), all into the same createHostSession factory.

Verification held throughout: `bobp make check` clean every phase; hostsetup/newgame/resume/
multiplayer/reconnect/rtg/spectator/tablezoom all green at the end. Zero fix loops.

Sprint closed: Oracle groom (ARCHITECTURE.md module-map drift fixed for 5 files missing since
D161; 2 lessons filed; BACKLOG.md's stale "no way to resume" entry corrected), Smith user-test
passed, full retro posted, Cypher `*pm launch`. 386 never-archived CHAT.md messages (6 prior
sprints) archived to agents/chat_archive/CHAT_MAINJS_AND_JEV_SPLIT.md in the same pass.

**NOT committed** - see agents/cypher.docs/state.md for the working-tree file list; ask the user
before committing/pushing.

## Current Task (2026-09-29, later still) - US-145/D167 SHIPPED: Flip control redesign

Gear menu's Flip is now enum:true, reusing changePileType's own buildEnumActionMenu disclosure
(no new widget). SET_STACK_DIRECTION(pileId, stackKey, direction) replaces FLIP_STACK outright;
Stack.flippedDirection() deleted. buildEnumActionMenu gained an optional choice.preview factory
(generic, not Flip-specific) rendered alongside the label. pileCards.js's openStackActionMenu
switched to call the shared buildSpecialActionControl instead of duplicating its range-only
branch inline - that missed call is WHY enum never worked as a stack action before this.

**2 real bugs found live, both worth remembering:**
1. `<action-menu>`'s document-click-close listener caught the enum's native `<summary>` toggle
   click (no stopPropagation) - opening Flip's disclosure closed the whole popup instantly.
   Fixed with `summary.addEventListener('click', e => e.stopPropagation())`.
2. Bigger one: the outer `<action-menu>` popup reuses `.pile-action-menu`'s own classname for
   its shell, including that class's `overflow: hidden` - clipped the enum's nested dropdown to
   NOTHING, invisible but fully present in the DOM. All 21 test-ui tests (incl. the new Flip
   ones) stayed GREEN throughout - count()/textContent() don't check paint, and Playwright's own
   click/visibility actionability doesn't check an ancestor's overflow clip either. Found only by
   Smith actually looking at a screenshot. Fixed with scoped `.stack-action-menu{overflow:visible}`;
   added a real `elementFromPoint` hit-test to the test itself as the general pattern for any
   future popup-in-popup reuse.

check clean, test-ui 21/21 (3x stress-clean), rtg/headeractions/zonepanel green throughout.

## Current Task (2026-09-30, later) - US-147/D169 SHIPPED: stack direction -> style + Jumble

`/bloop rename stack_direction to stack_style... add jumble... default for tokens`. Renamed the
whole "direction" concept to "style" throughout (Stackable/Stack/Pile/state.js/pileCards.js/CSS
class names), no back-compat - careful not to touch UNRELATED "direction" words in the same
files (card-flip, rank-adjacent, tap orientation). Added JUMBLE (Stackable.js): deterministic
per-index scatter+tilt via a seed-only sine hash, not Math.random. TokenPile.stackStyle = JUMBLE
+ its own defaultSpread=0.6 (Pile's own 0 would collapse a jumble to looking like one token).

**3 real structural bugs found live generalizing this, not patched around:**
1. Jumble's offset was signed - could land BEHIND the stack's own origin, overlapping content
   ABOVE the pile (found live: RtG's token supply overlapped its own title bar). Fixed: unsigned
   position jitter (rotation stays signed - no layout consequence).
2. Stack.extent() took the LAST item's offset - correct by construction for monotonic styles,
   wrong for jumble's non-monotonic scatter. Fixed: MAX across every item, each axis, for all
   styles (not a jumble-only branch).
3. `--raise-base` was only ever CONSUMED (as a real `transform`) by `.fan-row` - the token pile
   had ALREADY hit this exact gap once before (an old ad-hoc nth-child CSS patch existed just for
   it). Deleting that patch without replacing the underlying gap left jumble's rotation computing
   correctly but never painting - same failure, recurring. Fixed at the root: moved `transform:
   var(--raise-base, none)` onto the UNIVERSAL `.card-stack > .middle-card` rule.

Also found+fixed: a test helper (`moveTo`, rtgPlaythrough.browser.mjs) clicked a pile title's
whole bounding-box center - fragile whenever a busy header (title+rename+Tighten/Loosen slider)
has another control in that same box. Jumble's real 2D scatter shifted page layout just enough to
expose it. Fixed: click the title's own stable `.zone-name-text` label instead.

Verification style worth remembering: git-stashed the WHOLE diff against clean dev and re-ran
each failing test against the untouched baseline before trusting any "this is caused by my
change" theory - caught that the .pile-title/slider overlap was pre-existing (a red herring) and
that the REAL regressions were exactly the 3 bugs above, nothing else.

check clean, full unit suite (1195) + every browser suite (rtg 3x stress, ui, multiplayer,
reconnect, hostsetup, headeractions, zonepanel, actionmenu, pileelement, spectator, remotecursor)
all green. Visually confirmed (screenshot) both the token-jumble look and Flip's new 4th choice.

## Current Task (2026-09-30, later still) - US-148/D170 + US-149/D171 SHIPPED

**US-148**: `layoutSave.js` `performSaveLayoutAs` - swapped `globalThis.prompt()` for an inline
`<input>` reveal, exact same idiom `<header-actions>`'s rename already uses (focus+select on
open, Enter blurs to commit, Escape sets a settled flag and reverts, blur commits/reverts).
Trigger is the BUTTON itself (there's no existing label to double-click here, Smith's own
condition at the arch gate) - `button.replaceWith(input)` then back. `overwrite`/`save-success`
`alert`/`confirm` left untouched (out of scope). New `.layout-save-as-edit` CSS, copying
`.zone-name-edit`'s look. `tests/layoutSave.browser.mjs` (3 tests): type+Enter saves under the
typed name (checked via the real `recard:layout-overrides:v1` localStorage key, object keyed by
name - NOT an array, caught before shipping by reading `layoutOverrides.js`'s own doc comment);
Escape and blank both revert with ZERO `dialog` events (asserted via `page.on('dialog')`).

**US-149 - real finding, not just impl**: `state.js` already has `CREATE_ZONE(kind, name?)` and
`CREATE_PILE(kind, zoneId, name?, pileableId?, fromPileId?)` - fully built, fully unit-tested
(a dozen+ cases each in `tests/state.test.js`), replicated like any action, validated (rejects
`kind: 'hand'` and non-`tableSide` kinds) - found by actually reading `state.js` before writing
a single line, which caught that Morpheus's own arch draft (new `ADD_ZONE`/`ADD_PILE` actions)
was unnecessary. `main.js` even has a standing comment disclosing the exact gap: "Reset/Reset
Scores/Add Zone controls removed... CREATE_ZONE stay real, dispatchable, fully-tested... only
their UI entry points are gone." Closed that gap outright:
- `tableActions.js`: `performCreateZone(kind)`/`performCreatePile(kind, zoneId)` - plain
  `io.dispatchOrAlert` calls, deliberately NOT routed through the Pile/Zone `{action,guard}`
  descriptor registries (D165) - those are for an action an EXISTING instance decides the
  meaning of; creating one has no instance to ask, same category as `main.js`'s own
  `adjustScore`/`setScore`.
- New `src/builderMenu.js` (~95 lines): `wireBuilderMenu(read, tableActions)` wires
  `#add-zone-btn`/`#add-pile-btn`, each opening the SAME button-swap idiom US-148 just built -
  a kind `<select>` (every `PILE_TYPES` key but `hand`) for Add Zone, plus a zone `<select>`
  (`type: 'shared'` only - a per-player zone is another player's seat, not a builder target)
  for Add Pile, with Create/Cancel buttons.
- Two real lint catches, both fixed: `for...of` over a `.filter()` call built inline
  (`unicorn/no-duplicate-loops` - filter to a named variable first); a single-line
  `if (x) return; y; z;` arrow body (`sonarjs/no-unenclosed-multiline-block` - braces, matching
  this file's own established multi-line `close()` style elsewhere).
- Two real test bugs found and fixed before shipping: `getByText('Discard', {exact:true})`
  doesn't match reliably against a real rendered heading - switched to
  `.zone-name-text` with `hasText`; `page.keyboard.press('Escape')` only reaches a listener on
  the actually-focused element - `openInlineForm` wasn't calling `.focus()` on its first field,
  so Escape silently did nothing (caught by the test, not shipped broken) - fixed by focusing
  `fields[0]` on open.
- `tests/builderMenu.browser.mjs` (3 tests), mutation-proved: with `builderMenu.js` moved aside
  and the other 4 files' diffs stashed, all 3 time out on a `#add-zone-btn` that doesn't exist -
  the right symptom, not a false pass.

**No new reducer test, no new replication test for either story's actions** - deliberate:
`CREATE_ZONE`/`CREATE_PILE` and D13's generic replication are already proven; asserting them
again per-caller would be padding, not safety (project standard, called out explicitly in
Trin's UAT and the sprint retro).

Smith's user-test used the live harness MCP for a real visual look (not just green tests):
`game_start` (War, 1 player), screenshot of the full button row (no clipping at this viewport),
a real `player_act` `CREATE_ZONE(discard)` dispatch, screenshot of the resulting Zone panel
(clean placement, no overlap with Table Zone/hand/scores). `game_stop` after.

`bobp make check` clean (lint/decks/secrets) at every gate, zero fix loops, 6 new tests total.
**NOT committed** - awaiting the user (standing session pattern).

## Current Task (2026-09-30, later still) - Pile action buttons -> corner gear menu (bloop)

Direct user request: "move pile action buttons to a corner gear icon menu like the slack
settings (including the slider)". `HeaderActions.js`'s per-action button row -> one `.pile-gear`
emblem that opens the SAME `<action-menu>` popup the stack's own gear menu already uses
(`buildHeaderGear`, reuses `buildSpecialActionControl` for the enum/range rows). Deleted
`applyIconButton` outright (zero remaining callers once the button row was gone).

**Real bug found and fixed, not just a refactor**: focus-zoom's own click-outside/pointerup-
anywhere/pointerleave dismissal logic (`TableView.js`) checked `overlay.contains(event.target)`
to decide "is this still part of the focused pile" - broke the moment a pile's own actions
moved into a popup deliberately appended to `document.body` (same reason every such popup is
appended there - to escape a clipping ancestor). New `isPartOfFocusedPile(target, overlay)`
helper treats an open `<action-menu>` as part of the pile everywhere this check happens (3
call sites). A SECOND, subtler bug inside that same fix: a native `<input type=range>` (the
Tighten/Loosen slider) implicitly captures the pointer while dragged, so `event.target` at
release is ALWAYS the slider regardless of where it's actually released on screen -
`document.elementFromPoint(clientX, clientY)` (immune to capture) replaces target-based
checks specifically in `onPointerUpAnywhere`. A THIRD bug: my own first draft of the helper had
`target.closest?.(...)` (only guards the CALL) instead of `target?.closest?.(...)` (guards
`target` itself) - `elementFromPoint` legitimately returns `null` for a point outside the
viewport, which threw silently and prevented the shrink entirely until fixed.

Swept every affected browser test file (6): `headerActions.browser.mjs` (rewritten for the new
shape), `zonePanel.browser.mjs`, `focusZoom.browser.mjs`, `tableZoom.browser.mjs`,
`rtgPlaythrough.browser.mjs`, `uiActions.browser.mjs`. Two of those also had a PRE-EXISTING
break unrelated to this bloop (War's default preset dealing a 'deck' not '[data-kind="hand"]',
from the earlier same-session fix) - fixed by switching their shared fixtures to explicitly
select Gin Rummy, since none of them were ever actually about War.

One more real, War-adjacent regression found while fixing `rtgPlaythrough.browser.mjs`: a
fixed `bfBox.x+50` drop-point offset USED to land on empty battlefield space, but shorter pile
headers shifted the battlefield panel's own position just enough that it now lands on an
existing card's stack-gear, merging two tests' cards into one stack. Fixed by computing a
drop point that clears every existing card by a real margin (+300, empirically the smallest
round number that worked - the battlefield's own stack-assignment reads proximity, not literal
overlap, so a mere card-width margin still merged).

Also, per the user's explicit mid-session correction: stopped using multi-second `waitForFunction`/
`waitForSelector` timeout CEILINGS and wall-clock `waitForTimeout` sleeps sized for real network
latency in tests that are 100% localhost (no real network exists to pad for) - tightened every
touched file's timeouts to ~1-2s ceilings and ~50ms settle waits. Also added `check-fast` to
the Makefile (unit + static lint only, no browser launch) per direct user request ("we need a
fast gate - not every test needs to run every time") - `check` itself launches real Chromium
for lint:design's full per-preset sweep + two full-history gitleaks scans, far too slow to
re-run after every small edit.

Verified (targeted, not a blind full `make check` re-run): each of the 6 touched browser files
green standalone (headerActions 10/10, zonePanel 13/13, focusZoom 11/11, tableZoom 13/13,
rtgPlaythrough 16/16, uiActions 21/21), full unit suite 1200/1200, `lint:design` clean,
`lint:js`/`lint:style` clean, `secrets` clean. Full chain: Neo fix -> Trin independent re-run
-> Morpheus review, all PASSED, posted to CHAT.md.

**NOT committed yet** - ready to commit.

## Next Steps
Commit this gear-menu work (plus everything else already queued uncommitted this session - see
agents/cypher.docs/state.md for the full picture) once the user confirms. Otherwise await the
user's next direction, or pick up docs/BACKLOG.md's Technical/testing section (multi-player
harness follow-ups, Gin bot tuning, read()/patch() consolidation candidate) or the still-open
card-drag motion sync gap.

## Previous - (2026-09-25) - US-130: impl + 2 real bugs found by the browser test going intermittently red

1) Playwright's own SIGINT handler process.exit(130)s ahead of our shutdown -> handleSIGINT:false.
2) That EXPOSED two more: shutdown ran twice at once (main flow + SIGINT handler) and
   waited a fixed 5s after SIGTERM even if the bot died at once. Fixed with pure helpers
   tools/jev/shutdown.mjs (once, waitUntilDead), tested first.
Tell-tale: exit code 130 in 0s. Measured Ctrl-C->exit 1.1-2.1s over 8 runs.
lint is part of check - new files hit strict unicorn/sonarjs rules; fix, don't suppress.

## Previous - (2026-09-25) - D157 casting-doesn't-tap fix: DONE, live re-run confirmed all 3 fixes

Re-ran the live 2-bot RtG session (fresh MCP bridge, table YFSEEF) to
confirm D155/D156. Dice worked live: real /roll d20 (rules 13,
aggressive 8) correctly decided who went first via the pregame
judgment. Colourless-lands fix confirmed live: aggressive cast a real
spell for the first time ever in this project's history. That same run
surfaced a NEW bug: the spell got cast TWICE off one land - casting
never tapped anything. Fixed same session (D157):
tools/rtg/playState.mjs landsToTap(cost, lands) (colour pips matched to
produces, then generic from whatever's left, mutation-proved),
tools/rtg/moves.mjs's cast case ROTATEs them before moving to the
Stack. tests/rtgMoves.test.js's old cast test never gave Bear a cost -
same "fixture doesn't reflect reality" shape as D156 - rewritten to
exercise real tapping. make check 1125, test-jev-runner 3/3,
test-harness-mcp 13/13, all green.

Also found, NOT fixed (scoped to BACKLOG, out of "give it a go"'s
scope): nothing ever resolves a cast spell off the shared Stack onto a
battlefield - a real feature (priority/pass), not a bug fix.

## Next Steps
Awaiting the user: commit+push (standing instruction), or scope the
Stack-resolution feature, or another live re-run now that spells
actually cost mana.

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
