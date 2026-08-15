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
  el.textContent = cardLabel(card);
  el.dataset.cardId = card.id;
  if (onClick && !disabled) el.addEventListener('click', () => onClick(card));
  else el.disabled = true;
  return el;
}

function cardBackEl() {
  const el = document.createElement('div');
  el.className = 'card card-back';
  el.textContent = '🂠';
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
 */
export function renderHand(container, cards, { onPlay, onPlayFacedown, onHandMotion } = {}) {
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
      if (draggedEl && draggedEl !== wrapper) container.insertBefore(draggedEl, wrapper);
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
 * Renders the middle/table. Each entry is either a full card (visible to
 * this viewer) or a redacted `{id, owner, faceDown: true}` placeholder
 * (state.js's viewFor — see ARCHITECTURE.md D7). `resolveOwnerName` maps
 * an owner id to a display name (the caller already has the roster).
 */
export function renderTable(container, cards, { resolveOwnerName, onReveal, onPickup } = {}) {
  container.innerHTML = '';
  for (const card of cards) {
    const wrapper = document.createElement('div');
    wrapper.className = 'middle-card';

    if (card.faceDown) {
      wrapper.appendChild(cardBackEl());
      if (card.owner === null && onReveal) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reveal-btn';
        btn.textContent = 'Turn over';
        btn.addEventListener('click', () => onReveal(card.id));
        wrapper.appendChild(btn);
      } else if (card.owner) {
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

    container.appendChild(wrapper);
  }
}

export function renderRoster(container, players, { deckCount, movingIds, scores, onAdjustScore } = {}) {
  container.innerHTML = '';
  if (typeof deckCount === 'number') {
    const deckEl = document.createElement('li');
    deckEl.className = 'roster-deck';
    deckEl.textContent = `Deck: ${deckCount} cards left`;
    container.appendChild(deckEl);
  }
  for (const p of players) {
    const li = document.createElement('li');
    li.className = `roster-player roster-${p.connection}`;
    const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
    const moving = movingIds?.has(p.id) ? ' ✋ organizing hand' : '';
    li.append(`${p.name} - ${p.connection}${count}${moving}`);

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

export function renderBanner(container, message) {
  container.textContent = message ?? '';
  container.hidden = !message;
}

export function showScreen(screens, name) {
  for (const [key, el] of Object.entries(screens)) {
    el.hidden = key !== name;
  }
}
