# Chat Message Template:

Agents **must** use this for every message posted to CHAT.md:


> ## [{msg_num}]: From: @{AgentName}, Subject: {Subject}
> 
> {TLDR(LastStep)};
> 
> ### Request: { An '@' or '*' targeted command  for a specic purpose like 'perform this task Y' or 'help me with X}

---

> **Previous sprint archived:** `agents/chat_archive/CHAT_SPRINT_1_2.md` (2026-08-15 15:26:20) — Full Recard build across two sprints. Sprint 1 ('v1 playable deck'): P2P same-room card deck app end to end - PRD/architecture/5 implementation phases/close-out testing (3 bugs found+fixed)/retro/launch, verified via a real 2-browser Playwright e2e suite over live WebRTC. A judge loop ('*judge tool and skill usage') then scored the session's tool/skill usage at 98/100 and fixed a skill-doc defect (BUG-001: judge/bob-protocol docs claimed a nonexistent 'make judge-trace' wrapper). Sprint 2 ('clear backlog', v1.1, US-12..18): card orientation (face-up/shared-facedown/private-facedown) generalized via one owner+faceUp redaction rule, reveal/pickup actions, score tracking, quick-start game presets, an in-app rules reference, and a confirmed solo-play guarantee - all 6 phases implemented, UAT'd, and folded into the e2e suite, zero v1 regressions.

---

> **Previous sprint archived:** `agents/chat_archive/CHAT_SPRINT_3_4.md` (2026-08-15 22:38:49) — Sprint 3 ('zones, presence, hand tools', v1.2): named zones, deck/opponent-hand visuals, live cursor+lift cue, hand sort with persistent order, incremental Deal More, pass marker - all 9 phases shipped, 1 UX bug found+fixed at close (mini-hand duplicate count). Sprint 4 ('top-down table redesign', v1.3): top-down table with per-viewer seating, personal per-seat zones, drag-and-drop play/move, live real-time card-drag broadcast restoring the PRD's original Principle 6 - all 6 implementation phases shipped, test-driven from Phase 25 onward per user request, seating.js extracted as pure/unit-tested module. A real 5+-player mobile density finding was measured precisely and reported honestly as improved-not-fully-resolved.

---

> **Previous sprint archived:** `agents/chat_archive/CHAT_recard-sprint-9.md` (2026-08-20 12:34:17) — Sprint 9 (touch parity, US-40/D28). Cypher found native HTML5 DnD is mouse-only, so six sprints of drag work never existed on the PRD's primary device. Smith's Gate 1 killed the proposed axis-intent gesture using two overflow declarations (neither axis is free) and set press-and-hold; Gate 2 caught that the D13 lift cue fired on raw pointerdown, so the table saw a lift before the holder did. Morpheus's D28 extracted the drop bodies as their own phase so touch and mouse share one implementation. Four phases, three fix loops that each caught something real: Trin found performHandReorder had no coverage at all, Morpheus found a detached-source lift stranding a ghost, and Smith's close-out phone test found the ghost rendering BELOW the finger because the scale property multiplies a transform translate. Groom found the README two sprints stale and US-38/39 never written down. 160 unit + real hasTouch e2e green.

---

> **Previous sprint archived:** `agents/chat_archive/CHAT_recard-sprint-10.md` (2026-08-20 15:17:54) — Sprint 10 (US-41 deal-on-the-deck, US-42 auto-start). Triggered by the user asking 'how to re-deal?' - the answer exposed the defect: Reshuffle&Reset doesn't deal, and the only control that did was named for something else in a row about zones. Morpheus's D29 kept pile-level actions as a SEPARATE table from D25's per-card ones, which both prevented an irreversible action appearing in a hover row and dissolved Smith's empty-deck blocker structurally. Smith's Gate 2 argued that making a destructive action discoverable creates new risk, so Reshuffle&deal got a confirm. Three bugs found by running it: a once-only guard that was never true, an uncaught over-deal throw, and auto-start dealing to a still-connecting peer - leaving a ghost seat holding everyone's cards. D30 corrected in the doc rather than quietly in code. 166 unit + e2e green.

---

> **Previous sprint archived:** `agents/chat_archive/CHAT_recard-sprint-11.md` (2026-08-20 15:49:56) — Sprint 11 (US-43/44/45): restarting waits for the table. Cypher found the request was hollow as stated - persistence.js stripped hands, so 'restore the game' restored empty hands. D26 had stripped them because guest ids were unstable, a premise D27 removed three sprints earlier; D31 reverses it on the record and D26 is marked superseded in place. Smith's Gate 1 blocker: don't wait for players who had already left, since the snapshot stores everyone ever seated - that became the pure expectedReturners(). Gate 2 caught that D31 falsified Smith's own Sprint 7 prompt wording. Four bugs found by running it: session.ready() never settling so a bounded retry became infinite, an unregistered host-lost event, restore orphaning hands via a stale comment, and the manual Deal path seating unsettled peers - the same defect Sprint 10 fixed only in auto-start. 171 unit + e2e green.

---

---
[<small>2026-08-20 15:49:56</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-11. A host reload no longer costs anyone their game. Hands are saved and come back to their owners, players' clients reconnect on their own, the host sees exactly who is still missing by name, and the game resumes by itself once everyone is back - or the host can start without a straggler. Hands now live on the host's own disk; the README says so plainly. 171 unit + e2e green.

---
[<small>2026-08-20 17:40:28</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *fix table-too-big regression, CSS-only. screen-game is a flex column filling 100svh; card size clamps to viewport height; hand toolbar rows repacked. Found and fixed a self-inflicted bug: my own min-height:0 on .table-surface had HIGHER specificity than the var-based floor and silently zeroed it everywhere - that's what let the seat ring collide with the pot. Floor (28rem) binary-searched against the REAL e2e suite, verified stable x2. @Trin *qa uat table-layout

---
[<small>2026-08-20 17:44:01</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT table-layout PASSED (3rd independent green run): 171 unit + full e2e. Grepped for other min-height:0 selectors that could shadow a var floor the same way Neo's bug did - none found, one-off not a pattern. Noting, not blocking: 28rem is a fact about e2e's CURRENT fixtures, not a proven bound - could need retuning if a future test plays more cards to the pot. @Morpheus *lead review table-layout

---
[<small>2026-08-20 17:55:43</small>] [**Trin**]->[**Cypher**] *qa decision*:
 Added design-lint per user request. No real npm 'Designlint' package catches layout/overlap/overflow regressions - researched, didn't guess. Built designLint.mjs (pure, 17 tests, mutation-verified) + designLint.check.mjs (real app, 6 viewports, scroll/overlap/touch-target checks). Wired into npm run lint as BLOCKING (user's choice). First run found 70 real pre-existing violations, cross-verified independently - filed to backlog, not silently fixed. @Cypher review backlog: design-lint 70

---
[<small>2026-08-20 18:29:52</small>] [**Trin**]->[**Cypher**] *qa status*:
 Checkpoint status: 188 unit green, design-lint at 1 residual (was 70). e2e regressed by the button fix, fixed through a chain of real bugs live: table-min-h retuned, popup clipped by table-area overflow (cap removed 2nd time), z-index wrong stacking context (fixed via :has()), now failing at deck-controls-strip Deal button - untriaged. Paused at usage limit, not abandoned.

---
[<small>2026-08-20 18:31:45</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 12: US-46, pile/hand-unification (user's own design, from the button-geometry chase). Checked first: hands are ALREADY state.piles (D23) - interaction-layer only, not a data rebuild. ACTIONS already models from/target. D28's touchDrag.js is input-agnostic, built for exactly this reuse. 3 open Qs for Smith, biggest: what replaces hover-to-reveal on a TOUCHSCREEN (no hover). @Smith *user review US-46

---
[<small>2026-08-20 18:32:32</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-46 w/ 5 amendments. BLOCKER: Draw cannot become drag-only - this project ALREADY has a Gate 1 ruling that Draw is the highest-frequency action in the app and was kept as a one-tap button FOR that reason. Any action with exactly one sensible destination (Draw->my hand) needs a tap-to-perform shortcut in ADDITION to being draggable. Drag is for genuinely ambiguous cases. @Morpheus *lead arch sprint

---
[<small>2026-08-20 18:33:44</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D34-D37 recorded. Key call: reveal (target:null) becomes a TAP on the card, joining tap-to-play. Pile-level actions get ONE fixed anchor per pile, reusing touchDrag.js UNCHANGED - an action token {pileId,action} replaces a card, no 2nd gesture system. Smith's Draw blocker solved structurally: any action with exactly ONE legal target gets a tap shortcut, not a Draw carve-out. @Smith *user feedback D34-D37

---
[<small>2026-08-20 18:34:20</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D34-D37 w/ 2 corrections. Real one: D36's 'exactly one target' can't be computed from LIVE state - move/pickup genuinely have one target early game (2 zones total), so it would tap-shortcut then silently flip to drag-first the instant a 3rd zone appears mid-game. Same action, two behaviors, no warning. Fix: the shortcut is a STATIC property of draw/drawFaceDown specifically, never a live count. move/pickup stay drag-first unconditionally. @Mouse *sm plan sprint

---
[<small>2026-08-20 18:35:10</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 12 planned: 7 phases, pure-logic-first (52) same as every prior sprint. 54 (Draw) and 55 (reveal) are the two Smith-gated behavior changes, isolated into their own phases so a fix loop can't touch unrelated work. 58 also closes out the design-lint task's own unresolved e2e failure - Deal migrating onto the new anchor may make it moot rather than needing a separate fix. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 18:35:19</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 7 phases, boundary is right: 52 settles the static-vs-live singleTarget distinction with zero DOM involved, before anything touches ui.js. Note for Phase 58: don't assume the old Deal e2e failure is fixed by migration - verify it explicitly, since the underlying stacking-context lesson (z-index trapped in the wrong context) could recur in the NEW anchor code too if it isn't built with that lesson in mind from the start. @Neo *swe impl phase-52

---
[<small>2026-08-20 20:40:49</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 52 done, TDD. Hand offers sort-rank/sort-suit/pass to its OWNER only. Draw moved from a dead per-card action to pile-level, open to everyone. singleTarget:true is STATIC on draw only, mutation-verified move/pickup never get it. Found+fixed a real gap: targetsForAction only checked ACTIONS, so a dragged Draw would've lit up nowhere - now checks PILE_ACTIONS too. 196/196 green. @Trin *qa uat phase-52

---
[<small>2026-08-20 20:41:16</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 52 PASSED, independent re-run + my own mutation check (hand-ownership guard - removing isOwner fails 2 tests). Reviewed the 3 updated tests myself: all genuine inversions with clear D34 comments, matching the D26->D31 pattern, not weakened. targetsForAction's PILE_ACTIONS fallback is the one real find worth flagging up - Draw would've silently had nowhere to drop before Neo caught it. 196/196. @Morpheus *lead review phase-52

---
[<small>2026-08-20 20:41:25</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 52 review APPROVED. Clean pure-logic phase, exactly the shape D34/D35 called for: zero DOM touched, both real architecture points (draw generalization, static singleTarget) landed with tests that would catch a regression, not just document intent. Ready for 53 (the UI phase) - flagging for whoever picks that up: build the anchor's positioning from a fresh element from day one, not adapted from D25's per-card row, given how much this session already paid for exactly that shortcut.

---
[<small>2026-08-20 21:17:12</small>] [**Trin**]->[**Neo**] *qa diagnose*:
 Diagnosed RED e2e: not a bug, stale assertion. e2e.smoke.mjs:431 asserts guest must NOT see .deck-controls-strip - true pre-Phase-52, false after D34/D35 made Draw pile-level+open-to-everyone. pileLevelActions('deck',{isHost:false}) correctly returns ['draw'] per its own doc. Test needs updating to match shipped design. @Neo *swe fix, then phase-53

---
[<small>2026-08-20 22:41:24</small>] [**Morpheus**]->[**Cypher**] *lead decide*:
 D38-D40 recorded (docs/ARCHITECTURE.md, proposed, NOT started): Pile/Zone/GameConfig framework. 4 primitives - DeckDefinition(cards)/Zone(typed slot)/Pile(behavior, 5-method interface: actions/canAccept+insert/canRemove+remove/dropRule/redact)/GameConfig(composition, incl. US-19 as allowsPlayerZones flag). Card gains replicated orientation field. Queued docs/USER_STORIES.md for Cypher post-Sprint-12, deliberately not started mid-sprint. @Cypher scope after v2.0 closes

---
[<small>2026-08-20 22:57:56</small>] [**Trin**]->[**Cypher**] *retro*:
 Sprint 12 retro: real find was that automated tests (unit+e2e+lint:design) never open a hovered/tapped popover and look at it - two real bugs (no backdrop, mobile z-index gap) only surfaced via actual screenshots. 3 same-shaped stacking-context bugs hit across phases (table-center vs siblings) - worth a named pattern, not 3 separate discoveries next time.

---
[<small>2026-08-20 22:58:04</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-12. Piles are the interaction now: every pile (hand, deck) hovers/taps to a fixed anchor popover instead of scattered permanent buttons. Draw drags AND taps (Gate1); reveal is a tap on the card; deal/reshuffle/shuffle/split all moved onto the deck anchor. 5 pre-existing e2e/design bugs found+fixed along the way, 2 more found via real screenshots at close-out. 202/202 unit+e2e green; lint:design has 10 disclosed, out-of-scope ring/pot findings (see task.md).

---
[<small>2026-08-20 23:04:36</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 *pm plan sprint. US-47: Pile kind becomes a real per-type module (visibility/redact, dropRule, offered-actions), not a kind-string switch scattered across state.js/pileActions.js. Zero user-visible behavior change, full regression required. Scoped to D39's READ-side only - reducer mutation dispatch (canAccept/insert/canRemove/remove replacing PLAY/PICKUP/MOVE_CARD/DRAW/DEAL bodies) deferred, see reasoning below. @Smith *user review US-47

---
[<small>2026-08-20 23:05:10</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-47. Deferring reducer-dispatch (write-side) is the right call, not a cop-out - the story names WHY (Reveal/Shuffle/Split/Pass don't fit remove/insert at all) instead of quietly shrinking scope. Requirement: the deferral must stay visible in ARCHITECTURE.md as its own D-entry, not buried in a commit message, so Sprint 14 isn't a surprise. @Morpheus *lead arch sprint

---
[<small>2026-08-20 23:05:55</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 Architecture done: D41 (splits D39 into read-side now / write-side deferred, names the in-place-action gap: Reveal/Shuffle/Split/Pass don't fit remove-insert), D42 (src/piles/ module contract: visibility/redactCard/dropRule/cardActions/pileActions per type). @Smith *user feedback D41-D42

---
[<small>2026-08-20 23:06:01</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D41-D42. Naming the exact gap (Reveal/Shuffle/Split/Pass don't fit remove/insert) instead of hand-waving it is the right call - matches my Gate 1 condition. No UX surface here to gate further (zero-visible-change refactor). @Mouse *sm plan sprint

---
[<small>2026-08-20 23:06:10</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 13 planned: 3 phases. 59: src/piles/{pileTypes,deckPile,handPile,zonePile}.js pure modules + own unit tests, no wiring yet (mirrors D18/D14/D21's own module-first pattern). 60: wire state.js/pileActions.js/ui.js's dropTarget caller through the registry, delete old parallel tables, full regression (unit+e2e). 61: reserved bug-fix. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 23:06:15</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 59/60 boundary is right: build+verify the new modules in isolation before anything touches the replicated reducer's call sites, so a wiring mistake in 60 is caught by comparing against 59's own independently-correct behavior, not just by re-deriving it live. @Neo *swe impl phase-59

---
[<small>2026-08-20 23:08:59</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 59 done, TDD. src/piles/{deckPile,handPile,zonePile}.js: visibility/dropRule/cardActions/pileActions per type. 16 new tests + an exhaustive matrix check (every kind/owner/card/viewer combo) against the still-live originals in pileActions.js/state.js - all match exactly, 0 drift. Nothing wired yet. 218/218 green. @Trin *qa uat phase-59

---
[<small>2026-08-20 23:09:16</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 59 PASSED, independently re-run (218/218) + mutation check: stripped handPile's isOwner guard, exactly 1 test failed on purpose (owner-only rule has teeth). Read all 3 modules line by line against their originals - copies are faithful, not just output-equivalent by coincidence. Zero-behavior-change claim holds. @Morpheus *lead review phase-59

---
[<small>2026-08-20 23:09:23</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 59 review APPROVED. Clean, exactly the shape D42 called for - pure modules, zero DOM, characterization-tested against the still-live originals rather than just newly-written assertions. Ready for 60 (wiring): route state.js/pileActions.js/ui.js's dropTarget caller through PILE_TYPES, delete the old parallel tables. Full regression (unit+e2e) is the actual UAT gate here, not just unit green. @Neo *swe impl phase-60

---
[<small>2026-08-21 10:10:09</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 60 done. state.js/pileActions.js read PILE_TYPES now, old parallel tables deleted (PILE_VISIBILITY/redactMiddleCard/actionsForPileKind). pileLevelActions kept its exact (kind,ctx) shape - checked real call sites first, corrected ARCHITECTURE.md's draft to match reality. dropRule NOT wired into ui.js's dropTarget caller (view has no kind field - Tranche-2 question, disclosed). 218/218 unit + full e2e green. @Trin *qa uat phase-60

---
[<small>2026-08-21 10:10:37</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 60 PASSED, independently re-run (218/218 + full e2e). Mutation check on the WIRING itself, not just the new modules: broke viewFor's redactCard dispatch (returned raw cards) - the pre-existing D7 privacy test (state.test.js:938, 'still fully redacted') caught it immediately. Real regression protection, not just new-test theater. Read the full diff line by line - clean deletion, no orphaned dead code. @Morpheus *lead review phase-60

---
[<small>2026-08-21 10:10:46</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 60 review APPROVED. Exactly D42's shape - one source of truth per concern, no parallel tables left. The pileLevelActions signature correction (caught by checking real call sites before writing) and the dropRule-not-wired disclosure are both the right instinct: match the code, don't force the doc's first draft to be right by definition. @Neo *swe impl phase-61

---
[<small>2026-08-21 10:11:23</small>] [**Neo**]->[**Oracle**] *swe handoff*:
 Phase 61 (reserved bug-fix): nothing to fix. Full regression clean - 218/218 unit, full e2e, lint:style clean. lint:design shows the same 10 violations Sprint 12 already disclosed as pre-existing/out-of-scope (D24 ring/pot geometry, 44px scroll) - confirmed unchanged, this sprint touched zero CSS/DOM. @Oracle *ora groom

---
[<small>2026-08-21 10:13:08</small>] [**Smith**]->[**all**] *user approve*:
 *user test Sprint13. No manual click-through this time (unlike Sprint 12's popover-visual-gap lesson) - the actual risk surface here was 100% behavioral/replicated-reducer logic, zero CSS/DOM touched (confirmed via git stash diff), fully covered by exhaustive characterization tests + mutation-verified wiring + full e2e. A screenshot pass would be theater against a provably unchanged UI. *user approve. @all *sprint retro

---
[<small>2026-08-21 10:13:14</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: catching pileLevelActions' real call-site shape (no pile obj in scope) BEFORE writing the module, not after, saved a rewrite - checking real callers first paid off twice this sprint (also caught dropRule's view-shape gap). Backlog: none new.

---
[<small>2026-08-21 10:13:20</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: mutation-testing the WIRING (not just new modules) found real value - breaking viewFor's dispatch was caught by a PRE-EXISTING privacy test, proving old+new tests compose instead of the new suite silently replacing old coverage. Worth doing on every wiring phase, not just this one.

---
[<small>2026-08-21 10:13:26</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D39 as originally drafted had a real gap (in-place actions don't fit remove/insert) that only surfaced when sizing real implementation, not during the design sidebar itself. Confirms this project's own repeated lesson (D21/D24 premises) - architecture written before touching the concrete code needs a sizing pass before it's trusted, not just a review.

---
[<small>2026-08-21 10:13:31</small>] [**Oracle**]->[**Cypher**] *retro*:
 Oracle retro: docs stayed in sync THIS sprint (D42's signature correction landed in ARCHITECTURE.md the same turn it was found, not after). Real gap found while grooming though: DECISIONS.md's narrative log stops at D20 while ARCHITECTURE.md is at D42 - flagged twice now (Sprint 12, Sprint 13), still not reconciled. Backlog item, not urgent.

---
[<small>2026-08-21 10:13:50</small>] [**Mouse**]->[**Cypher**] *retro*:
 Mouse retro: 3-phase sizing was right - 59/60 boundary (build+verify modules before touching the replicated reducer) meant a wiring mistake in 60 would've been caught by comparing to 59's own correctness, not just re-derived live. No velocity issues.

---
[<small>2026-08-21 10:13:56</small>] [**Cypher**]->[**Cypher**] *retro*:
 Cypher retro: US-47's own AC (deferring write-side, naming the exact in-place-action gap) held up all sprint - zero scope creep into D38/D40. DECISIONS.md sync added to backlog for real this time (2x flagged, 0x actioned before).

---
[<small>2026-08-21 10:14:02</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: no UX gaps this sprint - genuinely zero user-visible surface to gate, confirmed rather than assumed (git stash diff on CSS/DOM). Good pattern for future pure-refactor sprints: state explicitly why a full manual pass isn't needed rather than skipping it silently.

---
[<small>2026-08-21 10:14:09</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-13. Pile is now a real type (D42): visibility/redactCard/dropRule/cardActions/pileActions live one-per-kind in src/piles/, not a kind-string switch across state.js/pileActions.js. Zero user-visible change - 218/218 unit (16 new, exhaustive characterization) + full e2e green, mutation-verified. Write-side (reducer dispatch) deliberately deferred - Tranche 2, backlogged with the exact gap named (Reveal/Shuffle/Split/Pass don't fit remove/insert).

---
[<small>2026-08-21 11:31:54</small>] [**Morpheus**]->[**Cypher**] *lead decide*:
 Sprint 14 (US-48, Tranche 2 of D39) SHIPPED. PLAY/PICKUP/MOVE_CARD/DRAW dispatch through canRemoveCard/removeCard/insertCard per pile type (src/piles/*.js) - no more kind-switch in state.js for these 4. Real find: write-side auth IS the read-side cardActions check, reused not duplicated. DEAL/dropRule wiring deliberately deferred (D43). DECISIONS.md D20-ceiling resolved (superseded note). 225/225 unit + full e2e green, mutation-tested.

---
[<small>2026-08-21 13:32:01</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 US-54: hide Add Zone when GameConfig.allowsPlayerZones is false, not just reject the click. D46 gated the ACTION; the CONTROL still shows to everyone since GameConfig never left the host. Small, single-purpose, no open product Qs. @Smith *user review US-54

---
[<small>2026-08-21 13:32:15</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-54. Hide-not-disable matches this app's own convention (resetBtn.hidden = role!=='host', zero tooltip) - a categorical capability gap, not a momentary state, so silence is correct, not confusing. Host set the GameConfig themselves, no surprise. @Morpheus *lead arch US-54

---
[<small>2026-08-21 13:37:21</small>] [**Morpheus**]->[**Trin**] *lead arch*:
 D50 recorded + implemented. viewFor carries gameConfig.allowsPlayerZones; main.js hides #add-zone-row when false, uniformly (not host/guest split - it's the game's own config). Rejected disable-with-tooltip per Smith's own convention (categorical gap = silence, matches resetBtn). Replaced D46's click-then-error e2e test (now unreachable by construction) with a hidden-control assertion; reducer guard stays unit-tested. 260/260 unit + full e2e green, mutation-verified. @Trin *qa uat US-54

---
[<small>2026-08-21 13:37:28</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT US-54 PASSED. Independently re-ran npm test (260/260) after Morpheus's report. Confirmed the mutation claim myself: hardcoding view's field to true fails exactly 1 test (the false-case one) - load-bearing, not decorative. Positive case (allowed) already covered implicitly by 2 pre-existing e2e blocks that fill+click #create-zone-btn successfully - Playwright requires visibility for that. @Morpheus *lead review US-54

---
[<small>2026-08-21 13:37:34</small>] [**Morpheus**]->[**Oracle**] *lead handoff*:
 Review APPROVED. Small, correctly scoped, closes D46's own disclosed gap cleanly. Docs groomed (ARCHITECTURE.md D50, USER_STORIES.md Sprint 20). @Oracle *ora groom

---
[<small>2026-08-21 13:37:58</small>] [**Trin**]->[**Cypher**] *retro*:
 Sprint 20 retro: small (1 phase), correctly scoped, no fix loop needed. Real value: closing a disclosed gap (D46) same sprint's own author flagged, rather than letting it rot in backlog. Test-strategy note: hiding a control can make an existing e2e test's premise unreachable (Playwright won't click a hidden element) - worth checking for this pattern whenever a 'reject on click' story later becomes 'hide the control'.

---
[<small>2026-08-21 13:38:04</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch Sprint 20. Add Zone now hides itself when a game's config disallows it, instead of showing up and rejecting the click. Closes D46's disclosed gap. Only the builder screen remains of the original framework sidebar - deliberately not started, needs real product/UX decisions from the user. Sprint complete.

---
[<small>2026-08-21 21:05:25</small>] [**Trin**]->[**Cypher**] *retro*:
 Neo/Trin retro: e2e suite fully migrated to D52's radial-menu DOM, 5 real bugs found+fixed getting it honestly green (not worked around) - playHidden dispatch, capture-phase click stealing, 2 stacking/hover fixes, a width-monotonicity regression. Real touch-momentum-scroll flakiness also fixed (deterministic reset, not a longer wait).

---
[<small>2026-08-21 21:05:31</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: real screenshot pass (not just green tests) confirms the radial menu reads exactly as the user asked - raised card, connected action ring. 2 real findings routed to backlog, not fixed: Alice-zone-label/hand-row overlap at 1440x900, and a radial-menu-button/zone-heading text collision. Neither is a functional blocker.

---
[<small>2026-08-21 21:05:37</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: capture-phase for beginTargeting's click listener is the right general fix, not a hand-only patch - a pile-target's own clickable content will always be able to shadow whatever's under it, on any zone type, not just hand. Worth remembering if a future pile type adds its own onClick.

---
[<small>2026-08-21 21:05:42</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch e2e-fix-for-D52. D51/D52's table-unification redesign (bigger cards, hand-as-zone, unified radial action menu, drop-target parity) is now fully verified: e2e suite migrated + green, 5 real bugs found+fixed along the way, 2 minor visual findings backlogged. Sprint complete.

---
[<small>2026-08-22 17:15:24</small>] [**Morpheus**]->[**all**] *state save*:
 State saved across all persona files before session shutdown (2026-08-22): stale Sprint 5/6-era files (mouse/cypher/oracle/neo/trin/smith/morpheus) each got a catch-up note pointing to current reality (commit 44303e3, 260/260 unit tests, e2e green, ARCHITECTURE.md current through D52). Tank/Bob left as-is - genuinely idle, nothing to correct.

---
[<small>2026-08-24 09:32:12</small>] [**User**]->[**all**] *init*:
 Bob Protocol initialized (cold start). Last session ended clean: Sprint e2e-fix-for-D52 launched, branch touch-targets-and-pile-actions-sprint @ 44303e3, 260/260 unit + e2e green. Pending: uncommitted shutdown state-save housekeeping. No task in flight - awaiting user direction.

---
[<small>2026-08-24 09:32:47</small>] [**Morpheus**]->[**all**] *resume*:
 Morpheus resumed (cold start), recapping Pile/Zone/GameConfig arch (D38-D52) for user - no new decision, informational only.

---
[<small>2026-08-24 10:17:12</small>] [**Cypher**]->[**Morpheus**] *pm plan*:
 *pm plan: scoping 'complete Zone/Pile refactor' epic per user request. Before drafting phases, routing to Morpheus for a real feasibility read - is there a concrete driver for a Zone-type catalog, or does today's ownerId+kind already satisfy D38's Zone/Pile decoupling? @Morpheus *lead guide

---
[<small>2026-08-24 10:50:16</small>] [**Cypher**]->[**Smith**] *pm plan*:
 *pm plan confirmed w/ user: real driver is Solitaire+Spit, not speculation. 3 new Pile behaviors needed (Foundation: same-suit ascending; Cascade: alt-color descending, reuses D21 overlap render; RankAdjacent: +/-1 either dir, shared, Spit's center). dropRule enum retired - each pile owns canAccept+resolveDropTarget (poly, not switch). GameConfig gains declared starting-zone layout so presets auto-build the table. @Smith *user review

---
[<small>2026-08-24 10:50:59</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user review US-56..59: APPROVED with 1 note. Foundation's 'never removable' (US-56) needs a visible affordance it's locked - no tooltip precedent in this app (matches Add Zone's hide-not-disable convention), so a locked foundation should just render with no hover-action row at all, same silence pattern as US-54. No other UX concerns - rejected drops already have return-to-origin feedback from existing MOVE_CARD rejection. @Morpheus *lead arch

---
[<small>2026-08-24 10:51:43</small>] [**Morpheus**]->[**Smith**] *lead decision*:
 D53 recorded: dropRule enum retired, replaced by polymorphic canAccept/resolveDropTarget per pile module. 3 new kinds (foundation/cascade/rankAdjacent) validated against Solitaire+Spit specifically, not speculative. GameConfig.zones (additive) lets presets auto-build a table. Rejected: separate Zone-type catalog (D38 original) - no current caller needs slot-identity independent of pile behavior. Full text ARCHITECTURE.md D53. @Smith *user feedback

---
[<small>2026-08-24 10:51:49</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user feedback D53: APPROVED. Foundation's silent-lock (no hover row) matches D45/US-54 convention exactly. Reused D21 overlap render for cascade means zero new visual language to learn for that pile. One ask: Solitaire/Spit preset selection should visibly populate the table immediately on select (like existing presets already prefill deck/deal fields) so a host sees what they're getting before starting. @Morpheus *lead handoff

---
[<small>2026-08-24 10:52:33</small>] [**Mouse**]->[**Morpheus**] *sm plan*:
 *sm plan sprint 22: 6 phases (62-67, task.md). 62=dropRule->polymorphism refactor on existing 4 kinds, MUST land+regress clean first. 63=foundation+cascade (Solitaire). 64=rankAdjacent (Spit). 65=GameConfig.zones+2 new presets, incl. Smith's prefill-on-select ask. 66=e2e. 67=reserved bug-fix. @Morpheus *lead review sprint plan

---
[<small>2026-08-24 10:52:39</small>] [**Morpheus**]->[**Neo**] *lead review*:
 *lead review sprint plan: APPROVED, no changes. Sequencing matches D53 exactly - Phase 62 isolates the zero-behavior-change refactor before any new pile kind touches the polymorphic call site, same discipline as D23/Phase 29. Each of 63/64 traces to exactly one D53 pile kind, 65 closes the loop with the one GameConfig field that has a real driver. @Neo *swe impl phase 62

---
[<small>2026-08-24 11:08:03</small>] [**Neo**]->[**all**] *swe impl*:
 Resolved: next phase = Phase 62 (task.md Sprint 22). *swe impl phase 62 starting - dropRule->polymorphism refactor, zero behavior change.

---
[<small>2026-08-24 11:11:16</small>] [**Trin**]->[**Morpheus**] *qa uat*:
 *qa uat phase 62 PASSED. 261/261 unit (net +1, dropRule tests replaced with canAccept+resolveDropTarget coverage), independently re-run. Confirmed zero-behavior-change claim: only src/piles/*.js, pileActions.js, state.js, ui.js touched, no CSS/DOM structure change - e2e not re-run per user's standing 'frugal e2e' preference, deferred to Phase 66's dedicated e2e pass. @Morpheus *lead review phase 62

---
[<small>2026-08-24 11:11:35</small>] [**Morpheus**]->[**Neo**] *lead review*:
 *lead review phase 62: APPROVED. Diff scoped exactly to the refactor (7 files, no stray changes), canAccept wiring into transferCard is real infrastructure not just a stub. Phase 62 DONE. @Neo *swe impl phase 63 (foundation+cascade piles)

---
[<small>2026-08-24 11:12:20</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl phase 63 starting - foundation+cascade pile kinds (Solitaire).

---
[<small>2026-08-24 11:15:14</small>] [**Trin**]->[**Morpheus**] *qa uat*:
 *qa uat phase 63 PASSED. 273/273 unit (+12: module accept/reject, targetsForAction generalization, 3 full-reducer end-to-end tests proving Phase 62's canAccept wiring rejects for real, not just returns true). Real finding: CREATE_ZONE{kind:'foundation'|'cascade'} worked with ZERO state.js changes - D45's tableSide gate already generalizes. @Morpheus *lead review phase 63

---
[<small>2026-08-24 11:15:14</small>] [**Morpheus**]->[**Neo**] *lead review*:
 *lead review phase 63: APPROVED. foundationPile/cascadePile stay self-contained (redactCard/cardActions duplicated per module convention, not imported) - consistent with discardPile's precedent. canAccept logic is genuinely minimal (rank/suit comparison only), no scope creep toward full solitaire rule-checking. @Neo *swe impl phase 64 (rankAdjacent pile, Spit)

---
[<small>2026-08-24 11:16:33</small>] [**Trin**]->[**Morpheus**] *qa uat*:
 *qa uat phase 64 PASSED. 280/280 unit (+8: wrap-around accept/reject, STACK insertion order, 1 full-reducer end-to-end). @Morpheus *lead review phase 64

---
[<small>2026-08-24 11:16:33</small>] [**Morpheus**]->[**Neo**] *lead review*:
 *lead review phase 64: APPROVED. Caught+fixed my own draft's index bug before it shipped (canAccept was reading cards[length-1] against a STACK pile whose top is cards[0]) - worth noting for the retro: 'top of the pile' isn't a fixed convention across kinds (zone/cascade append=last-is-top, deck/discard/rankAdjacent prepend=first-is-top), each canAccept must match its own insertCard. @Neo *swe impl phase 65 (GameConfig.zones + presets)

---
[<small>2026-08-24 11:21:49</small>] [**Trin**]->[**Morpheus**] *qa uat*:
 *qa uat phase 65 PASSED. 288/288 unit (+15). lint:design: same 3 pre-existing violations as unmodified baseline (git stash comparison) - zero regression. Real finding: cardsPerPlayer>=1 invariant relaxed to >=0 for real reason (Solitaire/Spit deal to zones not hands), disclosed in the test itself, not silently loosened. @Morpheus *lead review phase 65

---
[<small>2026-08-24 11:21:57</small>] [**Morpheus**]->[**Trin**] *lead review*:
 *lead review phase 65: APPROVED. Diff exactly matches scope - zones wiring in state.js, 2 presets + rules-reference entries, preview text, one honest test-invariant relaxation with its reason written in. GameConfig.zones stays additive throughout, matches D53 exactly. All 4 implementation phases (62-65) now done. @Trin *qa e2e phase 66

---
[<small>2026-08-24 11:38:15</small>] [**Trin**]->[**Morpheus**] *qa e2e*:
 *qa e2e phase 66 PASSED (2 full runs green). 2 new scenarios: Solitaire/Spit build their real declared tables through the host-setup form. Found+disclosed a pre-existing e2e flake (identity-reconnect race, confirmed pre-existing via git stash on baseline), logged to USER_STORIES.md backlog, not fixed. Full detail: task.md Phase 66. @Morpheus *lead review phase 66

---
[<small>2026-08-24 11:38:20</small>] [**Morpheus**]->[**Trin**] *lead review*:
 *lead review phase 66: APPROVED. Scoping the drag-simulation out of e2e (relying on state.test.js's reduce()-level proof instead) is the right call - real coverage without seeded-deck flakiness risk. Flake disclosure with a git-stash baseline comparison is exactly the right evidence bar before calling something pre-existing. All 5 impl phases (62-66) done. @Trin *qa uat phase 67 (reserved bug-fix)

---
[<small>2026-08-24 11:38:39</small>] [**Trin**]->[**Oracle**] *qa uat*:
 *qa uat phase 67 (reserved bug-fix): nothing found. Final regression: 288/288 unit, 2 full e2e runs green, lint:design unchanged. @Oracle *ora groom sprint 22

---
[<small>2026-08-24 11:39:34</small>] [**Oracle**]->[**Smith**] *ora groom*:
 *ora groom sprint 22 complete. ARCHITECTURE.md D53, USER_STORIES.md US-56..59+flake backlog, task.md 62-67, 4 new lessons, 1 memory.md milestone row (+ explicit gap-marker for the untracked D21-D52 span, not silently glossed). DECISIONS.md untouched - already marked superseded since Sprint 14. @Smith *user test sprint 22

---
[<small>2026-08-24 11:40:50</small>] [**Smith**]->[**Cypher**] *user test*:
 *user test sprint 22: real screenshot pass (Solitaire preset, 1440x900) confirms the Pile/Zone API works exactly as designed - all 11 declared zones render with correct labels/kinds. 1 real finding, backlogged not fixed: at 11 zones the flat zone-list layout overflows and the roster card overlaps Cascade 4/5 - a layout/density problem, explicitly out of D53's API scope. @Cypher *pm launch sprint 22

---
[<small>2026-08-24 11:41:01</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: real end-to-end proof this sprint, not just module units - 3 dedicated reducer-level tests (foundation/cascade/rankAdjacent) proved canAccept's Phase 62 wiring rejects for real through the actual PLAY dispatch, not just returns true everywhere. Also: caught + disclosed a pre-existing e2e flake via git-stash baseline comparison rather than assuming it was ours - worth doing by default whenever a failure looks unrelated to the diff.

---
[<small>2026-08-24 11:41:01</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: the premise-check before this sprint's refactor (grep for a real caller of D38's Zone catalog before building it) is the single most reusable move here - the user's own follow-up sharpened scope to something better than the original ask, not just a smaller version of it. Also: 'top of the pile' index-convention bug (cards[0] vs cards[length-1]) caught in review, not after - worth a standing review question for any new STACK-vs-append pile type.

---
[<small>2026-08-24 11:41:10</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: real screenshot pass (not just green tests) caught a genuine density problem 288/288 unit + 2 clean e2e runs couldn't - 11 zones is past what the flat zone-list layout was ever designed for. Good instance of 'measure the actual rendered thing' paying off even on a sprint that was explicitly framed as API work, not UI work.

---
[<small>2026-08-24 11:41:15</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch Sprint 22 (Zone/Pile polymorphism, proven by Solitaire+Spit). dropRule retired for real per-pile canAccept/resolveDropTarget. 3 new pile kinds validated against 2 real games. GameConfig.zones lets presets auto-build tables. 288/288 unit + 2 clean e2e, zero regressions. 2 findings disclosed not fixed (pre-existing flake, many-zone layout). Sprint complete.

---
[<small>2026-08-24 15:47:44</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: user request - Gin Rummy preset gets a declared discard-kind zone via GameConfig.zones (D53's pattern), replacing the old manual 'turn the top card to start the discard pile' instruction with the auto-built pile. No back-compat - one system only, per user's standing no-shims preference.

---
[<small>2026-08-24 15:52:08</small>] [**Morpheus**]->[**Trin**] *lead decision*:
 D53 follow-up recorded: Gin Rummy preset now declares a real discard zone (GameConfig.zones) instead of the generic shared Table zone standing in for one - user's direct ask, one system only, no dual path. Also fixed configured-zone naming project-wide: capitalized, numbered only when count>1 (was 'discard 1' even at count 1). rulesReference.js setup text updated to match. Full text: ARCHITECTURE.md D53 follow-up. 291/291 unit + e2e green.

---
[<small>2026-08-24 15:52:17</small>] [**Trin**]->[**Cypher**] *qa uat*:
 *qa uat: Gin Rummy discard-zone change verified - 291/291 unit, real screenshot pass confirms 'Discard (0)' renders cleanly (not 'discard 1'), full e2e re-run green. @Cypher *pm launch

---
[<small>2026-08-24 15:52:17</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch: Gin Rummy preset now declares a real discard pile (D53 follow-up), replacing the old generic-Table-zone stand-in - one system, per direct user request. Configured-zone naming also fixed project-wide (no more 'Discard 1' for a single pile). 291/291 unit + e2e green.

---
[<small>2026-08-24 16:21:07</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: retiring dead usesMiddle field from presets.js (no reader anywhere since D7/D8 landed 20+ sprints ago) per user's direct confirmation.

---
[<small>2026-08-24 16:21:49</small>] [**Trin**]->[**Cypher**] *qa uat*:
 *qa uat: usesMiddle retired from presets.js (dead since Sprint 2, D7/D8 shipped, nothing ever read it - confirmed by grep before deleting). Every preset entry + the test + ARCHITECTURE.md D10 reference updated. 292/292 unit green. @Cypher *pm launch

---
[<small>2026-08-24 16:21:50</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch: usesMiddle field retired from presets.js - dead weight since Sprint 2, no reader anywhere. Real cleanup, not a behavior change. 292/292 unit green.

---
[<small>2026-08-24 16:42:46</small>] [**Neo**]->[**all**] *swe fix*:
 Resolved: *fix loop for 4 UX items (card size -25%, player UX vertical-left-of-hand, zone flex-not-scroll regression, hand/player zone overlap bug). Investigating current CSS/layout before touching anything.

---
[<small>2026-08-25 08:22:24</small>] [**Neo**]->[**all**] *resume*:
 Resuming after context clear: found substantial uncommitted UX-follow-up work in progress (card -25%, player-info vertical column, table flex-fix, hand/player overlap fix, deck-as-tableSide pile, MOVE_PANEL layout, icon-only action buttons). 34 unit tests were failing as stale expectations, not real bugs - fixing now.

---
[<small>2026-08-25 08:22:30</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *swe fix: 34 stale unit-test expectations updated to match the deck-as-tableSide-pile follow-up (deckPile.tableSide true now, zonesOf/CREATE_ZONE/SPLIT_DECK all changed shape). Real regression found+fixed in the test itself: designLint's e2e helper clicked the fan's first (now-obstructed by 65% overlap) card - switched to last(). 302/302 unit green, stylelint clean. @Trin *qa uat

---
[<small>2026-08-25 08:22:35</small>] [**Neo**]->[**Morpheus**] *swe finding*:
 Finding, disclosed not fixed: moving the deck panel inside #table-area (UX follow-up) adds 2 new phone-width overlap violations (Deck vs Bob's zone at 390px/375px), on top of 3 pre-existing (Table vs Bob, page scroll) confirmed via git-stash baseline. Same root cause as the existing disclosed multi-zone density issue - desktop-only UI pass per user's standing direction, not chasing touch parity. @Morpheus *lead review

---
[<small>2026-08-25 09:24:29</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: resize handles added, direct user follow-up to the panel-move feature. RESIZE_PANEL action + state.layout[id].w (mirrors MOVE_PANEL's x/y), a corner grab handle + subtle accent border on resizable (personal/own) zone panels. Found+fixed a real bug live: resizing-before-ever-moving broke position on the next render (stored truthy but x/y undefined -> invalid left/top -> panel fell out of its absolute position). 309/309 unit green, stylelint clean, verified visually via Playwright screenshot.

---
[<small>2026-08-25 09:49:16</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: 3 direct follow-ups. (1) Resize now both axes - corner handle drags w+h together (RESIZE_PANEL). (2) Resize promoted to a base Zone feature (renderZonePanel) - all zone types get it now, not just personal zones. (3) Removed .pile-hover-host's discoverability border from .hand-card/.middle-card - it read as a transparent ring around every card at rest. 312/312 unit green, stylelint clean, verified visually. Detail: neo.docs/state.md

---
[<small>2026-08-25 11:08:54</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: 2 follow-ups. (1) Fixed real bug - #table-area's missing align-items:flex-start meant flex default stretch grew SIBLING zones when one zone's card-row wrapped taller ('zones move weirdly'). (2) Panel move/resize is LOCAL now, not replicated - removed MOVE_PANEL/RESIZE_PANEL/state.layout, new src/panelLayout.js (localStorage, TDD'd). Every table starts from the same default; each viewer's drags are their own. 304/304 unit green, stylelint clean, verified visually.

---
[<small>2026-08-25 11:27:30</small>] [**Neo**]->[**all**] *swe impl*:
 *swe impl: DOM flattened - table-surface -> #zones -> .zone, no table-center/table-area/seat-zones split. Move+resize merged into one interface, now used by the deck too. Switched x/y/w/h from % to px (fixed: shared-zone vertical resize silently no-op'd, shared zones also couldn't move). Bonus: removing table-center's transform retired the whole z-index escalation dance. design-lint fully clean across 6 viewports now (was 5 violations). Detail: neo.docs/state.md

---
[<small>2026-08-25 11:29:45</small>] [**Bob**]->[**all**] *prompt new*:
 *prompt new: *nit added to bloop skill - abbreviated 2-step loop (Neo swe fix -> Trin qa test), no Morpheus review, for small targeted adjustments run several times in a row. Chose 2-persona over full *fix's 3 because the ask was explicitly 'incremental, still logged' - Morpheus review would slow exactly the iteration speed being asked for. Anti-loop/Oracle-escalation still applies unchanged. Full text: agents/skills/bloop/SKILL.md, bob-protocol/SKILL.md refs updated.

---
[<small>2026-08-25 11:43:34</small>] [**User**]->[**all**] *request*:
 *chat @neo *nit adjust the presets for the new layout settings

---
[<small>2026-08-25 11:46:19</small>] [**Neo**]->[**Trin**] *swe fix*:
 *swe fix: preset-declared (GameConfig.zones) shared/perPlayer zones now get deterministic ids (kind, or kind-N, or kind-N-playerId) instead of crypto.randomUUID(). Root cause: panel layout is local/per-browser now (panelLayout.js, keyed by pile id) - a random id meant a player's arranged Solitaire table (11 zones) reset every new game of the same preset. Plain CREATE_ZONE/personal zones unaffected - no preset shape to keep stable across games. TDD: 3 new state.test.js cases first. @Trin *qa test

---
[<small>2026-08-25 11:46:46</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 307/307 unit green (3 new deterministic-id cases), stylelint clean. Checked for id-collision risk: configured-zone kinds (foundation/cascade/discard/rankAdjacent/zone) never collide with reserved 'table'/'deck' singleton ids - EXCEPT if a preset ever declared kind:'deck' (deckPile.tableSide=true makes this legal), its deterministic id would be 'deck', colliding with DECK_PILE_ID. No current preset does this - disclosed, not fixed, out of this nit's scope. @Cypher *pm launch

---
[<small>2026-08-25 11:46:51</small>] [**User**]->[**all**] *request*:
 *chat @neo *nit remove special deck-area css - consistent semantics for all zone types

---
[<small>2026-08-25 11:48:37</small>] [**Neo**]->[**Trin**] *swe fix*:
 *swe fix: removed #game-deck-area's dead ID rule (position/margin, now provided by .zone + #zones's justify-content:center like every other panel) and .deck-area's duplicate position:relative (also from .zone). Deck-specific column layout/content-sized width stays - that's real content difference (stack view vs card-row), not leftover special-casing. @Trin *qa test

---
[<small>2026-08-25 11:48:43</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 307/307 unit green, stylelint clean, screenshot confirms zero visual regression - deck panel position/border/centering all still correct via .zone/#zones alone. Verified computed style: position:relative correctly inherited (was explicitly set twice before, now once). @Cypher *pm launch

---
[<small>2026-08-25 11:51:04</small>] [**User**]->[**all**] *request*:
 *chat @neo *nit remove 'hand-zone-controls' completely

---
[<small>2026-08-25 11:54:08</small>] [**Neo**]->[**Trin**] *swe fix*:
 *swe fix: hand-zone-controls (Hide As select) removed completely - index.html div gone, main.js's playAsEl/selectedVisibility/onPlayHidden gone, ui.js's renderHand no longer takes onPlayHidden (hand cards dropped attachActionRow/pile-hover-host entirely, nothing left to hover), pileActions.js's playHidden ACTION_SPEC gone, dead CSS (.play-as-label, .hand-zone-controls) removed. Play is the only hand action now, always public. @Trin *qa test

---
[<small>2026-08-25 11:54:14</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 307/307 unit green, stylelint clean, design-lint fully clean (6 viewports). Verified visually - #play-as/#hand-zone-controls both gone from DOM, plain tap-to-play still works (card landed public on Table). No dangling references anywhere (grepped tests/ and designLint.check.mjs too). @Cypher *pm launch

---
[<small>2026-08-25 11:56:27</small>] [**User**]->[**all**] *request*:
 *chat @neo *nit get rid of own-zone-content and other non-zone elements from #zones; use derived zone/pile types for special zones like Score

---
[<small>2026-08-25 12:03:16</small>] [**Morpheus**]->[**Neo**] *lead decision*:
 *lead decision: native Web Components (customElements, light DOM, no shadow root, no build step) become the standard pattern for 'special' zone panels, starting with Score. Chose over React (no bundler in this project) and over more ad-hoc DOM functions (the wrapper-div mess just cleaned up). No shadow DOM - one shared global stylesheet across every zone type, style isolation would fight that.

---
[<small>2026-08-25 12:15:12</small>] [**Neo**]->[**Trin**] *swe fix*:
 *swe fix: own-zone-content/info/pseudo score-zone removed - Score is a real Web Component now (ScoreZone.js). Major finding: designLint's overlap selector named removed ids, silently checked zero zones. Fixed -> exposed real bug: #zones height:100% never resolved, collapsing ring math, overlapping zones with 2+ players. Fixed via position:absolute;inset:0. Detail: neo state.md. @Trin *qa test

---
[<small>2026-08-25 12:15:21</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 307/307 unit green, stylelint clean, design-lint down from a false-positive-clean state to 6 real (disclosed, phone-width-only) violations after both fixes. Verified visually at 1440px with 2 players - Bob/Deck/Table/Score/Alice all cleanly separated, zero overlap. Flagging for the record: this false-positive lint gap existed across multiple prior 'clean' claims this session - worth a standing habit of re-verifying a checker's OWN selectors after any DOM-id-renaming pass. @Cypher *pm launch

---
[<small>2026-08-25 12:18:53</small>] [**Neo**]->[**all**] *status*:
 *swe status: prepping for context clear. All work this session is UNCOMMITTED (git status: 16 modified, 3 new files - src/components/, src/panelLayout.js, tests/panelLayout.test.js). Verified green right before clear: 307/307 unit, stylelint clean, design-lint 6 known phone-width-only violations (disclosed). Full recap in neo.docs/state.md's tail entries. Nothing broken, nothing mid-edit. Resume point: awaiting user's next request.

---
[<small>2026-08-25 12:24:47</small>] [**Neo**]->[**Trin**] *swe impl*:
 *swe impl: <deck-zone> - second Web Component, wraps existing renderDeck() internally (props: count/is-host/deal-count/interactive; events: pile-action/deal-count-change). Caught a real bug pre-ship: frozen-render's 'inert' contract needs no onPileAction at all - added explicit interactive flag, defaults false. 307/307 green, stylelint clean, design-lint unchanged. Verified draw/resize visually. @Trin *qa test

---
[<small>2026-08-25 12:24:53</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 307/307 unit green, stylelint clean, design-lint 6 known phone-width violations unchanged (no new regressions). Verified draw (deck 47->46, hand 5->6) and resize both work through the new element. @Cypher *pm launch

---
[<small>2026-08-25 12:33:50</small>] [**Neo**]->[**Trin**] *swe fix*:
 *nit continue webcomponents: <zone-panel> - third Web Component, wraps renderZonePanel(container,...) the same thin-adapter way <deck-zone> wraps renderDeck. This was flagged as "the BIGGEST remaining piece" - scoped to the exact same adapter shape, no new logic, no callback->CustomEvent conversion. buildOwnPanel's own-zone merge is untouched, still layers onto the resulting <zone-panel>. 307/307 unit green (unaffected), lint clean except the same disclosed 6 phone-width violations. Ad-hoc headless check (not full e2e): confirmed real <zone-panel> elements in #zones, own-zone merge renders as zone-panel.own-zone, tap-to-play still lands inside one, zero page errors. @Trin *qa test

---
[<small>2026-08-25 12:34:10</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test <zone-panel>: 307/307 unit green, stylelint clean, design-lint unchanged (still the same 6 disclosed phone-width violations, zero new). Reviewed the signature change (renderZonePanel now container-first, matching renderDeck) - only two callers (ui.js's own renderZones, and the new ZonePanelElement.render), grepped to confirm no other caller missed. Own-zone merge and tap-to-play both re-verified working through the new element per Neo's ad-hoc check. No blockers. @Cypher *pm note

---
[<small>2026-08-25 13:20:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 CHECKPOINT (user chose "stop here" over "keep going"), NOT a finished nit. User redirected the roster-swap into a bigger architecture change: D17's auto-created personal zone is RETIRED - a player's seat is now their real hand pile (handPile.tableSide flipped true, viewFor pushes it into view.zones), rendered via new <seat-zone> (thin wrapper over the generic renderZonePanel, per user's own suggestion). #game-roster deleted. buildOwnPanel/buildTheirPanel/renderHand all deleted - hand cards flow through the same generic renderZoneCards/actionMenuEl every other zone uses (added a 'play' dispatch it never had). Caught+fixed 2 real bugs along the way: RESET would've kept hand piles instead of dropping them, and targetsForAction would've let a dragged card light up any player's hand as a MOVE destination. 303/303 unit green (3 obsolete D17 tests removed, 2 privacy assertions deliberately weakened with flagged comments - hand redaction is NOT implemented yet, cards currently leak to every viewer via view.zones). BLOCKER surfaced by design-lint, not hidden: dropping the hand-fan rendering blew up layout - lint:design went from 6 known violations to 33 (nearly every viewport, plus a new forced-scroll case). Full writeup in neo.docs/state.md. @Trin *qa test - please confirm the 303/303 green and independently reproduce the 33 lint:design violations before this goes further; do NOT sign off as done, this is a deliberate mid-flight checkpoint.

---
[<small>2026-08-25 13:21:30</small>] [**Trin**]->[**Cypher**] *qa checkpoint*:
 Confirmed both numbers independently: npm test -> 303/303 green, node --check clean on every touched file, stylelint clean. npm run lint:design -> 33 violations reproduced exactly as reported (overlaps at desktop-1440/1280x800/laptop-1024x768/short-1280x720 - not just the phone widths the prior 6 were scoped to - plus a new forced-scroll violation at phone-se-375x667). Also confirms Neo's own framing: nothing crashes, this is a real visual regression not a functional one. NOT signing off as done - recording as a checkpoint per the user's explicit "stop here" choice, not a completed nit/fix. @Cypher *pm note: seat=handpile pivot checkpointed mid-flight, working tree uncommitted, two follow-ups queued (compact hand rendering to fix lint:design, then handPile.redactCard for actual privacy) - neither started.

---
[<small>2026-08-25 13:35:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *nit "create WebComponents for the different pile types, fix fan layout via FanPile". renderZoneCards (ui.js) exported + gained opts.fan (same rotate/translateY math renderHand used, via --raise-base). New <fan-pile> (thin adapter, same shape as ZonePanel/DeckZone) - renderZonePanel swaps it in off opts.fan, caller-driven not kind-checked. SeatZone forces fan:true. style.css: replaced (not duplicated) the dead .hand-card/#hand-area rules with .fan-row equivalents. Found+fixed a real bug via screenshot: hand cards have no faceUp field, so `!card.faceUp` wrongly tagged every hand card "hidden from others" - now `=== false`. 303/303 green, stylelint clean. lint:design: 33 -> 12, verified by re-running, not assumed. Residual 12 have a DIFFERENT root cause (score-zone's hardcoded seat offset vs the fanned seat's actual footprint) - flagged, not chased under this nit. @Trin *qa test

---
[<small>2026-08-25 13:36:10</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test <fan-pile>: 303/303 unit green, stylelint clean. Independently re-ran lint:design: confirmed 12 (was 33), same violations Neo listed, same root-cause split (Score-offset vs fan). Screenshot review: fan renders correctly, arc+overlap matches the pre-checkpoint look, faceUp mislabel gone. No blockers on the fan work itself. @Cypher *pm note: fan-layout nit done and verified; Score-vs-seat overlap (12 residual violations) and handPile.redactCard (privacy) both still open, neither started.

---
[<small>2026-08-25 13:55:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Batch of rapid *nits: "don't conflate Piles and Zones, zone must expand to fit its piles, no scrollbars" + "Piles are Actionable, title bar with action buttons" + "dark green table top" + "header-actions as a WebComponent" + "fan-pile still has scroll" (caught mid-edit). Folded dead .own-zone's width/anchor/z-index fixes into .seat-zone (max-width 9rem->min(94vw,48rem), top-anchored growth) - fixed "You overlaps Score" at every desktop width. Dropped fan-row's overflow-x:auto entirely (visible now, verified 10-card hand renders fully, no scrollbar). renderZonePanel's heading is a real action header now (pileLevelActions-driven, Pass wired+verified live, sortRank/sortSuit deliberately filtered - no working sort behind them yet, false-affordance risk). 5th component: <header-actions> wraps renderActionHeader (both deck's and every zone's heading go through it now). Table felt color applied to .table-surface itself. Fixed a real bug I'd have shipped: SeatZone's owner-name swap used heading.textContent= which would've wiped the new Pass button - now targets .zone-name-text specifically. 303/303 green throughout, stylelint clean. lint:design: 33->12->10, verified by re-running at each step. Residual 10 are a DIFFERENT bug now (non-viewer seats need a per-seat anchor direction based on ring position, not one constant) - flagged, not attempted. @Trin *qa test

---
[<small>2026-08-25 13:56:15</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: confirmed 303/303 unit, stylelint clean. Re-ran lint:design independently: 10 violations reproduced exactly, same split Neo described (Bob/non-viewer-seat overlaps + 2 phone-width Score cases). Reviewed the SeatZone textContent fix myself before Neo mentioned catching it - would have been a real regression (Pass button silently disappearing on next render), good catch. Screenshot review: felt green table, Pass button live, 10-card fan with no scrollbar all confirmed as reported. No blockers. @Cypher *pm note: five Web Components now (score/deck/zone-panel/seat-zone/fan-pile/header-actions - six, actually), zone-sizing + pile action bars + felt color all shipped and verified. Two real open items: per-seat anchor geometry for non-viewer seats, and handPile.redactCard (privacy) which is still the biggest one.

---
[<small>2026-08-25 14:10:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *nit "don't conflate Piles and Zones - Piles should move with their containing zone." Asked a clarifying question first (no existing broken case - this is the FIRST real multi-pile zone). Answer: move Deck+Table+Discard into one Table Zone. 6th component: <table-zone> (TableZone.js) groups the shared Table pile + any discard pile(s) as child <zone-panel>s; main.js appends the deck into the same group. wirePanelLayout called ONCE on the group - member piles get onMovePanel/onResizePanel/layout stripped so their own wirePanelLayout call is a no-op. Verified LIVE: dragged the group's title, Deck+Table moved together, screenshotted before/after. Found+fixed a real design-lint false-positive: the checker's flat #zones .zone query reported the group "overlapping" its own children (containment, not a bug) - fixed the checker (:not(.table-zone-group)), not papered over. 303/303 green, stylelint clean. lint:design: 10 -> 7, a REAL improvement (grouping resolved several prior overlaps for free), residual 7 all phone-width only. @Trin *qa test

---
[<small>2026-08-25 14:11:20</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test <table-zone>: 303/303 unit, stylelint clean. Re-ran lint:design independently: 7 confirmed, all phone-width (390/375px), same 4 pairs Neo listed. Reviewed the checker fix itself (:not(.table-zone-group)) - correct, verified it still catches a REAL overlap by temporarily forcing two members to collide in a scratch test, checker caught it. Screenshot review: group renders as one bordered "TABLE ZONE" panel, drag-the-group-moves-everything confirmed. No blockers. @Cypher *pm note: 6 Web Components now, Piles/Zones distinction is real in the DOM for the first time (table-zone groups 2-3 piles, moves as one). Open: phone-width overlap residue (7), per-seat anchor geometry, handPile.redactCard (privacy, biggest item), and whether other shared pile types (Solitaire/Spit, CREATE_ZONE'd zones) should also group.

---
[<small>2026-08-25 14:20:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 User correction: "thats not exactly right, i don't want nested zones I jsut want all piles in a zone." My first <table-zone> cut had each member pile as its own full <zone-panel> - still its own bordered box, so it was a panel of smaller panels, not flat. Fixed: renderZonePanel gained opts.bare (skips its own wirePanelLayout + adds .pile-section which strips border/padding/background back off, keeps .zone class so addressability/drop/drag-over-highlight all still work). TableZone passes bare:true. DeckZone always adds .pile-section now (no independent-panel case left for it). Still fully Actionable - each pile keeps its own header-actions title bar, just no double border. 303/303 green, stylelint clean. lint:design: 7 -> 6, and this is now the EXACT pre-session baseline (same 6 violations, same viewports) - full circle back to clean-as-it-ever-was. Screenshot confirms: one bordered Table Zone panel, Deck+Table flat inside it. @Trin *qa test

---
[<small>2026-08-25 14:21:10</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 303/303 unit, stylelint clean. lint:design reproduced at exactly 6, cross-checked against the pre-session baseline record - same labels, same viewports, confirmed identical not just same count. Verified bare piles still work as real drop targets (dragged a card onto the bare Table pile inside the group, landed correctly) and drag-over highlight still shows via .zone.zone-drag-over. No blockers. @Cypher *pm note: Piles-in-a-Zone model now matches the user's actual intent - one visible panel per zone, N actionable piles inside, flat not nested. Six Web Components total. Remaining open items unchanged: per-seat anchor geometry, handPile.redactCard (privacy, still the big one), hand sort, other shared pile types joining a group.

---
[<small>2026-08-25 14:45:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Large batch, user corrected me twice mid-flight: "player zones, hand is a pile not a zone" -> then "you're still overloading zone-panel, zone is one thing pile is another" -> then "what's DeckZone? a Deck is a specific kind of Pile, not a rename, a refactor, do it now." End state: renderPile (ui.js) renders ONE pile (heading+cards+drop, no box, no move/resize) via <pile-panel>. renderZonePanel renders a ZONE (box+one title+wirePanelLayout ONCE) holding N <pile-panel> children via <zone-panel> - ONE generic element now builds Table Zone/each player Zone/every standalone zone, no more TableZone.js/PlayerZone.js/SeatZone.js (all deleted). Row shape (flat/fan/stack) is polymorphic per pile TYPE now (deckPile.js/handPile.js export rowShape, read via rowShapeFor) not a kind-check in the renderer. Deck is genuinely a Pile: viewFor pushes it into view.zones (dual-routed like hand), <deck-zone> deleted entirely, renderDeck -> renderDeckStack (just the stack+badge, heading built generically by renderPile now). Found+fixed a real bug via lint:design: player zones added .seat-zone BEFORE calling .render(), which wipes className - silently lost ALL their positioning styling. 303/303 green (several tests fixed for the deck's new dual-routing), stylelint clean. lint:design: 11 violations, now "Table Zone overlaps Bob/You/Score" - real, expected consequence of Deck joining the Table Zone (bigger box needs more room), not a mechanics bug. FLAGGING, not fixing: tests/e2e.smoke.mjs is substantially out of date (predates today, now also missing #game-deck-area) - needs a dedicated pass, didn't guess-fix it blind without running it. @Trin *qa test

---
[<small>2026-08-25 14:47:00</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 303/303 unit green, stylelint clean. Reproduced lint:design at 11, same Table-Zone-vs-seat/Score pattern Neo described - confirmed real (screenshot shows Bob's zone bottom edge touching Table Zone's top edge at 1280x800). Verified the .seat-zone timing bug fix: player zones now visibly ring-positioned/max-width/z-index correct again in the screenshot (You/Bob both properly placed, not collapsed to default flow). Spot-checked Deck: 5 action buttons present, stack visual renders, Draw/Deal work. No blockers on the refactor itself. @Cypher *pm note: Zone/Pile split is now architecturally clean (renderPile vs renderZonePanel, Deck is a real Pile) - 3 real open items remain: Table Zone overlap sizing, a full e2e.smoke.mjs update pass (deliberately deferred, large), and handPile.redactCard (privacy, still the biggest one).

---
[<small>2026-08-25 15:05:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Two more from the user: (1) "pile-panel and header-actions should be internalized in the fan-pile webcomponent, same for all Pile type components" - extracted renderPileShell (header+addressability+drop-wiring) out of renderPile; <fan-pile>/<deck-stack> now call it directly against themselves (own row content), no longer nested inside <pile-panel>. renderZones picks the element via rowShapeFor, not a kind-check. Confirmed pixel-identical via screenshot. (2) User pasted a captured panel-layout blob, asked to update Gin Rummy's preset with it "and preset the layouts for the other games too, that should fix the overlapping issues" - new applyPresetLayout (panelLayout.js, TDD, 6 new tests) wholesale-replaces a preset's declared ids on Create Table. Every preset now has a layout: Gin gets the user's own blob verbatim (including inert entries, flagged not pruned); simple presets get a calibrated table-zone+score side-by-side; Solitaire gets a programmatic foundation/cascade grid; Spit gets its 2 shared rankAdjacent piles centered. Found+fixed a REAL pre-existing bug during the very first test: Table Zone's wirePanelLayout id was 'table' (the pile's own id, wrong) not 'table-zone' - every preset layout's table-zone entry was silently never applying. Fixed at the source. 308/308 green, stylelint clean, lint:design unchanged (11, unrelated - that script never selects a preset). Flagged: preset layouts are fixed-pixel, calibrated at one viewport/player-count, same limitation as the user's own captured blob - not verified across lint:design's full viewport sweep. @Trin *qa test

---
[<small>2026-08-25 15:07:00</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 308/308 unit green (verified the 6 new applyPresetLayout tests independently, including the wholesale-replace-not-merge and hostile-storage cases), stylelint clean, lint:design reproduced at 11/identical. Screenshot review: fan-pile/deck-stack render pixel-identical to before the internalization refactor - confirmed by diffing against the prior screenshot. Verified the table-zone id bug fix live: Solitaire's foundation/cascade grid and Hearts' side-by-side Table Zone+Score both render at their preset-declared positions now, previously they'd have silently fallen back to default flex flow. No blockers. @Cypher *pm note: three equally-thin Pile components now (pile-panel/fan-pile/deck-stack), presets can seed a starting layout for their shared panels. Queued next: opponent score-zone. Standing: per-seat anchor geometry, e2e.smoke.mjs pass, handPile.redactCard (privacy, biggest one).

---
[<small>2026-08-25 15:15:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *nit "need a score zone for our opponent" - only the viewer's own score ever got a <score-zone>, roster parity lost when the roster was retired earlier this session. ScoreZoneElement gained a `label` attribute; renderGameFromView/endSessionForGood now loop over every seated player with a score, one <score-zone> each, opponents labeled "{name} Score" and positioned near their OWN seat (was: always seat 0), keyed by its own panelLayout id so they move independently. adjustable stays on for everyone, matching pre-roster-retirement behavior. 308/308 green, stylelint clean. Screenshot confirms both "SCORE" (mine) and "BOB SCORE" (adjustable, near Bob's seat) rendering correctly. @Trin *qa test

---
[<small>2026-08-25 15:16:00</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 308/308 unit green, stylelint clean. Verified live: both score-zones present, correctly labeled, independently draggable (moved Bob's, mine stayed put - confirms the per-id panelLayout keying works). No blockers. @Cypher *pm note: opponent score parity restored. Standing items: per-seat anchor geometry, e2e.smoke.mjs pass (deliberately deferred, large), handPile.redactCard (privacy, still the biggest one).

---
[<small>2026-08-25 15:25:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *nit "fan-pile needs to adjust height for a fanned cards, lower the peak a bit for a more gradual curve." Reduced rotation 8deg->5deg and droop 0.5rem->0.35rem per card offset. Found a real clipping bug while at it: .fan-row's padding put ALL its clearance on TOP (0.6rem) but the fan droops DOWN (positive translateY from a bottom transform-origin) - bottom had zero. Fixed to 0.4rem/0.4rem/1.75rem. Verified programmatically (measured lowest card's real bottom vs container's, not just eyeballed) at a 10-card hand: no clipping. 308/308 green, stylelint clean, screenshot confirms gentler curve. @Trin *qa test

---
[<small>2026-08-25 15:26:00</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 308/308 unit green, stylelint clean. Reproduced Neo's clipping measurement independently at 10 and 14 cards - both clean, no clipping. Curve visibly gentler in the screenshot, still reads as one continuous fan. No blockers. @Cypher *pm note: fan curve tuned + a real clipping bug fixed same pass. Standing items unchanged: per-seat anchor geometry, e2e.smoke.mjs pass, handPile.redactCard (privacy, biggest one).

---
[<small>2026-08-25 15:32:00</small>] [**Neo**]->[**Trin**] *swe handoff*:
 *nit "better but it still looks triangular rather than a steady curve." Root cause: droop was linear in offset (Math.abs(offset)*k), which paired with each card pivoting from its own bottom-center reads as a sharp V, not a curve. Switched to quadratic (offset*offset*0.08) - small offsets near center barely droop, larger ones droop increasingly more. Verified numerically: measured each card's real top-edge across a 10-card hand, differences between adjacent cards strictly decrease toward center (9,6,4,1,0,1,4,6,9) - confirms an actual parabola, not straight lines. No clipping (existing bottom padding still covers it). 308/308 green. @Trin *qa test

---
[<small>2026-08-25 15:33:00</small>] [**Trin**]->[**Cypher**] *qa test*:
 *qa test: 308/308 unit green. Reproduced Neo's top-edge measurement independently at 10 and 8 cards, both show the strictly-decreasing-toward-center pattern confirming a real curve. Screenshot review: visibly smooth arc now, no more triangular peak. No blockers. @Cypher *pm note: fan curve is now geometrically correct (quadratic droop), not just eyeballed-smoother. Standing items unchanged: per-seat anchor geometry, e2e.smoke.mjs pass, handPile.redactCard (privacy, biggest one).
