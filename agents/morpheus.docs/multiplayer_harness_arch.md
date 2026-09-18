# Multi-player Test Harness — Architecture (US-118, Tier 2 sprint)

Builds on Morpheus's 2026-09-18 design (morpheus.docs/state.md); the
three user-confirmed calls stand: drive by protocol not clicks, DOM
queries stay local via `page.evaluate()` (no wire query/reply), every
peer a real headless Playwright page.

## Refinement found reading main.js (vs. the saved design)

The saved design had two role-specific entry points (`dispatchLocal`
host / `sendAction` guest). The code already has ONE shape repeated at
~27 call sites:

    if (role === 'host') dispatch({ ...action, playerId: myId });
    else session.send({ type: 'action', action });

So: extract that once as `submitAction(action)` in main.js, migrate the
call sites to it (removes 27 copies of the branch), and the harness
calls `submitAction` - the harness then provably exercises the exact
funnel every UI button uses, with one role-agnostic `act()`. Same for
views: `currentView()` already exists (host `viewFor(gameState,myId)`,
guest `latestView`) - the harness reads that, no new role branching.

## Components

1. **`window.__recardHarness`** (main.js, unconditional - D1 no build
   step; not a new trust surface, the host authorizes by sending
   connection per D27): `act(action)` -> `submitAction`,
   `view()` -> `currentView()`, `myId()`. (`role()` dropped at impl - no
   test needed it.)
2. **`query(selectors)`** - lives Node-side in the harness as a single
   `page.evaluate` helper (rect, text, attrs per selector); nothing
   DOM-query-shaped is added to app code.
3. **`tests/harness/multiplayer.mjs`** - `startStaticServer(port)`,
   `launchChromium()` (the system-Chromium fallback, copied once from
   the existing browser tests), `createTable({ browser, baseUrl,
   players, preset? })` -> `{ host, guests, close() }`. Each peer:
   `.page`, `.act(action)`, `.view()`, `.waitForView(predicateSrc)`
   (page.waitForFunction, bounded timeout), `.query(selectors)`.
   Join uses the real UI join flow (`#join-code`/`#join-btn`) with
   the code read off the host's `#game-code`.
4. **`tests/multiplayer.browser.mjs`** - host + 2 guests scenario per
   US-118 AC; npm `test:multiplayer`; Makefile `test-multiplayer`
   (+ .PHONY + help), copying `test-tablezoom`'s shape.

D-number recorded after implementation+verification (project pattern).
