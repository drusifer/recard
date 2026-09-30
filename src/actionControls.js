// US-133/D160, cluster 4a: the controls an action header and a stack menu are
// made of - an icon button, an enum dropdown, a range slider - moved out of
// `ui.js` unchanged. One contract for "here is a control for this action id",
// shared by `<header-actions>` and the stack's gear menu (`ui.js`). A plain
// module: it touches `document` only when called.
/**
 * UX follow-up (direct user request, 2026-08-24): "small square icons
 * ... with tool tip style hover text ... keep each button the same
 * size." The button's visible content is just `spec.icon` now - the
 * full name (an override from `labels`, or `spec.label`) moves to
 * `title` (a native tooltip) and `aria-label` (so the icon-only button
 * still has a real accessible name, not just a glyph). Shared by both
 * `<header-actions>` (piles/zones) and `attachActionRow` (cards) so
 * the icon-button contract can't drift between the two.
 */
export function applyIconButton(button, spec, labelOverride) {
  const label = labelOverride ?? spec.label;
  button.textContent = spec.icon;
  button.title = label;
  button.setAttribute('aria-label', label);
}

/**
 * UX follow-up (direct user request, 2026-08-24): "the radials are not
 * working... use a header on Piles and Zones to display the actions
 * ... as a set of buttons next to the title." Retires D52's pointer-
 * centered radial menu entirely for pile/zone-level actions - the
 * heading itself IS the action row now, always visible, no hover state
 * to get wrong. Dispatch keeps D51/D36's split: an in-place action or a
 * STATIC `singleTarget` action (Draw) fires the moment it's clicked;
 * every pile-level action today is one of those two shapes (none needs
 * a "choose a destination" step - see `renderPileAnchor`'s own note),
 * so no targeting-mode branch is needed here at all.
 *
 * UX follow-up (continuing the Web Components pass): takes `container`
 * instead of creating its own `<div>`, same shape as `renderDeck`/
 * `renderPileCards` - so `<header-actions>` (`src/components/
 * HeaderActions.js`) can call this against `this`, the same "thin
 * adapter around proven logic" every other component in this pass uses.
 *
 * @param {HTMLElement} container
 * @param {string} titleText e.g. "Hand (7)"
 * @param {string[]} actionIds
 * @param {{labels?: Record<string,string>, disabled?: string[],
 *   onAction: (actionId: string, value?: string) => void, draggable?: boolean,
 *   headingId?: string, headingClass?: string, rawName?: string,
 *   onRename?: (name: string) => void,
 *   enumOptions?: Record<string, {value: string, choices: {value: string, label: string}[]}>}} opts
 *   `enumOptions[id]` supplies an EnumAction id's current value and full
 *   choice list (`buildEnumActionMenu`) - `onAction`'s second arg is only
 *   ever populated for one of those ids.
 */
/**
 * An action id that isn't a plain single-click button: an EnumAction
 * (`spec.enum`, e.g. `changePileType`, `buildEnumActionMenu`) or a
 * RangeAction (`spec.range`, e.g. `spread`, `buildRangeAction` -
 * Tighten/Loosen slider, 2026-09-13). Extracted out of
 * `<header-actions>`'s own action loop so that loop stays under its
 * cognitive-complexity budget as more of these special cases join
 * plain buttons - each one is a self-contained "does this id need
 * something other than a button, and if so what" check.
 *
 * @returns {HTMLElement|undefined} the control to render instead of a
 *   button, or `undefined` for a plain action.
 */
export function buildSpecialActionControl(id, spec, options) {
  const enumInfo = spec.enum ? options.enumOptions?.[id] : undefined;
  if (enumInfo) return buildEnumActionMenu(id, spec, enumInfo, options);
  const rangeInfo = spec.range ? options.rangeOptions?.[id] : undefined;
  if (rangeInfo) return buildRangeAction(id, spec, rangeInfo, options);
}

/**
 * *nit (direct user request): "a menu for the change pile action and
 * give me an indication of the currently selected pile type." Builds an
 * EnumAction's header control: a native `<details>/<summary>` disclosure
 * (open/close, keyboard, click-outside-to-close all free from the
 * browser - no bespoke show/hide state to get wrong, same "reach for the
 * platform first" instinct as this file's native HTML5 drag) rather than
 * a plain `pile-action-btn`. The summary itself IS the indicator - it
 * shows the CURRENT choice's label, not just a generic icon, so a
 * glance at the header says what this pile is right now, not only what
 * it could become. Not a `<button>`, so it's naturally outside the
 * design-lint 44px-floor check's selector (same as `.pile-action-btn`
 * is deliberately exempted) - the small habitual header-control sizing
 * this whole row already uses, not a new exemption to add. The MENU
 * ITEMS below it, though, are real `<button>`s a viewer taps to commit
 * to - sized to the 44px floor on purpose (`style.css`'s
 * `.pile-action-menu-item`), unlike the compact toggle, since these ARE
 * the primary target once the menu is open.
 *
 * @param {string} id the action id (e.g. `'changePileType'`)
 * @param {{label: string, icon: string}} spec
 * @param {{value: string, choices: {value: string, label: string,
 *   preview?: () => HTMLElement}[]}} enumInfo `choice.preview` (US-145/
 *   D167) is optional and generic - not Flip-specific - a factory
 *   called fresh per menu open, rendered ALONGSIDE `choice.label` inside
 *   the same button, never replacing it (Smith's Gate 1 condition,
 *   WCAG 1.4.1 - a picture is decoration, the word is the real signal).
 * @param {{onAction: (id: string, value: string) => void}} options
 */
function buildEnumActionMenu(id, spec, { value, choices }, options) {
  const details = document.createElement('details');
  details.className = 'pile-action-enum';

  const current = choices.find((c) => c.value === value);
  const summary = document.createElement('summary');
  summary.className = 'pile-action-enum-btn';
  summary.textContent = `${spec.icon} ${current?.label ?? value}`;
  summary.title = spec.label;
  summary.setAttribute('aria-label', `${spec.label}: ${current?.label ?? value}`);
  // US-145/D167: found live wiring this into a stack's own gear menu -
  // `<action-menu>` (`ActionMenuElement`) closes itself on ANY document
  // click that isn't one of its own rows' explicit `stopPropagation()`
  // (`#rowFor`, `ActionMenu.js`). The native `<summary>` toggle has no
  // such call, so opening the disclosure inside that popup closed the
  // WHOLE popup on the very click meant to open it. `<header-actions>`
  // never hit this because it renders the enum control inline, outside
  // any such popup - this is specific to reusing it inside one.
  summary.addEventListener('click', (event) => event.stopPropagation());
  details.append(summary);

  const menu = document.createElement('div');
  menu.className = 'pile-action-menu';
  for (const choice of choices) {
    const item = document.createElement('button');
    item.type = 'button';
    const isCurrent = choice.value === value;
    item.className = 'pile-action-menu-item' + (isCurrent ? ' pile-action-menu-item-current' : '');
    if (choice.preview) item.append(choice.preview());
    item.append(document.createTextNode(choice.label));
    if (isCurrent) item.setAttribute('aria-current', 'true');
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      details.open = false;
      if (!isCurrent) options.onAction(id, choice.value);
    });
    menu.append(item);
  }
  details.append(menu);
  return details;
}

/**
 * Tighten/Loosen slider (direct user request, 2026-09-13): a
 * RangeAction (`spec.range`, e.g. `spread`/`spreadStack`) renders as
 * one `<spread-slider>` (`components/SpreadSlider.js`) instead of a
 * button - the same "static spec + per-instance value/bounds at the
 * render call site" split `buildEnumActionMenu` above already uses
 * (`rangeOptions` here, `enumOptions` there).
 *
 * The slider fires live on every drag tick (the user's own answer at
 * Smith's gate) via its `spread-input` event, forwarded straight to
 * `options.onAction(id, value)` - the same second-argument shape
 * `buildEnumActionMenu`'s choice buttons already use.
 *
 * @param {string} id the action id (e.g. `'spread'`)
 * @param {{label: string}} spec
 * @param {{value: number, min: number, max: number}} rangeInfo
 * @param {{onAction: (id: string, value: number) => void}} options
 */
export function buildRangeAction(id, spec, { value, min, max }, options) {
  const slider = document.createElement('spread-slider');
  slider.className = 'pile-action-range';
  slider.setAttribute('min', String(min));
  slider.setAttribute('max', String(max));
  // `step="any"`, not `0.1`: `SET_STACK_SPREAD` rounds to 3 decimal
  // places, not to a 0.1 grid, and a fixed 0.1 step from `min` (0) can
  // never actually LAND on a kind's own ceiling when it isn't a clean
  // multiple of 0.1 - a card pile's own 0.85 is exactly this case,
  // found live: the browser refuses a `step`-misaligned value outright
  // (a stack could drag to 0.8 but never reach its true maximum).
  slider.setAttribute('step', 'any');
  slider.title = spec.label;
  slider.setAttribute('aria-label', spec.label);
  // A completed drag on a native range input fires a real `click` that
  // bubbles - inside `openStackActionMenu`'s popup, that click would
  // otherwise reach the document-level outside-click listener that
  // closes the menu (`<action-menu>`'s own), dismissing it the instant
  // a drag finishes. Every button in these menus already stops this
  // same propagation in its own click handler for the same reason.
  slider.addEventListener('click', (event) => event.stopPropagation());
  slider.addEventListener('spread-input', (event) => {
    options.onAction(id, event.detail.value);
  });
  // Set as a property, not just the initial attribute: `connectedCallback`
  // reads the attribute once on first connection, but a later external
  // update (this pile's spread changed - by this viewer's own drag once
  // it round-trips through replicated state, or by someone else's) has
  // to go through the property setter's own drag-guard
  // (`shouldApplyExternalValue`, `SpreadSlider.js`) to avoid fighting an
  // in-progress drag.
  slider.value = value;
  return slider;
}
