# Backlog — Recard

Owner: Cypher (PM), with technical-debt items owned by Morpheus/Trin.
This is the single, consolidated list of open (not-yet-done) work -
consolidated 2026-09-17 from three places it had been scattered across
(`docs/ARCHITECTURE.md`'s own "Open, standing backlog items" section,
`docs/USER_STORIES.md`'s "Deferred / Stretch" section, and the running
narrative in `agents/cypher.docs/state.md`), for the same reason
`docs/ARCHITECTURE.md` itself was just split from a decision dump: one
place to look, not several that drift out of sync with each other.

Not a queue with an order - items get picked up by direct user request
or when a sprint has room. Each entry says who flagged it and, where
relevant, whether it needs the user's own judgment call before it can
be started (a design decision, an architectural conflict to reconcile,
or a live-verification session) versus being pickable directly.

## Product

- **Reconnect-to-session after refresh/drop** — if a client's own tab
  reloads (or the host's does), there is no way to resume the session;
  a known v1 limitation, standing since the original architecture
  (`docs/DECISIONS.md` D6).
- **Builder screen** — standing idea, not yet scoped into stories.
- **Flip as a radio box with preview icons** (Neo, queued) — replace
  the single Flip action with a radio control listing orientations
  directly, each with a small icon/image showing the resulting
  arrangement. Needs the user's own visual-design input (icon
  rendering, layout) before implementation - not a fix-loop's to guess.
- **Zone-level privacy** (Neo, queued) — a pile inside a player's own
  PlayerZone defaulting to hidden-from-everyone-but-owner, like a hand
  card. **Not blocked** (corrected 2026-09-17, direct user
  clarification - an earlier pass here had wrongly read this as
  conflicting with `docs/DECISIONS.md` D83/D84): D84 governs the DATA
  only (every viewer's own `view` always carries the real card) -
  RENDERING is a separate, per-viewer question that's always been
  allowed to differ, which is exactly what `HandPile`'s own
  `showsFace()` split already does today (`PlayerHandPile` always
  renders the owner's real face; `OpponentHandPile` always renders a
  back, regardless of the card's own `faceUp`). The real work is
  generalizing that same owner/opponent rendering split to piles inside
  a `PerPlayerZone` generally, not just the built-in Hand kind - a
  rendering-class change, not a data-model one, and pickable directly.
- **Remote-cursor redesign** (Neo, queued; no back-compat) — replace
  exact-coordinate/transform cursor mirroring with an animate-to-target
  model (glide onto whatever pile/zone the other client's pointer just
  entered, rather than following live pixel coordinates). Needs either
  a live 2-person test session with the user watching, or an explicit
  "ship it unverified, I accept the risk" - there is no automated
  two-peer harness (see Technical, below) to verify live cross-client
  behavior any other way.
- **Pinch-to-zoom for the table-zoom wheel** (Neo) — the math exists
  and is unit-tested (`zoomFromPinch`, `src/tableZoom.js`) but is not
  wired to a live touch listener; no touch device available to verify
  against. Needs a live verification session on a real touch device, or
  an explicit decision to ship it unverified.
- **XL table zoom pushes the player's own hand below the fold** (Smith,
  non-blocking) — bends the standing "see table + hand together"
  principle; an accepted trade-off for a deliberate oversized view, not
  a defect, but worth a future look.
- **A focus-zoomed pile visually overlaps its parent Zone's own chrome**
  (Smith, non-blocking) — reads slightly cluttered; a shadow/dimmed-
  backdrop treatment would likely help. Real design call for the user.
- **Pin a focus-zoomed pile open with an explicit close (X) button**
  (nit, queued 2026-09-17, direct user request) — currently the
  overlay shrinks back on `pointerleave`/click-away; user wants it to
  stay zoomed (to adjust spacing/interact with cards) until they either
  zoom into another pile or click a top-right X, rather than losing
  focus involuntarily. Not yet triaged.
- **SaveAs's `window.prompt()`** (Smith, non-blocking, flagged
  2026-08-27) — a browser-native prompt for naming a saved layout;
  works but is not a designed UI. Not re-confirmed as still relevant
  since it was flagged - worth a quick re-check before picking up.

## Technical / testing

- **No real, automated two-peer end-to-end test harness** — the
  earlier one (`tests/e2e.smoke.mjs`) was removed (`docs/DECISIONS.md`
  D60) after drifting out of date with a DOM redesign; nothing has
  replaced it since. Anything that needs a real second peer (cross-
  client motion sync, reconnect behavior, live cursor redesign above)
  is currently unverified by automation and needs manual two-tab
  testing. Blocks the remote-cursor redesign item above from being
  shippable with real confidence.
- **Browser-automation tooling for Smith's own UX gate** — distinct
  from Neo's existing Playwright test scripts; Smith's end-to-end
  sprint-close testing is currently manual.
- **Dropping a card on a hand stack splits the stack instead of merging
  it in** (nit, queued 2026-09-17, direct user report) — not yet
  triaged.
- **Deck panel resizes as its stack thins** (Trin, found 2026-09-17) —
  violates its own "keeps its size while thinning" invariant
  (`tests/uiActions.browser.mjs`, "the deck visibly thins out as it
  empties, without the panel resizing" — panel height 224px -> 119px
  observed live). Confirmed as its own independent bug, not downstream
  of the now-fixed focus-zoom/context-menu issue. Not yet triaged.
- **Flaky test: "dragging the pile's own spread slider outside its
  bounds does not shrink the pile mid-drag"** (Trin, found 2026-09-17,
  `tests/focusZoom.browser.mjs`) — the post-mouseup `waitForFunction`
  (expects the focus-zoomed overlay to shrink) intermittently times out
  at 2000ms. Confirmed PRE-EXISTING via an 8-run baseline against
  unmodified `dev` (1 failure in 8) - not a regression from the
  Table-Zone/D132 zoom work done the same session, just newly noticed
  while re-running suites for that fix. Root cause not yet
  investigated; violates this project's own zero-flake standard, so
  worth a dedicated pass rather than a bumped timeout.
- **Morpheus's process note** (2026-08-27): check a record's id
  survives a round-trip before designing any future save-for-reuse
  feature on top of it - came out of a real live bug (Table pile's
  Remove button always failing) in the Save Layout work. Not a
  standing bug itself, a reminder for whoever next builds on that area.

## Dropped (direct user decision, 2026-09-17)

Not pursuing - removed at the user's explicit request, not resolved or
superseded:

- Scannable QR code for joining.
- In-app text chat or reactions.
- Custom card backs/themes.
- 5+-player mobile density.
- ~~Per-seat anchor geometry overlap at some desktop widths/player
  counts~~ — REVERSED same day (direct user request, later 2026-09-17
  session): "we can actually fix it by updating the presets with a
  table zoom that can fit all the zones." See "Not carried forward"
  below for the actual fix - this earlier "not pursuing" call did not
  hold.

## Not carried forward (checked, resolved)

- ~~**Table Zone overlaps opponent zones at narrower desktop
  breakpoints**~~ (`lint:design`'s "Table Zone overlaps Bob/You",
  grown from a documented baseline of 3 to 5 findings before being
  fixed 2026-09-17) — root cause: `#zones` used to fill whatever
  `.table-surface` the viewport left, so the seat ring (percentage-of-
  container, `seating.js`) and every preset's fixed-pixel shared-panel
  coordinates (`presets.js`) only agreed at the exact size the layout
  was calibrated against, drifting apart at every other size. Fixed by
  giving `#zones` one fixed local canvas (D132 revised - see
  `docs/DECISIONS.md`) plus repositioning `SIMPLE_LAYOUT`'s table-zone/
  score panels to clear the top seat's own zone within that canvas.
  `lint:design` clean of overlap findings at all 3 tracked breakpoints;
  860/860 unit, 7/7 `test:tablezoom`.
- ~~**Every preset's own layout, not just the default**~~ (D134, direct
  user request 2026-09-18: "update all the presets to have a
  reasonable zoom level and neatly organized table zones") —
  `lint:design` now sweeps every preset, not only whichever one the
  host form defaults to; found and fixed Gin Rummy's dead DevTools-
  captured layout (replaced with the shared, verified `SIMPLE_LAYOUT`),
  Chips & Tokens having no `layout` at all, and a `.pile-section`
  `min-width: 11rem` floor silently widening several presets' declared
  column widths enough to overlap their own neighbors (Solitaire's
  cascades, Spit's RankAdjacent piles). Also found and fixed a real,
  independent bug: `#zones`' CSS centering and its `scale()` transform
  used mismatched pivot points, badly misaligning the table whenever a
  preset's own `tableCanvasSize` differed much from the shared default
  (confirmed live for War's 26-card hand). Two presets carry a KNOWN,
  accepted zone-overlap exception (still logged, not gating): Recard
  the Gathering (Smith's own Gate-1 C3 crowding finding) and Solitaire
  (solo-designed, but nothing stops a second player from joining and
  claiming a seat-ring position the solo grid never accounted for) -
  see `tests/designLint.check.mjs`'s `KNOWN_EXCEPTIONS` and
  `docs/DECISIONS.md` D134 for the full writeup.
- ~~**7 cognitive-complexity lint findings**~~ (flagged 2026-08-27) —
  `npm run lint:js` reports zero `sonarjs/cognitive-complexity`
  findings as of 2026-09-17; resolved at some point without being
  logged here. Dropped rather than carried forward stale.
- ~~**2 minor visual overlaps**~~ (flagged 2026-08-27, no further
  detail recorded) — never re-confirmed in any later sprint's own
  standing-backlog restatement; dropped as unverifiable rather than
  carried forward as a vague, undated item. If this recurs, please
  re-file with the specific piles/zones involved.
- ~~**Radial action menu, pointer-centered**~~ — shipped (D52,
  2026-08-21).
- ~~**Tighten/Loosen as a slider**~~ — shipped (`/sprint sliders`,
  2026-09-13).
- ~~**Check story-number uniqueness**~~ — shipped
  (`tools/checkStoryNumbers.mjs`, 2026-09-12).
- ~~**Focus-zoom/context-menu stuck-open bug**~~ — fixed 2026-09-17.
