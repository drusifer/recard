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

- **The RtG bot is unsure about starting its own turn** (Smith, US-127
  close): `untap_all` came back at 0.12 confidence on the first live
  run - it nearly passed instead of beginning its turn. Nothing broke,
  but the obvious moves should not be close calls. Worth a handful of
  live turns and possibly clearer `step.criteria` wording.
- **Nothing authorises whose turn it is** (Morpheus, US-127 retro): the
  bot tracks turn and phase from table talk, which is the one piece of
  state with no authority behind it. If two players disagree, nothing
  resolves it today. US-128 narrowed it: when the bot is unsure it now
  asks ONE yes/no and abides by the answer, so a person at the table is
  the authority. A real disagreement between two people is still open.
- **No doc page for running an RtG bot** (Oracle, US-127 retro): the
  game file documents the rules, but how to RUN one lives only in a
  comment at the top of `tools/rtg/adapter.mjs` (was `rtg/player.mjs`,
  retired by US-128).
- **RtG combat is unplayed LIVE** (US-127; narrowed by US-129): two
  bugs kept it unreachable - a pass advanced no phase, and every RtG
  action named a card by NAME, not id. Both are fixed and tested
  (`tests/rtgTurn.test.js`), but no live table has been through a
  combat step yet. Needs one live RtG turn at a hosted table.

- **Play a hand with a question-file strategy** (US-125 close,
  2026-09-20): everything below live play is proven with a scripted
  judge; nobody has watched `jev-balanced` actually play. Needs
  `TYPESAFE_API_KEY`:
  `bobp make jev-player GAME=gin STRATEGY=jev-balanced CODE=<code>`.
- **Tune the question files against played hands** (the user's own
  sequencing: "+1 for tuning but that comes next"). Needs a bench -
  bot vs bot over N hands, scored - before any weight or threshold is
  argued about.
- **`docs/GIN_STRATEGY.md` still documents only the rule catalogue**
  (Oracle, US-125 retro): no mention of question-file strategies or
  the fixed state schema.
- **Retire the rule-list strategies** (D148): `ginRequest()`,
  `askJev()` and `strategies.mjs` go together, in the sprint that
  retires the benchmark - not before.

- **Bot decisions flood table talk** (Smith's gate, 2026-09-20, US-121):
  every bot decision is now a talk line, so three decisions buried the
  humans' own conversation under four lines. The thought bubble already
  carries that detail. Candidate: keep `bot-decision` lines out of the
  `<table-talk>` panel (they still travel, and the bubbles still show
  them), while knock/gin announcements stay visible. NOT done in-sprint:
  hiding a message class from the log is a product call.
- **A bot's visible history is capped at the talk log's 100 entries**
  (Morpheus, US-121 retro): a long game's earliest decisions fall off
  the top of the bubble. Accepted in D142; revisit if it bites.
- **`docs/UI_ARCHITECTURE.md` has no entry for the three new components**
  (Oracle, 2026-09-20): `<thought-bubble>`, `<add-bot>` and the
  spectator roster marking. Filed rather than claimed done.

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
  "ship it unverified, I accept the risk". The multi-player harness
  (US-118/D135, `tests/harness/multiplayer.mjs`) now covers
  cross-client STATE; motion/cursor assertions would need it extended
  to `motion` messages.
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

- **Multi-player harness follow-ups** (US-118 retro, 2026-09-18):
  extend `tests/harness/multiplayer.mjs` to assert `motion` messages
  (unblocks the remote-cursor redesign); `waitForView` predicates run
  in-page and silently can't capture closures - a trap for test
  authors; `createTable` without `cardsPerPlayer` times out instead of
  failing fast; concurrent `bobp make` runs clobber each other's
  `build/build.out`.
- **Gin bot tuning** (US-120, 2026-09-19): in the live Jev examples
  (`docs/GIN_STRATEGY.md` §7) the opponent-threat Score never reached 3,
  even in a state written as "one card from gin" (1.57), so
  `knockUnderThreat(3)` never fired; the helps Nouls sat close together
  (.19-.34). Options: lower the threshold, or give Jev more history.
  Also: `layoffExposure` is computed but no strategy uses it to decide
  whether to knock (undercut risk).
- **Harness MCP follow-ups** (US-119 retro, 2026-09-18): `screenshot`
  of one element (`selector`) and/or a `viewport` option on
  `game_start` - at the default 1280x720 a big preset canvas (War) fits
  at small zoom and card detail is hard to read in a capture; a guest's
  traffic log resets on reconnect (new Session) - fine today, surprising
  if someone debugs a reconnect with it.
  Smith's spin through the live tools (2026-09-19) added four more,
  all `player_query`/`player_wait` output: form fields report `text: ""`
  instead of their `value` (the deck's deal-count input shows 26 on
  screen); hidden matches (closed pile-type menus) come back with full
  rects, indistinguishable from visible ones - add a `visible` flag;
  a predicate that throws returns a bare `TypeError` without saying the
  predicate threw; `text` joins child elements with no separator.
- **Browser-automation tooling for Smith's own UX gate** — distinct
  from Neo's existing Playwright test scripts; Smith's end-to-end
  sprint-close testing is currently manual.
- **Dropping a card on a hand stack splits the stack instead of merging
  it in** (nit, queued 2026-09-17, direct user report) — not yet
  triaged.
- **`onPileLeave`'s held-button guard is unproven in Chromium**
  (Trin, 2026-09-18) — `focusZoom.browser.mjs`'s slider test passes
  with the `event.buttons !== 0` guard REMOVED: a range input captures
  the mouse while held, so the pile gets no `pointerleave` mid-drag at
  all. Kept as defensive code (other browsers / other drag sources may
  need it); nothing currently proves it load-bearing.
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


## From the US-128 retro (2026-09-22)

- **A Jev bot's budget exit is silent at the table** (Smith C5, US-128
  gate): a bot asked to leave says goodbye, but one whose STEPS or HANDS
  run out only writes to stderr and disconnects. The user's call whether
  it should say goodbye too.
- **Join lines name the game by its internal id** (Smith, US-128 test):
  "I can deal in another rtg bot" - a person reads "Recard the
  Gathering". Same for "gin". Heuristic #2.
- **RtG moves never reach the thought bubble** (same review):
  `botThoughts.js` shows only `bot-decision` talk; RtG narrates as
  `rtg-move`. Either RtG speaks `bot-decision`, or the bubble reads a
  shared kind. That belongs in the runner's contract, not in each game.
- **The via index has no entries for `tools/**/*.mjs`** (Oracle, US-128):
  every symbol lookup this sprint fell back to grep.

## From US-129 (2026-09-23)

- **A GAMES map still lives in `tools/jevPlayer.mjs`**: games are data
  now (`games/<game>/`), but the CLI still lists adapters by hand. A
  third game should make that a directory scan plus a naming convention.
- **Gin's D137 rule lists are the last Jev players in code** (D148): they
  retire when the bench says the question-file players beat them.
- **CLI errors say "strategy" where authors now think "player"** (Smith,
  US-129 test): "unknown rtg strategy "x" - choose one of: ..." lists
  player files. Heuristic #4. STRATEGY= stays (renaming breaks every
  documented command); only the message wording is in question.

- **RtG bots assume one opponent; RtG can have several, and allies**
  (user, 2026-09-23). `buildRtgState` exposes a single `opponent` = the
  first player who isn't me, and does not skip spectators. The rules
  reference also says "Two players". Seated players (roles are data,
  spectators out) should all reach the questions; who is an ally or an
  opponent, who is attacking me and whose turn follows mine are Jev
  judgments over the board and table talk.
- **`test-harness-mcp` failed once in 6 runs** (2026-09-23): `game_start`
  gave up after ~19s with no table, and the tests that share its table
  cascaded. Cause unproven - the test's `call` helper drops the tool's
  error text, so nothing says why. First step: surface `isError` text in
  the helper; then find out whether it is the public PeerJS broker (D2).
