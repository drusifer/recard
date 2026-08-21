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
