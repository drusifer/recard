# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant Smith
    participant Trin
    participant Neo
    participant Morpheus
    participant Mouse
    participant All
    participant Cypher
    Note over Oracle,Cypher: 📅 2026-08-15
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "Sprint 4 groom complete:<br/>DECISIONS.md +1<br/>(D17-D19, incl. the<br/>honest density-finding<br/>disposition), lessons.md<br/>+4, memory.md updated,<br/>README…"
    Smith->>Trin: "user test"
    Note right of Smith: "Stage-3 close-out: 2<br/>findings. (1) Draggable<br/>cards give ZERO cursor<br/>affordance on a mouse<br/>client - real<br/>discoverability gap for<br/>this sprint…"
    Trin->>Neo: "qa handoff"
    Note right of Trin: "Triaged: finding #1<br/>(cursor affordance)<br/>confirmed real - no<br/>cursor rule anywhere in<br/>style.css for draggable<br/>cards, matches Smith's<br/>measurem…"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "Phase 27 fix (T27.1),<br/>test-first: added the<br/>cursor-affordance<br/>assertion before<br/>touching CSS, confirmed<br/>it failed (got 'auto'),<br/>then fixed.…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "UAT Phase 27 PASSED:<br/>86/86 unit + e2e stable.<br/>Went beyond Neo's base<br/>check: (1) a non-<br/>draggable card (another<br/>player's still-hidden<br/>private…"
    Morpheus->>Smith: "lead handoff"
    Note right of Morpheus: "Code review Phase 27:<br/>CSS-only, zero<br/>JS/state/protocol<br/>touched. Reusing<br/>[draggable='true'] to<br/>scope the cursor rule is<br/>the right call - der…"
    Smith->>Mouse: "user approve"
    Note right of Smith: "Re-tested finding #1<br/>with the exact original<br/>repro: both draggable<br/>hand cards and middle-<br/>cards now report<br/>cursor:grab. Report<br/>CLOSED, appro…"
    Mouse->>All: "sm retro"
    Note right of Mouse: "Sprint 4 (top-down table<br/>redesign) closed: 7<br/>phases (21-27), all UAT-<br/>passed and code-<br/>reviewed, Smith's close-<br/>out found 2 issues - 1<br/>fixed (…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: real gap<br/>found via seating.js<br/>extraction - pure logic<br/>was trapped in DOM-<br/>coupled files<br/>(main.js/ui.js) and thus<br/>untestable by un…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: an objective<br/>measurement<br/>(getBoundingClientRect<br/>overlap count) settled a<br/>severity question a<br/>screenshot alone<br/>couldn't - pinpoi…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: D17-D19<br/>held up with zero new<br/>protocol messages across<br/>the whole sprint,<br/>confirmed not just<br/>predicted - the<br/>strongest evide…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro:<br/>continuous-groom gap<br/>(flagged Sprint 1,<br/>recurred Sprint 3) did<br/>NOT recur this sprint -<br/>D17-D19 got their<br/>DECISIONS.md entry a…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Smith retro: this<br/>sprint's findings were a<br/>genuinely different pair<br/>than any prior sprint -<br/>a discoverability gap<br/>(cursor affordance) and<br/>a…"
    Cypher->>Cypher: "retro"
    Note right of Cypher: "Cypher retro: item 9<br/>(Oracle's continuous-<br/>groom gap) finally broke<br/>its repeat-pattern<br/>streak after recurring<br/>Sprint 1->3 - first time<br/>a fla…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch recard-<br/>sprint-4. v1.3 'top-down<br/>table redesign'<br/>complete: seated top-<br/>down table (you're<br/>always at the bottom), a<br/>personal area p…"
```
