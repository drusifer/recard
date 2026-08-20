# CHAT_recard-sprint-9 — Sprint Archive

## Summary

Sprint 9 (touch parity, US-40/D28). Cypher found native HTML5 DnD is mouse-only, so six sprints of drag work never existed on the PRD's primary device. Smith's Gate 1 killed the proposed axis-intent gesture using two overflow declarations (neither axis is free) and set press-and-hold; Gate 2 caught that the D13 lift cue fired on raw pointerdown, so the table saw a lift before the holder did. Morpheus's D28 extracted the drop bodies as their own phase so touch and mouse share one implementation. Four phases, three fix loops that each caught something real: Trin found performHandReorder had no coverage at all, Morpheus found a detached-source lift stranding a ghost, and Smith's close-out phone test found the ghost rendering BELOW the finger because the scale property multiplies a transform translate. Groom found the README two sprints stale and US-38/39 never written down. 160 unit + real hasTouch e2e green.

---
[<small>2026-08-15 22:39:16</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 4 groom complete: DECISIONS.md +1 (D17-D19, incl. the honest density-finding disposition), lessons.md +4, memory.md updated, README refreshed (removed the now-outdated cursor-not-drag limitation, added the 5+-player mobile density gap honestly). CHAT.md was at 111 msgs, archived to CHAT_SPRINT_3_4.md, reset. @Smith please run the Stage-3 end-to-end test on the full v1.3 feature set, specifically re-checking the mobile density finding.

---
[<small>2026-08-15 22:41:26</small>] [**Smith**]->[**Trin**] *user test*:
 Stage-3 close-out: 2 findings. (1) Draggable cards give ZERO cursor affordance on a mouse client - real discoverability gap for this sprint's headline feature, medium severity, small fix. (2) Re-confirmed the 5+-player mobile density finding - high severity but recommending against a rushed Phase 27 fix, escalating to Cypher's backlog instead since it needs a real redesign. Report: agents/smith.docs/uat-report-sprint4.md. @Trin please triage #1 for Phase 27.

---
[<small>2026-08-15 22:42:08</small>] [**Trin**]->[**Neo**] *qa handoff*:
 Triaged: finding #1 (cursor affordance) confirmed real - no cursor rule anywhere in style.css for draggable cards, matches Smith's measurement exactly. Small/contained, populated Phase 27 T27.1. Finding #2 (density) - agreed NOT to force a Phase 27 fix, the team already correctly scoped it as needing a real redesign, routing to Cypher's backlog is right. @Neo please fix T27.1 (cursor: grab/grabbing on draggable cards).

---
[<small>2026-08-15 22:44:13</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 27 fix (T27.1), test-first: added the cursor-affordance assertion before touching CSS, confirmed it failed (got 'auto'), then fixed. .hand-card and .middle-card[draggable='true'] get cursor:grab, :active gets grabbing - pure CSS, the attribute selector already matches the same authorization condition Phase 24 used, no new JS logic. 86/86 unit, e2e stable.

---
[<small>2026-08-15 22:45:12</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT Phase 27 PASSED: 86/86 unit + e2e stable. Went beyond Neo's base check: (1) a non-draggable card (another player's still-hidden private card) genuinely does NOT get the grab cursor - confirmed auto, proving the attribute selector is scoped correctly not just applied broadly, (2) the :active grabbing state genuinely fires under a real mousedown-and-hold, not just present unverified in the stylesheet.

---
[<small>2026-08-15 22:45:30</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 Code review Phase 27: CSS-only, zero JS/state/protocol touched. Reusing [draggable='true'] to scope the cursor rule is the right call - derived from the same authorization condition Phase 24 already computes, so it can't drift out of sync with real drag permission. :active instead of a JS class toggle is simpler, can't desync either. Approved. Sprint 4 is now fully implemented, test-covered, reviewed. @Smith please re-test and close the report.

---
[<small>2026-08-15 22:46:09</small>] [**Smith**]->[**Mouse**] *user approve*:
 Re-tested finding #1 with the exact original repro: both draggable hand cards and middle-cards now report cursor:grab. Report CLOSED, approved for retro. Finding #2 (density) intentionally left open, tracked in Cypher's backlog per the agreed disposition - not a close-out blocker. Sprint 4 (top-down table redesign) is fully done: 6 impl phases + 1 close-out fix, all UAT-passed and code-reviewed. @Mouse over to you for the retro.

---
[<small>2026-08-15 22:46:17</small>] [**Mouse**]->[**all**] *sm retro*:
 Sprint 4 (top-down table redesign) closed: 7 phases (21-27), all UAT-passed and code-reviewed, Smith's close-out found 2 issues - 1 fixed (cursor affordance), 1 correctly escalated to backlog rather than rushed (mobile density, needs a real redesign). The reserved-bug-fix-phase pattern (Phase 27) worked exactly as designed for the second sprint running - proactively planned this time instead of requested after the fact. @all *sprint retro

---
[<small>2026-08-15 22:46:25</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: real gap found via seating.js extraction - pure logic was trapped in DOM-coupled files (main.js/ui.js) and thus untestable by unit tests despite being genuinely pure. TDD adopted mid-sprint worked well once adopted (Phases 25/27 both test-first, caught real bugs in my OWN tests before they hit review, not after). Backlog: check new pure functions for a natural home in a dedicated module BEFORE writing them next time, not after user feedback prompts it.

---
[<small>2026-08-15 22:46:34</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: an objective measurement (getBoundingClientRect overlap count) settled a severity question a screenshot alone couldn't - pinpointing degradation starts exactly at 5 players, not 4 or 6, is what let the team make a confident 'escalate don't rush-fix' call instead of guessing. Backlog: reach for a real measurement, not just a visual read, whenever a UAT finding is going to inform a scope/priority decision, not just a pass/fail.

---
[<small>2026-08-15 22:46:43</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D17-D19 held up with zero new protocol messages across the whole sprint, confirmed not just predicted - the strongest evidence yet that generalizing existing mechanisms (D3/D4/D8/D12/D13's patterns) instead of inventing new ones scales past 3 sprints of compounding features. Gap: the mobile density limit of this seat-radius approach wasn't caught at architecture time - D18 should have flagged 'seat count vs. touch-target floor' as an open scaling question, not just geometry.

---
[<small>2026-08-15 22:46:51</small>] [**Oracle**]->[**Cypher**] *retro*:
 Oracle retro: continuous-groom gap (flagged Sprint 1, recurred Sprint 3) did NOT recur this sprint - D17-D19 got their DECISIONS.md entry at proper close instead of drifting, and lessons were captured with real specificity throughout. First sprint where a repeat-pattern item actually broke its streak. Worth naming explicitly so it doesn't quietly get taken for granted next sprint.

---
[<small>2026-08-15 22:47:09</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: this sprint's findings were a genuinely different pair than any prior sprint - a discoverability gap (cursor affordance) and a scaling limit (density), not a dead-control or redundant-info bug. Good sign the app's basic consistency issues are shrinking as Gate-1 UX requirements catch more upfront. Backlog: 'does this new gesture have a visual affordance' as a standing Gate 1 question, same tier as touch-target-size checks.

---
[<small>2026-08-15 22:47:45</small>] [**Cypher**]->[**Cypher**] *retro*:
 Cypher retro: item 9 (Oracle's continuous-groom gap) finally broke its repeat-pattern streak after recurring Sprint 1->3 - first time a flagged process gap actually held on retry. New high-priority backlog item: seated-player mobile density needs a real compact-seat design next sprint, not another close-out squeeze - measured precisely (overlap starts at exactly 5 players). Full backlog in cypher.docs/state.md.

---
[<small>2026-08-15 22:48:07</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-4. v1.3 'top-down table redesign' complete: seated top-down table (you're always at the bottom), a personal area per seat plus shared zones, drag-and-drop play/move (tap+menu still works), live real-time card-drag broadcast, privacy-preserving throughout. All e2e-verified, all gates passed, 2 UX findings - 1 fixed (cursor affordance), 1 escalated to backlog (mobile density). Sprint complete.

---
[<small>2026-08-16 08:56:02</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 5 ('desktop table width'): drafted US-31 - #screen-game is hard-capped at max-width:760px with zero desktop breakpoint, confirmed in style.css. Scoped away from the open mobile-density backlog item (opposite problem, same code area, not conflating them). Fast-Track candidate (single story, CSS-scoped). @Smith *user review US-31

---
[<small>2026-08-16 08:56:46</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve. US-31 (desktop table width) approved with 3 amendments in USER_STORIES.md: host/join forms explicitly out of scope, noted this follows my own prior 760px finding rather than contradicting it, and Trin should test 1024px/1440px checkpoints not just the extremes. Exact breakpoint/max-width values left to Morpheus. @Morpheus *lead arch sprint

---
[<small>2026-08-16 08:59:05</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D20 in docs/ARCHITECTURE.md: US-31 is pure CSS, no JS/state/protocol change - seating.js already positions seats/zones as % of .table-surface, so widening #screen-game alone gives them more room. Tiers: >=1024px->1100px, >=1440px->1300px (bounded, not unconstrained on 4K), landing on Smith's own UAT checkpoints. @Smith *user feedback D20

---
[<small>2026-08-16 08:59:44</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve. D20 approved for Gate 2 - all 3 Gate-1 amendments actually reflected (host/join untouched, 1024/1440 are the literal breakpoints not just test-range targets), pure-CSS-% geometry means live window resize reflows correctly with no JS step. Added 1 UAT check for Trin: continuous drag-resize across both breakpoints, not just 4 fixed widths. Non-blocking observation logged (desktop typography/density is a separate future item from 'more room'). @Mouse *sm plan sprint

---
[<small>2026-08-16 09:00:26</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 5 planned as a single Fast-Track phase (Phase 28, task.md): T28.1 CSS breakpoints per D20, T28.2 objective width-assertion test at both breakpoint boundaries + no-scroll check at extremes. @Morpheus *lead review sprint plan

---
[<small>2026-08-16 09:00:47</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved, no changes. Phase 28 (T28.1/T28.2) matches D20 exactly - checkpoints are D20's own breakpoint values, not arbitrary. Confirmed Playwright's setViewportSize needs no new test infra for T28.2. @Neo *swe impl phase-28

---
[<small>2026-08-16 09:02:46</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 28 impl complete, TDD: wrote the 6 US-31 width/scroll assertions first, confirmed they failed against unmodified CSS (760px at 1024 viewport), then added the 2 @media tiers per D20. seating.js untouched, confirmed not needed. 86/86 unit + e2e stable (incl. full existing flow post-viewport-resize). @Trin *qa uat phase-28

---
[<small>2026-08-16 09:06:32</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT Phase 28 PASSED: 86/86 unit + e2e stable, re-run independently. Added an objective .table-surface width measurement (582->922px) covering the 'used by content, not padding' AC that Neo's 4 checkpoints alone missed. Real non-blocking finding: 2-player seats sit vertically, don't spread horizontally yet (pre-existing, out of scope). Passed Smith's continuous-resize sweep too. Details: agents/trin.docs/state.md. @Morpheus *lead review phase-28

---
[<small>2026-08-16 09:07:25</small>] [**Morpheus**]->[**Oracle**] *lead handoff*:
 Code review Phase 28: approved, no changes requested. style.css matches D20 exactly, zero src/*.js touched (D20's 'pure CSS' claim held through implementation, not just design). One non-blocking nit noted for Neo (2 near-duplicate test helpers, not worth a fix cycle). Sprint 5 is now fully implemented, tested, reviewed - 1 phase, no bug-fix phase needed. @Oracle *ora groom

---
[<small>2026-08-16 09:09:07</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 5 groom complete: DECISIONS.md +1 (D20), lessons.md +2 (AC-coverage-gap-in-UAT, Fast-Track validated first use), memory.md updated. CHAT.md at 24 msgs, no archive needed. README checked, no update needed (density limitation still accurate, CSS fix doesn't warrant a features bullet). @Smith please run Stage-3 end-to-end test on Sprint 5 plus a general regression sanity pass.

---
[<small>2026-08-16 09:11:08</small>] [**Smith**]->[**all**] *user approve*:
 *user approve. Sprint 5 close-out: actually ran the app, screenshotted the live table at 760/1024/1300/1920px + host form at 1920px. Real visible win confirmed: hand row's 7th card was cut off at 760px, fits clean at 1024+. Cap at 1300 holds visually (1920px screenshot nearly identical to 1300px, not stretched). My own Gate-1 amendment held (host form stays narrow at 1920px). Independently re-confirmed Trin's 2-player vertical-seat finding by eye - matches, non-blocking. No bugs. @all *sprint retro

---
[<small>2026-08-16 09:11:14</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: TDD-first on a pure-CSS change worked cleanly - writing the width assertions before touching style.css caught the exact right thing (760px where 1100 was expected) with zero ambiguity about what 'done' meant. Confirmed-not-guessed that seating.js needed zero changes, by reading it first rather than assuming JS would need to catch up to a wider container.

---
[<small>2026-08-16 09:11:20</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: passing tests aren't the gate, AC coverage is - Neo's 4 checkpoints all passed but missed the 'used by content not padding' AC bullet entirely until I checked line by line. Backlog: make 'does every AC bullet have a corresponding assertion' an explicit UAT checklist step, not just 'do the handed-off tests pass.'

---
[<small>2026-08-16 09:11:25</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: reading seating.js before writing D20 turned a 'probably just CSS' guess into a provable zero-JS-change decision - confirmed exactly right in code review, nothing drifted. First real Fast-Track (1-phase) sprint: the gate structure didn't need padding out to multiple phases to work, validating a guideline that had sat unused since Sprint 1.

---
[<small>2026-08-16 09:11:31</small>] [**Oracle**]->[**Cypher**] *retro*:
 Oracle retro: DECISIONS.md/lessons.md/memory.md all got their entries in the same groom pass immediately after code review, not deferred - the continuous-groom discipline (Sprint 4's broken-streak item) held again, second sprint running. First groom for a 1-phase sprint - confirms the groom template scales down fine, no wasted ceremony.

---
[<small>2026-08-16 09:11:41</small>] [**Mouse**]->[**Cypher**] *retro*:
 Mouse retro: single-phase planning (Phase 28) for a genuinely single-story sprint kept coordination overhead near zero - no phase-splitting decision to make, no multi-phase sequencing risk. Confirms the Fast-Track guideline is worth reaching for by default when Cypher flags a story as CSS-only/no-new-state, not just as a theoretical option.

---
[<small>2026-08-16 09:11:46</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: this sprint's close-out was genuinely quick to verify because the AC itself was concrete and measurable (specific breakpoints, specific bound) rather than a vague 'improve the UX' ask - worth noting as a Gate 1 quality signal: stories with numeric, falsifiable AC are cheaper to close out honestly than ones needing subjective judgment calls.

---
[<small>2026-08-16 09:12:02</small>] [**Cypher**]->[**Cypher**] *retro*:
 Cypher retro: Trin's AC-coverage-not-just-passing-tests catch is this sprint's most reusable lesson, added to backlog as a standing UAT checklist item. Fast-Track (1-phase) process validated end-to-end for the first time since Sprint 1. Full backlog in cypher.docs/state.md.

---
[<small>2026-08-16 09:12:08</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-5. 'Desktop table width' complete: the game table now widens on laptop/desktop browsers (760px->1100px at 1024px, ->1300px at 1440px+, deliberately bounded not unconstrained), your hand of cards no longer gets cut off needing a scroll at desktop widths. Host/join forms unaffected. Zero JS changes - pure CSS, first Fast-Track (single-phase) sprint. All gates passed, no bugs found. Sprint complete.

---
[<small>2026-08-16 09:19:05</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 6 ('snap-to stack/overlap'): drafted US-32 (stack, tight pile for sets) + US-33 (overlap/fan for runs) - user confirmed two explicit discrete modes via clarifying Q. Grounded in code first: MOVE_CARD currently always-appends/no-ops same-zone, no reordering exists today. PRD Feasibility Flag 6 added for Morpheus. Flagged the exact drop-region split as Smith's call, not prescribed. @Smith *user review US-32 US-33

---
[<small>2026-08-16 09:24:30</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 6 scope grew mid-flight: added US-34/35/36 (deck ops - Draw regrouped, new host-only Shuffle, new host-only Split into N piles for solitaire per user correction). PRD Feasibility Flag 7 added, both new actions proposed as thin reuses of shuffle()/makeZone()/dealCards(). Split's exact semantics (round-robin, even piles) stated as an assumption not silently decided - user declined to pick between 2 options and asked to proceed with assumptions flagged. @Smith *user review US-34 US-35 US-36

---
[<small>2026-08-16 09:25:46</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve. Full US-32..36 Gate 1 cleared. Key amendment: reversed US-34 after checking real layout - Draw stays put (highest-frequency action), only new Split/Shuffle go near the deck. Proposed concrete US-32/33 drop-region mechanism (on-card=stack, beside=overlap, reuses zone-drag-over highlight). No confirm on Shuffle, reuse deal-more-count input pattern for pile count, cap+guard it since zones can't be deleted. Details: agents/smith.docs/state.md. @Morpheus *lead arch sprint

---
[<small>2026-08-16 09:28:34</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D21/D22 in docs/ARCHITECTURE.md. Corrected both of Cypher's proposals after reading the real code: layout enum ('stack'|'overlap') not a boolean (matches Smith's 2-mode Gate 1 decision), PLAY/MOVE_CARD get optional beforeCardId+layout via one shared insertCard() helper, same-zone no-op deleted. SPLIT_DECK gets its own small loop - dealCards()'s fixed-count contract doesn't actually fit an exhaust-the-deck operation. No privacy/protocol changes needed either sprint. @Smith *user feedback D21 D22

---
[<small>2026-08-16 09:32:39</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve. D21/D22/D23 all approved. Caught a real bug in D21's draft (not just UX nit): before-side overlap drops need the LAYOUT WRITE on the pre-existing target card, not the dropped card, or the wrong pair visually overlaps - corrected to one direction-agnostic rule. D23 (user-directed Pile unification) reviewed for UX: viewFor's output shape is explicitly unchanged, zero observable behavior change, approved on that explicit guarantee. @Mouse *sm plan sprint

---
[<small>2026-08-16 09:33:44</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 6 planned: 6 phases (29-34). Phase 29 (Pile unification, D23) is the foundation, must pass full regression before Phase 30+ build the layout/insertCard state layer on top. T30.2 explicitly names a dedicated regression test for the before-side-overlap direction bug Smith caught. Reserved bug-fix phase included proactively. @Morpheus *lead review sprint plan

---
[<small>2026-08-16 09:34:03</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved, no changes. Phases 29-34 correctly sequence D23 (Pile unification) first, before D21/D22 feature work builds on top. @Neo *swe impl phase-29

---
[<small>2026-08-16 09:42:06</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 29 (Pile unification) impl done. 86/86 unit + full e2e green, zero changes to ui.js/main.js/protocol.js (grep-verified). Two findings raised, not absorbed: (1) T29.2's 'all tests pass unmodified' premise was impossible for a storage refactor - corrected to 'every viewFor assertion unmodified', which did hold; (2) deviated from D23's per-card {owner,faceUp}, deriving visibility from pile.kind instead - needs Morpheus's ruling. Details: agents/neo.docs/state.md. @Trin *qa uat phase-29

---
[<small>2026-08-16 09:43:56</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT Phase 29 PASSED: 91/91 (added 5 tests) + e2e green. Added coverage for failure modes the piles array newly enables (deck leaking into zones, hand leaking by id, an unrouted pile kind vanishing), then mutation-tested each to prove they fail on purpose. REAL FINDING: the fresh-flag mutation failed exactly 1 test - the one I just wrote. The DEAL/DEAL_MORE merge had ZERO coverage distinguishing reset-vs-append; a one-char slip would have shipped green. Now covered. @Morpheus *lead review phase-29

---
[<small>2026-08-16 09:46:02</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Code review Phase 29: APPROVED. Ruled on Neo's D23 deviation - ACCEPTED, decisive reason is the data clump (a hand card's owner would permanently duplicate its pile's ownerId; two places, one fact - the drift risk D17 avoided). Also found a forward landmine and made it a binding invariant: deckOf() is unguarded, so SPLIT_DECK must NOT drop the deck pile when splitting or Phase 32 breaks DRAW/DEAL opaquely. @Neo *swe impl phase-30

---
[<small>2026-08-16 09:48:59</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 30 (position-aware PLAY\/MOVE_CARD + layout) impl done, TDD: 10 tests written first, confirmed red, then implemented. 101\/101 + e2e green. Two flags: (1) D21's documented beforeCardId+layout params CANNOT express D21's own Gate-2 rule - needed targetCardId+side; minimal change, needs Morpheus ruling. (2) Real intermediate behavior change: dropping a card on its own zone was a no-op, now moves it to the end - Phase 31 makes it deliberate. @Trin *qa uat phase-30

---
[<small>2026-08-16 09:49:39</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT Phase 30 PASSED: 101/101 + e2e. Mutation-verified the direction rule - injecting Smith's exact predicted bug (layout on the dropped card for a before-side drop) fails precisely the one test written for it. Restoring the same-zone no-op fails 7. Confirmed Neo's flagged intermediate behavior change is real but not a defect. @Morpheus *lead review phase-30

---
[<small>2026-08-16 09:50:20</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Code review Phase 30: APPROVED, D21 amended. Ruled Neo's flag correct - this was a real inconsistency in my own decision (beforeCardId provably cannot express Smith's Gate 2 rule, since 'before T' and 'after T-1' are the same insertion point but need layout on different cards). Second implementation-stage catch of an architecture-stage defect this sprint - flagged for retro. @Neo *swe impl phase-31

---
[<small>2026-08-16 09:59:50</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 31 (stack/overlap UI) impl done: new pure src/dropTarget.js + 8 tests, ui.js hit-testing + live drop hints, CSS. 109/109 + e2e green incl. 2 real-DragEvent checks proving layout round-trips over WebRTC. Two findings: (1) a callback arity bug in main.js silently swallowed the placement arg - all unit tests passed while the feature did nothing, only caught by running it; (2) zone caps (13rem/9rem) limit laying out runs - needs a Morpheus/Smith call. @Trin *qa uat phase-31

---
[<small>2026-08-16 10:21:27</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 32 (zone room, D24) impl done: pot 13rem->24rem wide, seat zones 9rem->12rem, surface taller, pot centred - all >=1024px only. KEY FINDING: the required guard test failed BEFORE any change - measured the committed baseline and both personal zones already overlap the pot at every width today. Pre-existing bug, now fixed on desktop. Also corrected 2 wrong premises in my own D24 (pot wasn't centred; clearance is height-bound, not width). @Trin *qa uat phase-31 phase-32

---
[<small>2026-08-16 10:29:43</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 UAT phases 31+32 PASSED, Morpheus review APPROVED. All three new guards mutation-verified. Notable: removing D24's centring makes the e2e fail as a CLICK TIMEOUT - independently reproducing the exact click-through symptom the original 13rem cap comment describes, confirming that cap had stopped delivering it once the table grew. @Neo *swe impl phase-33

---
[<small>2026-08-16 10:36:53</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 33 (Shuffle/Split) impl done, TDD. 116/116 + e2e green. THREE bugs found by running it, not by tests: (1) .btn-row[hidden] didn't hide - class display:flex outranks the UA [hidden] rule, so host-only deck controls were VISIBLE TO GUESTS; (2) redactMiddleCard dropped , so every face-down pile rendered un-stacked - affected US-32/33 too; (3) piles now reuse D21 stack layout. Finding: only ~2 zones fit the pot, so 'split into 4 and see 4' doesn't hold. @Trin *qa uat phase-33

---
[<small>2026-08-16 10:37:45</small>] [**Morpheus**]->[**Oracle**] *lead handoff*:
 UAT Phase 33 PASSED + Morpheus review APPROVED. Mutation-verified the redaction change hardest (leaking the full card fails 4 tests) since it touches the one function the privacy model rests on. D24's deck-pile invariant paid off - removing the pile fails exactly its guard. Phase 34 (e2e) closed: coverage landed with each phase rather than deferred. Pile-density accepted as a design item for Smith at close-out. @Oracle *ora groom

---
[<small>2026-08-20 10:49:48</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 7: drafted US-37 (host-only localStorage save). Checked session.js first - the CRUX: host peer id is self-generated (reclaimable) but guests get new Peer() each time, and hands are keyed by that id. So restored hands belong to nobody. Rejected name-matching as unsafe (a live Sprint 6 table had TWO players named Drew - that's mis-assigned hole cards, not an edge case). Proposing: restore table+scores, drop hands. @Smith *user review US-37

---
[<small>2026-08-20 10:50:16</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve. US-37 approved w/ 4 amendments: (1) the restore prompt must state that hands are lost BEFORE the click - the save is consumed, so undisclosed cost is unrecoverable; (2) show the save's age, don't pick a silent expiry; (3) say players must rejoin, and land on the share-code screen not an empty table; (4) declining must not destroy the save on a mis-click. Option 1 (table not hands) is right - name-matching would mis-assign hole cards. @Morpheus *lead arch sprint

---
[<small>2026-08-20 10:50:44</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D26 recorded. Key call: hands are stripped AT SAVE TIME, not restore time - so the blob never contains anyone's private cards (a shared browser profile can't leak a hand) and no code path exists that could mis-assign one. Snapshot is versioned; bad/stale/wrong-version = discard + message, never half-restore. Host re-requests its own table code so guests rejoin with the code they already have. New pure src/persistence.js over an injectable storage object. @Smith *user feedback D26

---
[<small>2026-08-20 10:51:05</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D26, with 1 correction + 1 addition. Correction: since hands are stripped at SAVE time, the prompt must say hands 'weren't saved', not 'can't be restored' - the latter implies we have the data and are declining to use it. Addition: the claim 'nothing private is on disk' is overstated - the snapshot keeps the deck's full remaining ORDER, which is as game-breaking as a hand. Fine (host's own machine, already in memory there) but must be stated, not implicit. @Mouse *sm plan sprint

---
[<small>2026-08-20 10:51:24</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 7 planned: 2 phases. 36 = pure persistence module + tests (strips hands at save, versioned, fails safe). 37 = host wiring, debounced save, restore prompt with Smith's required wording, code re-request + e2e. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 10:51:25</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 2 phases, boundary is clean (pure module then wiring), matches D26. @Neo *swe impl phase-36

---
[<small>2026-08-20 10:53:02</small>] [**Trin**]->[**Neo**] *qa handoff*:
 UAT Phase 36 PASSED: 135/135, mutation-verified all three load-bearing behaviours (un-stripping hands, accepting any version, letting storage errors escape - each fails exactly one test). The hand-stripping test asserts on the serialized JSON string rather than the parsed object, which is the right level: the claim is about what lands on disk. @Morpheus review; @Neo *swe impl phase-37

---
[<small>2026-08-20 11:00:32</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 7 groom done: D26 in ARCHITECTURE.md, 4 lessons in lessons.md (key one: check what data is KEYED BY before promising to restore it - this was an identity problem wearing a storage costume). 135 unit + e2e green, lint clean. @Smith *user test sprint-7

---
[<small>2026-08-20 11:00:50</small>] [**Smith**]->[**all**] *user approve*:
 *user approve. Sprint 7 close-out passed. Verified the two claims that matter by reading the actual persisted blob, not the UI: hand card ids are absent from localStorage during play, and a real host reload restored 7 zones with zero hand piles. Prompt wording carries all 4 Gate-1 amendments (cost stated up front, age shown, rejoin explained, decline preserves the save). @all *sprint retro

---
[<small>2026-08-20 11:00:50</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: the extract-a-shared-function refactor mid-phase (wireHostSession) over-captured and swallowed unrelated handlers - node --check caught it immediately, but only because I ran it. Backlog: run a syntax check right after any mechanical extraction, before moving on. Also: reusing D23's single piles array made the snapshot a one-liner instead of a hand-maintained serializer.

---
[<small>2026-08-20 11:00:50</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: mutation testing keeps paying - all 3 persistence mutations failed exactly one test each, so the suite is precise not just green. The strongest test this sprint asserts on the serialized JSON STRING rather than the parsed object, because the claim ('private data never lands on disk') is about the bytes, not the shape. Worth reaching for whenever a test is about a boundary rather than a value.

---
[<small>2026-08-20 11:01:06</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D26's 'strip at write time, not read time' is the reusable shape - it removes a whole class of future bug by making the bad data absent rather than ignored. Also note D23 (Pile unification) paid off again unprompted: persistence was one filter on one array. Third sprint running where an earlier generalization absorbed a later requirement for free.

---
[<small>2026-08-20 11:01:06</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: Gate 2 caught that 'nothing private is saved' was overstated (the deck's full order IS saved). Implicit qualifications on a privacy claim are how those claims quietly become false. Backlog: add 'what does this security-flavoured claim NOT cover' as a standing Gate 2 question, same tier as touch-targets and info-duplication.

---
[<small>2026-08-20 11:01:06</small>] [**Mouse**]->[**Cypher**] *retro*:
 Mouse retro: 2 phases was right-sized - the pure/wiring split meant the risky identity design was settled in Phase 36 with fast unit tests before any DOM was involved. Oracle retro: 4 lessons recorded at close, continuous-groom held for a 3rd sprint.

---
[<small>2026-08-20 11:01:06</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-7. Host-only save/restore shipped: your table, piles and scores now survive a browser refresh, and the host re-claims its own table code so players rejoin with the code they already have. Hands are deliberately never written to disk - they can't be safely re-assigned, and this way they can't leak either. 135 unit + e2e green, lint clean. Sprint complete.

---
[<small>2026-08-20 11:11:22</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-8. Stable player identity shipped, per the user's own design: the host issues a UUID on connect, both ends store it, and a reconnecting client presents it to get its seat and hand back. Verified by a real guest refresh mid-game - same card ids, same seat, roster stays at 2. This closes the reconnect-after-refresh backlog item open since Sprint 1. Host-reload hand recovery still needs hands persisted (D26) - deliberate follow-on. 142 unit + e2e green, lint clean.

---
[<small>2026-08-20 11:54:04</small>] [**Mouse**]->[**all**] *sm status*:
 Shutdown prep: 147 unit + full e2e green, stylelint clean, no stray temp files. State saved to neo.docs (incl. the 7 traps hit today so they aren't re-learned). Sprints 7+8 shipped (host save/restore, stable playerKey identity - closes the Sprint-1 reconnect item), plus D25 pile actions and the landing Resume/Host/Join + always-visible table code. Open: hands still not persisted (now safe to do), mobile touch gap, pile density. 37 files changed and UNCOMMITTED.

---
[<small>2026-08-20 12:02:06</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 9: drafted US-40 (touch parity). Checked ui.js first - it moves cards with NATIVE HTML5 DnD (draggable/dataTransfer), which never fires on touch. So drag-to-play, hand reorder, stack, overlap AND the live drag ghost are ALL dead on phones - the PRD's primary device. Six sprints of drag work, invisible on mobile. One open call for you: drag on finger-down, on press-and-hold, or on horizontal-intent? @Smith *user review US-40

---
[<small>2026-08-20 12:03:10</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-40 w/ 6 amendments. Your preferred option is wrong here and the CSS says so: #hand-area is overflow-x:auto (hand SCROLLS horizontally) and reorder is ALSO horizontal; playing is vertical while #table-area is overflow-y:auto. No free axis in either region, so direction-intent disambiguates nothing. Answer is press-and-hold - ui.js ALREADY binds pointerdown/up for the D13 lift cue and calls it that. Extend that vocabulary, don't add a rival one. @Morpheus *lead arch sprint

---
[<small>2026-08-20 12:04:44</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D28 recorded. Key call: NOT a second drop implementation. The native drop bodies get extracted to performZoneDrop/performHandReorder FIRST (pure refactor, green before touch exists), then touch calls those same functions - two placement paths would drift and only mouse is e2e-covered. Recognizer is pure src/touchDrag.js: 250ms hold + 8px slop, so a scroll can never become a drag. Ghost is a clone, not the moved element. @Smith *user feedback D28

---
[<small>2026-08-20 12:05:22</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D28 w/ 3 corrections. The big one: ui.js binds the D13 lift cue to raw pointerdown, so it fires the instant a finger lands - but D28 puts LOCAL confirmation 250ms later. Everyone else sees me holding a card before I do, and a finger brushing a card while SCROLLING broadcasts a phantom lift to the whole table. Move the cue onto the recognizer's lift. Also: offset the ghost ABOVE the finger, or the hand covers the drop hint. @Mouse *sm plan sprint

---
[<small>2026-08-20 12:05:51</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 9 planned: 4 phases. 41 = the extraction refactor ALONE, green before any touch code exists - D28's whole no-drift argument dies if it lands in the same phase as its first caller. 42 = pure recognizer + tests. 43 = DOM binder, ghost, and Smith's lift-cue move. 44 = real hasTouch e2e + the hint. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 12:05:57</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 4 phases, and the boundary that matters is right: Phase 41 is a pure refactor with an existing green suite as its whole proof, so if it changes behaviour we find out with zero touch code in the way. 42 before 43 keeps the gesture rules provable without a DOM. @Neo *swe impl phase-41

---
[<small>2026-08-20 12:07:09</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 41 impl done: pure extraction. performHandReorder + showZoneDragOver/clearZoneDragOver/performZoneDrop now hold every drop body; the native listeners are 3-liners that just unwrap dataTransfer and clientX/Y into them. No touch code yet, by design. 147/147 unit + full e2e green - and the e2e is the whole proof here, since ui.js has no unit tests, so a behaviour change would have shown up as a failing drag/stack/overlap case. @Trin *qa uat phase-41

---
[<small>2026-08-20 12:08:44</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT Phase 41 PASSED, but the claim needed fixing first. 'The e2e is the whole proof' was only half true: performHandReorder was extracted with NOTHING covering it - the sort-persistence test exercises the sort BUTTONS, not a drag, despite its own comment saying '(or dragged)'. An untested function was about to gain a second caller in Phase 43. Added a real drag-reorder e2e case and mutation-verified it (append instead of insertBefore fails it). @Morpheus review phase-41

---
[<small>2026-08-20 12:09:00</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 41 review APPROVED. The listeners are now pure adapters - unwrap dataTransfer/clientXY, call the function - which is exactly the shape that makes a second input source cheap. Trin's finding is the more important half: an extraction is only 'behaviour-preserving' to the extent something observes the behaviour, and one of the two functions had no observer at all. Coverage now precedes the second caller rather than trailing it. @Neo *swe impl phase-42

---
[<small>2026-08-20 12:10:29</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 42 done, TDD. src/touchDrag.js is a pure reducer - step(state, sample) -> {state, events} - so the gesture rules are provable without a DOM or a real clock. 159/159. Two rules needed deciding in code, not prose: slop is measured from the ORIGIN (five 3px steps are a scroll, not a hold), and time is checked BEFORE distance once holdMs has elapsed, or a legitimate drag whose first sample arrives late and far gets cancelled. @Trin *qa uat phase-42

---
[<small>2026-08-20 12:11:22</small>] [**Trin**]->[**Neo**] *qa reject*:
 UAT phase 42 FAILED - one surviving mutation. You told chat the time-before-distance ordering was load-bearing ('a drag whose first sample arrives late and far gets cancelled'), but swapping the two checks keeps all 12 tests green. A claimed-important rule with nothing holding it in place is exactly what drifts later. The origin-vs-previous-sample rule IS covered (verified - a real previous-sample mutation fails that test). @Neo *swe fix add the late-and-far case

---
[<small>2026-08-20 12:11:47</small>] [**Neo**]->[**Trin**] *swe fix*:
 Fixed. Added the late-and-far case: a first move at 290ms already 120px out must still lift, because coalesced pointer samples on a busy main thread make that a normal drag, not a scroll. Swapping the checks now fails it. Your point stands - I'd argued the ordering in a comment and in chat but left nothing enforcing it, and an intermittent silent drag-cancel is the worst version of that bug to ship. 160/160. @Trin re-verify phase-42

---
[<small>2026-08-20 12:11:47</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 42 PASSED on re-verify. All 4 mutations now die: origin-vs-previous-sample, phantom lift from a stray tick, cancel-before-lift, and the newly-covered time-before-distance ordering. 13 recognizer tests, 160/160 overall. Worth noting the suite proves the SCROLL rule as hard as the drag rule - 'a scroll can never become a drag' asserts an empty event list, not just a phase. @Morpheus *lead review phase-42

---
[<small>2026-08-20 12:11:53</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 42 review APPROVED. The reducer shape (state, sample) -> {state, events} is right: it makes the timer an input rather than a dependency, which is why 13 gesture tests run in 100ms with no fake clock. One thing to carry into 43 - the module owns WHEN a drag exists and nothing else; capture, elementFromPoint and the ghost stay in ui.js. If a hit-test ever leaks in here it stops being testable. @Neo *swe impl phase-43

---
[<small>2026-08-20 12:14:58</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 43 done. 160/160 + full mouse e2e green, stylelint clean. Two traps found by writing it, not by design: (1) touch-action is resolved when the touch STARTS, so flipping it to none at lift does nothing for the gesture in flight - had to cancel touchmove non-passively instead; (2) the lift-pop animated transform, which the ghost also writes inline every move - animation outranks inline style, so the ghost would snap to origin for 120ms. Animating scale composes instead. @Trin *qa uat phase-43

---
[<small>2026-08-20 12:16:39</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 43 PASSED - and this is the first time the binder has ever been RUN. Drove real CDP touch events in a 390px hasTouch context: hold 400ms -> ghost appears; drag -> zone highlights; release -> card plays; ghost cleaned up. Then the half that matters as much: a 5-step swipe across a card produced NO ghost, none after 400ms either (the stale-timer guard holds in the DOM, not just in the unit test), and left hand order untouched. @Morpheus *lead review phase-43

---
[<small>2026-08-20 12:17:24</small>] [**Morpheus**]->[**Neo**] *lead reject*:
 Phase 43 review FAILED - one real defect. Every state broadcast rebuilds the cards, and a broadcast during a hold is routine (any other player drawing causes one), so the source element gets detached while the 250ms timer is still armed. We're relying on pointercancel firing on removal-during-capture; if it doesn't, the tick lifts a DETACHED element - zero-size rect, ghost appended to body, and nothing left to clean it up. Guard the lift on isConnected. @Neo *swe fix

---
[<small>2026-08-20 12:18:09</small>] [**Neo**]->[**Morpheus**] *swe fix*:
 Fixed: lift bails if !sourceEl.isConnected, and move/drop/cancel each no-op when there's no ghost in flight (the refused lift would otherwise leave state=='dragging' and the next move would deref a null ghost - the guard created that path, so it needed closing in the same change). Verified live: wiped #hand-area mid-hold, let the timer fire, 0 stranded ghosts. Normal hold-drag-drop still green. @Morpheus re-review phase-43

---
[<small>2026-08-20 12:18:09</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Phase 43 re-review APPROVED. The fix is right and so is the reasoning about it: adding the isConnected guard CREATED the null-ghost path (a refused lift leaves the recogniser in 'dragging'), and catching that in the same change rather than as a later crash report is the difference between a guard and a new bug. Note for the record - the ui.js/touchDrag.js split held: this whole defect lived entirely in the binder, and not one gesture rule moved. @Neo *swe impl phase-44

---
[<small>2026-08-20 12:25:04</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Phase 44 done. Real hasTouch context + CDP touch events: swipe-scrolls-not-drags asserted BEFORE the drag cases (a build that dragged on every touch would still pass the drag ones), then hold-drag plays a card and reaches the other client. 160 unit + full e2e green, lint clean. FOUND EN ROUTE: a 3rd player makes a seat zone overlap the pot at 1024px - real geometry defect, not a test artifact. Backing it out of the test, not hiding it. @Trin *qa uat phase-44

---
[<small>2026-08-20 12:26:02</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT phase 44 PASSED. Mutation-verified the e2e itself, not just the code: HOLD_MS=0 fails the swipe case ('ghosts during=1'), and unbinding touch from hand cards fails the drag case ('got 0'). So the suite proves BOTH halves - that a hold drags and that a swipe doesn't. Neo's 3-player overlap find is real and I'd have filed it too; it belongs to D24's geometry, which has only ever been measured at 2 seats. @Morpheus *lead review phase-44

---
[<small>2026-08-20 12:26:10</small>] [**Morpheus**]->[**Oracle**] *lead handoff*:
 Phase 44 review APPROVED - all phases done. Making the GUEST context touch-capable instead of adding a third browser was the right call and worth recording: a third player is never removed from state, so it would have permanently reshaped the seat ring every later geometry assertion measures. The test would have been buying touch coverage with the D24 checks. @Oracle *ora groom

---
[<small>2026-08-20 12:27:29</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 9 groom done. D28 + Smith's Gate 2 corrections in ARCHITECTURE.md, 9 lessons in lessons.md. Two groom FINDINGS fixed, not just noted: README still advertised 'No reconnect' and 'No persistence' two sprints after both shipped, and US-38/39 existed only in CHAT.md and task.md - never written as stories, so nothing reviewable survived Sprint 8. Backfilled both. 3-player overlap logged as an open item. 160 unit + e2e green, lint clean. @Smith *user test sprint-9

---
[<small>2026-08-20 12:31:13</small>] [**Smith**]->[**Trin**] *user bug*:
 *user bug CMD: hold-drag a card on a 390px phone | EXPECTED: ghost floats ABOVE the finger (my Gate 2 #2) | ACTUAL: it sits 38px BELOW - the hand covers the card AND the drop hint. UX ISSUE: this is the one correction I made for touch specifically, and the code reads as if it complies (y - height - 28). Root cause measured, not guessed: the  property composes OUTSIDE , so the translate is itself multiplied by 1.12. @Trin triage

---
[<small>2026-08-20 12:31:21</small>] [**Trin**]->[**Neo**] *qa reject*:
 Triaged, confirmed, and it is a hole in MY suite as much as the code. The e2e asserts the ghost EXISTS and is CLEARED - never where it is. Smith's measurement: with transform:none the ghost sits at top -4px (correct), with the translate applied it lands 62px low, exactly the 1.12 amplification. Reproduced. Fix must be positional, not a fudge factor, and I want an assertion on the ghost/finger relationship. @Neo *swe fix ghost offset

---
[<small>2026-08-20 12:32:59</small>] [**Neo**]->[**Trin**] *swe fix*:
 Fixed. Ghost now positions with left/top instead of a transform translate - the scale property composes OUTSIDE transform, so the translate was itself multiplied by 1.12 and the ghost drifted further from the finger the further it travelled. left/top don't participate in that composition, so the pop animation and the positioning have nothing left to argue about. Now 24px clear above the finger. Trin's assertion added and mutation-verified. @Trin re-test

---
[<small>2026-08-20 12:33:00</small>] [**Trin**]->[**Smith**] *qa handoff*:
 Re-test PASSED. Two new e2e assertions, both mutation-verified: ghost position (putting it back at the finger fails with 'ghost bottom=685, finger y=601') and touch hand-reorder, which had NO automated proof - it's performHandReorder, a different path from the zone drop, so case 2 passing said nothing about it. That's the second time this sprint a Smith AC bullet turned out to have no observer. 160 unit + e2e green. @Smith re-test sprint-9

---
[<small>2026-08-20 12:33:07</small>] [**Smith**]->[**all**] *user approve*:
 *user approve. Sprint 9 close-out passed on re-test. Verified on a real 390px phone client, by measurement not by reading the diff: ghost floats 24px clear ABOVE the finger, hand reorder and zone-to-zone both work with a finger, the hint is visible only on touch, and a swipe broadcasts NO lift cue to the other player - all five of my Gate corrections are in the shipped behaviour. Tap-to-play and Move-to are untouched. @all *sprint retro

---
[<small>2026-08-20 12:33:16</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: two bugs this sprint were the SAME bug wearing different clothes - a CSS animation on transform outranking my inline transform, and the scale property multiplying my transform translate. Both are 'two ways to move an element are not interchangeable'. Backlog: when an element is positioned by JS, position it with left/top and leave transform to CSS - don't share the property.

---
[<small>2026-08-20 12:33:17</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: TWICE this sprint a function shipped with no observer - performHandReorder at the extraction, then again for touch. Both times the surrounding tests looked like coverage (a sort test with a comment claiming it covered dragging; a ghost test asserting existence but never position). Backlog: when an AC bullet names a distinct code path, it needs its own assertion - adjacency is not coverage.

---
[<small>2026-08-20 12:33:27</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D28's 'extract before the second caller' was the highest-value decision and cost one phase. Every later defect landed in the binder and not one gesture rule moved, which is the pure/impure split paying rent. Worth revisiting: the D24 seat geometry has only ever been measured at 2 seats and demonstrably breaks at 3 - that's an architecture gap, not a polish item.

---
[<small>2026-08-20 12:33:27</small>] [**Oracle**]->[**Cypher**] *retro*:
 Oracle retro: groom found the README advertising 'No reconnect' and 'No persistence' TWO sprints after both shipped, and US-38/39 existing only in CHAT.md. Both are the same failure - a fast sprint updates code and chat but not the artifacts a newcomer reads. Backlog: make 'what did a user-facing doc claim before this sprint' a standing groom question, not an occasional one. 9 lessons recorded.

---
[<small>2026-08-20 12:33:36</small>] [**Mouse**]->[**Cypher**] *retro*:
 Mouse retro: 4 phases, 3 fix loops (Trin on 42, Morpheus on 43, Smith on close) - all three caught something real and none restarted the sprint. Phase 41 existing purely to be a refactor felt like overhead when I planned it and was the best-spent phase of the sprint. Velocity note: e2e is now ~3min a run and we ran it 12+ times; that cost is starting to be felt.

---
[<small>2026-08-20 12:33:36</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: the gap this sprint closed was invisible for SIX sprints because every test ran on the developer's input device. My Gate 2 amendment that mattered most wasn't a design opinion - it was requiring hasTouch, because a mouse emits pointer events too. Backlog: add 'what device/input was this actually verified on' as a standing Gate 2 question, same tier as touch-targets and the privacy-claim question from Sprint 7.

---
[<small>2026-08-20 12:33:43</small>] [**Cypher**]->[**all**] *retro*:
 Cypher retro: my proposed gesture rule (drag once the finger commits to an axis) was wrong, and Smith disproved it from two overflow declarations I hadn't read. I checked session.js before writing the Sprint 7 story and got that one right; I skipped the equivalent check here. Backlog captured: 3-player 1024px overlap, D24 geometry review, multi-touch, and the four standing-question items from the retro.

