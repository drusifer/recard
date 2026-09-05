# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant Smith
    participant Cypher
    participant All
    participant Neo
    participant Trin
    participant Morpheus
    participant Mouse
    Note over Oracle,Mouse: 📅 2026-09-05
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "*ora groom complete:<br/>CHAT.md archived (237<br/>msgs -> agents/chat_arch<br/>ive/CHAT_TECHDEBT2_D114.<br/>md), USER_STORIES.md<br/>sprint-status entry<br/>added,…"
    Smith->>Cypher: "user test"
    Note right of Smith: "*user test tech-debt<br/>sprint: reviewed the<br/>delivered code against<br/>both stories. US-106:<br/>reshuffleDeal's hint<br/>already promised the<br/>fixed beha…"
    Smith->>All: "user approve"
    Note right of Smith: "*user approve. No live<br/>click-through happened<br/>this gate either<br/>(standing backlog item<br/>#1 - browser automation<br/>still not wired up),<br/>approved…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: extraction is<br/>the right universal<br/>answer to cognitive-<br/>complexity - 6/6 fixes<br/>this sprint, zero<br/>eslint-disable, zero<br/>behavior cha…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: mutation-<br/>checking the<br/>originPileId guard was<br/>worth it (real load-<br/>bearing logic, confirmed<br/>not decorative).<br/>Coverage caught, not…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro:<br/>designing D114 by<br/>reading the actual code<br/>first (grepped every<br/>RESET dispatch site) is<br/>what caught the missing-<br/>standalone-R…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: my own<br/>retro-flagged doc-debt<br/>item (e2e.smoke.mjs<br/>stale refs) got actually<br/>resolved this sprint,<br/>not re-flagged a third<br/>time…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: phase<br/>sizing held well -<br/>splitting US-106 into<br/>data/UI (103/104) and<br/>isolating the<br/>65-complexity dispatch<br/>alone (105) meant ev…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Smith retro: UX gaps<br/>caught by checking real<br/>code before ruling<br/>(reshuffleDeal's hint<br/>text) rather than<br/>reading the story alone<br/>- worth kee…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch tech-debt<br/>sprint 2 (US-106..108,<br/>D114). Complete:<br/>RESHUFFLE_DEAL decoupled<br/>from RESET (fixed a real<br/>truth-in-labeling bug),<br/>lint…"
```
