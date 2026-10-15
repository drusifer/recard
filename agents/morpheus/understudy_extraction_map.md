# Understudy extraction map (2026-10-15, Morpheus)

Goal: lift the Jev + XState + harness machinery out of recard into `../understudy`,
a standalone automation tool. Recard then consumes understudy like any other app
(no shims left behind in recard - fully migrate, per our no-back-compat rule).

The shape that falls out of the code: **understudy = the actor** (statechart script +
Jev judgment + a run loop + hands), **an app adapter = the stage** (how to read the
app's state, what moves exist, how to make one). Today the adapter is welded into the
harness as `window.__recardHarness` and PeerJS table setup.

## 1. Moves as-is (already game-agnostic, ~600 lines)

| File | What it is | Note |
|---|---|---|
| `tools/jev/escalate.mjs` | Noul -> yes/no/unsure verdicts, escalation policies | pure |
| `tools/jev/decide.mjs` | read -> Choice -> verify, one decision | pure |
| `tools/jev/strategyFile.mjs` | no-literals rule for question prose, state paths | pure |
| `tools/jev/machine.mjs` | YAML statechart -> XState machine, load-time validation, `busy`/`safe` | the heart |
| `tools/jev/seat.mjs` | `MachineSeat`: "is it my move?" + "take one step" | rename `TABLE` event -> `OBSERVE`? |
| `tools/jev/shutdown.mjs` | `once`, `waitUntilDead` | pure |

## 2. Moves after generalizing

| File | Recard-specific part | Generalized as |
|---|---|---|
| `tools/jev/library.mjs` | vocabulary says board/table/talk/phase/move | `genericLibrary` keeps its shape; doc strings say observe/channel/step. App hooks stay `services.game` -> `services.app` |
| `tools/jev/table.mjs` | turn detection from table talk | "conversation channel" helpers (`shouldAsk`, `readAnswer`, `askPeer`) - optional module, apps without a chat channel skip it |
| `tools/jev/runner.mjs` | imports `botRequests.mjs` (add-bot/leave from talk), joins by table code | generic run loop (`playSeat`, `run(adapter)`); spawn/quit-from-talk becomes an adapter hook, stays in recard |
| `tests/harness/multiplayer.mjs` | `__recardHarness` hook, PeerJS host/join/deal, game-master invite | split: understudy gets `startStaticServer`, `launchChromium`, a `PagePeer` driving a CONFIGURABLE hook name (act/view/say/talk/traffic/query/wait); recard keeps `hostTable`/`joinTable`/`dealTable`/`listenAsGameMaster` as its adapter |
| `tools/mcp/harnessServer.mjs` | `game_*` tools, `gin_turn` | understudy ships the generic MCP layer (session start/stop, actor act/view/wait/query/say, screenshot); the adapter registers app tools (recard keeps `gin_turn`, `game_join`) |
| `tools/jev/tableFile.mjs` + `tableSetup.mjs` | preset/deal/score/opening | a "scenario file" (who plays, setup steps, opening lines); deal/score become adapter-defined setup steps |
| `tools/turnRelay.mjs` | Cloudflare TURN for WebRTC | only if understudy owns WebRTC transport; otherwise stays in recard |

## 3. Stays in recard

`tools/jev/gameFiles.mjs`, `gameReadme.mjs`, `games.mjs`, `libraryDocument.mjs` (imports
gin/rtg/war libraries), `games/*`, `tools/gin|rtg|war/*`, `tools/botRequests.mjs`,
`tools/localPeerServer.mjs`, `src/gameMasterInvite.js`, `src/identity.js`,
`src/peerOptions.js`, `jevGameMaster.mjs`, `jev-table`. These become recard's
understudy adapter + game content.

## Dependencies understudy takes

`xstate`, `@xstate/graph` (if the README/graph generator generalizes), `yaml`,
`@typesafe-ai/sdk`, `playwright`, `@modelcontextprotocol/sdk`, `zod`. Node ESM, same
lint/test conventions as recard.

## Suggested order (Tier 1 sprint in understudy, then a recard migration sprint)

1. Core (section 1) + their unit tests, copied with history notes; understudy's
   `make check` green.
2. Adapter contract: define the hook interface (observe / options / act / say / talk),
   a tiny demo app adapter + live test (a non-game web page, proves "not cards").
3. Generalize library/runner/seat vocabulary; scenario file.
4. Harness split + generic MCP server.
5. Recard migration: depend on understudy, delete the moved files and their tests,
   recard adapter = what's in section 3. All recard live suites green.

## Decisions (user, 2026-10-15)

- **Targets: web + CLI/HTTP.** The adapter contract is transport-neutral from day one
  (observe / options / act / say / talk / wait); the Playwright page hook is ONE adapter,
  not the model. Step 2 therefore ships two demo adapters (a web page and a CLI or HTTP
  target), so the contract is proved neutral, not just claimed.
- **Packaging: git dependency.** recard's package.json -> `github:drusifer/understudy#<tag>`.
  Understudy tags releases; no npm publish.
- **Jev: required.** Every actor has a judge; no pure-rules mode. Live runs need the
  TypeSafe key; unit tests use a judge test double at the SDK seam.
