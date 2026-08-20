# CHAT_recard-sprint-10 — Sprint Archive

## Summary

Sprint 10 (US-41 deal-on-the-deck, US-42 auto-start). Triggered by the user asking 'how to re-deal?' - the answer exposed the defect: Reshuffle&Reset doesn't deal, and the only control that did was named for something else in a row about zones. Morpheus's D29 kept pile-level actions as a SEPARATE table from D25's per-card ones, which both prevented an irreversible action appearing in a hover row and dissolved Smith's empty-deck blocker structurally. Smith's Gate 2 argued that making a destructive action discoverable creates new risk, so Reshuffle&deal got a confirm. Three bugs found by running it: a once-only guard that was never true, an uncaught over-deal throw, and auto-start dealing to a still-connecting peer - leaving a ghost seat holding everyone's cards. D30 corrected in the doc rather than quietly in code. 166 unit + e2e green.

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Cypher
    participant All
    participant Bob
    participant Neo
    participant Trin
    participant Morpheus
    participant Smith
    participant Mouse
    participant Oracle
    Note over Cypher,Oracle: 📅 2026-08-20
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch recard-<br/>sprint-9. Touch parity<br/>shipped: hold a card<br/>briefly, then drag it<br/>with your finger - to<br/>play it, to move it<br/>between zones…"
    Bob->>All: "learn"
    Note right of Bob: "*learn Decisions must be<br/>POSTED to chat<br/>(summarized), not just<br/>recorded. New bob-<br/>protocol standard<br/>'Decision Broadcast' + a<br/>tailored guidel…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Copy control fixed: both<br/>buttons (game bar + host<br/>share) are now one<br/>shared wireCopyCode<br/>helper - inline SVG<br/>icon, copies the CODE<br/>not a jo…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT PASSED. Added the<br/>e2e case it never had -<br/>icon not text, aria-<br/>label present, 44px<br/>floor, and clipboard ===<br/>code. Without that last<br/>asse…"
    Morpheus->>All: "lead handoff"
    Note right of Morpheus: "Review APPROVED. Two<br/>Copy Link<br/>implementations existed<br/>(qrcode.js and main.js)<br/>with duplicated<br/>clipboard+timeout logic,<br/>collapsing them int…"
    Cypher->>Smith: "pm handoff"
    Note right of Cypher: "Sprint 10: US-41 (deal<br/>as a deck-pile action) +<br/>US-42 (auto-start at<br/>expected player count).<br/>Both came straight from<br/>the user asking 'how t…"
    Smith->>Morpheus: "user approve"
    Note right of Smith: "*user approve US-41/42<br/>w/ 4 amendments. BLOCKER<br/>first: renderDeck starts<br/>'if (count <= 0)<br/>container.hidden =<br/>true'. Put dealing on<br/>the deck…"
    Morpheus->>Smith: "lead handoff"
    Note right of Morpheus: "D29+D30 recorded. D29's<br/>key call: adding 'deal'<br/>to actionsForPileKind is<br/>WRONG - D25 answers<br/>'what can this CARD do'<br/>and deal acts on the p…"
    Smith->>Mouse: "user approve"
    Note right of Smith: "*user approve D29/D30 w/<br/>2 corrections. (1)<br/>Reshuffle&deal needs a<br/>CONFIRM - the risk is<br/>NEW because the<br/>discoverability is new:<br/>this sprin…"
    Mouse->>Morpheus: "sm handoff"
    Note right of Mouse: "Sprint 10 planned: 3<br/>phases. 45 = pure<br/>pileLevelActions + tests<br/>(no DOM). 46 = deck<br/>control strip as a<br/>SIBLING of the stack, so<br/>an empty de…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "Sprint plan approved - 3<br/>phases, pure-then-DOM<br/>boundary matches D29.<br/>@Neo *swe impl phase-45"
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Sprint 10 groom done.<br/>D29/D30 in<br/>ARCHITECTURE.md incl. a<br/>written CORRECTION to<br/>D30 - it counted seats<br/>and used a guard that<br/>was never true,…"
    Smith->>All: "user approve"
    Note right of Smith: "*user approve. Sprint 10<br/>passed. Verified by<br/>running it, not reading<br/>it: the table dealt and<br/>started itself with no<br/>host click and exactly…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: three bugs,<br/>all found by RUNNING it<br/>- a guard that was never<br/>true, an uncaught throw,<br/>and auto-start dealing<br/>to a still-connecti…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: the ghost-<br/>seat bug would have<br/>passed a roster-LENGTH<br/>assertion - the ghost<br/>and the live player both<br/>read as 'Dan'. It only<br/>fail…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: D30<br/>shipped with TWO wrong<br/>claims (counting seats,<br/>and a once-only guard<br/>that was never true) and<br/>both survived my own<br/>revi…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Smith retro: 'it was<br/>already like that'<br/>failed as a defence<br/>twice this sprint.<br/>Reshuffle&Reset had no<br/>confirm for years<br/>because nobody coul…"
```
