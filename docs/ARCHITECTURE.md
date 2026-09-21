# Architecture — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** present-state description — how the system works today, not
a history of how it got there. For the full chronological decision
record with rationale and consequences, see `docs/DECISIONS.md`.
**See also:** `docs/DOMAIN_MODEL.md` (the Pileable/Stackable/Pile/Stack/
Zone class hierarchy), `docs/UI_ARCHITECTURE.md` (Web Components,
rendering, camera/focus-zoom/table-zoom, UI conventions).
**Last updated:** 2026-09-17 (split out of a 6000+ line decision-log
dump — see `docs/DECISIONS.md`'s own header for why).

## Overview

Recard is a static, no-build-step web app (`index.html` + `style.css` +
ES modules under `src/`) that replaces a physical deck of cards for
players in the same room. There is no server: peer-to-peer connections
use PeerJS (WebRTC) against its public signaling broker, in a **star
topology** — every player connects directly to the host's browser tab
only, never to each other. The host holds the single, authoritative copy
of game state; every other client sends action *requests*, the host
validates and dispatches them through the same reducer, then broadcasts
the resulting state (D1-D3).

Node is used only as a dev-time test runner and build tooling
(`node --test`, the various `tools/*.mjs` scripts) — never at runtime.

## Core invariant

Piles are arrangements of Cards/TableObjects. All cards/table objects
can be moved (drag and drop) by any player at any time from any pile or
zone to any pile or zone, no matter what.

A derived Pile type may add its own special pile-level actions for
convenience (`untapAll`, `split`, `take`, `changePileType`, ...) — those
are free to be kind-specific, restricted, or omitted entirely. What a
derived type may never do is remove or restrict the baseline card-level
drag-and-drop (`move`/`pickup`) every card has by virtue of being a card
on a table — this app is a table simulator, not a rules engine (the
same framing established for Recard the Gathering: the software models
zones/tapping/life/movement, players enforce mana costs/combat/timing
themselves). A real card on a real table can always be picked up and
moved, house rules or game rules notwithstanding.

As of D83, this is fully literal: no per-card ownership check either (a
still-hidden private card, or any card in another player's hand, can be
moved by anyone), and no per-viewer restriction of any kind. As of D84,
card identity redaction (D7) is gone too — a viewer sees every card's
real identity, always, not just whether it can be moved. As of D85, the
same removal reaches the three bulk/pile-level actions that still had
their own separate authorization gate.

## Networking and replication model

Two message classes travel over the one PeerJS data channel (D4):

1. **State messages** (reliable, ordered): the result of dispatching an
   action through `state.js`'s reducer — deal, play, draw, reset, roster
   changes, and every other action id the reducer handles. These are
   authoritative; every client renders directly from the latest one it
   received. A guest never mutates its own copy of state directly — it
   sends the action to the host and waits for the host's own broadcast,
   the same as every other client.
2. **Motion messages** (best-effort, cosmetic only, throttled ~20/s with
   latest-wins coalescing): live cursor position, card-lift cues,
   in-flight drag position. These never carry information not already
   implied by the last state message, and are never required to arrive
   for the app to stay correct — losing motion frames costs smoothness,
   never correctness.

3. **Talk messages** (D138): a line anyone can say, host-stamped and
   relayed to everyone in one order. Never game state. Its optional
   `data` field is what bots speak through - a Jev player announces
   itself and narrates every decision there (D142), "add a Jev bot" is
   a request/answer pair on the same channel (D143), and `quit` tells
   a bot (or every bot) to finish its turn and leave cleanly (D149).

**Who is at the table** (D141): one roster, `state.players[]`, where a
record's `role` is `'player'` or `'spectator'` (absent reads as player).
A spectator is present in every way except having a seat - no hand, never
dealt to, no seat zone - and the table stays fully permissive for them,
so they move cards and deal like anyone else (D82-D85, D145). Only
seating, dealing and scoring filter by role.

**What just happened** (D144): each action stamps one `lastTouch`
(`{by, pileableIds, seq}`), derived in `reduce()` by comparing where
every Pileable was against where it is. Clients animate and glow from
it; nothing about motion is messaged, and the fade is local.

**Local-only view state** is a third category that never touches the
network at all: each player's own table zoom level, table pan offset,
and which pile (if any) is currently focus-zoomed are per-browser,
per-player state, set once at startup and mutated only by that player's
own local interactions (`tableZoom.js`, `focusZoom.js`, wired in
`main.js`). Two players looking at the same table can be zoomed to
completely different levels without either seeing the other's camera.

Session/connection management (`session.js`) and the message envelope
helpers (`protocol.js`) are the only two modules that touch PeerJS
directly; everything else works in terms of plain actions and views.

## Module layout

```
index.html          entry page: host/join screens, game screen
style.css            styling

src/state.js           host-side authoritative state + reducer(action) -> state;
                        also derives each viewer's own redacted `view` (viewFor)
src/session.js          PeerJS wiring: create/join, connection roster, send/recv
src/protocol.js          message envelope: state vs. motion, throttling/coalescing
src/identity.js          returning-player identity resolution (trusts a returning
                          playerKey unconditionally, D100)
src/persistence.js       local-only persisted UI preferences (not game state)
src/deck.js              Card + Deck: build/shuffle/deal (pure logic)
src/presets.js           static game-preset definitions (deck lists, table layout)
src/rulesReference.js    static in-app rules-reference content
src/hostSettings.js      host's own sticky pre-game settings (deck/preset choice)

tools/botRequests.mjs    pure: unanswered "add a bot" requests + refusals
tools/gin/               the Gin bot core, strategies and the runner (D137)
tools/gin/playState.mjs  projects the replicated view into the fixed state
                          schema a question file refers to by path (D147)
tools/gin/strategyFile.mjs  loads a question-file strategy; rejects any
                          instruction carrying a card name or a number
tools/gin/strategies/    question-file strategies, static JSON (D147)
tools/gin/jevStrategy.mjs  project, ask once, act - no rule list (D147)
tools/gin/strategyKinds.mjs  one lookup resolving a name to either kind

src/pileables/           the Pileable -> Stackable -> Card/Chip/Token hierarchy
src/piles/               the Pile -> Stack (+ every derived pile KIND) hierarchy
src/zones/                the Zone -> SharedZone/PerPlayerZone hierarchy
src/pileActions.js       per-card action table AND the separate pile-level
                          action table - two questions, two tables, not merged
src/cardTransforms.js    FLIP/ROTATE as real polymorphism (extends the Pileable
                          hierarchy), not a type-conditional branch in state.js
src/dropTarget.js        drop-target resolution shared by drag-and-drop

src/ui.js               DOM rendering: card/pile/zone rows, action menus,
                         drag-and-drop wiring, roster, connection status
src/main.js              wires session + state + ui together; owns local-only
                         view state (table zoom/pan, focus-zoom)
src/components/          registered Web Components - see docs/UI_ARCHITECTURE.md
src/seating.js           pure per-viewer seat rotation + seat geometry
src/handOrder.js         pure client-side hand sort/manual-reorder reconcile
src/touchDrag.js         pure press-and-hold touch-drag gesture recognizer
src/panelLayout.js       per-browser persisted pile/zone move+resize state
src/layoutOverrides.js   preset-declared default layout overrides
src/focusZoom.js         pure clamp math for the focus-zoom overlay
src/cardMotion.js        pure travel math + the FLIP/glow players (US-123)
src/playerColors.js      pure: a person's seat index -> their colour (US-123)
src/botOffers.js         pure: which Jev players are offering bots (US-122)
src/botThoughts.js       pure: a bot's decisions, filtered out of table talk
src/tableZoom.js         pure math for the table-zoom wheel, drag-to-pan, pinch
src/qrcode.js            vendored QR renderer (no runtime network call)
src/assetPath.js         static asset path resolution

tests/*.test.js          node:test unit tests (pure logic) - `npm test`
tests/*.browser.mjs      real-browser Playwright suites (DOM wiring, live
                         interaction) - each its own `npm run test:*` script,
                         not part of `npm test` since they need a browser
```

This list is a snapshot, not a contract — if a module here has since been
renamed or removed, prefer the actual source tree over this list; update
it when you notice drift rather than treating a mismatch as a bug report.

## Testing strategy

Pure logic (`deck.js`, `state.js`, the domain-model classes, `protocol.js`,
`seating.js`, `handOrder.js`, `touchDrag.js`, `focusZoom.js`, `tableZoom.js`,
and friends) is unit-tested with Node's built-in `node:test` — `npm test`,
no framework dependency needed.

Multi-peer behaviour is covered by the multi-player harness (US-118,
D135): `tests/harness/multiplayer.mjs` stands up a real host plus N real
guests (one headless Chromium page each, over the real PeerJS broker)
and drives them by protocol actions through `window.__recardHarness`
-> `submitAction`, the same funnel every UI button uses. Tests await
convergence on each peer's structured view and inspect the DOM through
one `query()` helper. First scenario: `tests/multiplayer.browser.mjs`
(`npm run test:multiplayer`). It covers cross-client STATE; `motion`
messages (live drag/cursor sync) aren't asserted yet. The harness also
supplies the static server and Chromium launcher every browser test
file uses.

The same harness is exposed to agents as an MCP server (US-119, D136):
`tools/mcp/harnessServer.mjs`, registered as `recard-harness` in
the committed `.mcp.json`. It starts a live table, acts as any named player, reads
views/DOM/WebRTC traffic (`Session`'s bounded `trafficLog`), and
captures screenshots with a saved contact sheet.

Several single-client, real-Playwright-browser suites fill the gap for
everything that doesn't need a second peer, each its own `npm run test:*`
script (see Module Layout above for the file list): card-action wiring
through the context menu, a full RtG playthrough, the pre-game host-setup
picker, New Game, the table-zoom wheel/pan, and the focus-zoom
grow-in-place interaction. `npm run lint:design` is a further real-browser
check specifically for layout/overlap/touch-target invariants (see UI
Conventions in `docs/UI_ARCHITECTURE.md`) across several real viewport
sizes.

`npm run lint:js` (ESLint, flat config, `unicorn` + `sonarjs`) and
`npm run lint:style` (Stylelint) run on every push-worthy change.
`make check-decisions` and `make check-story-numbers` verify
`docs/DECISIONS.md` and `docs/USER_STORIES.md` each have no duplicate
number, respectively.

## Open, standing backlog items

See `docs/BACKLOG.md` — the single consolidated list (this section used
to duplicate it, along with `docs/USER_STORIES.md`'s own "Deferred /
Stretch" section and the running narrative in
`agents/cypher.docs/state.md`; consolidated 2026-09-17 for the same
reason this file was split from a decision dump).
