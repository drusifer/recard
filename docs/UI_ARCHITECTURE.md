# UI Architecture — Recard

**Owner:** Morpheus (Tech Lead)
**Status:** present-state description of rendering, Web Components, and
the camera/view features. For history and rationale, see
`docs/DECISIONS.md`.
**Part of:** `docs/ARCHITECTURE.md`'s documentation set.

## ui.js / main.js split

`ui.js` builds and returns DOM — card faces, pile rows, zone panels,
action menus, drag-and-drop wiring — as pure-ish functions taking data
and an options bag of callbacks. `main.js` owns everything stateful:
the session/reducer wiring, dispatching an action when a callback
fires, and every piece of **local-only view state** (table zoom, table
pan, which pile is focus-zoomed, panel layout overrides) that never
touches the network. `ui.js` never dispatches an action or reads
`state.js` directly; `main.js` never builds DOM directly beyond calling
into `ui.js`/the Web Components.

## Web Components

Every pile/zone type renders through one of a small set of registered
custom elements (`src/components/`, each a light-DOM wrapper around a
thin `render(...)` call into the matching `ui.js` function — the
component owns almost no logic of its own; `ui.js`'s function is the
actually-tested unit):

- **`<zone-panel>`** — the box: border, padding, title bar, and every
  Pile it holds as a child. Owns move/resize; never draws card content.
- **`<pile-panel>`** — the flat-row case (every kind except a hand's fan
  or a deck's stack): its own Actionable title bar plus a wrapped card
  row and drop-target wiring.
- **`<fan-pile>`** — a hand's fanned/arced row.
- **`<deck-stack>`** — a deck's own depth-layered visual (one real,
  draggable top card; the rest are inert decorative layers).
- **`<chip-tray>`** — a chip pile's stacked-by-denomination columns.
- **`<header-actions>`** — the shared "Actionable" title bar (icon
  buttons, an EnumAction dropdown for things like `changePileType`, a
  RangeAction slider for Tighten/Loosen) every pile/zone heading with
  actions is built from.
- **`<spread-slider>`** — the Tighten/Loosen vertical drag control
  (`shouldApplyExternalValue`'s pointer-active guard stops a live
  replicated-state update from fighting an in-progress drag).
- **`<score-zone>`** — the consolidated per-player score panel.

## Card action menus

A card offers its own actions via a **right-click context menu**
(`.card-context-menu`), reusing the same `.pile-action-menu`/
`.pile-action-menu-item` classes and styling the pile-level header
button row already uses — one visual language for "here is a list of
actions," not two. A targeted action (move/pickup) is a two-step pick:
choose the action, then click a destination pile; an in-place action
(reveal/conceal/rotate) commits immediately on click. A stack's own
gear emblem opens the same kind of popup, scoped to that one stack.

## Camera / view features

Three per-player, local-only (never replicated) view mechanisms, layered
on `#zones` via CSS custom properties:

- **Table zoom** — a vertical drag "wheel" control (`#table-zoom-wheel`,
  deliberately not the real scroll wheel, which stays free for ordinary
  page scrolling) plus S/M/L/XL quick presets. Sets `--table-zoom`,
  applied as `scale()` on `#zones`.
- **Drag-to-pan** — dragging the empty table background (never a pile,
  card, or button — those keep their own interactions untouched) moves
  the view. Sets `--table-pan-x`/`--table-pan-y`, applied as
  `translate()` *outside* the scale (so a screen-pixel drag reads as the
  same pan distance regardless of current zoom level). The pan bound
  grows with how far past 1x the table is zoomed in, and is zero at or
  below 1x (`maxPan`/`clampPan`, `tableZoom.js`).
- **Focus-zoom** — hovering (after a short intent delay) or clicking a
  pile grows it in place as a `position: fixed` overlay anchored at its
  own on-screen rect, reparented to `<body>` (so it can escape `#zones`'
  own transform/stacking context) with an invisible placeholder left
  behind so nothing else in `#zones` reflows. The grown scale is capped
  (`clampFocusZoomScale`) so it never exceeds the viewport even for a
  pile with an unusually wide header. Opening that pile's own context
  menu or stack-gear menu cancels any pending grow — a menu opening
  and closing quickly must not leave a stale hover-intent timer to fire
  later and grow an orphaned pile mid some unrelated interaction
  (`PILE_MENU_OPENED_EVENT`, the seam between `ui.js`'s menu code and
  `main.js`'s timer).

Pinch-to-zoom math exists (`zoomFromPinch`, `tableZoom.js`, unit-tested)
but is not yet wired to a live touch listener — standing backlog, not
shipped unverified without a real touch device to confirm against.

## UI Conventions

- **Interactive elements are ≥44×44px** (iOS HIG / Material minimum),
  including secondary/small buttons. `npm run lint:design`
  (`tests/designLint.check.mjs`) checks every visible button clears
  this floor, measured at its *authored* size across several real
  viewports via a real headless browser — not a style guideline, an
  enforced invariant.
- **No zone ever overlaps another zone** (shared or personal), checked
  by the same `lint:design` pass across the same viewport set.
- **No pile draws its own box or handles its own move/resize** — that's
  always the containing Zone's job (see `docs/DOMAIN_MODEL.md`).
