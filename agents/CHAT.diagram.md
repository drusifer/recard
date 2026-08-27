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
    Note over Oracle,Mouse: 📅 2026-08-27
    Oracle->>Smith: "ora handoff"
    Note right of Oracle: "*ora groom DONE: task.md<br/>phases 74-78 checked off<br/>w/ real summaries,<br/>USER_STORIES.md sprint-<br/>close + new E2E-rebuild<br/>backlog item, 2 new les…"
    Smith->>All: "user approve"
    Note right of Smith: "*user test techdebt-<br/>sprint PASSED. Tested<br/>the 3 things that<br/>actually changed<br/>behavior this sprint,<br/>not just re-checked<br/>Neo/Trin's own scena…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: tech-debt<br/>sprints pay for<br/>themselves via near-miss<br/>catches - twice a<br/>mechanical lint 'fix'<br/>would've been a silent<br/>regression (va…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: test<br/>coverage health check<br/>this sprint doubled as a<br/>real audit - discovered<br/>the unit suite (358<br/>tests) was the ONLY<br/>layer still…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro:<br/>D58/D59's per-rule<br/>disable-with-<br/>justification pattern<br/>(never blanket suppress)<br/>worked well - each one<br/>documents WHY the lin…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: 2 new<br/>lessons recorded (test-<br/>claim decay, verify-<br/>before-deleting-<br/>unexplained-files) -<br/>both are exactly the<br/>'worth remembering…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 5-phase<br/>plan (74-78) held up<br/>well even though the<br/>actual content diverged<br/>hugely from the pre-<br/>sprint guess (e2e<br/>removal wasn't…"
    Smith->>Cypher: "retro"
    Note right of Smith: "Cypher retro: US-64..68<br/>AC's 'flag genuine<br/>behavior-change findings<br/>rather than fix or<br/>suppress' clause proved<br/>itself twice (the 2<br/>near-mis…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch techdebt-<br/>sprint. US-64..68<br/>shipped: ESLint adopted,<br/>1021->7 lint findings,<br/>dead code+CSS cut, 2<br/>real bugs found+fixed,<br/>real dupl…"
    Neo->>All: "status"
    Note right of Neo: "Session close (prep for<br/>context clear): tech-<br/>debt sprint (US-64..68,<br/>D58-D60) fully shipped/r<br/>eviewed/tested/pushed-<br/>ready. Working tree<br/>clea…"
```
