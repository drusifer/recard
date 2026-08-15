import { Session } from './session.js';
import { createInitialState, reduce, viewFor } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler } from './protocol.js';
import { buildJoinUrl, renderShareCode } from './qrcode.js';
import { renderHand, renderTable, renderRoster, renderBanner, showScreen } from './ui.js';

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

let role = null; // 'host' | 'join'
let session = null;
let myId = null;
let myName = '';
let gameState = null; // authoritative, host only
let latestView = null; // last view received from host, join only
let sessionEnded = false;

const motionThrottler = createMotionThrottler();
const movingIds = new Set();
const moveTimers = new Map();

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
  document.getElementById('host-deck-config').textContent =
    `Deck: ${deckConfig.numDecks} deck(s), ${deckConfig.jokers} joker(s)`;
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
    // Re-render with no onPlay handler so cardEl disables every card too,
    // and force the roster to reflect reality instead of the last-known
    // (now stale) connection states (Smith Gate-close finding #1).
    if (latestView) renderHand(handAreaEl, latestView.myHand, {});
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
  const opts = { deckCount: view.deckCount, movingIds };
  const hostRosterEl = document.getElementById('host-roster');
  if (hostRosterEl) renderRoster(hostRosterEl, players, opts);
  renderRoster(gameRosterEl, players, opts);
}

function renderGameFromView(view) {
  renderHand(handAreaEl, view.myHand, {
    onPlay: (card) => playCard(card.id),
    onHandMotion: (active) => motionThrottler.schedule('hand', { active }),
  });
  renderTable(tableAreaEl, view.table);
  resetBtn.hidden = role !== 'host';
  renderRosterOnly();
}

function playCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'PLAY', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'PLAY', cardId } });
}

drawBtn.addEventListener('click', () => {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'DRAW', playerId: myId });
  else session.send({ type: 'action', action: { type: 'DRAW' } });
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

function applyIncomingMotion(playerId, msg) {
  if (msg.kind !== 'hand') return;
  markMoving(playerId, msg.data.active);
  renderRosterOnly();
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
