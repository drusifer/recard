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
export function renderHand(container, cards, { onPlay, onPlayFacedown, onHandMotion, onReorder } = {}) {
  container.innerHTML = '';
  for (const card of cards) {
    const wrapper = document.createElement('div');
    wrapper.className = 'hand-card';
    wrapper.draggable = true;
    wrapper.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      onHandMotion?.(true);
    });
    wrapper.addEventListener('dragend', () => onHandMotion?.(false));
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
  }
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
  { resolveOwnerName, onReveal, onPickup, onMoveCard, onCardLift } = {},
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
 * Renders every zone as its own labeled sub-panel (US-19, D12) - zone
 * names/counts are always shown, per Smith's Gate 1 requirement that a
 * zone never be identifiable only by position.
 */
export function renderZones(container, zones, opts = {}) {
  container.innerHTML = '';
  for (const zone of zones) {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'zone';

    const heading = document.createElement('div');
    heading.className = 'zone-name';
    heading.textContent = `${zone.name} (${zone.cards.length})`;
    zoneEl.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'card-row';
    zoneEl.appendChild(row);
    renderZoneCards(row, zone, zones, opts);

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

export function renderRoster(container, players, { movingIds, scores, onAdjustScore, myId, passed } = {}) {
  container.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    li.className = `roster-player roster-${p.connection}`;
    const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
    const moving = movingIds?.has(p.id) ? ' ✋ organizing hand' : '';
    const passedTag = passed?.[p.id] ? ' 🙅 Passed' : '';
    li.append(`${p.name} - ${p.connection}${count}${moving}${passedTag}`);

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
  }
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

export function renderBanner(container, message) {
  container.textContent = message ?? '';
  container.hidden = !message;
}

export function showScreen(screens, name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}
