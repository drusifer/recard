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

## Current Task (2026-09-30, later still) - US-147/D169 SHIPPED (stack direction -> style + Jumble)

`/bloop`: renamed the "direction" concept to "style" throughout the Stack/Stackable/Pile system
(no back-compat), added a real JUMBLE stack style, made it the token supply's default (with its
own non-zero defaultSpread so it actually LOOKS jumbled, not just after a manual spread bump).
3 real structural bugs found and fixed while generalizing it (see agents/neo.docs/state.md for
full detail) - none patched around, all fixed at the root and verified via git-stash-vs-baseline
comparison before trusting any "caused by my change" theory. Full Neo->Trin->Morpheus->Smith
Bloop chain in CHAT.md; Smith's UX gate confirmed the live look matches the user's literal ask.

## Current Task (2026-09-30, later) - Backlog Q&A: 4 standing judgment-calls answered

User asked "what's in the backlog?" then "queue up the questions" - walked the 4
"needs your judgment" items one at a time via AskUserQuestion:
1. RtG 5s quit-grace cutoff -> **accept the cut**, no code change. BACKLOG.md updated (struck).
2. Bot ignoring SIGTERM (~11s shutdown) -> **shorten further**, same way the 15s->5s grace
   cut went; exact post-SIGTERM/SIGKILL windows NOT picked, pickable directly by Neo.
3. SaveAs's `window.prompt()` -> still relevant, user said scope it -> **US-148** written.
4. "Builder screen" -> user: "we are actually quite close to a game builder already...
   just need an add menu to add new zones and piles" -> **US-149** written (Add Zone/Add
   Pile menu actions on top of the existing GameConfig.zones/piles + D165 registries).
All 4 decisions posted to CHAT.md (*pm decision*, 2026-09-30 20:19). docs/BACKLOG.md and
docs/USER_STORIES.md both updated same turn.

## Current Task (2026-09-30, later still) - US-148/D170 + US-149/D171 SHIPPED

`/sprint the new stories` (Tier 2 fast-track, AGENTS.md rule 10.2): Cypher+Morpheus combined
story+arch, Smith+Mouse combined review+plan, straight to Neo. 2 phases, no fix loops.

**US-148 (SaveAs naming)**: `layoutSave.js`'s `globalThis.prompt()` - the one remaining native
dialog in `src/` - replaced by the same inline-`<input>` idiom `<header-actions>`'s own rename
already uses (Enter/Escape/blank-reverts). `tests/layoutSave.browser.mjs` (3 tests), mutation-
proved (git-stash baseline, all 3 fail with the exact right symptom).

**US-149 (Builder menu) - the sprint's real finding (D171, self-corrected same day)**: the
architecture draft proposed new `ADD_ZONE`/`ADD_PILE` reducer actions. Checking `state.js`
while implementing found `CREATE_ZONE`/`CREATE_PILE` ALREADY EXIST, fully unit-tested
(`tests/state.test.js`, a dozen+ cases each), replicated like any action - with NO UI entry
point anywhere (`main.js`'s own standing comment disclosed this gap explicitly). US-149 became
pure UI: `src/builderMenu.js` (new, ~95 lines) wires "Add Zone…"/"Add Pile…" in
`#layout-controls`, each revealing an inline kind-`<select>` (+zone-`<select>` for Add Pile,
shared zones only) via the same button-swap idiom US-148 established one commit earlier. No new
reducer test, no new replication test - would have duplicated already-proven coverage (prune,
not pad). `tests/builderMenu.browser.mjs` (3 tests), mutation-proved (baseline has no
`#add-zone-btn` at all).

Smith's user-test used the live harness MCP (not just green tests): `game_start`, a real
screenshot of the button row (no clipping), a real `player_act` CREATE_ZONE dispatch,
screenshot of the result (clean render, no overlap). `game_stop` after.

Full writeup: `docs/DECISIONS.md` D170/D171 (D171 includes the correction, in place, same
D-number - Oracle's retro flagged this as the clean model to repeat). `docs/USER_STORIES.md`
US-148/149 (AC5 of US-149 was narrowed mid-sprint to match the real scope). `docs/BACKLOG.md`
both entries now SHIPPED. `docs/ARCHITECTURE.md` module map has the new `builderMenu.js` line.

check clean throughout (lint/decks/secrets), 6 new tests total, zero flakes, zero fix loops.

**NOT committed** - awaiting the user's go-ahead (same standing pattern as the rest of this
session's work).

## Next Steps
1. User's standing instruction: commit + push all (dev + main). Covers US-147/D169 AND this
   whole US-148/149 sprint - nothing committed yet this session.
2. SIGTERM shortening (direct user decision earlier this session, see CHAT.md *pm decision*
   2026-09-30 20:19): no story yet, small enough to go straight to Neo as a `*fix`, user's call.
3. Cold start: read this file, then docs/BACKLOG.md top, then task.md tail, then ask what's next.

## Sprint: Gin strategy bench, tournament, and evolution (2026-10-03, direct user request)

"Set up multiple jev gin strategies for Gin, have them compete, and
evolve the best players." Directly addresses a standing backlog item
("Tune the question files against played hands... needs a bench -
bot vs bot over N hands, scored").

**Scoped with the user up front** (two questions, before planning):
rule-list bench/tournament/evolution is Phase 1-3, fully free and
verified, BEFORE any costed Jev (question-file) track starts - the
free track gates whether the costed one happens at all this sprint.
Evolution mutates bounded numeric thresholds and recombines existing
named strategies' rule lists/thresholds - no new rule-authoring
mechanism, no wording/text mutation.

**Real finding during scoping, corrected before writing stories:** 3 of
the 4 rule-list strategies (`gin-hunter`/`equilibrium`/`defensive`) are
`usesJev: true` and READ live Jev judgments (`context.jev.threat`/
`.helps`) - not just enhanced by them. Checked `tools/gin/bot.mjs`:
`askJev(judge, obs, facts)` takes any `{ systemOne: Function }` -
"a TypeSafeClient, or a fake in tests" (its own doc comment) - already
precedented (`tests/ginJudgments.test.js`'s `fakeJudge`,
`tests/ginJevPlayer.test.js`'s `scriptedJudge`). So the free bench can
exercise all 4 rule-list strategies fairly (same substitute judge for
all), not just `knock-early` - just not with REAL Jev judgment
quality, which is exactly what's deferred to the costed track.

### Stories

**US-1: Headless hand simulator.** Play a complete Gin hand (not one
deal - draw/discard/knock/gin to a real conclusion) entirely in-process
via the existing reducer + `tools/gin/strategies.mjs`, no browser, no
WebRTC, no real Jev - a deterministic fake judge standing in wherever
`usesJev` needs one. AC: given two strategy names + an RNG seed, plays
one full hand, returns {winner, scores, deadwood, handLength}.
Deterministic given the seed (repeatable, per project standard).

**US-2: Round-robin tournament.** Every pair in the 4-strategy roster
plays N hands (seeded, so reproducible); a leaderboard (win rate, avg
score margin, avg hand length) per strategy, structured output (JSON),
not just console prose.

**US-3: Evolution loop.** Given a generation's leaderboard: mutate each
survivor's own tunable numeric knobs (already exposed by its factory
function - `ginHunter({chaseChance, draws, minThreat})`,
`equilibrium({minThreat, weight, minGain})`, `knockEarly({minGain})`)
by a small bounded random step; recombine by pairing one parent's rule
list with another's thresholds. Keep the top K each generation, run a
CAPPED number of generations (explicit flag, sane default). Seeded,
reproducible. Final report names the winning generation's exact
parameters, copy-pasteable into `strategies.mjs` as a new named
strategy.

**Out of scope, explicit:** the costed Jev question-file track
(evolving `jev-balanced`/`jev-cagey`'s `floor`/wording with the REAL
API) - gated on US-1 through US-3 proving the mechanism is correct and
worth the cost, per the user's own framing. No UI/table visualization -
a CLI tool, matching `jev-table`/`jev-player`'s own existing pattern.

## Next Steps
@Morpheus *lead arch sprint - the one real architecture question is
where the simulator lives (`tools/gin/` alongside the strategies it
drives, or a new `tools/gin/bench/` cluster) and what the fake-judge
substitute actually computes (a cheap heuristic proxy for threat/helps,
not random noise - needs to be GOOD ENOUGH that strategies are judged
fairly on their own rule logic, not on judge noise).
