import { step as touchDragStep, HOLD_MS } from './touchDrag.js';
import { ACTION_SPECS, actionsForCard, pileLevelActions, targetsForAction, resolveDropTargetFor } from './pileActions.js';
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
  const handCard = el.closest('#hand-area .hand-card');
  if (handCard) return { kind: 'hand', el: handCard };
  const zone = el.closest('.zone[data-zone-id]');
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
      if (target.kind === 'hand') {
        // A card that isn't in the hand resolves to nothing here, which
        // is the same no-op the native path gives it.
        performHandReorder(target.el.parentElement, card.id, target.el, ctx.onReorder);
      } else if (ctx.onDropCard) {
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

/**
 * D28: the one implementation of "reorder my hand", called by both the
 * native `drop` listener and the touch recognizer. Extracted before any
 * touch code existed, specifically so there can never be two of these -
 * two placement paths would drift, and only the mouse one is covered by
 * the e2e suite.
 *
 * `beforeEl` is the hand card the dragged card lands in front of, or
 * null to move it to the end.
 */
function performHandReorder(container, draggedId, beforeEl, onReorder) {
  if (!draggedId) return;
  const draggedEl = container.querySelector(`[data-card-id="${CSS.escape(draggedId)}"]`)?.closest('.hand-card');
  if (!draggedEl || draggedEl === beforeEl) return;
  container.insertBefore(draggedEl, beforeEl);
  const newOrder = [...container.children].map((el) => el.querySelector('.card').dataset.cardId);
  onReorder?.(newOrder);
}

/**
 * Renders your own hand. Cards are draggable so you can reorder your own
 * view of your hand (a purely local/cosmetic preference - hand order isn't
 * part of authoritative state). `onHandMotion` fires on drag start/end so
 * the caller can broadcast a best-effort "organizing hand" cue (US-11) -
 * it never reveals which/how many cards moved, just that motion happened.
 *
 * Playing a card is one tap, or a drag onto a zone. Face-down play used
 * to be a pair of icon buttons under *every* card; with drag-and-drop
 * (US-28/32/33) that per-card clutter cost the whole hand vertical room
 * for a rarely-used option, so it moved to one control in the hand
 * toolbar that sets what the *next* play does. The capability is
 * unchanged - US-12/13/14 community and hole cards still work - it's
 * just stated once instead of 2xN times.
 *
 * `onReorder(newOrderIds)` fires after a manual drag-reorder completes,
 * so the caller can fold the result into the same order list the sort
 * buttons write to (D14) - sorting and dragging share one source of
 * truth instead of fighting each other (Smith Gate 1).
 */
export function renderHand(container, cards, { onPlay, onPlayHidden, onHandMotion, onReorder, onCardDrag, onDropCard, zones } = {}) {
  container.innerHTML = '';
  cards.forEach((card, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'hand-card';
    // US-30: a fanned spread via rotation + a slight arc, not horizontal
    // overlap - overlap would shrink covered cards' tap targets below
    // the 44px floor (Smith Gate 1), rotation/arc alone doesn't touch
    // hit-testing at all, so every card stays fully, individually
    // tappable no matter how many are in hand.
    const center = (cards.length - 1) / 2;
    const offset = i - center;
    // D51 follow-up: the fan-spread transform is set via the
    // `--raise-base` CUSTOM PROPERTY only, never the `transform`
    // property directly - style.css's `.hand-card { transform:
    // var(--raise-base, none); }` applies it as a plain class rule,
    // which the shared `.pile-hover-host:hover` rule (also a class
    // rule) can then outrank on hover. An inline `transform` would have
    // always won regardless of specificity, silently making the new
    // "Play hidden" hover row's raise effect never apply here - the
    // exact `.seat-zone` conflict already fixed once this same pass,
    // now avoided here by never using inline `transform` in the first
    // place rather than composing inside it.
    wrapper.style.setProperty('--raise-base', `rotate(${offset * 4}deg) translateY(${Math.abs(offset) * 0.35}rem)`);
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      onHandMotion?.(true);
      // D51: every table-side zone lights up as a legal `play` target
      // for the whole drag - same "compatible drop targets must appear
      // droppable while holding a card" mechanism the zone-card dragstart
      // above uses, applied to the hand's own side of it.
      if (zones) highlightDragTargets(['play'], zones.map((z) => ({ id: z.id, kind: z.kind, ownerId: z.ownerId ?? null })), {});
    });
    // US-29/D19: live position while actually dragging (not just the
    // start/end boolean onHandMotion already sends) - card is a plain
    // hand card with no `faceUp` field, which `cardDragPayload` treats
    // the same as `faceUp: false` (never reveals identity), by design.
    wrapper.addEventListener('drag', (e) => onCardDrag?.(card, e.clientX, e.clientY));
    wrapper.addEventListener('dragend', () => {
      onHandMotion?.(false);
      onCardDrag?.(null, 0, 0); // signals "stopped" - see main.js's onCardDrag
      clearPileTargets();
    });
    wrapper.addEventListener('dragover', (e) => e.preventDefault());
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      performHandReorder(container, e.dataTransfer.getData('text/plain'), wrapper, onReorder);
    });
    // US-40/D28: the same three things a mouse drag does - play onto a
    // zone, reorder within the hand, broadcast live motion - now reachable
    // with a finger, through the same functions.
    attachTouchDrag(wrapper, card, { onDropCard, onReorder, onCardDrag, onHandMotion });

    wrapper.appendChild(cardEl(card, { onClick: onPlay }));

    // D51 follow-up: "Play hidden" is the deliberate, secondary action -
    // reached by hovering the card (same mechanism every other
    // actionable pile/card uses now), never a tap/drag shortcut, so it
    // can't be triggered by accident the way the fast default (plain
    // tap/drag = public play, D36-style) can be.
    if (onPlayHidden) {
      attachRadialMenu(wrapper, card.id, () => ['playHidden'], { onAction: () => onPlayHidden(card) });
    }

    container.appendChild(wrapper);
  });
}

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
 * D51: the hand highlights as its own zone-styled container
 * (`#hand-zone`, not the inner `#hand-area` card row) now that it has
 * one, the same visual `.pile-target` every other zone gets. */
function pileElement(pileId) {
  if (pileId === HAND_PILE_ID) return document.getElementById('hand-zone');
  return document.querySelector(`.zone[data-zone-id="${CSS.escape(pileId)}"]`);
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

const HAND_PILE_ID = '__hand__';

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
    const id = el.id === 'hand-zone' ? HAND_PILE_ID : el.dataset.zoneId;
    clearPileTargets();
    onChoose(id);
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
 * D52 (real bug fix, direct user report): the menu used to reopen
 * itself at the CURRENT pointer position on every `pointerenter` -
 * including a `pointerenter` fired by a brand-new DOM node this app's
 * own wholesale re-renders (`renderZoneCards`/`renderGameFromView` etc.,
 * on every state/motion broadcast) insert right under a mouse that
 * hasn't actually moved anywhere. Each re-render's fresh node re-fired
 * the "just started hovering" event, silently teleporting the menu to
 * wherever the mouse happened to be at that instant - "a race to click
 * it" in the user's own words, because it could relocate mid-click.
 *
 * The fix is identity, not timing: track WHAT the open menu belongs to
 * by a caller-supplied stable `key` (a card id, or a fixed string like
 * `'deck'`) rather than by DOM node reference, which re-renders don't
 * preserve. A `pointerenter` for the SAME key is a re-render artifact,
 * not a new hover - it's ignored outright, so the menu stays exactly
 * where it opened until one of the three things the user asked for
 * actually happens.
 */
let radialMenuKey = null;

/**
 * D52: a pointer-centered radial menu of `actionIds`, replacing the
 * D34-era edge-anchored popover. `position: fixed` at the pointer's OWN
 * screen coordinates (never the host element's box) sidesteps this
 * project's whole history of trapped-stacking-context bugs (D24/D51's
 * `#table-center:has(...)` escalations) at the source, rather than
 * fixing them one more time for a new host shape - a menu that isn't
 * inside any pile's own box can't lose a z-index fight to one.
 *
 * Dispatch mirrors D51's existing split: an in-place
 * action (`target` null/undefined) or a STATIC `singleTarget` action
 * (D36 - Draw's own "don't make the highest-frequency action need an
 * extra step" rule, preserved exactly here too) dispatches the moment
 * it's clicked. Anything else opens `beginTargetingWithGhost` - the
 * card-follows-cursor-until-you-confirm behavior.
 *
 * Persists once open (direct user request) until: an action is
 * clicked, a click lands anywhere else (the deferred document
 * listener below), or the pointer genuinely moves to a DIFFERENT
 * actionable thing (a new `key` arrives via `attachRadialMenu`).
 *
 * @param {string} key stable identity of what's opening this menu (a
 *   card id, or a fixed string per pile) - see the doc comment above.
 * @param {string[]} actionIds
 * @param {number} cx @param {number} cy pointer screen coordinates
 * @param {{labels?: Record<string,string>, disabled?: string[],
 *   targetsFor: (actionId: string) => string[],
 *   onAction: (actionId: string, targetPileId?: string) => void}} opts
 */
function openRadialMenu(key, actionIds, cx, cy, opts) {
  // D52 real bug (found live, right after the "don't reposition" fix
  // above): a re-render's `pointerenter` for the SAME key must keep the
  // menu's POSITION, but still needs to rebuild its CONTENT - the
  // re-render might be exactly what changed which actions are legal
  // (drawing the last card disables Deal, mid-hover). Reusing the
  // existing menu's own coordinates instead of the new event's is what
  // "same key, don't move" actually means; skipping the rebuild
  // entirely would have left a stale, wrong action list on screen.
  const reopeningSameKey = radialMenuEl && radialMenuKey === key;
  if (reopeningSameKey) {
    cx = parseFloat(radialMenuEl.style.left);
    cy = parseFloat(radialMenuEl.style.top);
  }
  closeRadialMenu();
  const ids = actionIds.filter((id) => !opts.disabled?.includes(id));
  if (!ids.length) return;

  const menu = document.createElement('div');
  menu.className = 'radial-menu';
  menu.style.left = `${cx}px`;
  menu.style.top = `${cy}px`;

  const n = ids.length;
  // D52: brought closer in (user request #1: "bring the radial menu
  // into the card interface, overlap or just get closer") - also
  // shortens how far the mouse has to travel to reach a button, which
  // matters more now that the menu is stable (not fighting to relocate
  // out from under a moving cursor) but still worth minimizing travel.
  const radius = 3 * 16; // px
  ids.forEach((id, i) => {
    const spec = ACTION_SPECS[id];
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // first item points up
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radial-menu-btn' + (spec.destructive ? ' btn-danger' : '');
    btn.style.transform = `translate(${Math.round(Math.cos(angle) * radius)}px, ${Math.round(Math.sin(angle) * radius)}px)`;
    // D52 flare: a small stagger so the ring fans out rather than
    // popping in as one flat block - style.css's `radial-pop` keyframe
    // reads this per-button delay.
    btn.style.setProperty('--radial-delay', `${i * 0.025}s`);
    btn.dataset.action = id;
    btn.textContent = opts.labels?.[id] ?? spec.label;
    if (spec.hint) btn.title = spec.hint;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (spec.destructive && !window.confirm(
        `${spec.hint}\n\nEvery player's current hand will be cleared. Continue?`)) return;
      closeRadialMenu();
      if (spec.target == null || spec.singleTarget) {
        opts.onAction(id);
      } else {
        beginTargetingWithGhost(id, opts.targetsFor(id), spec.label, (targetId) => opts.onAction(id, targetId));
      }
    });
    // D35/D51/D52: a `target`-bearing pile action (today, only `draw`)
    // keeps its own action-token drag protocol ALONGSIDE the new
    // click-to-follow gesture above - not a replacement. Cards never
    // need this (a card's own element is what gets dragged for
    // move/pickup/play), only pile-level actions.
    if (opts.draggable && spec.target) {
      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', pileActionToken(id));
        closeRadialMenu();
      });
      attachPileActionTouchDrag(btn, id, () => opts.onAction(id));
    }
    menu.appendChild(btn);
  });
  // D52 real bug, found live: the menu is a child of `document.body`,
  // positioned by `position: fixed` at the pointer's coordinates - NOT
  // a descendant of `hostEl`. Moving the mouse from the host onto a
  // button fires `pointerleave` on the host with nothing to catch it,
  // closing the menu out from under the click before it lands. Giving
  // the menu its OWN enter/leave that cancels/reschedules the same
  // close (deferred one tick, so a leave-then-immediately-enter pair
  // between two disjoint elements doesn't close in between) is the fix
  // - "hovering the host OR the menu" is what should keep it open, not
  // just the host alone.
  menu.addEventListener('pointerenter', cancelRadialClose);
  menu.addEventListener('pointerleave', scheduleRadialClose);
  document.body.appendChild(menu);
  radialMenuEl = menu;
  radialMenuKey = key;

  // D52 user request #2b: "a click anywhere besides the action buttons"
  // closes it - mirrors `beginTargeting`'s own `onElsewhere` (deferred
  // so the SAME click that opened the menu, via a card's own click-to-
  // reveal path elsewhere in this app, doesn't immediately close it).
  setTimeout(() => document.addEventListener('click', onRadialElsewhere, { once: true }), 0);
}

function onRadialElsewhere(e) {
  if (!e.target.closest('.radial-menu')) closeRadialMenu();
}

let radialMenuEl = null;
let radialCloseTimer = null;

function cancelRadialClose() {
  clearTimeout(radialCloseTimer);
  radialCloseTimer = null;
}

function scheduleRadialClose() {
  cancelRadialClose();
  radialCloseTimer = setTimeout(closeRadialMenu, 0);
}

function closeRadialMenu() {
  cancelRadialClose();
  document.removeEventListener('click', onRadialElsewhere);
  radialMenuEl?.remove();
  radialMenuEl = null;
  radialMenuKey = null;
}

/**
 * Wires `hostEl` to open a radial menu of `getActionIds()` on mouse
 * hover, centered on the pointer. Desktop/mouse-only, matching D51's
 * own explicit scope for this whole redesign pass (`e.pointerType`
 * gates it, same as `attachTouchDrag`'s own mouse-vs-touch split) - no
 * touch equivalent was built or attempted.
 *
 * @param {HTMLElement} hostEl
 * @param {string} key stable identity for this host - see
 *   `openRadialMenu`'s own doc comment for why this exists (re-render
 *   churn, not DOM reference, is what "still the same card" means here).
 * @param {() => string[]} getActionIds computed fresh on every hover,
 *   not cached, since what a card offers can change between renders.
 * @param {object} opts see `openRadialMenu`'s own `opts`.
 */
function attachRadialMenu(hostEl, key, getActionIds, opts) {
  // `.pile-hover-host` still drives a plain CSS `:hover` raise (a small
  // lift + shadow on the actor itself, style.css) as the "this is
  // actionable" cue - independent of the radial menu's own open/closed
  // state, which is JS-driven (needs real pointer coordinates, which
  // `:hover` alone can't give). `tabIndex` is the same low-cost,
  // unverified touch nicety D51 already noted - not a real touch
  // equivalent, no effort spent confirming it.
  hostEl.classList.add('pile-hover-host');
  if (hostEl.tabIndex < 0 || hostEl.tabIndex == null) hostEl.tabIndex = 0;
  hostEl.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    cancelRadialClose();
    openRadialMenu(key, getActionIds(), e.clientX, e.clientY, { targetsFor: () => [], ...opts });
  });
  hostEl.addEventListener('pointerleave', () => {
    // A menu still open (nothing clicked yet) closes when the pointer
    // leaves both the host AND the menu itself (`scheduleRadialClose`
    // is cancelable - see the menu's own pointerenter in
    // `openRadialMenu`); targeting already in progress (a target-
    // bearing action was clicked) stays open regardless of where the
    // pointer wanders - that's the whole point of "the card follows
    // the mouse".
    if (!cancelTargeting) scheduleRadialClose();
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
 * The radial action menu for one card in a zone (D52) - `attachRadialMenu`
 * wired for the card case: a `target`-bearing action opens the card-
 * follows-cursor targeting mode since a card may have several legal
 * destinations (`move` among zones); an in-place action (`target: null`
 * - today just `rotate`) dispatches directly. `reveal` is deliberately
 * excluded (Phase 55 moved it to a direct tap on the card - see
 * `performReveal` and its call site in `renderZoneCards`).
 *
 * @param {HTMLElement} wrapper the card's own `.middle-card` element -
 *   `attachRadialMenu` opens the menu on hovering it, centered on the
 *   pointer.
 */
function actionMenuEl(wrapper, zone, card, allZones, opts) {
  const { viewerId, onPickup, onMoveCard, onRotate } = opts;
  // D45: both were hardcoded `kind: 'zone'` - real bugs the moment a
  // second table-side type exists, same class as `renderZoneCards`'s.
  const pile = { id: zone.id, kind: zone.kind, ownerId: zone.ownerId ?? null };
  const available = actionsForCard(pile, card, viewerId).filter((a) => a !== 'reveal');
  if (available.length === 0) return;

  const piles = [
    ...allZones.map((z) => ({ id: z.id, kind: z.kind, ownerId: z.ownerId ?? null })),
    { id: HAND_PILE_ID, kind: 'hand', ownerId: viewerId },
  ];

  attachRadialMenu(wrapper, card.id, () => available, {
    targetsFor: (action) => targetsForAction(action, piles, { viewerId, fromPileId: zone.id }),
    onAction: (action, targetId) => {
      // D48: an in-place action has no destination to pick - `openRadialMenu`
      // dispatches it directly (no `targetId` argument) rather than going
      // through targeting, since `targetsForAction` would return `[]` for
      // a null-target action anyway (a no-op click, not a bug in either).
      if (action === 'rotate') onRotate?.(card.id);
      else if (action === 'pickup') onPickup?.(card.id);
      else if (action === 'move') onMoveCard?.(card.id, targetId);
    },
  });
}

function renderZoneCards(container, zone, allZones, opts = {}) {
  const { resolveOwnerName, onMoveCard, onCardLift, onCardDrag } = opts;
  container.innerHTML = '';
  // D45: was hardcoded `kind: 'zone'` below - harmless while zone was
  // the only 'mixed'-visibility pile type, a real bug the moment a
  // second one (discard) exists: every card-level authorization check
  // in this function would have been evaluated against ZONE's rules
  // even for a discard pile's own cards.
  const pile = { id: zone.id, kind: zone.kind, ownerId: zone.ownerId ?? null };
  for (const card of zone.cards) {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card';
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
      const piles = [
        ...allZones.map((z) => ({ id: z.id, kind: z.kind, ownerId: z.ownerId ?? null })),
        { id: HAND_PILE_ID, kind: 'hand', ownerId: opts.viewerId },
      ];
      wrapper.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.id);
        // D51: every zone (and the hand, if this card is pickup-eligible)
        // that could legally receive this SPECIFIC card lights up for the
        // whole drag - not just whichever one the pointer happens to be
        // over mid-drag (`showZoneDragOver`'s existing per-hover cue,
        // unchanged, still layers on top of this once you're over one).
        highlightDragTargets(
          cardActions.filter((a) => a === 'move' || a === 'pickup'),
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
      if (!card.faceUp) {
        const hiddenTag = document.createElement('div');
        hiddenTag.className = 'owner-tag';
        hiddenTag.textContent = 'hidden from others';
        wrapper.appendChild(hiddenTag);
      }
    }

    actionMenuEl(wrapper, zone, card, allZones, opts);

    container.appendChild(wrapper);
  }
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
function renderZonePanel(zone, allZones, opts) {
  const zoneEl = document.createElement('div');
  zoneEl.className = 'zone';
  zoneEl.dataset.zoneId = zone.id; // D25: addressable as a drop target
  // D45/D53: the kind travels with the element so the touch-drag path
  // (which only has the DOM node, not the view object, at drop time)
  // can resolve its own drop-target geometry too - see
  // touchTargetAt/attachTouchDrag.
  zoneEl.dataset.kind = zone.kind;

  const heading = document.createElement('div');
  heading.className = 'zone-name';
  heading.textContent = `${zone.name} (${zone.cards.length})`;
  zoneEl.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'card-row';
  zoneEl.appendChild(row);
  renderZoneCards(row, zone, allZones, opts);

  if (opts.onDropCard) {
    zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      showZoneDragOver(zoneEl, row, { x: e.clientX, y: e.clientY }, zone.kind);
    });
    zoneEl.addEventListener('dragleave', () => clearZoneDragOver(zoneEl, row));
    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      performZoneDrop(zoneEl, row, zone.id, e.dataTransfer.getData('text/plain'),
        { x: e.clientX, y: e.clientY }, opts.onDropCard, zone.kind);
    });
  }

  return zoneEl;
}

/**
 * Renders every zone as its own labeled sub-panel (US-19, D12) - zone
 * names/counts are always shown, per Smith's Gate 1 requirement that a
 * zone never be identifiable only by position. `allZones` (defaults to
 * `zones`) is what the "Move to…" dropdown offers as destinations - the
 * caller passes the *full*, unfiltered zone list here when `zones` has
 * been filtered down to just the shared ones (D17/US-27: personal zones
 * render separately via `renderSeatZones`, but must still appear as
 * valid move-to targets).
 */
export function renderZones(container, zones, opts = {}, allZones = zones) {
  container.innerHTML = '';
  for (const zone of zones) {
    container.appendChild(renderZonePanel(zone, allZones, opts));
  }
}

/**
 * Personal zones (D17, US-27) render "in front of" their owning
 * player's seat instead of in the flat shared-zone stack - same
 * `seatPosition()` geometry `renderRoster`'s seats use, at a smaller
 * radius so they sit toward the table's center rather than its edge.
 * `seatedPlayers` must be in the same seat order used to render the
 * roster (viewer first, D18), so a zone lands at the SAME seat its
 * owner's roster entry is drawn at.
 */
export function renderSeatZones(container, personalZones, allZones, seatedPlayers, opts = {}) {
  container.innerHTML = '';
  for (const zone of personalZones) {
    const seatIndex = seatedPlayers.findIndex((p) => p.id === zone.ownerId);
    if (seatIndex === -1) continue; // owner not in the current roster (shouldn't happen) - skip defensively

    const zoneEl = renderZonePanel(zone, allZones, opts);
    zoneEl.classList.add('seat-zone');
    const { leftPct, topPct } = seatPosition(seatIndex, seatedPlayers.length, 26);
    zoneEl.style.left = `${leftPct}%`;
    zoneEl.style.top = `${topPct}%`;

    container.appendChild(zoneEl);
  }
}

/**
 * D51 (table-unification pass): positions the hand zone at the VIEWER's
 * own seat - same `seatPosition()` geometry `renderSeatZones` uses for
 * every other personal zone, at the same radius, so the hand visually
 * belongs to the same ring. The viewer is always seat index 0 (D18's
 * per-viewer rotation - "the viewer always lands at the bottom"), so
 * this is always `seatPosition(0, seatCount, 26)`, but takes an explicit
 * `seatIndex` rather than hardcoding 0 so a future caller isn't forced
 * to agree with that assumption silently.
 *
 * A plain positioning helper, not a `render*` function: `#hand-zone`
 * lives as a *static* sibling of `#seat-zones` in `index.html` (that
 * container is wiped wholesale every render by `renderSeatZones` - a
 * child would be destroyed each call), so its own contents (`#hand-area`
 * etc.) are rendered by the existing `renderHand`/`renderPileAnchor`
 * calls in `main.js`, unchanged - this only ever touches position.
 */
export function positionHandZone(el, seatIndex, seatCount) {
  const { leftPct, topPct } = seatPosition(seatIndex, seatCount, 26);
  el.style.left = `${leftPct}%`;
  el.style.top = `${topPct}%`;
}

/**
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter - purely presentational, draw
 * mechanics (US-7) are unchanged.
 */
export function renderDeck(container, count, opts = {}) {
  container.innerHTML = '';
  container.hidden = false;

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

  const actions = pileLevelActions('deck', { isHost: opts.isHost === true });
  if (!actions.length || !opts.onPileAction) return;

  // D52: count inputs (how many cards to Deal, how many piles to Split
  // into) moved OUT of the action menu and onto the deck itself,
  // persistent/always-visible rather than nested inside a transient
  // radial menu - there's no natural way to embed a text field in a
  // ring of buttons, and these are settings you set ahead of clicking
  // the action, not part of the action's own identity.
  if (actions.includes('deal') || actions.includes('reshuffleDeal')) {
    container.appendChild(pileCountInput({
      value: opts.dealCount ?? 1, onChange: opts.onDealCountChange,
      min: 1, max: 20, ariaLabel: 'Cards to deal each player', inputId: 'deck-deal-count',
    }));
  }
  if (actions.includes('split')) {
    container.appendChild(pileCountInput({
      value: opts.splitCount ?? 2, onChange: opts.onSplitCountChange,
      min: 2, max: 20, ariaLabel: 'Number of piles', inputId: 'deck-split-count',
    }));
  }

  // Phase 56 (T56.1): every deck action - draw, deal, reshuffleDeal,
  // shuffle, split - lives on one menu (Phase 54 gave it only `draw`;
  // the legacy strip carried the rest until this phase). D52: that menu
  // is now the pointer-centered radial menu, hosted on `container`
  // (`#game-deck-area`) itself, not a separate anchor slot - hovering
  // the deck's own stack/empty state opens it, the same mechanism a
  // card's hover menu already used.
  attachRadialMenu(container, 'deck', () => actions, {
    onAction: (id) => opts.onPileAction(id),
    disabled: count <= 0 ? ['deal'] : [], // nothing left to deal from
    draggable: true,
  });
}

/** D52: a small, always-visible number input for a pile-level action's
 * count setting (Deal's cards-per-player, Split's pile count) - see
 * `renderDeck`'s own comment for why this lives outside the radial
 * menu now. */
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

/**
 * D52: a pile's own radial action menu (Draw, Deal, Sort, Pass, ...) -
 * `attachRadialMenu` wired for the pile case: dispatch is always direct
 * (no "choose a destination"/follow mode, ever - even `draw`'s
 * `singleTarget` case just means there's only one legal destination,
 * D36), and `target`-bearing actions (today, only `draw`) also keep
 * their own action-token drag protocol (D35) alongside the new click.
 *
 * @param {HTMLElement} hostEl the pile's own visual container (e.g.
 *   `#game-deck-area`, `#hand-zone`) - `attachRadialMenu` opens the menu
 *   on hovering this element, centered on the pointer, not the element's
 *   own box.
 * @param {string[]} actions ids from `pileLevelActions()`.
 * @param {{onPileAction: (id: string) => void,
 *   labels?: Record<string,string>, disabled?: string[]}} opts
 */
export function renderPileAnchor(hostEl, actions, opts = {}) {
  // 'hand-pile' is a fixed key, not per-instance: today's only caller
  // (main.js) always uses this for the SAME logical pile (the viewer's
  // own hand) - see `openRadialMenu`'s doc comment for why a stable key
  // (not the DOM node) is what "still the same thing" means here.
  attachRadialMenu(hostEl, 'hand-pile', () => actions, {
    labels: opts.labels,
    disabled: opts.disabled,
    draggable: true,
    onAction: (id) => opts.onPileAction?.(id),
  });
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
export function renderRoster(container, players, { movingIds, scores, onAdjustScore, myId, passed, seated } = {}) {
  container.innerHTML = '';
  players.forEach((p, i) => {
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
