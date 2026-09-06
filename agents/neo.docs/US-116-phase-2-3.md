# US-116 Phase 2+3 handoff

New Game button lives in `#layout-controls` (host-only, away from the
deck panel's "Restart game" action per Smith Gate 1). Reuses
`#host-form`'s preset/deck-choices/layout picker VERBATIM (same DOM
nodes, not a copy) - `configsForPreset()` extracted so Create Table and
New Game build `deckConfig`/`gameConfig` from one shared function.
Confirm dialog (`globalThis.confirm`, same pattern `performResetLayout`
already uses) gates the actual `NEW_GAME` dispatch. Guests get a banner
via `noticeNewGameIfPresetChanged`, diffing the replicated
`gameConfig.presetName` (D116) on every render.

## Real bug found and fixed while testing live
`#screen-game { display: flex }` (id selector, style.css:99) outranks
the UA stylesheet's `[hidden] { display: none }` - same specificity
gotcha already fixed for `.btn-row[hidden]`/`.deck-choices[hidden]`
elsewhere in this file, just never hit for `#screen-game` before because
it only ever went hidden->shown ONCE per table. New Game navigates back
to `#screen-host` mid-game, and without `#screen-game[hidden] { display:
none }` the live table stayed visible underneath the picker. Screenshot
before/after confirmed the fix.

## Tests
5 new Playwright tests in `tests/newGame.browser.mjs` (`npm run
test:newgame` / `bobp make test-newgame`): button placement, Cancel is
a no-op, Start rebuilds for the new preset with a confirm dialog, table
code is unchanged, scores reset to 0. 683 unit tests + all 4 browser
suites (ui/rtg/hostsetup/newgame) green. lint-js/lint-style clean.

## Known gap
The guest-side banner has no automated 2-peer test - this project has
no 2-peer (host+guest) browser harness yet (tracked as a standing
backlog item, mouse.docs/state.md: "reconnect-after-refresh... browser-
automation tooling"). Verified by code review only:
`noticeNewGameIfPresetChanged` runs inside `renderGameFromView`, the
single funnel both host and guest renders go through.
