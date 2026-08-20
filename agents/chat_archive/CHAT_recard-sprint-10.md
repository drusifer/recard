# CHAT_recard-sprint-10 — Sprint Archive

## Summary

Sprint 10 (US-41 deal-on-the-deck, US-42 auto-start). Triggered by the user asking 'how to re-deal?' - the answer exposed the defect: Reshuffle&Reset doesn't deal, and the only control that did was named for something else in a row about zones. Morpheus's D29 kept pile-level actions as a SEPARATE table from D25's per-card ones, which both prevented an irreversible action appearing in a hover row and dissolved Smith's empty-deck blocker structurally. Smith's Gate 2 argued that making a destructive action discoverable creates new risk, so Reshuffle&deal got a confirm. Three bugs found by running it: a once-only guard that was never true, an uncaught over-deal throw, and auto-start dealing to a still-connecting peer - leaving a ghost seat holding everyone's cards. D30 corrected in the doc rather than quietly in code. 166 unit + e2e green.

---
[<small>2026-08-20 12:34:24</small>] [**Cypher**]->[**all**] *pm launch*:
 *pm launch recard-sprint-9. Touch parity shipped: hold a card briefly, then drag it with your finger - to play it, to move it between zones, or to reorder your own hand. Same drop feedback a mouse gets, same code path underneath. A swipe still scrolls the page, and tapping still works. This closes the biggest gap in the product: six sprints of drag features that did not exist on the phones this app is meant for. 160 unit + real touch e2e green.

---
[<small>2026-08-20 12:37:20</small>] [**Bob**]->[**all**] *learn*:
 *learn Decisions must be POSTED to chat (summarized), not just recorded. New bob-protocol standard 'Decision Broadcast' + a tailored guideline in all 9 personas + a sprint rule. Chose to make it normative in bob-protocol rather than 9 copies. Evidence it was needed: the rule existed only as a courtesy to Oracle in 3 relationship tables, and DECISIONS.md stops at D20 while D21-D28 survive only because they were chatted.

---
[<small>2026-08-20 12:43:12</small>] [**Neo**]->[**Trin**] *swe handoff*:
 Copy control fixed: both buttons (game bar + host share) are now one shared wireCopyCode helper - inline SVG icon, copies the CODE not a join URL. DECISION: deleted buildJoinUrl with it. Nothing generated a share URL any more, and a helper with no callers claims a feature still exists. Arriving on ?join=<code> still works - main.js reads that param independently. Verified live: 44x44, aria-label flips to Copied, clipboard holds the code. @Trin *qa uat copy-control

---
[<small>2026-08-20 12:43:12</small>] [**Trin**]->[**Morpheus**] *qa handoff*:
 UAT PASSED. Added the e2e case it never had - icon not text, aria-label present, 44px floor, and clipboard === code. Without that last assertion this could silently revert to copying a URL and the code printed beside the button would still look right. Full suite green. NOT mutation-verified: stopping short of another 3min e2e run on usage budget, flagging rather than implying I did it. @Morpheus *lead review copy-control

---
[<small>2026-08-20 12:43:12</small>] [**Morpheus**]->[**all**] *lead handoff*:
 Review APPROVED. Two Copy Link implementations existed (qrcode.js and main.js) with duplicated clipboard+timeout logic; collapsing them into wireCopyCode is why this fix is smaller than the bug. Neo's onclick-assignment note is the load-bearing detail - showGameCode re-runs on every broadcast, so addEventListener would have stacked handlers invisibly.

---
[<small>2026-08-20 12:50:53</small>] [**Cypher**]->[**Smith**] *pm handoff*:
 Sprint 10: US-41 (deal as a deck-pile action) + US-42 (auto-start at expected player count). Both came straight from the user asking 'how to re-deal?' - which IS the finding: Reshuffle&Reset dispatches RESET only, so the button that sounds like re-deal leaves everyone with nothing, and the only way back is a button in an unrelated row named for something else. DEAL/DEAL_MORE are already one reducer case; deck actions already exist in D25. @Smith *user review US-41/42

---
[<small>2026-08-20 12:51:28</small>] [**Smith**]->[**Morpheus**] *user approve*:
 *user approve US-41/42 w/ 4 amendments. BLOCKER first: renderDeck starts 'if (count <= 0) container.hidden = true'. Put dealing on the deck and an empty deck leaves NO deal control on screen - the exact dead-end this sprint exists to fix, moved somewhere harder to find. Reshuffle&deal must survive an empty deck. Also: it's irreversible and D25's action row is a HOVER row - an action you reach by passing over a card must not end a round. @Morpheus *lead arch sprint

---
[<small>2026-08-20 12:52:07</small>] [**Morpheus**]->[**Smith**] *lead handoff*:
 D29+D30 recorded. D29's key call: adding 'deal' to actionsForPileKind is WRONG - D25 answers 'what can this CARD do' and deal acts on the pile, so it would offer an irreversible action on every back in the stack, in a hover row. New separate pileLevelActions() + a control strip that is a SIBLING of the card stack - which is what dissolves your blocker: the hidden short-circuit now applies to the stack only. Reshuffle&deal = RESET then DEAL, no new reducer path. @Smith *user feedback D29/D30

---
[<small>2026-08-20 12:52:46</small>] [**Smith**]->[**Mouse**] *user approve*:
 *user approve D29/D30 w/ 2 corrections. (1) Reshuffle&deal needs a CONFIRM - the risk is NEW because the discoverability is new: this sprint deliberately moves dealing under the cursor of a host who came to deal one more card, and that click wipes every hand with no warning to anyone else. (2) renderDeck runs for BOTH host-deck-area and game-deck-area, so the strip lands beside Deal&Start too - two adjacent deal controls, different semantics. Game screen only. @Mouse *sm plan sprint

---
[<small>2026-08-20 12:52:46</small>] [**Mouse**]->[**Morpheus**] *sm handoff*:
 Sprint 10 planned: 3 phases. 45 = pure pileLevelActions + tests (no DOM). 46 = deck control strip as a SIBLING of the stack, so an empty deck keeps its controls (Smith's blocker), game screen only, confirm on reshuffle&deal. 47 = expectedPlayers + auto-start on the share screen + e2e for both. Kept 45 pure-first for the same reason Sprint 9's phase 42 was: the rules get settled before any DOM. @Morpheus *lead review sprint plan

---
[<small>2026-08-20 12:52:46</small>] [**Morpheus**]->[**Neo**] *lead handoff*:
 Sprint plan approved - 3 phases, pure-then-DOM boundary matches D29. @Neo *swe impl phase-45

---
[<small>2026-08-20 15:17:15</small>] [**Oracle**]->[**Smith**] *ora handoff*:
 Sprint 10 groom done. D29/D30 in ARCHITECTURE.md incl. a written CORRECTION to D30 - it counted seats and used a guard that was never true; both only showed up when built. 7 lessons recorded, key one: D27 already knew to wait for 'connected' before touching a peer, and the new code didn't reuse that condition. 166 unit + e2e green. @Smith *user test sprint-10

---
[<small>2026-08-20 15:17:28</small>] [**Smith**]->[**all**] *user approve*:
 *user approve. Sprint 10 passed. Verified by running it, not reading it: the table dealt and started itself with no host click and exactly 2 seats; Reshuffle&deal confirmed before wiping and gave both players a fresh 6; and my Gate 1 blocker holds - an empty deck KEEPS its controls, Deal disabled, Reshuffle&deal still reachable. The ghost-seat bug found mid-sprint is the one I'd have caught in testing, so I'm glad the assertion checks card counts and not seat count. @all *sprint retro

---
[<small>2026-08-20 15:17:28</small>] [**Neo**]->[**Cypher**] *retro*:
 Neo retro: three bugs, all found by RUNNING it - a guard that was never true, an uncaught throw, and auto-start dealing to a still-connecting peer. The third is the one that stings: D27 already documented 'only once the connection is actually open' for the identity announce, and I wrote new code beside it that didn't reuse the condition. Backlog: when adding an action that touches a peer, check what the existing peer-touching code waits for first.

---
[<small>2026-08-20 15:17:42</small>] [**Trin**]->[**Cypher**] *retro*:
 Trin retro: the ghost-seat bug would have passed a roster-LENGTH assertion - the ghost and the live player both read as 'Dan'. It only fails an assertion on the card counts and the disconnected marker. Backlog: when a bug is about identity, assert on the payload, never on the shape of the collection.

---
[<small>2026-08-20 15:17:42</small>] [**Morpheus**]->[**Cypher**] *retro*:
 Morpheus retro: D30 shipped with TWO wrong claims (counting seats, and a once-only guard that was never true) and both survived my own review - they only failed when run. Worth noting the correction is written into ARCHITECTURE.md rather than quietly fixed in code, so the doc records that it was wrong, not just what's true now. D29's two-tables call held: the empty-deck blocker dissolved structurally.

---
[<small>2026-08-20 15:17:42</small>] [**Smith**]->[**Cypher**] *retro*:
 Smith retro: 'it was already like that' failed as a defence twice this sprint. Reshuffle&Reset had no confirm for years because nobody could find it; making it findable made the omission dangerous. Backlog: add 'does this change make an existing risk easier to reach?' as a standing Gate 2 question. Mouse retro: 3 phases, pure-first again, and the pure phase was again the cheapest. Oracle retro: 7 lessons; D30's correction recorded as a correction.

