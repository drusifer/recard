# Harness MCP Server — Architecture (US-119, Tier 2)

Builds on D135's harness (`tests/harness/multiplayer.mjs`).

## Shape
- `tools/mcp/harnessServer.mjs` - stdio MCP server (`@modelcontextprotocol/sdk`
  + `zod`, new devDependencies). Long-lived process owns ONE browser +
  static server + table. Registered as `recard-harness` in `.mcp.json`.
- The harness itself stays the one place that knows how to stand a
  table up; the server is a thin tool layer over `createTable` and
  `HarnessPeer`. Players addressed by name: `host`, `guest1`..`guestN`.

## Tools
| tool | does |
|---|---|
| `game_start {players, preset?, cardsPerPlayer}` | stops any running table, starts a new one; returns player names + table code |
| `game_status` | players, ids, connection, hand sizes |
| `game_stop` | closes contexts/browser/server |
| `player_act {player, action}` | `submitAction` via `window.__recardHarness.act` |
| `player_view {player, path?}` | view JSON (optionally a dotted sub-path, views are large) |
| `player_wait {player, predicate, arg?, timeoutMs?}` | harness `waitForView` |
| `player_query {player, selectors}` | harness `query()` |
| `player_traffic {player, limit?, type?}` | recent protocol messages in/out |
| `screenshot {player?, label?, fullPage?}` | one player, or all when omitted; inline PNG(s) + saved files + contact sheet |

## WebRTC exposure (app change)
`Session` (session.js) records a bounded ring buffer of every message
it sends/receives (`{seq, at, direction, peer, type, message}`), generic transport
observability, not harness-specific. `window.__recardHarness` gains
`traffic()`. READ-ONLY by user decision at the Smith gate: no raw-send
tool; acting stays on `submitAction`. Headless only (no `headed` flag).
The ring buffer is a pure module (`src/trafficLog.js`) so it is unit-
tested; Session just feeds it.

## Screenshots
`build/screenshots/<run-timestamp>/NNN-<player>-<label>.png` +
`index.html` contact sheet regenerated per capture (grouped by capture
step, one column per player).

## Testing
`tests/harnessMcp.browser.mjs` spawns the server via the SDK's stdio
client, runs start -> act -> wait -> traffic -> screenshot -> stop.
npm `test:harness-mcp`, make `test-harness-mcp`.
