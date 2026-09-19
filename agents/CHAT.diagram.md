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
    participant User
    Note over Smith,User: 📅 2026-09-18
    Smith->>All: "user approve"
    Note right of Smith: "*user test harness-mcp<br/>PASSED: viewed a real<br/>capture - own hand face-<br/>up, host's as backs,<br/>moved card on table.<br/>Tool errors name the<br/>valid p…"
    Neo->>Cypher: "retro"
    Note right of Neo: "Neo retro: server stayed<br/>~200 lines by leaning on<br/>the harness. Friction:<br/>.middle-card and .card<br/>both carry data-<br/>pileable-id - selector<br/>trap…"
    Trin->>Cypher: "retro"
    Note right of Trin: "Trin retro: every new<br/>guard mutation-proved<br/>(capacity bound, Session<br/>send tap). I clobbered<br/>build.out again with a<br/>concurrent make -<br/>proces…"
    Morpheus->>Cypher: "retro"
    Note right of Morpheus: "Morpheus retro: read-<br/>only traffic was the<br/>right cut - raw send<br/>would have been a second<br/>action path beside<br/>submitAction."
    Oracle->>Cypher: "retro"
    Note right of Oracle: "Oracle retro: persona<br/>state files had gone<br/>stale (Neo since D129),<br/>refreshed this sprint<br/>after the user asked.<br/>Keep saving per handoff."
    Mouse->>Cypher: "retro"
    Note right of Mouse: "Mouse retro: 3 small<br/>phases held, user asked<br/>mid-sprint about<br/>subagents - phases were<br/>sequential and shared<br/>build.out, so<br/>parallelism would…"
    Cypher->>All: "retro"
    Note right of Cypher: "Cypher retro: AC held,<br/>gate trimmed scope twice<br/>(raw send, headed).<br/>Backlog: screenshot<br/>selector/viewport,<br/>traffic reset on<br/>reconnect."
    Cypher->>All: "pm launch"
    Note right of Cypher: "*pm launch harness-mcp.<br/>US-119 shipped: recard-<br/>harness MCP server -<br/>start a multi-player<br/>table, act/view/wait/que<br/>ry/traffic per player,<br/>scr…"
    Neo->>All: "exit"
    Note right of Neo: "*exit prep: US-119<br/>harness MCP shipped<br/>(D136). .mcp.json now<br/>COMMITTED with recard-<br/>harness only<br/>(${CLAUDE_PROJECT_DIR}<br/>path, type stdio), v…"
    Neo->>User: "resume"
    Note right of Neo: "Session init (cold<br/>start). Last handoff:<br/>Neo *exit after US-119<br/>(D136). recard-harness<br/>MCP FAILED to connect<br/>this session (Connection<br/>close…"
    User->>Smith: "request"
    Note right of User: "try using the new mcp to<br/>control a 1 player game"
    Smith->>All: "user test"
    Note right of Smith: "Smith on entry: recard-<br/>harness isn't loaded as<br/>tools this session, so<br/>I'll drive tools/mcp/har<br/>nessServer.mjs over real<br/>stdio with the MCP S…"
    Smith->>User: "user test"
    Note right of Smith: "*user test harness-mcp<br/>(1 player) PASSED over<br/>real stdio: start/view/D<br/>RAW/MOVE/wait/query/scre<br/>enshot/stop all work,<br/>card seen on table. Con…"
    User->>Neo: "request"
    Note right of User: "*fix usablility issues"
    Neo->>Trin: "swe handoff"
    Note right of Neo: "*swe fix done. Root<br/>cause confirmed:<br/>CLAUDE_PROJECT_DIR is<br/>unset for MCP servers,<br/>so .mcp.json launched /t<br/>ools/mcp/harnessServer.m<br/>js -> now…"
    Trin->>Morpheus: "qa handoff"
    Note right of Trin: "*qa uat PASSED: 10/10.<br/>Mutation-proved all 3<br/>guards (old .mcp.json<br/>arg -> Connection<br/>closed, drop errorText<br/>-> reducer-error test<br/>fails, dr…"
    Morpheus->>User: "lead review"
    Note right of Morpheus: "*lead review APPROVED.<br/>Fix stays in the MCP<br/>tool layer, errorText in<br/>the one tool() wrapper,<br/>no per-tool special<br/>cases. Amended D136<br/>rather…"
    User->>Smith: "request"
    Note right of User: "take it for a spin"
    Smith->>All: "user test"
    Note right of Smith: "Smith on entry: recard-<br/>harness now loaded as<br/>real MCP tools after<br/>/mcp reconnect. Spinning<br/>a 1-player game through<br/>them directly, re-<br/>checki…"
    Smith->>User: "user test"
    Note right of Smith: "*user test harness-mcp<br/>via real MCP tools:<br/>PASS. All 3 prior<br/>concerns verified fixed<br/>in use. New:<br/>player_query drops<br/><input> values (deck d…"
    Note over Smith,User: 📅 2026-09-19
    User->>Oracle: "request"
    Note right of User: "groom docs commit and ff<br/>main -> dev"
    Oracle->>User: "ora groom"
    Note right of Oracle: "*ora groom done. D136<br/>amended in place (config<br/>path + error text), not<br/>a new D - same decision,<br/>corrected. BACKLOG<br/>harness-MCP follow-ups<br/>+…"
```
