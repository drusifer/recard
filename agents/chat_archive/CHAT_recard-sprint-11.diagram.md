# CHAT_recard-sprint-11 — Sprint Archive

## Summary

Sprint 11 (US-43/44/45): restarting waits for the table. Cypher found the request was hollow as stated - persistence.js stripped hands, so 'restore the game' restored empty hands. D26 had stripped them because guest ids were unstable, a premise D27 removed three sprints earlier; D31 reverses it on the record and D26 is marked superseded in place. Smith's Gate 1 blocker: don't wait for players who had already left, since the snapshot stores everyone ever seated - that became the pure expectedReturners(). Gate 2 caught that D31 falsified Smith's own Sprint 7 prompt wording. Four bugs found by running it: session.ready() never settling so a bounded retry became infinite, an unregistered host-lost event, restore orphaning hands via a stale comment, and the manual Deal path seating unsettled peers - the same defect Sprint 10 fixed only in auto-start. 171 unit + e2e green.

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Cypher
    participant All
    participant Smith
    participant Morpheus
    participant Mouse
    participant Neo
    participant Oracle
    participant Trin
    Note over Cypher,Trin: 📅 2026-08-20
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch recard-<br/>sprint-10. Dealing now<br/>lives on the deck: Deal,<br/>and Reshuffle & deal -<br/>the re-deal that<br/>previously had no single<br/>control…"
    Cypher->>Smith: "pm handoff"
    Note right of Cypher: "Sprint 11: US-43/44/45<br/>(hands survive a host<br/>restart, clients auto-<br/>reconnect, host waits<br/>and names who's<br/>missing). TWO code<br/>findings decide…"
    Smith->>Morpheus: "user approve"
    Note right of Smith: "*user approve<br/>US-43/44/45 w/ 4<br/>amendments. BLOCKER:<br/>don't wait for players<br/>who had ALREADY left.<br/>The snapshot stores<br/>state.players verbatim…"
    Morpheus->>Smith: "lead handoff"
    Note right of Morpheus: "D31/D32/D33 recorded.<br/>D31 REVERSES D26 on the<br/>record - it stripped<br/>hands because ids were<br/>unstable, and D27<br/>removed that premise,<br/>following…"
    Mouse->>Morpheus: "sm handoff"
    Note right of Mouse: "Sprint 11 planned: 4<br/>phases. 48 =<br/>persistence: keep hands,<br/>bump version,<br/>expectedReturners() +<br/>tests (pure). 49 = host<br/>restore -> waiting s…"
    Smith->>Mouse: "user approve"
    Note right of Smith: "*user approve D31-D33 w/<br/>3 corrections. (1) D31<br/>falsifies MY OWN Sprint<br/>7 wording: the prompt<br/>says 'hands were not<br/>saved, you will need to…"
    Morpheus->>Neo: "lead handoff"
    Note right of Morpheus: "Sprint plan approved - 4<br/>phases. 48 pure-first<br/>again, and 51 existing<br/>as its own phase is<br/>right: Smith's wording<br/>sweep is a deliverable,<br/>no…"
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Sprint 11 groom done.<br/>D31/D32/D33 recorded,<br/>D26 marked SUPERSEDED in<br/>place rather than<br/>edited, so the reversal<br/>is visible. Both the<br/>unit an…"
    Smith->>All: "user approve"
    Note right of Smith: "*user approve. Sprint 11<br/>passed. All three of my<br/>Gate corrections are in<br/>shipped behaviour: the<br/>restore prompt now says<br/>hands DO come back…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: the stalled<br/>retry is the one to<br/>remember -<br/>session.ready() never<br/>settles when the host is<br/>simply absent (PeerJS<br/>opens the peer,…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: I inverted<br/>two assertions this<br/>sprint rather than<br/>deleting them, and that<br/>felt wrong until I wrote<br/>the comment - a privacy<br/>guar…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: D31<br/>reversing D26 is the<br/>sprint's real lesson -<br/>D26 was obeyed for three<br/>sprints after D27<br/>removed its premise,<br/>because the…"
    Cypher->>All: "retro"
    Note right of Cypher: "Cypher retro: I nearly<br/>wrote this as three UI<br/>stories. Reading<br/>persistence.js first<br/>showed the request was<br/>hollow without reversing<br/>D26 - '…"
```
