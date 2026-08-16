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
 * Renders your own hand. Cards are draggable so you can reorder your own
 * view of your hand (a purely local/cosmetic preference - hand order isn't
 * part of authoritative state). `onHandMotion` fires on drag start/end so
 * the caller can broadcast a best-effort "organizing hand" cue (US-11) -
 * it never reveals which/how many cards moved, just that motion happened.
 *
 * Playing a card is one tap (public, unchanged from v1). Playing it
 * face-down is a second, smaller pair of buttons on the same card
 * (Smith Gate 1: don't cost the common path anything extra) rather than
 * a new gesture (Smith Gate 1: reuse tap, don't invent long-press/etc.).
 *
 * `onReorder(newOrderIds)` fires after a manual drag-reorder completes,
 * so the caller can fold the result into the same order list the sort
 * buttons write to (D14) - sorting and dragging share one source of
 * truth instead of fighting each other (Smith Gate 1).
 */
export function renderHand(container, cards, { onPlay, onPlayFacedown, onHandMotion, onReorder, onCardDrag } = {}) {
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
    wrapper.style.transform = `rotate(${offset * 4}deg) translateY(${Math.abs(offset) * 0.35}rem)`;
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      onHandMotion?.(true);
    });
    // US-29/D19: live position while actually dragging (not just the
    // start/end boolean onHandMotion already sends) - card is a plain
    // hand card with no `faceUp` field, which `cardDragPayload` treats
    // the same as `faceUp: false` (never reveals identity), by design.
    wrapper.addEventListener('drag', (e) => onCardDrag?.(card, e.clientX, e.clientY));
    wrapper.addEventListener('dragend', () => {
      onHandMotion?.(false);
      onCardDrag?.(null, 0, 0); // signals "stopped" - see main.js's onCardDrag
    });
    wrapper.addEventListener('dragover', (e) => e.preventDefault());
    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      const draggedEl = container.querySelector(`[data-card-id="${CSS.escape(draggedId)}"]`)?.closest('.hand-card');
      if (draggedEl && draggedEl !== wrapper) {
        container.insertBefore(draggedEl, wrapper);
        const newOrder = [...container.children].map((el) => el.querySelector('.card').dataset.cardId);
        onReorder?.(newOrder);
      }
    });

    wrapper.appendChild(cardEl(card, { onClick: onPlay }));

    if (onPlayFacedown) {
      const fdRow = document.createElement('div');
      fdRow.className = 'hand-card-fd-row';

      const sharedBtn = document.createElement('button');
      sharedBtn.type = 'button';
      sharedBtn.className = 'fd-btn';
      sharedBtn.title = 'Play face-down, hidden from everyone';
      sharedBtn.textContent = '🂠';
      sharedBtn.addEventListener('click', () => onPlayFacedown(card, 'shared-facedown'));

      const privateBtn = document.createElement('button');
      privateBtn.type = 'button';
      privateBtn.className = 'fd-btn';
      privateBtn.title = 'Play face-down, private to you';
      privateBtn.textContent = '🔒';
      privateBtn.addEventListener('click', () => onPlayFacedown(card, 'private-facedown'));

      fdRow.append(sharedBtn, privateBtn);
      wrapper.appendChild(fdRow);
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
function renderZoneCards(
  container,
  zone,
  allZones,
  { resolveOwnerName, onReveal, onPickup, onMoveCard, onCardLift, onCardDrag } = {},
) {
  container.innerHTML = '';
  for (const card of zone.cards) {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card';

    // Card-lift cue (US-22, D13): press-and-hold broadcasts motion.
    // Safe for redacted cards too - only the id (already known to every
    // viewer, even in redacted form) is broadcast, never rank/suit.
    if (onCardLift) {
      wrapper.addEventListener('pointerdown', () => onCardLift(card.id, true));
      wrapper.addEventListener('pointerup', () => onCardLift(card.id, false));
      wrapper.addEventListener('pointerleave', () => onCardLift(card.id, false));
    }

    // US-28: draggable exactly where MOVE_CARD's own authorization would
    // allow a drop to succeed - a visible card (already face-up, or my
    // own still-hidden private one) or a redacted-but-unowned card
    // (shared face-down, movable by anyone per US-19 "put or take").
    // Someone else's still-hidden private card gets no controls at all
    // today (see below) and stays non-draggable to match.
    if (onMoveCard && (!card.faceDown || card.owner === null)) {
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.id);
      });
      // US-29/D19: live position while dragging. A redacted placeholder
      // (`card.faceDown: true`) has no `faceUp` field either, so
      // `cardDragPayload` correctly treats it the same as hidden - even
      // a blind "put or take" move of a shared face-down card never
      // reveals its identity mid-drag.
      wrapper.addEventListener('drag', (e) => onCardDrag?.(card, e.clientX, e.clientY));
      wrapper.addEventListener('dragend', () => onCardDrag?.(null, 0, 0));
    }

    if (card.faceDown) {
      wrapper.appendChild(cardBackEl(card.id));
      if (card.owner === null) {
        if (onReveal) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'reveal-btn';
          btn.textContent = 'Turn over';
          btn.addEventListener('click', () => onReveal(card.id));
          wrapper.appendChild(btn);
        }
        const moveSelect = moveToControl(card, zone.id, allZones, onMoveCard);
        if (moveSelect) wrapper.appendChild(moveSelect);
      } else {
        // Someone else's still-hidden private card: no authority, no
        // visibility, no controls at all - just the anonymous back + tag.
        wrapper.appendChild(ownerTag(resolveOwnerName?.(card.owner) ?? card.owner));
      }
      container.appendChild(wrapper);
      continue;
    }

    wrapper.appendChild(cardEl(card, { disabled: true }));
    if (card.owner) wrapper.appendChild(ownerTag(resolveOwnerName?.(card.owner) ?? card.owner));

    if (!card.faceUp && onReveal) {
      // My own still-hidden private card (only I ever see this branch —
      // everyone else gets the redacted `faceDown` case above).
      const hiddenTag = document.createElement('div');
      hiddenTag.className = 'owner-tag';
      hiddenTag.textContent = 'hidden from others';
      wrapper.appendChild(hiddenTag);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reveal-btn';
      btn.textContent = 'Reveal';
      btn.addEventListener('click', () => {
        if (window.confirm('Reveal this card to everyone? This cannot be undone.')) onReveal(card.id);
      });
      wrapper.appendChild(btn);
    } else if (card.faceUp && onPickup) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pickup-btn';
      btn.textContent = 'Pick up';
      btn.addEventListener('click', () => onPickup(card.id));
      wrapper.appendChild(btn);
    }

    const moveSelect = moveToControl(card, zone.id, allZones, onMoveCard);
    if (moveSelect) wrapper.appendChild(moveSelect);

    container.appendChild(wrapper);
  }
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
      zoneEl.classList.add('zone-drag-over');
    });
    zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('zone-drag-over'));
    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneEl.classList.remove('zone-drag-over');
      const cardId = e.dataTransfer.getData('text/plain');
      if (cardId) opts.onDropCard(cardId, zone.id);
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
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter - purely presentational, draw
 * mechanics (US-7) are unchanged.
 */
export function renderDeck(container, count) {
  container.innerHTML = '';
  if (count <= 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const stackSize = Math.min(count, 3);
  for (let i = 0; i < stackSize; i++) {
    const back = cardBackEl();
    back.classList.add('deck-stack-card');
    back.style.top = `${-i * 2}px`;
    back.style.left = `${i * 2}px`;
    container.appendChild(back);
  }
  const badge = document.createElement('span');
  badge.className = 'deck-count-badge';
  badge.textContent = count;
  container.appendChild(badge);
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
    const moving = movingIds?.has(p.id) ? ' ✋ organizing hand' : '';
    const passedTag = passed?.[p.id] ? ' 🙅 Passed' : '';
    const youTag = seated && p.id === myId ? ' 🧑 You' : '';
    li.append(`${p.name} - ${p.connection}${count}${moving}${passedTag}${youTag}`);

    if (p.id !== myId && typeof p.handCount === 'number') {
      const miniHandEl = document.createElement('div');
      renderMiniHand(miniHandEl, p.handCount);
      li.appendChild(miniHandEl);
    }

    if (scores && p.id in scores) {
      const scoreRow = document.createElement('span');
      scoreRow.className = 'score-row';
      scoreRow.append(`Score: ${scores[p.id]}`);
      if (onAdjustScore) {
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
        scoreRow.append(minusBtn, plusBtn);
      }
      li.appendChild(scoreRow);
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
