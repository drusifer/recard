# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant Smith
    participant All
    participant Neo
    participant Cypher
    participant Trin
    participant Morpheus
    participant Mouse
    participant User
    Note over Oracle,User: 📅 2026-08-27
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Docs groomed:<br/>USER_STORIES.md sprint-<br/>status added,<br/>ARCHITECTURE.md/task.md<br/>already current. CHAT.md<br/>archived to agents/chat_<br/>archive/CHAT_sa…"
    Smith->>All: "user approve"
    Note right of Smith: "User testing PASSED.<br/>Confirmed captions/confi<br/>rmations/icon labels all<br/>work as designed, Table-<br/>pile Remove fix verified<br/>live. 1 non-blocking…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: TDD<br/>throughout kept every<br/>phase fast to verify<br/>(tests written first<br/>caught the boolean-<br/>naming/condition-order<br/>lint issues before…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: reducer-<br/>level TDD gave near-<br/>total coverage for free<br/>(empty-only guards,<br/>exemptions) - UI-layer<br/>UAT could focus on<br/>wiring/dispat…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: D61's<br/>mid-design discovery<br/>(random-UUID ids on<br/>player-created<br/>zones/piles) would have<br/>shipped a silently-<br/>broken feature if…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: decisions<br/>(D61-D63) were posted to<br/>chat live during Stage<br/>1, not batched at groom<br/>- groom itself took<br/>under a minute since th…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 6-phase<br/>data-then-UI split held<br/>up well: phases 79-81<br/>had zero UI dependency<br/>and moved fast, bundling<br/>82+83 (they shared one<br/>d…"
    Cypher->>Cypher: "retro"
    Note right of Cypher: "Cypher retro: flagging 7<br/>open questions at Gate 1<br/>instead of guessing<br/>meant zero rework during<br/>implementation - every<br/>one got a real answer…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Smith retro: both Gate<br/>1/Gate 2 conditions<br/>survived intact into the<br/>shipped UI - the<br/>discipline of writing<br/>conditions directly into<br/>task.md…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch save-layout-<br/>remove-changetype.<br/>US-69..73 shipped: Save<br/>Layout, SaveAs, Remove<br/>Zone, Remove Pile,<br/>changePileType. 393/393<br/>tests,…"
    Neo->>User: "swe finding"
    Note right of Neo: "*nit checked:<br/>Save/SaveAs/Reset Layout<br/>already host-only<br/>(role!=='host' guards<br/>both #layout-controls<br/>visibility and each<br/>perform* handler,…"
    Neo->>User: "swe finding"
    Note right of Neo: "*nit done: D64 - deck<br/>can now be reparented<br/>between Zones<br/>(DeckPile.reparentable:<br/>false->true), reversing<br/>part of Sprint 23's D55<br/>exclusion…"
    Neo->>User: "swe finding"
    Note right of Neo: "Found+fixed real bug<br/>(D65): Draw's drag-to-<br/>pick-up was silently<br/>clobbered - the Draw<br/>button and its<br/>containing pile-title<br/>bar are BOTH drag…"
    Neo->>User: "swe finding"
    Note right of Neo: "D66: deck's card-stack<br/>visual is now also a<br/>drag source (same token<br/>D65 fixed), not only the<br/>button - 'drag from the<br/>card like all piles do…"
    Neo->>User: "swe decision"
    Note right of Neo: "D67: retired D66's<br/>action-token drag<br/>entirely - it always<br/>resolved to hand<br/>regardless of drop<br/>target, which isn't real<br/>drop semantics. view…"
    Neo->>User: "swe finding"
    Note right of Neo: "*nit done:<br/>Remove/changePileType<br/>buttons (pile-level and<br/>Zone-level) now only<br/>appear when actually<br/>empty - Pile.disabledAct<br/>ions(count) retu…"
    Neo->>User: "swe finding"
    Note right of Neo: "*nit done: widened deal-<br/>count input + badge<br/>styling (matches deck-<br/>count-badge pill).<br/>Found+fixed a real<br/>layout bug while<br/>verifying: .deck-s…"
    Mouse->>All: "sm status"
    Note right of Mouse: "Mouse: session close-<br/>out. Phase 85 (task.md)<br/>filled by D64-D67 *nits<br/>post-launch - deck drag-<br/>and-drop took 4 rounds<br/>to get right (reparenti…"
    Neo->>User: "swe finding"
    Note right of Neo: "D68: card-drag broadcast<br/>now relative to the<br/>dragging player's own<br/>hand-panel position, not<br/>an absolute screen<br/>fraction (each viewer's<br/>pane…"
    Neo->>User: "swe finding"
    Note right of Neo: "D68 follow-up: Y<br/>inverted when rendering<br/>an opponent's card-drag<br/>- every viewer's own<br/>hand sits near the<br/>bottom of their own<br/>screen, but an…"
```
