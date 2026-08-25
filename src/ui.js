import { step as touchDragStep, HOLD_MS } from './touchDrag.js';
import {
  ACTION_SPECS, actionsForCard, pileLevelActions, targetsForAction, resolveDropTargetFor,
  disabledPileActionsFor, rowShapeFor,
} from './pileActions.js';
import { seatPosition } from './seating.js';

const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RED_SUITS = new Set(['diamonds', 'hearts']);

export function cardLabel(card) {
  if (card.rank === 'JOKER') return 'JOKER';
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function cardEl(card, { onClick, disabled } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card' + (RED_SUITS.has(card.suit) ? ' card-red' : '');
  el.dataset.cardId = card.id;

  if (card.rank === 'JOKER') {
    const pip = document.createElement('span');
    pip.className = 'card-pip';
    pip.textContent = 'JOKER';
    pip.style.fontSize = '0.65rem';
    el.appendChild(pip);
  } else {
    const symbol = SUIT_SYMBOL[card.suit];
    const corner = document.createElement('span');
    corner.className = 'card-corner';
    corner.textContent = `${card.rank} ${symbol}`;
    const pip = document.createElement('span');
    pip.className = 'card-pip';
    pip.textContent = symbol;
    el.append(corner, pip);
  }

  if (onClick && !disabled) el.addEventListener('click', () => onClick(card));
  else el.disabled = true;
  return el;
}

function cardBackEl(cardId) {
  const el = document.createElement('div');
  el.className = 'card card-back';
  el.textContent = '🂠';
  if (cardId) el.dataset.cardId = cardId;
  return el;
}

function ownerTag(name) {
  const tag = document.createElement('div');
  tag.className = 'owner-tag';
  tag.textContent = name;
  return tag;
}

/**
 * How far above the finger the drag ghost floats (Smith Gate 2 #2). A
 * ghost centred on the touch point is under the hand holding the phone,
 * and so is the `drop-onto`/`drop-before` hint beneath it — the feedback
 * this whole story exists to deliver would arrive exactly where it can't
 * be seen. There is no mouse equivalent of this problem, which is why a
 * design derived from the mouse path misses it.
 */
const GHOST_LIFT_PX = 28;

/**
 * Finds what a touch point is over. `setPointerCapture` stops events
 * retargeting, so hit-testing has to be explicit — and the ghost is
 * `pointer-events: none` precisely so it never hit-tests as itself.
 */
function touchTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  // UX follow-up (direct user request): the hand's own local reorder
  // (`performHandReorder`, the old `.hand-card`-specific 'hand' target
  // kind) is gone along with `renderHand`/`#hand-area` - the hand pile
  // is a plain `.pile-section[data-zone-id]` now, same as any other
  // pile, so the generic branch below already finds it.
  const zone = el.closest('.pile-section[data-zone-id]');
  if (zone) return { kind: 'zone', el: zone, row: zone.querySelector('.card-row') };
  return null;
}

/** Clone of the *rendered* card face, never a re-render from card data:
 *  a redacted card is only redacted in the DOM, so cloning is safe by
 *  construction where rebuilding would not be. The face is cloned rather
 *  than the wrapper because the wrapper also holds the action row. */
function makeDragGhost(sourceEl) {
  const face = sourceEl.querySelector('.card') ?? sourceEl;
  const rect = face.getBoundingClientRect();
  const ghost = face.cloneNode(true);
  ghost.classList.add('touch-drag-ghost');
  ghost.removeAttribute('data-card-id'); // never hit-testable, never queryable as the real card
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * Positions the ghost with `left`/`top`, NOT a `transform` translate.
 * Smith found the ghost landing 38px *below* the finger despite code that
 * reads as if it floats it above: the `scale` property composes outside
 * the `transform` property, so a translate written here is itself
 * multiplied by the scale (and taken about the transform origin) - the
 * ghost drifted 12% further down the page the further it travelled.
 * `left`/`top` don't participate in that composition at all, so the pop
 * animation and the positioning stop having any relationship to argue
 * about. Same trap as the earlier animation-vs-inline-transform one, from
 * the other side: two ways to move an element are not interchangeable.
 */
function moveDragGhost(ghost, x, y) {
  ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${y - ghost.offsetHeight - GHOST_LIFT_PX}px`;
}

/**
 * Touch drag for one card (US-40, D28). The recognizer in `touchDrag.js`
 * decides *when* a drag exists; everything DOM-shaped — capture,
 * hit-testing, the ghost — lives here. Crucially, the drop itself is
 * `performHandReorder` / `performZoneDrop`, the same functions the
 * native `drop` listeners call: there is one implementation of what a
 * drop means, so touch and mouse cannot drift apart.
 *
 * Mouse pointers are ignored outright — native HTML5 DnD still owns
 * them, and it gives us the drag image, Escape-to-cancel and cursor
 * feedback for free.
 */
function attachTouchDrag(sourceEl, card, ctx) {
  let state = null;
  let timer = null;
  let ghost = null;
  let hinted = null; // the zone currently showing drop feedback

  const clearHint = () => {
    if (hinted) clearZoneDragOver(hinted.el, hinted.row);
    hinted = null;
  };

  const teardown = () => {
    clearTimeout(timer);
    ghost?.remove();
    ghost = null;
    sourceEl.classList.remove('card-dragging');
    clearHint();
  };

  const handle = {
    lift: (ev) => {
      // Morpheus, Phase 43 review: every state broadcast rebuilds the
      // cards, and a broadcast mid-hold is routine - any other player
      // drawing causes one. That detaches `sourceEl` while the 250ms
      // timer is still armed. Removal during pointer capture *should*
      // fire `pointercancel` and clear it, but leaning on that leaves a
      // ghost cloned from a zero-sized rect, appended to `body`, with no
      // surviving handler to remove it. Checking the DOM directly costs
      // nothing and doesn't depend on a browser being well-behaved.
      if (!sourceEl.isConnected) {
        state = null;
        return;
      }
      ghost = makeDragGhost(sourceEl);
      moveDragGhost(ghost, ev.x, ev.y);
      sourceEl.classList.add('card-dragging');
      // Smith Gate 2 #1: the D13 cue fires HERE, not on raw pointerdown.
      // Bound to pointerdown it announced a lift the instant a finger
      // landed — so the rest of the table saw you pick a card up before
      // you did, and a finger merely brushing a card on its way to
      // scrolling broadcast a lift that never happened.
      ctx.onCardLift?.(card.id, true);
      ctx.onHandMotion?.(true);
    },
    move: (ev) => {
      if (!ghost) return; // the lift was refused above; there is nothing in flight
      moveDragGhost(ghost, ev.x, ev.y);
      ctx.onCardDrag?.(card, ev.x, ev.y);
      const target = touchTargetAt(ev.x, ev.y);
      if (hinted && (target?.kind !== 'zone' || target.el !== hinted.el)) clearHint();
      if (target?.kind === 'zone') {
        showZoneDragOver(target.el, target.row, { x: ev.x, y: ev.y }, target.el.dataset.kind);
        hinted = target;
      }
    },
    drop: (ev) => {
      if (!ghost) return;
      const target = touchTargetAt(ev.x, ev.y);
      teardown();
      ctx.onCardLift?.(card.id, false);
      ctx.onHandMotion?.(false);
      ctx.onCardDrag?.(null, 0, 0);
      if (!target) return; // dropped in dead space: a no-op, same as mouse
      if (ctx.onDropCard) {
        performZoneDrop(target.el, target.row, target.el.dataset.zoneId, card.id,
          { x: ev.x, y: ev.y }, ctx.onDropCard, target.el.dataset.kind);
      }
    },
    cancel: () => {
      if (!ghost) return;
      teardown();
      // Smith Gate 1 #5: end the gesture properly. The 2s motion TTL is
      // a backstop for dropped packets, not a way to finish a drag.
      ctx.onCardLift?.(card.id, false);
      ctx.onHandMotion?.(false);
      ctx.onCardDrag?.(null, 0, 0);
    },
  };

  const feed = (sample) => {
    const out = touchDragStep(state, sample);
    state = out.state;
    for (const ev of out.events) handle[ev.type](ev);
  };

  sourceEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    feed({ type: 'down', x: e.clientX, y: e.clientY, t: performance.now() });
    clearTimeout(timer);
    // A finger that never moves fires no pointermove, so the timer is
    // the only thing that can start the drag.
    timer = setTimeout(() => feed({ type: 'tick', t: performance.now() }), HOLD_MS);
    sourceEl.setPointerCapture(e.pointerId);
  });
  sourceEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    feed({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now() });
  });
  sourceEl.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(timer);
    feed({ type: 'up', x: e.clientX, y: e.clientY, t: performance.now() });
  });
  sourceEl.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(timer);
    feed({ type: 'cancel', t: performance.now() });
  });

  // `touch-action` is resolved when the touch STARTS, so switching it to
  // `none` at lift time does nothing for the gesture already in flight —
  // and setting it up front would kill scrolling on every card forever,
  // which is the exact failure the AC forbids. Cancelling `touchmove`
  // instead works mid-gesture, and is safe here because a drag only
  // exists after 250ms of stillness, by which point the browser has not
  // begun scrolling and will still honour preventDefault.
  sourceEl.addEventListener('touchmove', (e) => {
    if (state?.phase === 'dragging') e.preventDefault();
  }, { passive: false });
}

// NOTE (flagged, not yet done): `renderHand`/`performHandReorder` (the
// fanned, drag-reorderable own-hand rendering) are retired along with
// the merged own-zone panel - a hand pile's cards render through the
// exact same generic `renderZoneCards` every other pile's do now (`<seat-
// zone>`, `src/components/SeatZone.js`). Direct instruction was to get
// that working first; the fan/reorder/sort/pass polish this drops is a
// deliberate, temporary gap, not an oversight.

/**
 * A "move to another zone" control - only rendered when there's actually
 * somewhere else to move a card to, and only for cards the viewer has
 * some authority/visibility over (never for another player's still-
 * hidden private card, which mirrors the reveal/pickup controls above
 * already not being offered for that case).
 */
function moveToControl(card, currentZoneId, allZones, onMoveCard) {
  const otherZones = allZones.filter((z) => z.id !== currentZoneId);
  if (!onMoveCard || otherZones.length === 0) return null;

  const select = document.createElement('select');
  select.className = 'move-to-select';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Move to…';
  select.appendChild(placeholder);
  for (const zone of otherZones) {
    const opt = document.createElement('option');
    opt.value = zone.id;
    opt.textContent = zone.name;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    if (select.value) onMoveCard(card.id, select.value);
    select.value = '';
  });
  return select;
}

/**
 * Renders one zone's cards. Each entry is either a full card (visible to
 * this viewer) or a redacted `{id, owner, faceDown: true}` placeholder
 * (state.js's viewFor — see ARCHITECTURE.md D7). `resolveOwnerName` maps
 * an owner id to a display name (the caller already has the roster).
 */

// --- Card actions (D25) ------------------------------------------------
// Hovering a card reveals what it can do; choosing an action lights up
// every pile that can receive it, and clicking one completes the move.
// Which actions exist, and which piles qualify, both come from
// `pileActions.js` rather than being re-derived here - so the offer can
// never disagree with the rule.

let cancelTargeting = null;

/** Drops any in-progress targeting and removes every highlight. */
export function clearPileTargets() {
  for (const el of document.querySelectorAll('.pile-target')) {
    el.classList.remove('pile-target');
  }
  document.body.classList.remove('targeting');
  if (cancelTargeting) {
    cancelTargeting();
    cancelTargeting = null;
  }
}

/** The element standing in for a pile id, for highlighting/clicking.
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another" - a Pile (`renderPile`, above) is what's addressable by pile
 * id, never the Zone it lives in (a Zone can hold several piles, so it
 * has no single pile id of its own to be found by). */
function pileElement(pileId) {
  return document.querySelector(`.pile-section[data-zone-id="${CSS.escape(pileId)}"]`);
}

/**
 * D51: highlights every pile a card COULD go to for the duration of a
 * native drag, mirroring `beginTargeting`'s click-flow highlighting
 * (same `.pile-target` class, same `pileElement` lookup) but for the
 * drag gesture itself rather than a click-then-choose menu - "every
 * compatible drop target must appear droppable while holding a card"
 * (the user's own wording). `actionIds` is usually more than one: a
 * zone card being dragged is a legal `move` AND, if it's pickup-
 * eligible, a legal `pickup` too - both light up together, since a
 * native drag doesn't commit to which action until the drop.
 */
function highlightDragTargets(actionIds, piles, ctx) {
  const ids = new Set();
  for (const action of actionIds) {
    for (const id of targetsForAction(action, piles, ctx)) ids.add(id);
  }
  for (const id of ids) pileElement(id)?.classList.add('pile-target');
}

/**
 * Highlights every pile that accepts `action` and waits for a click.
 * Escape or a click anywhere else cancels, so the user is never stuck in
 * a mode they can't leave (Nielsen #3).
 */
function beginTargeting(action, targetIds, onChoose) {
  clearPileTargets();
  const els = targetIds.map(pileElement).filter(Boolean);
  if (els.length === 0) return;

  document.body.classList.add('targeting');
  const onPick = (e) => {
    const el = e.currentTarget;
    e.preventDefault();
    e.stopPropagation();
    clearPileTargets();
    onChoose(el.dataset.zoneId);
  };
  const onEscape = (e) => { if (e.key === 'Escape') clearPileTargets(); };
  const onElsewhere = () => clearPileTargets();

  for (const el of els) {
    el.classList.add('pile-target');
    // CAPTURE phase, not bubble: a pile-target element (`#hand-zone`, a
    // zone) can contain its own genuinely-clickable content - a hand
    // card's `onClick` (Play), a revealable middle-card's `onClick`
    // (tap-to-reveal). Choosing that PILE as a target by clicking its
    // body, at whatever point the pointer happens to land, must not
    // ALSO fire whatever's underneath - found live (D52 follow-up): a
    // Pick-up-into-hand click that happened to land on a hand card
    // silently played that card too, netting the hand size unchanged
    // and reading as "pickup does nothing". Capturing here means this
    // listener runs BEFORE the click ever reaches that descendant, and
    // its own `stopPropagation()` (still called, same as before) then
    // stops it from proceeding to the target at all - not a bubble-
    // order race, doesn't depend on which registered first.
    el.addEventListener('click', onPick, { capture: true });
  }
  document.addEventListener('keydown', onEscape);
  // Deferred so the click that opened targeting doesn't immediately close it.
  setTimeout(() => document.addEventListener('click', onElsewhere, { once: true }), 0);

  cancelTargeting = () => {
    for (const el of els) el.removeEventListener('click', onPick, { capture: true });
    document.removeEventListener('keydown', onEscape);
    document.removeEventListener('click', onElsewhere);
  };
}

/**
 * D52 (direct user request): "on hover, draw a radial menu of actions
 * around my pointer... click an action, the card follows my mouse and
 * displays what drop targets are valid... click to confirm." Reuses
 * `beginTargeting`'s highlight-then-click machinery unchanged for the
 * "which pile did they choose" half (same `.pile-target` class, same
 * Escape/click-elsewhere cancel) - this only ADDS the visual: a small
 * label that tracks the cursor for as long as targeting stays open,
 * cleaned up through the same `cancelTargeting` hook `clearPileTargets`
 * already calls, so there is exactly one way out of either mode, not two.
 */
function beginTargetingWithGhost(action, targetIds, label, onChoose) {
  beginTargeting(action, targetIds, onChoose);
  if (!cancelTargeting) return; // beginTargeting found no legal targets - nothing to track

  const ghost = document.createElement('div');
  ghost.className = 'radial-follow-ghost';
  ghost.textContent = label;
  document.body.appendChild(ghost);
  const onMove = (e) => {
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
  };
  document.addEventListener('mousemove', onMove);

  const cleanup = cancelTargeting;
  cancelTargeting = () => {
    cleanup();
    document.removeEventListener('mousemove', onMove);
    ghost.remove();
  };
}

/**
 * UX follow-up (direct user request, 2026-08-24): "small square icons
 * ... with tool tip style hover text ... keep each button the same
 * size." The button's visible content is just `spec.icon` now - the
 * full name (an override from `labels`, or `spec.label`) moves to
 * `title` (a native tooltip) and `aria-label` (so the icon-only button
 * still has a real accessible name, not just a glyph). Shared by both
 * `renderActionHeader` (piles/zones) and `attachActionRow` (cards) so
 * the icon-button contract can't drift between the two.
 */
function applyIconButton(btn, spec, labelOverride) {
  const label = labelOverride ?? spec.label;
  btn.textContent = spec.icon;
  btn.title = label;
  btn.setAttribute('aria-label', label);
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
 * `renderZoneCards` - so `<header-actions>` (`src/components/
 * HeaderActions.js`) can call this against `this`, the same "thin
 * adapter around proven logic" every other component in this pass uses.
 *
 * @param {HTMLElement} container
 * @param {string} titleText e.g. "Hand (7)"
 * @param {string[]} actionIds
 * @param {{labels?: Record<string,string>, disabled?: string[],
 *   onAction: (actionId: string) => void, draggable?: boolean,
 *   headingId?: string, headingClass?: string}} opts
 */
export function renderActionHeader(container, titleText, actionIds, opts = {}) {
  container.innerHTML = '';
  container.className = `zone-name pile-action-header${opts.headingClass ? ` ${opts.headingClass}` : ''}`;
  if (opts.headingId) container.id = opts.headingId;

  const label = document.createElement('span');
  label.className = 'zone-name-text';
  label.textContent = titleText;
  container.appendChild(label);

  for (const id of actionIds) {
    if (opts.disabled?.includes(id)) continue;
    const spec = ACTION_SPECS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pile-action-btn' + (spec.destructive ? ' btn-danger' : '');
    applyIconButton(btn, spec, opts.labels?.[id]);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (spec.destructive && !window.confirm(
        `${spec.hint}\n\nEvery player's current hand will be cleared. Continue?`)) return;
      opts.onAction(id);
    });
    // D35: `draw`'s own action-token drag protocol, unrelated to the
    // menu it used to live in - preserved as-is, just hosted on a plain
    // button now instead of a radial one.
    if (opts.draggable && spec.target) {
      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', pileActionToken(id)));
      attachPileActionTouchDrag(btn, id, () => opts.onAction(id));
    }
    container.appendChild(btn);
  }
}

/**
 * UX follow-up: a card's own actions as a small row directly above it
 * on hover - replaces D52's radial ring for the CARD case specifically
 * (piles/zones get `renderActionHeader` above; a card has no title bar
 * to host buttons next to, and is too small to carry them permanently).
 * A target-bearing action still opens `beginTargetingWithGhost`
 * unchanged - only the TRIGGER visual changed, not the destination-
 * choosing mechanic underneath it.
 *
 * Appended to `document.body` (`position: fixed`, computed from
 * `hostEl.getBoundingClientRect()` once on open) rather than as a plain
 * absolutely-positioned child of the card - a real bug, found live: a
 * hand card lives inside `#hand-area`, whose horizontal scroll
 * (`overflow-x: auto`, needed for the fan) forces `overflow-y` to
 * compute as `auto` too, not `visible` (a genuine CSS rule: a non-
 * `visible` value on one axis pulls the other off `visible`) - so a
 * row anchored INSIDE that box was silently clipped invisible on
 * either side, not just below. Body-level fixed positioning is exactly
 * why D52's own radial menu used it, for the same underlying reason
 * (trapped stacking/clipping contexts) - reused here for a plain row,
 * not reintroducing the ring.
 *
 * @param {HTMLElement} hostEl the card's own wrapper.
 * @param {() => string[]} getActionIds computed fresh on every hover.
 * @param {{labels?: Record<string,string>,
 *   targetsFor: (actionId: string) => string[],
 *   onAction: (actionId: string, targetPileId?: string) => void}} opts
 */
function attachActionRow(hostEl, getActionIds, opts) {
  hostEl.classList.add('pile-hover-host');
  if (hostEl.tabIndex < 0 || hostEl.tabIndex == null) hostEl.tabIndex = 0;
  let rowEl = null;
  let closeTimer = null;

  const cancelClose = () => { clearTimeout(closeTimer); closeTimer = null; };
  const close = () => { rowEl?.remove(); rowEl = null; };
  const scheduleClose = () => { cancelClose(); closeTimer = setTimeout(close, 0); };

  const open = () => {
    close();
    const ids = getActionIds();
    if (!ids.length) return;
    rowEl = document.createElement('div');
    rowEl.className = 'card-action-row';
    for (const id of ids) {
      const spec = ACTION_SPECS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-action-btn' + (spec.destructive ? ' btn-danger' : '');
      applyIconButton(btn, spec, opts.labels?.[id]);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        if (spec.target == null || spec.singleTarget) {
          opts.onAction(id);
        } else {
          beginTargetingWithGhost(id, opts.targetsFor(id), spec.label, (targetId) => opts.onAction(id, targetId));
        }
      });
      rowEl.appendChild(btn);
    }
    rowEl.addEventListener('pointerenter', cancelClose);
    rowEl.addEventListener('pointerleave', scheduleClose);
    document.body.appendChild(rowEl);
    const rect = hostEl.getBoundingClientRect();
    rowEl.style.left = `${rect.left + rect.width / 2}px`;
    rowEl.style.top = `${rect.top}px`;
  };

  hostEl.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    cancelClose();
    open();
  });
  hostEl.addEventListener('pointerleave', () => {
    if (!cancelTargeting) scheduleClose();
  });
}

/**
 * Reveal a still-hidden card (Sprint 12, Phase 55, T55.1): a direct tap
 * on the card itself, joining tap-to-play's existing vocabulary, rather
 * than a separate hover-revealed button. The confirm gate is unchanged
 * (Smith Gate 2 #2 - it's the actual safety net, not the AC this phase
 * touches): revealing your OWN private card is irreversible and only
 * you can undo the decision by not making it; a shared face-down card
 * is nobody's, so it stays a single tap.
 */
function performReveal(card, viewerId, onReveal) {
  clearPileTargets();
  const mine = card.owner != null && card.owner === viewerId;
  if (mine && !window.confirm('Reveal this card to everyone? This cannot be undone.')) return;
  onReveal?.(card.id);
}

/**
 * A card's own hover action row (UX follow-up, retires D52's radial for
 * this case) - `attachActionRow` wired for the card case: a
 * `target`-bearing action opens the card-follows-cursor targeting mode
 * since a card may have several legal destinations (`move` among
 * zones); an in-place action (`target: null` - today just `rotate`)
 * dispatches directly. `reveal` is deliberately excluded (Phase 55
 * moved it to a direct tap on the card - see `performReveal` and its
 * call site in `renderZoneCards`).
 *
 * @param {HTMLElement} wrapper the card's own `.middle-card` element -
 *   `attachActionRow` opens the row on hovering it.
 */
function actionMenuEl(wrapper, zone, card, allZones, opts) {
  const { viewerId, onPickup, onMoveCard, onRotate, onPlay } = opts;
  // D45: both were hardcoded `kind: 'zone'` - real bugs the moment a
  // second table-side type exists, same class as `renderZoneCards`'s.
  const pile = { id: zone.id, kind: zone.kind, ownerId: zone.ownerId ?? null };
  const available = actionsForCard(pile, card, viewerId).filter((a) => a !== 'reveal');
  if (available.length === 0) return;

  // UX follow-up (direct user request): a hand pile is a real,
  // addressable entry in `allZones` now (`view.zones`) - no more
  // synthetic `HAND_PILE_ID` stand-in needed for `pickup`'s `target:
  // 'hand'` lookup below.
  const piles = allZones.map((z) => ({ id: z.id, kind: z.kind, ownerId: z.ownerId ?? null }));

  attachActionRow(wrapper, () => available, {
    targetsFor: (action) => targetsForAction(action, piles, { viewerId, fromPileId: zone.id }),
    onAction: (action, targetId) => {
      // D48: an in-place action has no destination to pick - dispatched
      // directly (no `targetId` argument) rather than going through
      // targeting, since `targetsForAction` would return `[]` for a
      // null-target action anyway (a no-op click, not a bug in either).
      if (action === 'rotate') onRotate?.(card.id);
      else if (action === 'pickup') onPickup?.(card.id);
      else if (action === 'move') onMoveCard?.(card.id, targetId);
      // UX follow-up (direct user request): 'play' is offered by
      // `cardActions` for a hand pile's own owner (`handPile.js`) but
      // had no dispatcher wired here before - the merged own-zone panel
      // used to be the only way to play a card. Generic now, same
      // click-a-lit-target flow as `move`.
      else if (action === 'play') onPlay?.(card.id, targetId);
    },
  });
}

export function renderZoneCards(container, zone, allZones, opts = {}) {
  const { resolveOwnerName, onMoveCard, onCardLift, onCardDrag } = opts;
  container.innerHTML = '';
  // D45: was hardcoded `kind: 'zone'` below - harmless while zone was
  // the only 'mixed'-visibility pile type, a real bug the moment a
  // second one (discard) exists: every card-level authorization check
  // in this function would have been evaluated against ZONE's rules
  // even for a discard pile's own cards.
  const pile = { id: zone.id, kind: zone.kind, ownerId: zone.ownerId ?? null };
  // UX follow-up (direct user request): "create WebComponents for the
  // different pile types... fix the fan layout issue by implementing
  // FanPile." `opts.fan` (set by `<fan-pile>`, `src/components/
  // FanPile.js`) is the ONLY difference from the plain flat-row case -
  // every other per-card behavior (drag/actions/reveal/redaction) is
  // identical, so this stays ONE function rather than a forked copy.
  // The fan math (rotate + arc, pivoting from the bottom like cards
  // actually held in a hand) is exactly `renderHand`'s old formula,
  // just applied generically by index instead of being hand-specific.
  zone.cards.forEach((card, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card';
    if (opts.fan) {
      // UX follow-up (direct user request): "lower the peak a bit so
      // it's a more gradual curve" - then, immediately after: "it still
      // looks triangular rather than a steady curve." The rotation
      // (5deg/card) was already linear in `offset`, which is correct - a
      // real fanned hand's cards ARE spaced at roughly equal angles. The
      // droop wasn't: `Math.abs(offset) * k` is linear too, and a linear
      // vertical drop paired with a pivot around each card's OWN
      // bottom-center reads as a sharp V (two straight edges meeting at
      // the center card), not a rounded arc. Squaring `offset` instead
      // is what actually curves it - small offsets near the center barely
      // droop, larger ones toward the ends droop increasingly more,
      // tracing a parabola instead of two lines. `.fan-row`'s own bottom
      // padding (style.css) is sized to this exact formula's max droop,
      // not just eyeballed - see that rule's own comment if this changes
      // again.
      const center = (zone.cards.length - 1) / 2;
      const offset = i - center;
      wrapper.style.setProperty('--raise-base', `rotate(${offset * 5}deg) translateY(${offset * offset * 0.08}rem)`);
    }
    // US-32/33: `data-card-id` makes the wrapper hit-testable for
    // drop-region detection; `data-layout` is what style.css keys the
    // stacked/overlapped rendering off, so the visual is driven straight
    // from authoritative state rather than a separate UI-side flag that
    // could drift out of sync with it.
    wrapper.dataset.cardId = card.id;
    if (card.layout) wrapper.dataset.layout = card.layout;
    // D48/D40: same "state drives the visual" reasoning as `layout` -
    // style.css rotates the card face when this is 'landscape'.
    if (card.orientation) wrapper.dataset.orientation = card.orientation;

    // Card-lift cue (US-22, D13): press-and-hold broadcasts motion.
    // Safe for redacted cards too - only the id (already known to every
    // viewer, even in redacted form) is broadcast, never rank/suit.
    // Smith Gate 2 #1: mouse only. On touch this same binding fired the
    // instant a finger landed, so the table saw you lift a card before
    // you saw it yourself, and a finger brushing past on its way to a
    // scroll broadcast a lift that never happened. Touch gets the cue
    // from the recognizer's `lift` instead - see `attachTouchDrag`.
    if (onCardLift) {
      wrapper.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') onCardLift(card.id, true); });
      wrapper.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') onCardLift(card.id, false); });
      wrapper.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') onCardLift(card.id, false); });
    }

    // US-28: draggable exactly where MOVE_CARD's own authorization would
    // allow a drop to succeed - a visible card (already face-up, or my
    // own still-hidden private one) or a redacted-but-unowned card
    // (shared face-down, movable by anyone per US-19 "put or take").
    // Someone else's still-hidden private card gets no controls at all
    // today (see below) and stays non-draggable to match.
    //
    // D45: was the ad-hoc `!card.faceDown || card.owner === null` check
    // - equivalent for zone cards (verified case-by-case against
    // `zonePile.cardActions` before changing this), but it never
    // consulted the pile TYPE, so a discard pile's cards (drop-only -
    // `discardPile.cardActions` is always `[]`) would have shown as
    // draggable even though every resulting drop is rejected
    // server-side. Reading the real offer table instead is what D34/D42
    // already promised: "the hover affordances... can't drift apart"
    // from the reducer's own authorization.
    const cardActions = actionsForCard(pile, card, opts.viewerId);
    if (onMoveCard && cardActions.length > 0) {
      wrapper.draggable = true;
      // UX follow-up (direct user request): a hand pile is a real,
      // addressable entry in `allZones` now - no more synthetic
      // `HAND_PILE_ID` stand-in needed.
      const piles = allZones.map((z) => ({ id: z.id, kind: z.kind, ownerId: z.ownerId ?? null }));
      wrapper.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.id);
        // D51: every zone (and the hand, if this card is pickup-eligible)
        // that could legally receive this SPECIFIC card lights up for the
        // whole drag - not just whichever one the pointer happens to be
        // over mid-drag (`showZoneDragOver`'s existing per-hover cue,
        // unchanged, still layers on top of this once you're over one).
        // UX follow-up: 'play' joins 'move'/'pickup' here now that a
        // hand pile's own cards flow through this same generic path.
        highlightDragTargets(
          cardActions.filter((a) => a === 'move' || a === 'pickup' || a === 'play'),
          piles,
          { viewerId: opts.viewerId, fromPileId: zone.id },
        );
      });
      wrapper.addEventListener('dragend', clearPileTargets);
      // US-29/D19: live position while dragging. A redacted placeholder
      // (`card.faceDown: true`) has no `faceUp` field either, so
      // `cardDragPayload` correctly treats it the same as hidden - even
      // a blind "put or take" move of a shared face-down card never
      // reveals its identity mid-drag.
      wrapper.addEventListener('drag', (e) => onCardDrag?.(card, e.clientX, e.clientY));
      wrapper.addEventListener('dragend', () => onCardDrag?.(null, 0, 0));
      attachTouchDrag(wrapper, card, { onDropCard: opts.onDropCard, onCardDrag, onCardLift });
    }

    // D25: one hover-revealed action row, built from `pileActions.js`,
    // replacing the per-card Turn over / Pick up / Move to… buttons that
    // used to render unconditionally. Those made every zone about twice
    // the height of the cards in it, and each site re-derived its own
    // "may this card do this" condition inline.
    // Phase 55 (T55.1): tap the card itself to reveal it - joining
    // tap-to-play's vocabulary instead of a separate hover button. Same
    // authorization `actionMenuEl` already used (`actionsForCard`), and
    // computed once here since it applies to TWO different elements
    // below depending on who's looking: `redactMiddleCard` (state.js
    // D7) sends the OWNER their card's real face (`card.faceDown` is
    // never set on it - only `card.faceUp: false`), while everyone else
    // gets the redacted `{faceDown: true}` back. A tap-to-reveal needs
    // wiring onto whichever one actually renders for this viewer.
    // `pile` is the one hoisted to the top of this function (D45).
    const canReveal = Boolean(opts.onReveal) && actionsForCard(pile, card, opts.viewerId).includes('reveal');

    if (card.faceDown) {
      const back = cardBackEl(card.id);
      if (canReveal) {
        back.classList.add('revealable');
        back.addEventListener('click', () => performReveal(card, opts.viewerId, opts.onReveal));
      }
      wrapper.appendChild(back);
      if (card.owner !== null && card.owner !== opts.viewerId) {
        // Someone else's still-hidden card: no visibility, no authority,
        // so no actions - just the anonymous back and whose it is.
        wrapper.appendChild(ownerTag(resolveOwnerName?.(card.owner) ?? card.owner));
      }
    } else {
      const face = cardEl(card, canReveal
        ? { onClick: () => performReveal(card, opts.viewerId, opts.onReveal) }
        : { disabled: true });
      if (canReveal) face.classList.add('revealable');
      wrapper.appendChild(face);
      if (card.owner) wrapper.appendChild(ownerTag(resolveOwnerName?.(card.owner) ?? card.owner));
      // UX follow-up (real bug, found live via a screenshot): a plain
      // hand card has no `faceUp` field at all (visibility is a
      // PILE-level "in-hand" rule, not per-card like a zone's) - `!card.
      // faceUp` treated that missing field the same as an explicit
      // `faceUp: false`, wrongly labeling every hand card "hidden from
      // others" now that hand cards flow through this same generic
      // renderer. `=== false` only fires for a zone-kind card that
      // actually carries the field.
      if (card.faceUp === false) {
        const hiddenTag = document.createElement('div');
        hiddenTag.className = 'owner-tag';
        hiddenTag.textContent = 'hidden from others';
        wrapper.appendChild(hiddenTag);
      }
    }

    actionMenuEl(wrapper, zone, card, allZones, opts);

    container.appendChild(wrapper);
  });
}

/**
 * Boxes for drop hit-testing (US-32/33). Measures the `.card` face
 * rather than its wrapper: the wrapper also contains the Pick up / Move
 * to… controls below the card, so wrapper rects would make the "on the
 * card body" region reach well under the card into its own buttons.
 */
function cardBoxesIn(rowEl) {
  return [...rowEl.querySelectorAll('.middle-card[data-card-id]')].flatMap((wrapper) => {
    const face = wrapper.querySelector('.card');
    if (!face) return [];
    const r = face.getBoundingClientRect();
    return [{
      cardId: wrapper.dataset.cardId,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      width: r.width, height: r.height,
    }];
  });
}

const DROP_HINTS = ['drop-onto', 'drop-before', 'drop-after'];

function clearDropHints(rowEl) {
  for (const el of rowEl.querySelectorAll('.middle-card')) el.classList.remove(...DROP_HINTS);
}

/**
 * Smith Gate 1 (Nielsen #1/#6): native drag-and-drop gives no feedback
 * until release, so the *mode* a drop is about to use has to be visible
 * during the drag or it isn't discoverable at all. A glow on the card
 * body reads "will stack here"; an insertion line beside it reads "will
 * slot in here".
 */
function showDropHint(rowEl, placement) {
  clearDropHints(rowEl);
  if (!placement.targetCardId) return;
  const target = rowEl.querySelector(`.middle-card[data-card-id="${CSS.escape(placement.targetCardId)}"]`);
  if (!target) return;
  if (placement.layout === 'stack') target.classList.add('drop-onto');
  else target.classList.add(placement.side === 'before' ? 'drop-before' : 'drop-after');
}

/**
 * D28: the drag-over feedback and the drop itself, extracted from the
 * native listeners so the touch recognizer can call exactly the same
 * code. See `performHandReorder` for why this matters more than it
 * looks: if touch computed placement separately it would drift from
 * mouse, and only mouse is covered by the e2e suite.
 *
 * D53 (Sprint 22, replaces D45's `dropRule` string): the pile TYPE's
 * own `resolveDropTarget` (`resolveDropTargetFor`, `pileActions.js`)
 * decides the geometry - `ui.js` makes one polymorphic call, no
 * kind-branching left here at all. `zone` still resolves real
 * before/onto/after halo geometry (delegated to `dropTarget.js`
 * internally by `zonePile.js`); `deck`/`hand`/`discard` still resolve
 * to `{}` (plain append, no positional choice) - same outcomes as
 * before, just owned by each module instead of switched on centrally.
 */
function showZoneDragOver(zoneEl, row, point, kind) {
  zoneEl.classList.add('zone-drag-over');
  showDropHint(row, resolveDropTargetFor(kind, cardBoxesIn(row), point));
}

function clearZoneDragOver(zoneEl, row) {
  zoneEl.classList.remove('zone-drag-over');
  clearDropHints(row);
}

function performZoneDrop(zoneEl, row, zoneId, cardId, point, onDropCard, kind) {
  clearZoneDragOver(zoneEl, row);
  if (!cardId) return;
  // US-32/33: the drop point decides stack vs. overlap vs. plain
  // append. Aiming at the card being dragged itself is meaningless
  // (it's about to leave that position), so it's treated as open
  // space rather than a self-referential placement.
  const placement = resolveDropTargetFor(kind, cardBoxesIn(row).filter((b) => b.cardId !== cardId), point);
  onDropCard(cardId, zoneId, placement);
}

/**
 * Builds one zone's sub-panel (name/count heading + its cards) - shared
 * by `renderZones` (shared zones) and `renderSeatZones` (personal zones)
 * so the drop-target wiring below only needs to exist once.
 *
 * US-28: dropping a dragged card here plays it (from hand) or moves it
 * (from another zone) - `opts.onDropCard(cardId, zone.id)` does the
 * PLAY-vs-MOVE_CARD branching (main.js knows where the card currently
 * lives, this file doesn't need to). Additive: tap-to-play and the
 * "Move to…" dropdown are untouched, this is one more way in, not a
 * replacement (Smith Gate 1). The zone highlights while a drag is over
 * it (Smith Gate 1: Nielsen #1, drag needs a droppable-here affordance)
 * and reverts on drop/dragleave; dropping somewhere invalid is naturally
 * a no-op since nothing here ever moves a DOM node directly - only a
 * successful `onDropCard` dispatch (and the resulting re-render) changes
 * what's on screen.
 */
/**
 * UX follow-up (direct user request): move + resize as one shared,
 * "normalized" wiring pass - EVERY pile/zone panel calls this exact
 * function (`renderZonePanel` below, and `renderDeck`'s own caller in
 * main.js), so the deck offers the identical resize/move interface a
 * zone does rather than a bespoke copy. `id` keys `opts.layout`
 * (`panelLayout.js`, local per-browser storage) and is whatever stable
 * string the caller already uses elsewhere (a zone's own `id`, or
 * `'deck'` for the draw pile). `headingEl` is the drag handle - `null`
 * is fine, `attachPanelDrag` no-ops.
 */
export function wirePanelLayout(panelEl, id, headingEl, opts) {
  if (opts.onResizePanel) {
    panelEl.classList.add('panel-resizable');
    const stored = opts.layout?.[id];
    if (typeof stored?.w === 'number') panelEl.style.width = `${stored.w}px`;
    if (typeof stored?.h === 'number') {
      panelEl.style.height = `${stored.h}px`;
      // A resized-short panel needs somewhere for overflow to go rather
      // than spilling past its own border - scroll, not clip, so cards
      // already in it are never simply hidden.
      panelEl.style.overflowY = 'auto';
    }
    attachPanelResize(panelEl, id, opts.onResizePanel);
  }
  if (opts.onMovePanel) {
    const stored = opts.layout?.[id];
    if (typeof stored?.x === 'number' && typeof stored?.y === 'number') {
      panelEl.classList.add('panel-moved');
      panelEl.style.left = `${stored.x}px`;
      panelEl.style.top = `${stored.y}px`;
    }
    attachPanelDrag(headingEl, panelEl, id, opts.onMovePanel);
  }
}

/**
 * UX follow-up (direct user request): "pile-panel and header-actions
 * should be internalized in the fan-pile webcomponent... same for all
 * Pile type components." A specialized row shape (`<fan-pile>`,
 * `<deck-stack>`) is a COMPLETE Pile on its own now, not a "row"
 * `renderPile` wraps with a separately-built header - each one calls
 * this shell directly against itself. `renderPileShell` is what's
 * actually shared: the "Actionable" title bar (`<header-actions>`,
 * pile-level actions), the addressability (`data-zone-id`/`data-kind`),
 * and the drop-target wiring every Pile needs REGARDLESS of how its
 * cards are drawn - `buildRow(container)` is the one thing that
 * differs, building whatever content sits below the header and
 * returning the element drop hit-testing should measure against.
 *
 * Never draws a Zone's own box (border/padding/background) and never
 * wires its own move/resize - a Pile always lives inside a Zone
 * (`renderZonePanel`, below), which owns both of those exactly once for
 * everything inside it.
 */
export function renderPileShell(container, zone, allZones, opts, buildRow) {
  container.innerHTML = '';
  container.className = 'pile-section';
  container.dataset.zoneId = zone.id; // D25: addressable as a drop target
  // D45/D53: the kind travels with the element so the touch-drag path
  // (which only has the DOM node, not the view object, at drop time)
  // can resolve its own drop-target geometry too - see
  // touchTargetAt/attachTouchDrag.
  container.dataset.kind = zone.kind;

  // UX follow-up (direct user request): "like zones, Piles are
  // Actionable and should have a title bar with action buttons for
  // that pile type" - every pile's own heading is a real
  // `renderActionHeader` now (the same builder the deck's own title bar
  // already used), not a plain text div. `pileLevelActions(zone.kind,
  // ...)` returns `[]` for every kind with nothing pile-level to offer
  // (zone/discard/foundation/cascade/rankAdjacent today), so this is a
  // pure superset of the old plain-text heading for those - no visual
  // change unless a kind actually has pile-level actions.
  //
  // NOTE (flagged, not yet done): `sortRank`/`sortSuit` are filtered out
  // here even though `handPile.pileActions` offers them to a hand's
  // owner - they used to reorder a CLIENT-ONLY local view of the hand
  // (D14, `handOrder.js`), which had no home left once `renderHand`'s
  // bespoke rendering was retired (a hand's cards render in `zone.
  // cards`' own order now, same as any other pile). Showing the buttons
  // without a working sort behind them would be a false affordance -
  // left out until sort becomes a real thing to wire up (either a
  // client-side order layer reintroduced generically, or a real reducer
  // action, now that a hand is state-level).
  const heading = document.createElement('header-actions');
  container.appendChild(heading);
  heading.render(
    `${zone.name} (${zone.count ?? zone.cards.length})`,
    pileLevelActions(zone.kind, { isOwner: zone.ownerId === opts.viewerId, isHost: opts.isHost })
      .filter((id) => id !== 'sortRank' && id !== 'sortSuit'),
    {
      // `pile-title`, not `panel-title` - a Pile's own heading is never
      // a Zone's move/resize drag handle (`renderZonePanel` wires that
      // once, on the Zone's OWN heading instead), so it needs a
      // different class than the one `attachPanelDrag`/`wirePanelLayout`
      // look for.
      headingClass: 'pile-title',
      draggable: true,
      // UX follow-up (direct user request): "a Deck is a specific kind
      // of Pile" - which of ITS OWN offered actions are disabled (Deal,
      // at zero cards) is now read polymorphically per pile type
      // (`disabledPileActionsFor`), not a `zone.kind === 'deck'` check
      // hardcoded here.
      disabled: disabledPileActionsFor(zone.kind, zone.count ?? zone.cards.length),
      onAction: (id) => opts.onPileAction?.(zone.id, id),
    },
  );

  const row = buildRow(container);

  if (opts.onDropCard) {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      showZoneDragOver(container, row, { x: e.clientX, y: e.clientY }, zone.kind);
    });
    container.addEventListener('dragleave', () => clearZoneDragOver(container, row));
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      // UX follow-up (direct user request): a dragged pile-level action
      // token (Draw's own drag protocol, D35) can now land on ANY pile,
      // including a hand - this used to only be handled by the merged
      // own-zone panel's own bespoke hand-drop listener. Checked here,
      // generically, before falling back to the ordinary card-drop
      // path, so Draw dropped on a hand pile draws instead of being
      // misread as a bogus card id.
      const pileAction = pileActionFromDrop(e.dataTransfer);
      if (pileAction) { opts.onPileActionDrop?.(pileAction, zone.id); return; }
      performZoneDrop(container, row, zone.id, e.dataTransfer.getData('text/plain'),
        { x: e.clientX, y: e.clientY }, opts.onDropCard, zone.kind);
    });
  }
}

/**
 * The FLAT row shape (`rowShapeFor(kind) === 'flat'` - every kind
 * except a hand's fan or a deck's stack) - `<pile-panel>`'s own thin
 * wrapper around `renderPileShell`, same shape `<fan-pile>`/
 * `<deck-stack>` now have for their own row shapes.
 */
export function renderPile(container, zone, allZones, opts = {}) {
  renderPileShell(container, zone, allZones, opts, (c) => {
    const row = document.createElement('div');
    row.className = 'card-row';
    c.appendChild(row);
    renderZoneCards(row, zone, allZones, opts);
    return row;
  });
}

/**
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another." Renders a ZONE: the bordered/padded/positioned box, ONE
 * title bar (`title` - the ZONE'S OWN name, distinct from any pile
 * inside it - `null` for the common single-pile case, where the lone
 * pile's own heading doubles as the drag handle instead of adding a
 * redundant second one), and every Pile it holds as its own
 * `<pile-panel>` child (`piles`, always a non-empty array - even a
 * "plain" shared zone like a CREATE_ZONE'd one or a Solitaire
 * foundation is a Zone holding exactly one Pile now, not a Zone/Pile
 * hybrid). `id` keys `opts.layout` (`panelLayout.js`) - the STABLE
 * identity of this Zone, independent of which/how many piles it holds.
 *
 * Move/resize (`wirePanelLayout`) is wired EXACTLY ONCE, here, for the
 * whole Zone - "Piles move with their containing Zone." A Pile
 * (`renderPile`, above) never wires its own.
 */
export function renderZonePanel(zoneEl, id, title, piles, allZones, opts) {
  zoneEl.innerHTML = '';
  zoneEl.className = 'zone';
  // The Zone's own stable identity (`opts.layout` key) - distinct from
  // any one pile's own `data-zone-id` (`renderPile`), since a Zone can
  // hold several piles and so has no single pile id of its own.
  zoneEl.dataset.groupId = id;

  let dragHandle;
  if (title) {
    const heading = document.createElement('header-actions');
    zoneEl.appendChild(heading);
    heading.render(title, [], { headingClass: 'panel-title' });
    dragHandle = heading;
  }

  const body = document.createElement('div');
  body.className = 'zone-body';
  zoneEl.appendChild(body);

  // UX follow-up (direct user request): "a Deck is a specific kind of
  // Pile... it is not a Zone at all" / "pile-panel and header-actions
  // should be internalized in the fan-pile webcomponent, same for all
  // Pile type components" - which ELEMENT renders a pile is decided
  // here, off the pile TYPE's own `rowShape` (`rowShapeFor`,
  // `pileActions.js`), never a `zone.kind === 'hand'` check inside any
  // one component. `<fan-pile>`/`<deck-stack>` are now fully self-
  // contained Piles (their own header+row+drop wiring, via
  // `renderPileShell`) - `<pile-panel>` is just the flat-row case's own
  // equally-thin wrapper, not a generic container the other two nest
  // inside any more.
  const PILE_TAGS = { flat: 'pile-panel', fan: 'fan-pile', stack: 'deck-stack' };
  for (const zone of piles) {
    const el = document.createElement(PILE_TAGS[rowShapeFor(zone.kind)]);
    body.appendChild(el);
    el.render(zone, allZones, opts);
    // No separate Zone-level title for the common single-pile case -
    // the lone pile's own heading (`.pile-title`) is the drag handle
    // instead, so this Zone doesn't show two headings saying almost the
    // same thing.
    if (!dragHandle) dragHandle = el.querySelector('.pile-title');
  }

  wirePanelLayout(zoneEl, id, dragHandle, opts);
}


/**
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another - don't overload zone-panel to do everything." One generic
 * `<zone-panel>` element type builds EVERY Zone now (the shared Table
 * Zone, each player's Zone, and every standalone shared zone), varying
 * only in which/how many Piles it's given:
 * - The shared Table pile (`id === 'table'`), any discard-kind pile(s),
 *   and every deck-kind pile (the main deck, D53's `deckPile.rowShape`
 *   stack-rendered - AND any SPLIT_DECK pile, same kind) - none ever
 *   `ownerId`-carrying - group into ONE Zone titled "Table Zone".
 * - Every pile sharing one `ownerId` (a player's hand, plus any
 *   personal pile a GameConfig declares - Spit's per-player stock,
 *   D53) groups into ONE Zone per owner, titled with the owner's NAME.
 * - Every other shared pile (a player-CREATE_ZONE'd zone, Solitaire's
 *   foundations/cascades, Spit's rank-adjacent pile) gets its own Zone
 *   holding exactly that one pile - no separate Zone-level title in
 *   this case (`renderZonePanel`'s `title: null`), since the lone
 *   pile's own heading already says the same thing a redundant second
 *   one would.
 *
 * A personal Zone renders "in front of" its owner's seat by default -
 * same `seatPosition()` geometry `renderRoster`'s seats use, at a
 * smaller radius so it sits toward the table's center rather than its
 * edge; a shared Zone defaults to normal flex-wrap flow (`#zones`'s own
 * CSS). Either kind switches to an absolutely-positioned, plain
 * top-left `panel-moved` panel the first time it's dragged/resized
 * (`wirePanelLayout`, `opts.layout` - a LOCAL, per-browser preference,
 * `panelLayout.js`, not replicated game state).
 *
 * `seatedPlayers` must be in the same seat order used to render the
 * roster (viewer first, D18), so a personal Zone lands at the SAME
 * seat its owner's roster entry is drawn at; one with no seated owner
 * (shouldn't happen) is skipped defensively.
 */
export function renderZones(container, zones, seatedPlayers, opts = {}) {
  container.innerHTML = '';

  const grouped = zones.filter((z) => !z.ownerId && (z.id === 'table' || z.kind === 'discard' || z.kind === 'deck'));
  if (grouped.length > 0) {
    const tableZoneEl = document.createElement('zone-panel');
    container.appendChild(tableZoneEl);
    // UX follow-up (real bug, found live via a preset layout that
    // silently failed to apply): this id is `opts.layout`'s key
    // (`panelLayout.js`) - it must be `'table-zone'` to match what
    // every preset's own `layout` field, this project's own docs, and
    // a player's own drag-to-move already call it, NOT the Table
    // PILE's own id (`'table'`, one of `grouped`'s members, already
    // addressable by ITS OWN `data-zone-id`).
    tableZoneEl.render('table-zone', 'Table Zone', grouped, zones, opts);
  }

  // UX follow-up (direct user request): every pile sharing one ownerId
  // groups into one Zone, positioned/moved/resized once for the whole
  // group - mirrors the Table Zone's own grouping exactly, just keyed
  // by owner instead of by "shared".
  const byOwner = new Map();
  for (const zone of zones) {
    if (grouped.includes(zone) || !zone.ownerId) continue;
    if (!byOwner.has(zone.ownerId)) byOwner.set(zone.ownerId, []);
    byOwner.get(zone.ownerId).push(zone);
  }
  for (const [ownerId, piles] of byOwner) {
    const seatIndex = seatedPlayers.findIndex((p) => p.id === ownerId);
    if (seatIndex === -1) continue; // owner not in the current roster (shouldn't happen) - skip defensively

    const playerZoneEl = document.createElement('zone-panel');
    container.appendChild(playerZoneEl);
    const ownerName = opts.resolveOwnerName?.(ownerId) ?? ownerId;
    playerZoneEl.render(`player-${ownerId}`, ownerName, piles, zones, opts);
    // AFTER `.render()`, not before - `renderZonePanel`'s own first line
    // (`zoneEl.className = 'zone'`) would otherwise wipe this class out.
    playerZoneEl.classList.add('seat-zone');
    // `wirePanelLayout` (called inside `render` above) only ever sets
    // `left`/`top` once a REAL stored position exists - a player zone
    // with none yet still needs its ring-position default, same as it
    // always has.
    if (!playerZoneEl.classList.contains('panel-moved')) {
      const { leftPct, topPct } = seatPosition(seatIndex, seatedPlayers.length, 26);
      playerZoneEl.style.left = `${leftPct}%`;
      playerZoneEl.style.top = `${topPct}%`;
    }
  }

  // Every remaining shared pile (ownerless, not part of the Table Zone
  // group) - a player-CREATE_ZONE'd zone, Solitaire's foundations/
  // cascades, Spit's rank-adjacent pile - gets its own Zone holding
  // that one pile, exactly as before.
  for (const zone of zones) {
    if (grouped.includes(zone) || zone.ownerId) continue;

    const zoneEl = document.createElement('zone-panel');
    container.appendChild(zoneEl);
    zoneEl.render(zone.id, null, [zone], zones, opts);
  }
}

/**
 * UX follow-up (direct user request): "grab bars and click title...
 * grabbing the title to move the panel to a different place on the
 * table." `headingEl` (a panel's own `.zone-name`) is the drag handle;
 * `panelEl` is what actually moves (`left`/`top`, percentages of
 * `#table-surface` - the same coordinate convention `seating.js`'s
 * `seatPosition()` already uses for everything absolutely positioned
 * there). Mouse-only (`e.pointerType`), matching this whole redesign
 * pass's established desktop-only scope. Dispatches `onMove(id, x, y)`
 * ONCE, on release, not on every pointermove - the position only needs
 * to persist to `localStorage` (`panelLayout.js`) once the gesture is
 * done, not on every intermediate pixel; the live drag itself is purely
 * a local style update until then.
 */
function attachPanelDrag(headingEl, panelEl, id, onMove) {
  if (!headingEl) return;
  headingEl.classList.add('panel-drag-handle');
  headingEl.addEventListener('pointerdown', (e) => {
    // Buttons in the header (pile-action-btn, score +/-) must keep
    // working as plain clicks, not become a drag's starting point.
    if (e.pointerType !== 'mouse' || e.target.closest('button')) return;
    e.preventDefault();
    // `offsetParent`, not a hardcoded `#table-surface`: every panel is a
    // direct child of `#zones` now, but this still generalizes correctly
    // regardless of what any panel's positioning ancestor actually is.
    const parentRect = (panelEl.offsetParent || document.getElementById('table-surface')).getBoundingClientRect();
    const startRect = panelEl.getBoundingClientRect();
    // Offset from the pointer to the panel's own top-left, so the panel
    // doesn't jump to re-center itself on the cursor the instant the
    // drag starts - it moves exactly as far as the pointer does.
    const grabDx = e.clientX - startRect.left;
    const grabDy = e.clientY - startRect.top;
    // UX follow-up (real bug, found live): a panel that has never been
    // moved is still positioned by its OWN default mechanism (a personal
    // zone's seatPosition ring math + centering transform, a shared
    // zone's normal flex-wrap flow) - taking it out of that flow onto a
    // plain top-left `position: absolute` needs an anchor computed from
    // where it's ACTUALLY sitting right now, or it jumps the instant the
    // drag starts. Idempotent for a panel already in `panel-moved` mode
    // (a second drag, or a personal zone whose position was already
    // stored) - this produces the same left/top it already had.
    panelEl.classList.add('panel-moved');
    panelEl.style.left = `${startRect.left - parentRect.left}px`;
    panelEl.style.top = `${startRect.top - parentRect.top}px`;

    panelEl.classList.add('panel-dragging');
    document.body.classList.add('panel-drag-active');

    const onPointerMove = (ev) => {
      const x = ev.clientX - grabDx - parentRect.left;
      const y = ev.clientY - grabDy - parentRect.top;
      panelEl.style.left = `${x}px`;
      panelEl.style.top = `${y}px`;
      panelEl.dataset.dragX = x;
      panelEl.dataset.dragY = y;
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      panelEl.classList.remove('panel-dragging');
      document.body.classList.remove('panel-drag-active');
      const x = Number(panelEl.dataset.dragX);
      const y = Number(panelEl.dataset.dragY);
      delete panelEl.dataset.dragX;
      delete panelEl.dataset.dragY;
      if (Number.isFinite(x) && Number.isFinite(y)) onMove(id, x, y);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
}

/** Never let a resize shrink a panel past the point its own content
 * (a card, a heading) stops fitting - matches `.seat-zone`'s own CSS
 * `min-width` floor for the un-resized case, just enforced here too so
 * a resize can't undercut it. */
const MIN_PANEL_WIDTH_PX = 160;
/** Same idea for height - tall enough for the heading plus one row of
 * cards, so a vertical resize can't collapse a zone to an unusable
 * sliver (the `overflow-y: auto` `renderZonePanel` sets handles a
 * SHORTER-than-content panel gracefully; this stops it going shorter
 * than makes sense at all). */
const MIN_PANEL_HEIGHT_PX = 90;

/**
 * UX follow-up (direct user request): a resize handle in the panel's
 * own bottom-right corner, alongside the title-bar move handle
 * (`attachPanelDrag`) - and, per a follow-up ask, BOTH axes, not just
 * width, from the one corner handle (matching its own `nwse-resize`
 * cursor, which already implied two-way). Same local, dispatch-once-
 * on-release shape as `attachPanelDrag` - `onResize(id, w, h)` fires on
 * pointerup, not on every pointermove. `w`/`h` are PLAIN PIXELS, not a
 * percentage - real bug, found live: a shared (`#table-area`) zone is
 * still in normal flex flow, whose own height is intrinsic/content-
 * driven, and CSS only resolves a percentage `height` against a
 * DEFINITE ancestor height (a well-known quirk - percentage widths
 * mostly "just work" against auto-width containers, percentage heights
 * do not). That silently no-opped every vertical resize on a shared
 * zone while width (and personal zones, already `position: absolute`
 * either way) looked fine. Plain pixels sidestep the whole question.
 */
function attachPanelResize(panelEl, id, onResize) {
  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  handle.title = 'Drag to resize';
  panelEl.appendChild(handle);

  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    e.preventDefault();
    e.stopPropagation(); // don't also let this bubble into a move-drag
    // `offsetParent`, not a hardcoded `#table-surface`: a personal zone's
    // is `#seat-zones` (which exactly overlays `#table-surface`, so the
    // numbers agree either way), but a shared zone's is `#table-area` -
    // a smaller, offset box within it. The clamp below only needs SOME
    // stable outer bound to avoid an unbounded resize, not that specific
    // element.
    const bound = (panelEl.offsetParent || document.getElementById('table-surface')).getBoundingClientRect();
    const startRect = panelEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    panelEl.classList.add('panel-resizing');
    document.body.classList.add('panel-resize-active');

    const onPointerMove = (ev) => {
      const w = Math.min(
        Math.max(startRect.width + (ev.clientX - startX), MIN_PANEL_WIDTH_PX),
        bound.width * 0.9,
      );
      const h = Math.min(
        Math.max(startRect.height + (ev.clientY - startY), MIN_PANEL_HEIGHT_PX),
        bound.height * 0.9,
      );
      panelEl.style.width = `${w}px`;
      panelEl.style.height = `${h}px`;
      panelEl.style.overflowY = 'auto';
      panelEl.dataset.resizeW = w;
      panelEl.dataset.resizeH = h;
    };
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      panelEl.classList.remove('panel-resizing');
      document.body.classList.remove('panel-resize-active');
      const w = Number(panelEl.dataset.resizeW);
      const h = Number(panelEl.dataset.resizeH);
      delete panelEl.dataset.resizeW;
      delete panelEl.dataset.resizeH;
      if (Number.isFinite(w) && Number.isFinite(h)) onResize(id, w, h);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });
}

// positionHandZone (D51) retired, UX follow-up: the hand no longer has
// its own separately-positioned element - it renders inside the
// viewer's own zone panel now (`renderSeatZones`'s `opts.own`, above),
// which is already positioned by that same function. Nothing left to
// position separately.

/**
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter, plus (when relevant) the
 * always-visible Deal count input - purely presentational, draw
 * mechanics (US-7) are unchanged.
 *
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - this is now ONLY the deck's row
 * content (the stack + count input), the same role `<fan-pile>` plays
 * for a hand - the heading (title + Draw/Deal/Reshuffle/Shuffle/Split
 * buttons) is built generically by `renderPile` now, via
 * `pileLevelActions('deck', ...)`, same as any other pile's heading.
 * Used both as `<deck-stack>`'s row inside `renderPile` (`opts.isHost`
 * set) and directly by the pre-game preview screen (`#host-deck-area`,
 * no opts - no host controls exist on that screen at all).
 */
export function renderDeckStack(container, count, opts = {}) {
  container.innerHTML = '';
  // `classList.add`, not `className =` - `#host-deck-area` (the pre-game
  // preview screen) already carries `.deck-area` from static markup and
  // must keep it; `<deck-stack>` (inside `renderPile`) starts with none,
  // so adding is equivalent to setting there.
  container.classList.add('deck-area-row');

  // D29: the stack and the controls are SIBLINGS. The empty-deck
  // short-circuit below therefore hides the cards only - it used to hide
  // the whole container, which would have taken the deal controls with it
  // exactly when a host most needs them (Smith Gate 1 blocker). The fix
  // is the structure, not a special case inside it.
  const stack = document.createElement('div');
  stack.className = 'deck-stack';
  if (count > 0) {
    for (let i = 0; i < Math.min(count, 3); i++) {
      const back = cardBackEl();
      back.classList.add('deck-stack-card');
      back.style.top = `${-i * 2}px`;
      back.style.left = `${i * 2}px`;
      stack.appendChild(back);
    }
    const badge = document.createElement('span');
    badge.className = 'deck-count-badge';
    badge.textContent = count;
    stack.appendChild(badge);
  } else {
    const empty = document.createElement('div');
    empty.className = 'deck-empty';
    empty.textContent = 'Deck empty';
    stack.appendChild(empty);
  }
  container.appendChild(stack);

  // Deal's count input stays persistent/always-visible - unchanged from
  // D52. UX follow-up (direct user request): "just make the split action
  // always split in half" - no count input for split any more, it's a
  // one-click action like every other deck action now.
  const actions = pileLevelActions('deck', { isHost: opts.isHost === true });
  if (actions.includes('deal') || actions.includes('reshuffleDeal')) {
    container.appendChild(pileCountInput({
      value: opts.dealCount ?? 1, onChange: opts.onDealCountChange,
      min: 1, max: 20, ariaLabel: 'Cards to deal each player', inputId: 'deck-deal-count',
    }));
  }
}

/** D52: a small, always-visible number input for a pile-level action's
 * count setting (Deal's cards-per-player) - see `renderDeck`'s own
 * comment for why this lives outside the radial menu now. UX follow-up:
 * Split no longer has one - it always splits into 2, no count to set. */
function pileCountInput({ value, onChange, min, max, ariaLabel, inputId }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min ?? 1);
  input.max = String(max ?? 20);
  input.value = String(value ?? min ?? 1);
  input.className = 'pile-anchor-count';
  if (inputId) input.id = inputId;
  input.setAttribute('aria-label', ariaLabel ?? 'Count');
  input.addEventListener('input', () => onChange?.(Number(input.value)));
  return input;
}

const PILE_ACTION_TOKEN_PREFIX = 'pile-action:';

/** The dataTransfer payload a draggable pile-action button carries. */
function pileActionToken(actionId) {
  return `${PILE_ACTION_TOKEN_PREFIX}${actionId}`;
}

/**
 * Reads a drop's raw `text/plain` payload and returns the pile-action id
 * it carries, or `null` if this drop isn't one (an ordinary card, most
 * likely). Only meaningful at `drop` time - real browsers don't expose
 * `dataTransfer` values during `dragover`, only `.types` (D35 note: this
 * is why the drop target below always calls `preventDefault()` on
 * dragover unconditionally rather than trying to distinguish there).
 */
export function pileActionFromDrop(dataTransfer) {
  const raw = dataTransfer.getData('text/plain');
  return raw.startsWith(PILE_ACTION_TOKEN_PREFIX) ? raw.slice(PILE_ACTION_TOKEN_PREFIX.length) : null;
}

/**
 * Touch drag for one pile-action button (Draw, Phase 54/D35) - the same
 * press-and-hold recognizer `attachTouchDrag` uses for cards, wired
 * smaller: there's no card identity to broadcast mid-drag (US-29 doesn't
 * apply - nothing has been drawn yet), just a ghost and a drop check.
 */
function attachPileActionTouchDrag(sourceEl, actionId, onDrop) {
  let state = null;
  let timer = null;
  let ghost = null;

  const teardown = () => {
    clearTimeout(timer);
    ghost?.remove();
    ghost = null;
  };

  const handle = {
    lift: (ev) => {
      ghost = sourceEl.cloneNode(true);
      ghost.classList.add('touch-drag-ghost');
      document.body.appendChild(ghost);
      moveDragGhost(ghost, ev.x, ev.y);
    },
    move: (ev) => { if (ghost) moveDragGhost(ghost, ev.x, ev.y); },
    drop: (ev) => {
      teardown();
      if (document.elementFromPoint(ev.x, ev.y)?.closest('#hand-area')) onDrop();
    },
    cancel: teardown,
  };

  const feed = (sample) => {
    const out = touchDragStep(state, sample);
    state = out.state;
    for (const e of out.events) handle[e.type](e);
  };

  sourceEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    feed({ type: 'down', x: e.clientX, y: e.clientY, t: performance.now() });
    clearTimeout(timer);
    timer = setTimeout(() => feed({ type: 'tick', t: performance.now() }), HOLD_MS);
    sourceEl.setPointerCapture(e.pointerId);
  });
  sourceEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    feed({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now() });
  });
  sourceEl.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    clearTimeout(timer);
    feed({ type: 'up', x: e.clientX, y: e.clientY, t: performance.now() });
  });
  sourceEl.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    feed({ type: 'cancel', t: performance.now() });
  });
  sourceEl.addEventListener('touchmove', (e) => {
    if (state?.phase === 'dragging') e.preventDefault();
  }, { passive: false });
}

/**
 * A compact fan of face-down mini-cards representing another player's
 * hand (US-21) - capped at a handful of visible backs regardless of
 * actual hand size, so this stays compact even with 3+ players holding
 * 10+ cards each (Smith Gate 1). No count badge here - the roster row's
 * own `(N cards)` text is already the exact count (Smith Sprint 3
 * close-out finding: a second badge repeating the same number ran
 * together with the row text, redundant and visually squished).
 */
function renderMiniHand(container, count) {
  container.className = 'mini-hand';
  const shown = Math.min(count, 5);
  for (let i = 0; i < shown; i++) {
    const back = document.createElement('div');
    back.className = 'mini-card-back';
    back.style.marginLeft = i === 0 ? '0' : '-0.85rem';
    container.appendChild(back);
  }
}


/**
 * `seated: true` (US-26, D18) positions each player absolutely around
 * the table surface instead of stacking them in a plain list - same
 * per-player info as before (Smith Gate 1: this redesign changes WHERE
 * it's drawn, not what it shows), plus an explicit "You" marker on the
 * viewer's own seat (Smith Gate 1: position alone is ambiguous).
 * `players` must already be in seat order (viewer first) when seated.
 */
export function renderRoster(container, players, { movingIds, scores, onAdjustScore, myId, passed, seated, hideId } = {}) {
  container.innerHTML = '';
  players.forEach((p, i) => {
    // UX follow-up: the viewer's own seat now lives in the merged
    // hand+zone panel (`renderSeatZones`'s `opts.own`), not the ring -
    // skipping the `<li>` here (not filtering `players` itself) keeps
    // everyone ELSE's seat index/angle math unchanged, since it's still
    // computed against the real roster length and position.
    if (p.id === hideId) return;
    const li = document.createElement('li');
    li.className = `roster-player roster-${p.connection}`;
    if (seated) {
      const { leftPct, topPct } = seatPosition(i, players.length);
      li.style.left = `${leftPct}%`;
      li.style.top = `${topPct}%`;
      li.classList.add('seat');
      if (p.id === myId) li.classList.add('seat-you');
    }
    const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
    const moving = movingIds?.has(p.id) ? ' \u270B organizing hand' : '';
    const passedTag = passed?.[p.id] ? ' \uD83D\uDE45 Passed' : '';
    const youTag = seated && p.id === myId ? ' \uD83E\uDDD1 You' : '';

    // A seat is one horizontal row: [-] [who they are + score] [+].
    // The score buttons used to be appended *after* the text inside the
    // card, which on a narrow seat pushed them out past its own edge and
    // over whatever sat next to it. Flanking the info keeps both 44px
    // targets inside the card and makes the seat wider-than-taller,
    // which is what the table has room for.
    const info = document.createElement('span');
    info.className = 'seat-info';
    info.append(`${p.name} - ${p.connection}${count}${moving}${passedTag}${youTag}`);

    if (p.id !== myId && typeof p.handCount === 'number') {
      const miniHandEl = document.createElement('div');
      renderMiniHand(miniHandEl, p.handCount);
      info.appendChild(miniHandEl);
    }

    const hasScore = scores && p.id in scores;
    if (hasScore) {
      const scoreEl = document.createElement('span');
      scoreEl.className = 'score-row';
      scoreEl.append(`Score: ${scores[p.id]}`);
      info.appendChild(scoreEl);
    }

    if (hasScore && onAdjustScore) {
      const minusBtn = document.createElement('button');
      minusBtn.type = 'button';
      minusBtn.className = 'score-btn';
      minusBtn.textContent = '-';
      minusBtn.addEventListener('click', () => onAdjustScore(p.id, -1));

      const plusBtn = document.createElement('button');
      plusBtn.type = 'button';
      plusBtn.className = 'score-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => onAdjustScore(p.id, 1));

      li.append(minusBtn, info, plusBtn);
    } else {
      li.appendChild(info);
    }

    container.appendChild(li);
  });
}

/**
 * Renders the static rules-reference content (US-18) into a container.
 * One consistent block per game (goal/setup/turns), per Smith's Gate 1 AC.
 */
export function renderRulesPanel(container, rulesReference) {
  container.innerHTML = '';
  for (const [name, entry] of Object.entries(rulesReference)) {
    const block = document.createElement('div');
    block.className = 'rules-entry';
    const heading = document.createElement('h3');
    heading.textContent = name;
    block.appendChild(heading);

    const dl = document.createElement('dl');
    for (const [label, value] of [['Goal', entry.goal], ['Setup', entry.setup], ['Turns', entry.turns]]) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
    block.appendChild(dl);
    container.appendChild(block);
  }
}

/**
 * Toggles the "lifted" visual state on every rendered instance of a card
 * (a card can appear once per zone it's currently in - normally just
 * one place, but this stays correct regardless). Cosmetic only.
 */
export function setCardLifted(cardId, active) {
  const els = document.querySelectorAll(`[data-card-id="${CSS.escape(cardId)}"]`);
  for (const el of els) el.classList.toggle('card-lifted', active);
}

/**
 * Live remote cursor (US-22, D13): a small labeled dot positioned via
 * normalized (0-1) coordinates within `container` (the caller passes the
 * game screen element, matching how the position was captured).
 */
export function updateRemoteCursor(container, playerId, name, x, y) {
  let el = container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'remote-cursor';
    el.dataset.cursorId = playerId;
    const label = document.createElement('span');
    label.className = 'remote-cursor-label';
    label.textContent = name;
    el.appendChild(label);
    container.appendChild(el);
  }
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
}

export function removeRemoteCursor(container, playerId) {
  container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`)?.remove();
}

/**
 * Live card-drag ghost (US-29, D19): same normalized-position pattern as
 * the remote cursor, but shows an actual card - its real face if `card`
 * is given (already resolved by the caller to a full `{id,rank,suit}`
 * object, only ever done for a card that's genuinely public), or a
 * generic anonymous back if `card` is `null` (still-hidden to this
 * viewer - D19's privacy rule, enforced by the sender never including a
 * resolvable id in the first place, not by this function).
 */
export function updateCardDragGhost(container, playerId, card, x, y) {
  let el = container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'card-drag-ghost';
    el.dataset.cardDragId = playerId;
    container.appendChild(el);
  }
  el.innerHTML = '';
  el.appendChild(card ? cardEl(card, { disabled: true }) : cardBackEl(null));
  el.style.left = `${x * 100}%`;
  el.style.top = `${y * 100}%`;
}

export function removeCardDragGhost(container, playerId) {
  container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`)?.remove();
}

export function renderBanner(container, message) {
  container.textContent = message ?? '';
  container.hidden = !message;
}

export function showScreen(screens, name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}
