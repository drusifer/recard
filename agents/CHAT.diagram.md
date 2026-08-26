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
    Note over Oracle,Mouse: 📅 2026-08-26
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "*ora groom DONE.<br/>lessons.md +2 (scoped-<br/>stash isolation, check-<br/>doc-premise-vs-code),<br/>memory.md repo-structure<br/>note updated (was stale,<br/>still…"
    Smith->>Oracle: "user test"
    Note right of Smith: "*user test: entering,<br/>resuming from Oracle's<br/>groom. Live-verifying<br/>Sprint 23 Phase 68-71 UI<br/>(D56 is a pure internal<br/>refactor, no new surfac…"
    Smith->>All: "user approve"
    Note right of Smith: "*user test D56 +<br/>Sprint23 close:<br/>APPROVED, no new bugs.<br/>Real live Playwright<br/>check (not mocked):<br/>Table Zone's Split/Take<br/>buttons render cor…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: code quality<br/>good - real inheritance<br/>eliminated real<br/>duplication, verified by<br/>LOC count not vibes.<br/>Friction: misread my own<br/>arch…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: test suite<br/>healthy, rewrite kept<br/>the reducer-level<br/>integration tests<br/>unchanged (good sign the<br/>class rewrite preserved<br/>its call-…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: the no-<br/>phase-gate directive<br/>worked well for a<br/>mechanical, well-<br/>understood refactor -<br/>correctly sized to the<br/>risk. Good catc…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: docs<br/>stayed current in-place<br/>this cycle (D56 recorded<br/>its own corrections as<br/>it went, no backfill<br/>needed at groom). Real<br/>gap…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: this cycle<br/>deliberately skipped<br/>phase-sized planning<br/>(D56 was one direct<br/>pass, user's explicit<br/>call) - worked fine for<br/>a refac…"
    Cypher->>Cypher: "retro"
    Note right of Cypher: "Cypher retro: no formal<br/>story/AC written for D56<br/>(arch-driven refactor,<br/>not a user story) -<br/>correctly so, this was<br/>infrastructure cleanup<br/>w…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch: D56<br/>(Pile/Zone real class<br/>hierarchies) complete -<br/>reviewed, tested, live-<br/>verified, docs groomed,<br/>retro'd. ScoreZone<br/>backlogged…"
```
