# Agent State

## Current Task (2026-09-29) - Cold-start note for /clear. Tree clean, HEAD 9472e39 on dev+main.

Big arc since 2026-09-26, all Tier 2, all shipped/pushed/gated (bobp make check + live browser
suites every time, several mutation-proved):

**ui.js (D160, US-133..138): 2947 -> 268 lines.** Menus -> <action-menu>; drag/drop -> dragDrop.js;
zone -> <zone-panel>+panelInteraction.js; header -> <header-actions>+actionControls.js; pile ->
abstract PileElement + pileCards.js; deck stack/zone layout -> deckStack.js/renderZones.js.

**main.js (D161-165, US-139..143): 2946 -> ~2160 lines**, restructured not just shrunk:
- layoutSave.js pilot (explicit-param pattern); 2 smell-cleanup nits (perform* dedup, stale-timer dedup)
- <table-view> (D162): table camera + focus-zoom as a real domain object, private state
- sessionLifecycle.js (D163): reconnect flags -> XState-SHAPED machine, NOT the xstate package
  (found live: src/ is browser-loaded with no bundler/import map - xstate only works in tools/ under Node)
- Overridable reconnect clock + live test (D164): __recardHarness.setReconnectClock/disconnect,
  tests/reconnect.browser.mjs - real host+guest+PeerJS in ~3-7s not ~51s
- Pile/zone/stack action dispatch (D165, US-143): src/tableActions.js + Pile/Zone class registries.
  3 rounds of user review landed it: io-injected -> pure {action,guard} descriptors (tableActions.js's
  dispatch() is the ONLY interpreter) -> if-chains -> static registries (registerActions, static{}
  blocks) mirroring state.js's own ACTIONS object. New pile kind = 1 file + 1 static block; new
  action = 1 registry entry; new dispatch STRATEGY = 1 guard name + 1 if, main.js untouched either way.

Standing rules from this arc: `ui.js`/domain classes (Pile/Zone) cannot import a component file or
session state - components self-register via tag name, domain classes stay pure (no io/DOM calls,
return descriptors). Static class fields are inherited BY REFERENCE unless redeclared (real bug hit
and fixed in DeckPile/ChipPile).

## Current Task (2026-09-29, later) - US-144/D166 SHIPPED, sprint closed (*pm launch posted)

`/sprint till done` ran the full cycle unattended: Cypher story -> Smith gate -> Morpheus arch
(D166) -> Mouse plan -> 3 phases (Neo/Trin/Morpheus) -> Oracle groom -> Smith user-test -> retro
-> Cypher launch. Full text: docs/USER_STORIES.md US-144, docs/DECISIONS.md D166, CHAT.md (this
sprint's own messages, not yet archived - next groom should archive them).

**Result**: main.js's host-setup/new-game cluster (D161's last pause-list item) -> src/hostSetup.js.
main.js 2174 -> 1412 lines. D160/161's whole 5-sprint main.js/ui.js split arc (2947+2946 combined)
is now fully closed - see D166 for why this cluster used D161's explicit-param pattern rather
than D162/163's private-object pattern (peerToKey/identityAnnounced looked private but are read
by dispatch/publishTalk/applyIncomingMotion, which stay in main.js).

New: 10 unit tests (tests/hostSetup.test.js) + tests/resume.browser.mjs (2 tests) - the host
Resume flow (US-37/39/43/45) had ZERO automated coverage before this sprint; closed while
touching this exact code. `bobp make check` clean throughout, zero fix loops.

Also this sprint: archived 386 never-archived CHAT.md messages (6 prior sprints, US-121..144)
to `agents/chat_archive/CHAT_MAINJS_AND_JEV_SPLIT.md` via `bobp chat-report`. Corrected a stale
BACKLOG.md entry claiming "no way to resume" (Resume has existed since US-37).

**NOT committed/pushed** - full sprint's worth of changes sitting in the working tree
(src/main.js, new src/hostSetup.js, 2 new test files, Makefile/package.json test-resume target,
docs/ARCHITECTURE.md/BACKLOG.md/DECISIONS.md/USER_STORIES.md, task.md, agents/CHAT.md reset +
archive files). Ask the user before committing - this project's own pattern is mixed (some
sprints auto-commit+push, some wait).

## Current Task (2026-09-29, later still) - US-145/D167 SHIPPED (Flip control redesign)

`/sprint flip control redesign`. Backlog item (Flip as radio + previews) needed the user's own
visual-design input first - asked via AskUserQuestion before writing the story: all 3 directions
everywhere (real behavior change), mini card-stack illustration previews, same gear-menu slot.
Full cycle: Cypher story -> Smith gate 1 -> Morpheus arch (D167: reuse changePileType's own
buildEnumActionMenu control, SET_STACK_DIRECTION replaces FLIP_STACK) -> Smith gate 2 -> Mouse
2-phase plan -> Neo/Trin/Morpheus Bloop -> Oracle groom -> **Smith's user-test caught a REAL bug
Trin's UAT had missed** (Flip's menu was completely invisible - an inherited overflow:hidden -
while all 21 test-ui tests stayed green) -> fix loop (Neo fix + new elementFromPoint test, Trin
re-verify, Morpheus re-review) -> Oracle re-groom -> Smith re-test PASSED -> retro -> launch.

Worth remembering: this is the sprint protocol's fix-loop working exactly as designed - Smith's
own "always look, never read a test report" standing rule is what caught it, not a script.

Plus a same-day nit (2026-09-30): stack gear icon moved top-right -> top-left, direct user
request. .stack-gear right->left, verified geometrically + test-ui/test-rtg green. (Both of the
above already committed+pushed to dev/main as aed4eaa.)

## Current Task (2026-09-30, later) - US-146/D168 SHIPPED (remote-cursor redesign)

`/sprint move protocol backlog item` -> the "Remote-cursor redesign" backlog item, blocked since
2026-08-16 on "needs a live human OR ship unverified." User reframed the question: "use a jav
player or two" -> a dedicated harness test player (HarnessPeer.pointerDown/hoverPile/pointerUp,
real mouse events, not synthetic dispatch), not a live session and not blind trust. Sender now
broadcasts which pile the pointer is over (elementFromPoint+closest), receiver resolves against
its OWN DOM and reuses the pre-existing .remote-cursor CSS transition (widened to 0.2s ease-out).
No back-compat (user's own mid-sprint reminder - confirmed clean, no leftover x/y refs anywhere).
2 new cross-client tests (tests/remoteCursor.browser.mjs), mutation-proved AND visually confirmed
via screenshot. Smith's own retro line worth remembering: "a blocked backlog item may need a
better question, not a decision."

## Next Steps
1. User's standing instruction: commit + push all (dev + main). Covers US-146/D168 - the only
   thing still uncommitted (US-144/D166, US-145/D167, and the gear nit are already pushed).
2. **Waiting on the user** (docs/BACKLOG.md, been open since the US-130 era): RtG's 5s quit grace vs
   its safe points; a bot that ignores SIGTERM (~11s worst-case shutdown).
3. Cold start: read this file, then docs/BACKLOG.md top, then task.md tail, then ask what's next.
