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
    participant Cypher
    participant Smith
    Note over Oracle,Smith: 📅 2026-10-07
    Oracle->>User: "ora handoff"
    Note right of Oracle: "Groomed + archived<br/>(CHAT_TURN_RELAY). Docs:<br/>module map gains<br/>tools/turnRelay.mjs,<br/>README Deploying names<br/>the TURN vars, D176 in<br/>the topical…"
    Note over Oracle,Smith: 📅 2026-10-08
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
    Note over Oracle,Smith: 📅 2026-10-15
    User->>All: "request"
    Note right of User: "/bob-protocol init"
    Mouse->>User: "resume"
    Note right of Mouse: "Init/resume: last work<br/>was US-153 (late arrival<br/>seated + dealt, D177),<br/>all gates green, image<br/>re-exported as<br/>dist/recard-jev-e388ebf-<br/>dirty.…"
    User->>All: "request"
    Note right of User: "close and commit the<br/>sprint"
    Mouse->>User: "sm close"
    Note right of Mouse: "US-153 (D177) closed in<br/>task.md, TURN sprint<br/>header fixed to<br/>committed e388ebf.<br/>Committing US-153 + the<br/>bobp folder move.<br/>Leaving .mcp.json…"
    Tank->>User: "devops"
    Note right of Tank: "MCP: both servers run.<br/>Committed .mcp.json<br/>stays recard-harness<br/>only (reverted the bobp<br/>upgrade's via entry +<br/>.gitignore line), via<br/>registe…"
    User->>All: "request"
    Note right of User: "all we're Going to<br/>generalize the Jev and<br/>XState harness to use as<br/>a standalone automation<br/>tool. What would be a<br/>good name for this new<br/>too…"
    Cypher->>All: "pm name"
    Note right of Cypher: "Naming: the tool is a<br/>stand-in actor - a<br/>statechart is the script<br/>(XState rules), Jev<br/>makes the judgment calls<br/>the script can't, the<br/>harnes…"
    Morpheus->>Cypher: "lead review"
    Note right of Morpheus: "Arch angle: whatever the<br/>name, keep it off game<br/>words -<br/>pitboss/croupier/dealer<br/>tie it back to recard.<br/>npm: bare understudy/sta<br/>ndin/pitboss…"
    Smith->>User: "user review"
    Note right of Smith: "CLI usability:<br/>'understudy' is 10 chars<br/>to type, ship a short<br/>bin alias (us? no -<br/>collides in shells'<br/>head). Suggest bin<br/>'ustudy' or just t…"
    User->>All: "request"
    Note right of User: "repo is ready<br/>../understudy"
    Morpheus->>User: "lead arch"
    Note right of Morpheus: "Understudy extraction<br/>map: agents/morpheus/und<br/>erstudy_extraction_map.m<br/>d. 6 modules move as-is<br/>(escalate, decide,<br/>strategyFile, machine,<br/>sea…"
    Morpheus->>Cypher: "handoff"
    Note right of Morpheus: "User decided: web +<br/>CLI/HTTP targets<br/>(adapter contract<br/>transport-neutral, prove<br/>it with 2 demo<br/>adapters), recard<br/>consumes via git<br/>dependenc…"
    Morpheus->>User: "handoff"
    Note right of Morpheus: "Understudy seeded: core<br/>Jev/XState modules + 7<br/>tests copied to<br/>../understudy (src/,<br/>tests/),<br/>harness/runner/MCP<br/>server copied verbatim<br/>to i…"
    User->>All: "request"
    Note right of User: "commit the recard<br/>changes"
    User->>All: "request"
    Note right of User: "prep for shutdown"
    Mouse->>User: "exit"
    Note right of Mouse: "Shutdown prep: all<br/>persona states saved<br/>(Mouse, Morpheus, Tank,<br/>Cypher). Open: export-<br/>jev-image for a clean<br/>tag, recard migration<br/>onto unde…"
```
