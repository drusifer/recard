const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RED_SUITS = new Set(['diamonds', 'hearts']);

export function cardLabel(card) {
  if (card.rank === 'JOKER') return 'JOKER';
  return `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

function cardEl(card, { onClick, draggable, onDragStart, onDragEnd } = {}) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'card' + (RED_SUITS.has(card.suit) ? ' card-red' : '');
  el.textContent = cardLabel(card);
  el.dataset.cardId = card.id;
  if (onClick) el.addEventListener('click', () => onClick(card));
  else el.disabled = true;
  if (draggable) {
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      onDragStart?.();
    });
    el.addEventListener('dragend', () => onDragEnd?.());
  }
  return el;
}

/**
 * Renders your own hand. Cards are draggable so you can reorder your own
 * view of your hand (a purely local/cosmetic preference - hand order isn't
 * part of authoritative state). `onHandMotion` fires on drag start/end so
 * the caller can broadcast a best-effort "organizing hand" cue (US-11) -
 * it never reveals which/how many cards moved, just that motion happened.
 */
export function renderHand(container, cards, { onPlay, onHandMotion } = {}) {
  container.innerHTML = '';
  for (const card of cards) {
    const el = cardEl(card, {
      onClick: onPlay,
      draggable: true,
      onDragStart: () => onHandMotion?.(true),
      onDragEnd: () => onHandMotion?.(false),
    });
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      const draggedEl = container.querySelector(`[data-card-id="${CSS.escape(draggedId)}"]`);
      if (draggedEl && draggedEl !== el) container.insertBefore(draggedEl, el);
    });
    container.appendChild(el);
  }
}

export function renderTable(container, cards) {
  container.innerHTML = '';
  for (const card of cards) container.appendChild(cardEl(card));
}

export function renderRoster(container, players, { deckCount, movingIds } = {}) {
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
    li.textContent = `${p.name} - ${p.connection}${count}${moving}`;
    container.appendChild(li);
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
