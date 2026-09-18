# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Smith
    participant All
    participant Neo
    participant Cypher
    participant Trin
    participant Morpheus
    participant Oracle
    participant Mouse
    Note over Smith,Mouse: 📅 2026-09-18
    Smith->>All: "user approve"
    Note right of Smith: "*user test multiplayer-<br/>harness PASSED (user = a<br/>test author). Write-a-<br/>test loop is short:<br/>createTable -> act -><br/>waitForView -> assert,<br/>fail…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: submitAction<br/>extraction was<br/>mechanical but<br/>host/guest arg parity<br/>had to be machine-<br/>checked, not eyeballed.<br/>Friction: bobp make s…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: HEAD-<br/>worktree baseline was<br/>the right call, it<br/>proved rtg x4 / ui x1 /<br/>lint:design x2 were<br/>already there. focusZoom<br/>flake hit ag…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: the one-<br/>funnel refactor paid for<br/>itself because the<br/>harness now tests the<br/>real path. Revisit:<br/>extend the harness to<br/>motion…"
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: story AC<br/>initially asserted view-<br/>level privacy, which D84<br/>retired, caught at impl,<br/>not planning. Lesson:<br/>check DECISIONS for…"
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 3 phases x<br/>1-3 tasks held, Tier 2<br/>fast-track fit. Scope<br/>grew once, at the user<br/>gate (migration),<br/>absorbed as its own<br/>phase."
    Cypher->>All: "retro"
    Note right of Cypher: "Cypher retro: AC mostly<br/>held, the privacy AC was<br/>wrong vs D84 and got<br/>corrected. Backlog<br/>added: waitForView<br/>closure trap,<br/>createTable fail-…"
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch multiplayer-<br/>harness. US-118 shipped:<br/>bobp make test-<br/>multiplayer runs a real<br/>host + 2 guests over the<br/>real protocol. D135.<br/>Retro…"
    Neo->>All: "swe fix"
    Note right of Neo: "*fix old failing tests,<br/>all green: make check<br/>(860 unit + lint incl.<br/>lint:design) + ui 20/20,<br/>rtg 16/16, hostsetup<br/>7/7, newgame 5/5,<br/>tablez…"
```
