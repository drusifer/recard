# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Oracle
    participant User
    participant All
    participant Neo
    participant Trin
    participant Morpheus
    participant Tank
    participant Mouse
    Note over Oracle,Mouse: 📅 2026-10-07
    Oracle->>User: "ora handoff"
    Note right of Oracle: "Groomed + archived<br/>(CHAT_TURN_RELAY). Docs:<br/>module map gains<br/>tools/turnRelay.mjs,<br/>README Deploying names<br/>the TURN vars, D176 in<br/>the topical…"
    Note over Oracle,Mouse: 📅 2026-10-08
    User->>All: "request"
    Note right of User: "*fix late-arriving bot<br/>can never play: JOIN<br/>closes the table once<br/>dealtThisGame<br/>(src/state.js<br/>isTableClosed) even with<br/>a free seat, want la…"
    Neo->>All: "swe handoff"
    Note right of Neo: "*fix US-153 done (TDD):<br/>JOIN seats a newcomer as<br/>spectator only when<br/>FULL, a new seated<br/>player after a deal gets<br/>lastDeal.cardsPerPlayer<br/>(o…"
    Trin->>All: "qa handoff"
    Note right of Trin: "UAT PASS: make check<br/>clean (state tests: 6<br/>new US-153, 2 D141<br/>'started' tests pruned),<br/>test-jev-game-master 7/7<br/>incl. 2 new live tests,<br/>tes…"
    Morpheus->>All: "lead decision"
    Note right of Morpheus: "D177 recorded: only a<br/>FULL table forces a<br/>spectator, a mid-game<br/>free seat is seated +<br/>dealt the last hand.<br/>Chose seat-and-deal over<br/>the use…"
    Tank->>All: "devops handoff"
    Note right of Tank: "Image re-exported:<br/>dist/recard-jev-e388ebf-<br/>dirty.tar (uncommitted<br/>tree - commit + re-<br/>export for a clean tag).<br/>Nothing infra-side<br/>changed."
    Note over Oracle,Mouse: 📅 2026-10-15
    User->>All: "request"
    Note right of User: "/bob-protocol init"
    Mouse->>User: "resume"
    Note right of Mouse: "Init/resume: last work<br/>was US-153 (late arrival<br/>seated + dealt, D177),<br/>all gates green, image<br/>re-exported as<br/>dist/recard-jev-e388ebf-<br/>dirty.…"
    User->>All: "request"
    Note right of User: "close and commit the<br/>sprint"
    Mouse->>User: "sm close"
    Note right of Mouse: "US-153 (D177) closed in<br/>task.md, TURN sprint<br/>header fixed to<br/>committed e388ebf.<br/>Committing US-153 + the<br/>bobp folder move.<br/>Leaving .mcp.json…"
```
