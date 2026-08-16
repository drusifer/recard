import { Session } from './session.js';
import { createInitialState, reduce, viewFor } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from './protocol.js';
import { buildJoinUrl, renderShareCode } from './qrcode.js';
import {
  renderHand,
  renderZones,
  renderSeatZones,
  renderRoster,
  renderRulesPanel,
  renderBanner,
  renderDeck,
  showScreen,
  updateRemoteCursor,
  removeRemoteCursor,
  setCardLifted,
  updateCardDragGhost,
  removeCardDragGhost,
} from './ui.js';
import { PRESETS } from './presets.js';
import { RULES_REFERENCE } from './rulesReference.js';
import { reconcileOrder, sortByRank, sortBySuit } from './handOrder.js';
import { seatedOrder } from './seating.js';

const MOTION_FLUSH_MS = 50;
const MOTION_TTL_MS = 2000; // auto-clear a stale "organizing hand" cue if the end-event is dropped

const screens = {
  landing: document.getElementById('screen-landing'),
  host: document.getElementById('screen-host'),
  join: document.getElementById('screen-join'),
  game: document.getElementById('screen-game'),
};
const bannerEl = document.getElementById('banner');

const handAreaEl = document.getElementById('hand-area');
const tableAreaEl = document.getElementById('table-area');
const gameRosterEl = document.getElementById('game-roster');
const drawBtn = document.getElementById('draw-btn');
const resetBtn = document.getElementById('reset-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const dealMoreBtn = document.getElementById('deal-more-btn');
const dealMoreCountEl = document.getElementById('deal-more-count');
const passToggleBtn = document.getElementById('pass-toggle-btn');
const sortRankBtn = document.getElementById('sort-rank-btn');
const sortSuitBtn = document.getElementById('sort-suit-btn');

let handOrderIds = []; // D14: persists hand display order across state updates

// D14: reconciles handOrderIds against the current hand (existing cards
// keep position, new ones append, gone ones drop) so sort buttons and
// manual drag-reorder share one source of truth instead of fighting.
function orderedHand(myHand) {
  handOrderIds = reconcileOrder(handOrderIds, myHand);
  const byId = new Map(myHand.map((c) => [c.id, c]));
  return handOrderIds.map((id) => byId.get(id));
}

let role = null; // 'host' | 'join'
let session = null;
let myId = null;
let myName = '';
let gameState = null; // authoritative, host only
let latestView = null; // last view received from host, join only
let sessionEnded = false;
let selectedPreset = null; // US-15: applied to cards-per-player once host-share is shown

function describeDeckConfig({ numDecks, jokers }) {
  const deckWord = numDecks === 1 ? 'deck' : 'decks';
  const jokerWord = jokers === 1 ? 'joker' : 'jokers';
  return `${numDecks} ${deckWord}, ${jokers} ${jokerWord}`;
}

// --- Rules reference (US-18): a toggleable overlay, not a showScreen()
// swap, so opening it never loses table state (Smith Gate 1 AC). ---
renderRulesPanel(document.getElementById('rules-content'), RULES_REFERENCE);
document.getElementById('rules-toggle').addEventListener('click', () => {
  document.getElementById('rules-panel').hidden = false;
});
document.getElementById('rules-close').addEventListener('click', () => {
  document.getElementById('rules-panel').hidden = true;
});

// --- Presets (US-15) ---
const presetSelect = document.getElementById('host-preset');
for (const preset of PRESETS) {
  const opt = document.createElement('option');
  opt.value = preset.name;
  opt.textContent = preset.name;
  presetSelect.appendChild(opt);
}
presetSelect.addEventListener('change', () => {
  const preset = PRESETS.find((p) => p.name === presetSelect.value);
  const previewEl = document.getElementById('host-preset-preview');
  selectedPreset = preset ?? null;
  if (!preset) {
    previewEl.hidden = true;
    return;
  }
  document.getElementById('host-num-decks').value = String(preset.numDecks);
  document.getElementById('host-jokers').value = String(preset.jokers);
  const cardsWord = preset.cardsPerPlayer === 1 ? 'card' : 'cards';
  previewEl.textContent = `${describeDeckConfig(preset)}, ${preset.cardsPerPlayer} ${cardsWord}/player`;
  previewEl.hidden = false;
});

const motionThrottler = createMotionThrottler();
const movingIds = new Set();
const moveTimers = new Map();
const cursorTimers = new Map();
const cardDragTimers = new Map();

// --- Live cursor (US-22, D13): while the pointer is down anywhere on
// the game screen, broadcast its position normalized to that screen's
// own bounding box (0-1 on each axis) - the only value that means the
// same thing across devices with different viewport sizes. ---
const gameScreenEl = document.getElementById('screen-game');
let pointerActive = false;
gameScreenEl.addEventListener('pointerdown', () => {
  pointerActive = true;
});
window.addEventListener('pointerup', () => {
  pointerActive = false;
});
gameScreenEl.addEventListener('pointermove', (e) => {
  if (!pointerActive || sessionEnded) return;
  const rect = gameScreenEl.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  motionThrottler.schedule('cursor', { x, y });
});

// --- Landing ---
document.getElementById('show-host').addEventListener('click', () => showScreen(screens, 'host'));
document.getElementById('show-join').addEventListener('click', () => showScreen(screens, 'join'));

// --- Host flow ---
document.getElementById('create-table').addEventListener('click', async () => {
  role = 'host';
  myName = document.getElementById('host-name').value.trim() || 'Host';
  const deckConfig = {
    numDecks: Number(document.getElementById('host-num-decks').value),
    jokers: Number(document.getElementById('host-jokers').value),
  };

  session = Session.host({ name: myName });
  const createErrorEl = document.getElementById('host-create-error');
  try {
    myId = await session.ready();
  } catch (err) {
    createErrorEl.textContent = 'Could not create a table (code collision or network issue). Try again.';
    createErrorEl.hidden = false;
    console.warn('host session failed to open', err);
    return;
  }
  createErrorEl.hidden = true;

  gameState = reduce(createInitialState(deckConfig), { type: 'JOIN', playerId: myId, name: myName });

  // Table is created - the setup form no longer does anything, so stop
  // implying it's still live (Smith Gate-close finding #2).
  document.getElementById('host-form').hidden = true;

  const shareContainer = document.getElementById('share-code-container');
  renderShareCode(shareContainer, { code: myId, joinUrl: buildJoinUrl(myId) });
  document.getElementById('host-share').hidden = false;
  document.getElementById('host-deck-config').textContent = `Deck: ${describeDeckConfig(deckConfig)}`;
  if (selectedPreset) {
    document.getElementById('cards-per-player').value = String(selectedPreset.cardsPerPlayer);
  }
  renderRosterOnly();

  session.on('roster', (transportRoster) => {
    for (const r of transportRoster) {
      if (!gameState.players.some((p) => p.id === r.id)) {
        gameState = reduce(gameState, { type: 'JOIN', playerId: r.id, name: r.name });
      }
      gameState = reduce(gameState, { type: 'SET_CONNECTION', playerId: r.id, connection: r.connection });
    }
    broadcastViews();
  });

  session.on('data', ({ fromId, msg }) => {
    if (msg.type === 'motion') {
      applyIncomingMotion(fromId, msg);
      relayMotion(fromId, msg);
      return;
    }
    if (msg.type !== 'action') return;
    try {
      dispatch({ ...msg.action, playerId: fromId });
    } catch (err) {
      console.warn('Rejected action from', fromId, err);
    }
  });
});

document.getElementById('deal-btn').addEventListener('click', () => {
  const cardsPerPlayer = Number(document.getElementById('cards-per-player').value);
  dispatch({ type: 'DEAL', cardsPerPlayer });
  showScreen(screens, 'game');
});

resetBtn.addEventListener('click', () => {
  dispatch({ type: 'RESET' });
});

resetScoresBtn.addEventListener('click', () => {
  // Confirm-gated, consistent with revealing a private card - both are
  // irreversible and lose state a player can't easily reconstruct
  // (Smith Gate-close finding: this precedent already existed for
  // Reveal, Reset Scores just hadn't followed it).
  if (window.confirm('Reset everyone\'s score to 0? This cannot be undone.')) {
    dispatch({ type: 'RESET_SCORES' });
  }
});

function adjustScore(targetPlayerId, delta) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'ADJUST_SCORE', targetPlayerId, delta });
  else session.send({ type: 'action', action: { type: 'ADJUST_SCORE', targetPlayerId, delta } });
}

function rosterWithCounts(view) {
  return view.players.map((p) => ({
    ...p,
    handCount: p.id === myId ? view.myHand.length : view.otherHandCounts[p.id] ?? 0,
  }));
}

function dispatch(action) {
  gameState = reduce(gameState, action);
  broadcastViews();
}

function broadcastViews() {
  for (const player of gameState.players) {
    const view = viewFor(gameState, player.id);
    if (player.id === myId) {
      renderGameFromView(view);
    } else {
      session.sendTo(player.id, makeStateMessage(view));
    }
  }
  renderRosterOnly();
}

// --- Join flow ---
document.getElementById('join-btn').addEventListener('click', () => {
  role = 'join';
  myName = document.getElementById('join-name').value.trim() || 'Player';
  const hostId = document.getElementById('join-code').value.trim();
  const statusEl = document.getElementById('join-status');
  statusEl.textContent = 'Connecting...';

  session = Session.join(hostId, { name: myName });
  session
    .ready()
    .then((id) => {
      myId = id;
      statusEl.textContent = 'Connected. Waiting for host to deal...';
    })
    .catch(() => {
      statusEl.textContent = 'Could not connect. Check the code and try again.';
    });

  session.on('data', (msg) => {
    if (msg.type === 'motion') {
      applyIncomingMotion(msg.fromId, msg);
      return;
    }
    if (msg.type !== 'state') return;
    latestView = msg.payload;
    renderGameFromView(latestView);
    showScreen(screens, 'game');
  });

  session.on('session-ended', () => {
    renderBanner(bannerEl, 'Host disconnected — session ended.');
    sessionEnded = true;
    drawBtn.disabled = true;
    resetScoresBtn.disabled = true;
    // Re-render with no action handlers so every control (hand cards,
    // reveal/pickup buttons) is inert, and force the roster to reflect
    // reality instead of the last-known (now stale) connection states
    // (Smith Gate-close finding #1 — don't leave any control looking
    // live once the session is actually over).
    if (latestView) {
      renderHand(handAreaEl, orderedHand(latestView.myHand), {});
      const nameById = new Map(latestView.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));
      const frozenOpts = { resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId };
      renderZones(tableAreaEl, latestView.zones.filter((z) => !z.ownerId), frozenOpts, latestView.zones);
      renderSeatZones(
        document.getElementById('seat-zones'),
        latestView.zones.filter((z) => z.ownerId),
        latestView.zones,
        seatedOrder(latestView.players, myId),
        frozenOpts,
      );
    }
    renderRosterOnly();
  });
});

// --- Shared game rendering ---
function currentView() {
  if (role === 'host') return gameState ? viewFor(gameState, myId) : null;
  return latestView;
}

function renderRosterOnly() {
  const view = currentView();
  if (!view) return;
  let players = rosterWithCounts(view);
  if (sessionEnded) players = players.map((p) => ({ ...p, connection: 'disconnected' }));
  const opts = {
    movingIds,
    scores: view.scores,
    onAdjustScore: sessionEnded ? null : adjustScore,
    myId,
    passed: view.passed,
  };
  const hostRosterEl = document.getElementById('host-roster');
  if (hostRosterEl) {
    renderRoster(hostRosterEl, players, opts);
    renderDeck(document.getElementById('host-deck-area'), view.deckCount);
  }
  renderRoster(gameRosterEl, seatedOrder(players, myId), { ...opts, seated: true });
  // Scales the table surface's size with player count (style.css) so
  // seats have room to spread out - confirmed necessary at 8 players,
  // not just a theoretical density concern (Phase 26 T26.3 finding).
  document.getElementById('table-surface').style.setProperty('--seat-count', players.length);
  renderDeck(document.getElementById('game-deck-area'), view.deckCount);
  passToggleBtn.textContent = view.passed?.[myId] ? 'Unpass' : 'Pass';
}

function renderGameFromView(view) {
  const nameById = new Map(view.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));

  renderHand(handAreaEl, orderedHand(view.myHand), {
    onPlay: (card) => playCard(card.id, 'public'),
    onPlayFacedown: (card, visibility) => playCard(card.id, visibility),
    onHandMotion: (active) => motionThrottler.schedule('hand', { active }),
    onReorder: (newOrderIds) => {
      handOrderIds = newOrderIds;
    },
    onCardDrag: broadcastCardDrag,
  });
  const zoneOpts = {
    resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
    onReveal: (cardId) => revealCard(cardId),
    onPickup: (cardId) => pickupCard(cardId),
    onMoveCard: (cardId, toZoneId) => moveCard(cardId, toZoneId),
    onCardLift: (cardId, active) => motionThrottler.schedule('card-lift', { cardId, active }),
    onDropCard: (cardId, toZoneId) => dropCardOnZone(cardId, toZoneId),
    onCardDrag: broadcastCardDrag,
  };
  // D17/US-27: personal zones render at their owner's seat, not in the
  // shared flat stack - both still list every zone (this array, passed
  // as allZones) as a "Move to…" destination.
  const sharedZones = view.zones.filter((z) => !z.ownerId);
  const personalZones = view.zones.filter((z) => z.ownerId);
  renderZones(tableAreaEl, sharedZones, zoneOpts, view.zones);
  renderSeatZones(document.getElementById('seat-zones'), personalZones, view.zones, seatedOrder(view.players, myId), zoneOpts);
  resetBtn.hidden = role !== 'host';
  resetScoresBtn.hidden = role !== 'host';
  dealMoreBtn.hidden = role !== 'host';
  dealMoreCountEl.hidden = role !== 'host'; // no orphaned input once its button is hidden
  renderRosterOnly();
}

function playCard(cardId, visibility, zoneId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'PLAY', playerId: myId, cardId, visibility, zoneId });
  else session.send({ type: 'action', action: { type: 'PLAY', cardId, visibility, zoneId } });
}

function revealCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'REVEAL', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'REVEAL', cardId } });
}

function pickupCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'PICKUP', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'PICKUP', cardId } });
}

function moveCard(cardId, toZoneId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'MOVE_CARD', playerId: myId, cardId, toZoneId });
  else session.send({ type: 'action', action: { type: 'MOVE_CARD', cardId, toZoneId } });
}

// US-28: dropping a dragged card on a zone plays it (if it came from
// hand) or moves it (if it was already on the table) - the drop target
// itself doesn't know or care which, it just hands back a card id and a
// destination zone. Always plays public on drop, matching the existing
// "primary gesture = public play" precedent (US-12); face-down stays
// button-only (Smith Gate 1: don't overload drag with a mid-drag choice).
function dropCardOnZone(cardId, targetZoneId) {
  if (sessionEnded) return;
  const view = currentView();
  if (!view) return;
  if (view.myHand.some((c) => c.id === cardId)) {
    playCard(cardId, 'public', targetZoneId);
  } else {
    moveCard(cardId, targetZoneId);
  }
}

document.getElementById('create-zone-btn').addEventListener('click', () => {
  if (sessionEnded) return;
  const nameInput = document.getElementById('new-zone-name');
  const name = nameInput.value.trim();
  if (!name) return; // Smith Gate 1: zones need a real name, no silent auto-numbering
  if (role === 'host') dispatch({ type: 'CREATE_ZONE', name });
  else session.send({ type: 'action', action: { type: 'CREATE_ZONE', name } });
  nameInput.value = '';
});

drawBtn.addEventListener('click', () => {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'DRAW', playerId: myId });
  else session.send({ type: 'action', action: { type: 'DRAW' } });
});

// --- Hand sort (US-23, D14): local-only, never broadcast. Writes into
// the same handOrderIds that manual drag-reorder writes into, so the two
// never fight (Smith Gate 1). ---
sortRankBtn.addEventListener('click', () => {
  const view = currentView();
  if (!view) return;
  handOrderIds = sortByRank(view.myHand);
  renderGameFromView(view);
});
sortSuitBtn.addEventListener('click', () => {
  const view = currentView();
  if (!view) return;
  handOrderIds = sortBySuit(view.myHand);
  renderGameFromView(view);
});

// --- Deal More (US-24): host-only, adds to existing hands without a
// reset. Deliberately a different label/section/style than "Deal &
// Start" so a mid-game host can't mis-tap into a reset (Smith Gate 1). ---
dealMoreBtn.addEventListener('click', () => {
  if (sessionEnded) return;
  const cardsPerPlayer = Number(dealMoreCountEl.value);
  dispatch({ type: 'DEAL_MORE', cardsPerPlayer });
});

// --- Pass marker (US-25): self-toggle only, like US-13's precedent. ---
passToggleBtn.addEventListener('click', () => {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'TOGGLE_PASS', playerId: myId });
  else session.send({ type: 'action', action: { type: 'TOGGLE_PASS' } });
});

// --- Motion (US-11): best-effort, cosmetic only. See protocol.js/ARCHITECTURE.md D4. ---
function markMoving(playerId, active) {
  clearTimeout(moveTimers.get(playerId));
  moveTimers.delete(playerId);
  if (active) {
    movingIds.add(playerId);
    moveTimers.set(
      playerId,
      setTimeout(() => {
        movingIds.delete(playerId);
        renderRosterOnly();
      }, MOTION_TTL_MS),
    );
  } else {
    movingIds.delete(playerId);
  }
}

function resolvePlayerName(playerId) {
  const view = currentView();
  return view?.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function markCursorStale(playerId) {
  clearTimeout(cursorTimers.get(playerId));
  cursorTimers.set(
    playerId,
    setTimeout(() => removeRemoteCursor(gameScreenEl, playerId), MOTION_TTL_MS),
  );
}

// D19: finds a card's full data among whatever's currently visible to
// THIS viewer (own hand excluded - a dragged card broadcasts identity
// only when public, and a public card always lives in a zone, never a
// hand). Redacted placeholders (`card.faceDown: true`) have no rank/
// suit and are skipped - only a real, renderable card is ever returned.
function resolveVisibleCard(cardId) {
  const view = currentView();
  if (!view) return null;
  for (const zone of view.zones) {
    const card = zone.cards.find((c) => c.id === cardId);
    if (card && !card.faceDown) return card;
  }
  return null;
}

function markCardDragStale(playerId) {
  clearTimeout(cardDragTimers.get(playerId));
  cardDragTimers.set(
    playerId,
    setTimeout(() => removeCardDragGhost(gameScreenEl, playerId), MOTION_TTL_MS),
  );
}

// US-29/D19: broadcasts live position while dragging, extending D13's
// existing throttled channel with one new kind. `card: null` is the
// dragend "stopped" signal (see renderHand/renderZoneCards' dragend
// handlers) - sent as `active: false` so receivers clear the ghost
// promptly instead of waiting out the full TTL after a normal drop.
function broadcastCardDrag(card, clientX, clientY) {
  if (!card) {
    motionThrottler.schedule('card-drag', { cardId: null, x: 0, y: 0, active: false });
    return;
  }
  const rect = gameScreenEl.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  motionThrottler.schedule('card-drag', { ...cardDragPayload(card, x, y), active: true });
}

function applyIncomingMotion(playerId, msg) {
  if (msg.kind === 'hand') {
    markMoving(playerId, msg.data.active);
    renderRosterOnly();
  } else if (msg.kind === 'cursor') {
    if (playerId === myId) return; // never render my own cursor back at me
    updateRemoteCursor(gameScreenEl, playerId, resolvePlayerName(playerId), msg.data.x, msg.data.y);
    markCursorStale(playerId);
  } else if (msg.kind === 'card-lift') {
    setCardLifted(msg.data.cardId, msg.data.active);
  } else if (msg.kind === 'card-drag') {
    if (playerId === myId) return; // never render my own drag ghost back at me
    if (!msg.data.active) {
      clearTimeout(cardDragTimers.get(playerId));
      removeCardDragGhost(gameScreenEl, playerId);
      return;
    }
    const card = msg.data.cardId ? resolveVisibleCard(msg.data.cardId) : null;
    updateCardDragGhost(gameScreenEl, playerId, card, msg.data.x, msg.data.y);
    markCardDragStale(playerId);
  }
}

function relayMotion(fromId, msg) {
  for (const player of gameState.players) {
    if (player.id === fromId || player.id === myId) continue;
    session.sendTo(player.id, { ...msg, fromId });
  }
}

setInterval(() => {
  if (!session || sessionEnded) return;
  for (const { key, data } of motionThrottler.drain()) {
    const msg = makeMotionMessage(key, data);
    applyIncomingMotion(myId, msg);
    if (role === 'host') relayMotion(myId, msg);
    else session.send(msg);
  }
}, MOTION_FLUSH_MS);

// --- Deep link: ?join=<hostId> pre-fills and jumps to the join screen ---
const joinParam = new URLSearchParams(window.location.search).get('join');
if (joinParam) {
  document.getElementById('join-code').value = joinParam;
  showScreen(screens, 'join');
}
