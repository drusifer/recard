import { Session } from './session.js';
import { createInitialState, reduce, viewFor } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from './protocol.js';
import { renderShareCode, wireCopyCode } from './qrcode.js';
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
  renderPileAnchor,
  pileActionFromDrop,
} from './ui.js';
import { pileLevelActions } from './pileActions.js';
import { PRESETS } from './presets.js';
import { RULES_REFERENCE } from './rulesReference.js';
import { reconcileOrder, sortByRank, sortBySuit } from './handOrder.js';
import { seatedOrder } from './seating.js';
import { save as saveGame, load as loadGame, clear as clearGame, describeAge, expectedReturners } from './persistence.js';
import { CLIENT_KEY_STORAGE, resolvePlayer, peerFor, rememberSession, recallSession, forgetSession } from './identity.js';

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
const handAnchorEl = document.getElementById('hand-pile-anchor');
const tableAreaEl = document.getElementById('table-area');
const gameRosterEl = document.getElementById('game-roster');
const resetBtn = document.getElementById('reset-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const playAsEl = document.getElementById('play-as');

/** US-34 follow-up: what the next play/drop does, armed once in the hand
 *  toolbar rather than chosen per card. */
function selectedVisibility() {
  return playAsEl.value;
}

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

function describeDeckConfig({ type, numDecks, jokers }) {
  const deckWord = numDecks === 1 ? 'deck' : 'decks';
  const jokerWord = jokers === 1 ? 'joker' : 'jokers';
  // D49: named only when it's not the (unstated) default - "1 deck, 0
  // jokers" already means standard, every existing preset's preview
  // text is unchanged by this.
  const typePrefix = type && type !== 'standard' ? `${type} ` : '';
  return `${numDecks} ${typePrefix}${deckWord}, ${jokers} ${jokerWord}`;
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
  // D49: `type` is optional on a preset ('standard' by omission, same
  // default createInitialState/buildDeck already use) - most presets
  // never set it, so this must not clobber a host's own manual
  // deck-type choice with 'standard' every time they merely preview a
  // preset that doesn't care.
  if (preset.type) document.getElementById('host-deck-type').value = preset.type;
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
// --- Resume (landing screen) -------------------------------------------
// One button covers both roles: if this browser was hosting, restore the
// table; if it was playing, rejoin it. Disabled (not hidden) when there's
// nothing to resume, so the option is still discoverable.
const resumeBtn = document.getElementById('resume-game');
const resumeHint = document.getElementById('resume-hint');

function refreshResumeOption() {
  const savedHost = loadGame(window.localStorage);
  const savedGuest = recallSession(window.localStorage);
  if (savedHost.ok) {
    resumeBtn.disabled = false;
    resumeHint.textContent = `You were hosting a table, saved ${describeAge(savedHost.ageMs)}.`;
    resumeBtn.dataset.mode = 'host';
  } else if (savedGuest) {
    resumeBtn.disabled = false;
    resumeHint.textContent = `You were playing at table ${savedGuest.code} as ${savedGuest.name}.`;
    resumeBtn.dataset.mode = 'guest';
  } else {
    resumeBtn.disabled = true;
    resumeHint.textContent = '';
    delete resumeBtn.dataset.mode;
  }
}
refreshResumeOption();

resumeBtn.addEventListener('click', () => {
  if (resumeBtn.dataset.mode === 'host') { resumeHostedTable(); return; }
  const remembered = recallSession(window.localStorage);
  if (!remembered) return;
  document.getElementById('join-code').value = remembered.code;
  document.getElementById('join-name').value = remembered.name;
  showScreen(screens, 'join');
  document.getElementById('join-btn').click();
});

document.getElementById('show-host').addEventListener('click', () => {
  showScreen(screens, 'host');
});
document.getElementById('show-join').addEventListener('click', () => showScreen(screens, 'join'));


// --- Host flow ---
/**
 * Every host-side session handler, shared by creating a new table and
 * restoring a saved one - so the two paths can't drift apart.
 */
function wireHostSession() {
session.on('roster', (transportRoster) => {
  for (const r of transportRoster) {
    if (r.connection === 'disconnected') {
      // Free the seat's address but keep the player (and their hand) in
      // state, so the key they hold can bring them back to it.
      const key = peerToKey.get(r.id);
      peerToKey.delete(r.id);
      identityAnnounced.delete(r.id);
      if (key) gameState = reduce(gameState, { type: 'SET_CONNECTION', playerId: key, connection: 'disconnected' });
      continue;
    }

    // Don't seat a peer that is still `connecting`. D27 already refuses to
    // *announce* identity before the connection is open; seating them
    // earlier has the same defect one step upstream - the host can deal to
    // a peer whose identity hasn't settled, and it re-seats a moment later
    // as a stranger, stranding the dealt hand on a ghost. Sprint 10 fixed
    // this for auto-start by counting connected players; this fixes the
    // manual "Deal & Start" path too, at the source.
    if (r.connection !== 'connected' && !peerToKey.has(r.id)) continue;

    let key = peerToKey.get(r.id);
    if (!key) {
      const resolved = resolvePlayer(r.playerKey, gameState.players, peerToKey);
      key = resolved.playerKey;
      peerToKey.set(r.id, key);
    }
    // Tell the client which identity it is, so it can present the same one
    // next time. Only once the connection is actually open - sending to a
    // still-connecting peer is the documented way to hit PeerJS's
    // "Maximum call stack size exceeded" (see backlog).
    if (r.connection === 'connected' && !identityAnnounced.has(r.id)) {
      identityAnnounced.add(r.id);
      session.sendTo(r.id, { type: 'identity', playerKey: key });
    }
    if (!gameState.players.some((p) => p.id === key)) {
      gameState = reduce(gameState, { type: 'JOIN', playerId: key, name: r.name });
    }
    gameState = reduce(gameState, { type: 'SET_CONNECTION', playerId: key, connection: r.connection });
  }
  broadcastViews();
});

session.on('data', ({ fromId, msg }) => {
  if (msg.type === 'motion') {
    applyIncomingMotion(peerToKey.get(fromId) ?? fromId, msg);
    relayMotion(fromId, msg);
    return;
  }
  if (msg.type !== 'action') return;
  try {
    // The transport tells us the *address*; authority is bound to the
    // identity that address currently speaks for (D27). Unmapped peers
    // are ignored rather than trusted.
    const actorKey = peerToKey.get(fromId);
    if (!actorKey) return;
    dispatch({ ...msg.action, playerId: actorKey });
  } catch (err) {
    console.warn('Rejected action from', fromId, err);
  }
});
}

/**
 * US-42/D30: how many players to wait for before starting on our own.
 * Host-local, never game state - see D30. Empty/0 means no auto-start,
 * which is exactly the behaviour before this existed.
 */
let expectedPlayers = 0;

/**
 * US-45/D33: who a restored table is still waiting for. Only players who
 * were CONNECTED when the game was saved (Smith Gate 1 blocker - someone
 * who quit an hour before the reload is still in `state.players`, and
 * waiting for them means the resume never fires).
 */
let awaitedReturners = [];
let resumePending = false;

/** Names still missing, resolved live against the current roster. */
function stillMissing() {
  const back = new Set((gameState?.players ?? [])
    .filter((p) => p.connection === 'connected').map((p) => p.id));
  return awaitedReturners.filter((p) => !back.has(p.id));
}

function renderWaitingForReturners() {
  const el = document.getElementById('restore-waiting');
  if (!el) return;
  if (!resumePending) { el.hidden = true; return; }
  const missing = stillMissing();
  const back = awaitedReturners.length - missing.length;
  el.hidden = false;
  el.querySelector('.waiting-summary').textContent =
    missing.length === 0
      ? 'Everyone is back \u2014 resuming\u2026'
      : `Waiting for ${missing.length} of ${awaitedReturners.length} players to reconnect (${back} back).`;
  const list = el.querySelector('.waiting-list');
  list.innerHTML = '';
  for (const p of awaitedReturners) {
    const li = document.createElement('li');
    const isBack = !missing.some((m) => m.id === p.id);
    li.className = isBack ? 'returner-back' : 'returner-missing';
    // Smith Gate 1 #4: by NAME. "2 of 3" doesn't tell a host whether to
    // keep waiting; "Bob is still out" does.
    li.textContent = `${p.name} \u2014 ${isBack ? 'back' : 'still disconnected'}`;
    list.appendChild(li);
  }
}

/**
 * Resumes once everyone expected is back.
 *
 * Follows Sprint 10's CORRECTION rather than its first draft: counts
 * connected players (never seats), and clears the trigger BEFORE
 * resuming, because resuming re-renders and would otherwise re-enter
 * here with the condition still true. "Start anyway" clears the same
 * flag, so the two paths cannot both fire.
 */
function maybeResumeRestored() {
  if (!resumePending) return;
  renderWaitingForReturners();
  if (stillMissing().length > 0) return;
  finishRestore();
}

function finishRestore() {
  if (!resumePending) return;
  resumePending = false;
  document.getElementById('restore-waiting').hidden = true;
  document.getElementById('host-share').hidden = true;
  broadcastViews();
  if (latestView) renderGameFromView(latestView);
  showScreen(screens, 'game');
}

function startGame() {
  const cardsPerPlayer = Number(document.getElementById('cards-per-player').value);
  dispatch({ type: 'DEAL', cardsPerPlayer });
  showScreen(screens, 'game');
}

document.getElementById('deal-btn').addEventListener('click', startGame);

// US-45 AC: a table that can only resume at full strength is a table one
// closed tab can hold hostage. Clears the same flag the auto-resume does,
// so the two paths can never both fire.
document.getElementById('resume-anyway-btn').addEventListener('click', finishRestore);

/**
 * Fires at most once, without needing a flag to say so: the guard is a
 * condition that is only true before the game begins (D30). `startGame`
 * leaves the share screen, so the trigger is structurally dead
 * afterwards - a player leaving and rejoining mid-game therefore cannot
 * re-deal a round in progress, and unlike a boolean this survives a host
 * reload with nothing extra to persist or reset.
 */
/**
 * Auto-start must NOT run inline from the render path.
 *
 * `renderRosterOnly` is called from inside the `session.on('roster')`
 * handler, part-way through its loop over the transport roster - before
 * that peer's `SET_CONNECTION` has been applied and before `peerToKey` /
 * `identityAnnounced` are consistent for it. Starting the game there
 * dispatches and broadcasts mid-iteration, and the client ends up joined
 * twice: one ghost seat holding the dealt cards and one live seat holding
 * nothing. Observed exactly that - a roster reading "Dan - disconnected
 * (6 cards)" beside "Dan - connected (0 cards)".
 *
 * Deferring to a macrotask lets the roster handler finish and settle
 * identity first, so auto-start sees the same settled state a host
 * clicking the button by hand would have seen.
 */
let autoStartTimer = null;
function scheduleAutoStartCheck() {
  if (role !== 'host' || !expectedPlayers) return;
  clearTimeout(autoStartTimer);
  autoStartTimer = setTimeout(maybeAutoStart, 0);
}

function maybeAutoStart() {
  if (role !== 'host' || !expectedPlayers || sessionEnded) return;
  // `showScreen` hides `#screen-host`, NOT `#host-share` (which is a div
  // inside it), so checking `#host-share.hidden` here was dead code -
  // it never became true. The game screen being visible is the real
  // "already started" signal.
  if (!screens.game.hidden) return;
  // CONNECTED players only, not seats. A peer appears on the roster while
  // still `connecting`, and dealing to it is the same mistake D27 already
  // documents for the identity announcement: the client isn't ready to
  // receive, never gets told which identity it is, and reconnects as a
  // stranger - leaving a ghost seat holding the dealt cards and a live
  // seat holding nothing. Waiting for `connected` is the same settled-state
  // condition D27 uses, not a timing guess.
  const joined = gameState?.players.filter((p) => p.connection === 'connected').length ?? 0;
  const statusEl = document.getElementById('autostart-status');
  if (joined >= expectedPlayers) {
    // Zeroed BEFORE starting, not after. D30 argued the share-screen
    // check was a sufficient once-only guard; writing it showed it isn't,
    // because `startGame` dispatches first and only then leaves the
    // screen - so the re-render triggered by that dispatch re-enters here
    // with the screen still visible and the condition still true, and
    // recurses. The screen check still earns its place for later rejoins;
    // this closes the re-entrant path it can't see.
    expectedPlayers = 0;
    statusEl.hidden = true;
    startGame();
    return;
  }
  // Smith Gate 1 #3: state what we're waiting for, before it happens.
  statusEl.textContent =
    `Starting automatically when ${expectedPlayers} players have joined \u2014 ${joined} so far.`;
  statusEl.hidden = false;
}

/**
 * US-37: offer a saved game back to the host.
 *
 * Wording is Smith's Gate 1/2 requirement, not incidental: it states the
 * cost *before* the click (D31 reversed that: hands ARE saved now, and
 * save time per D26, so this is "weren't saved", not "can't be
 * restored"), shows the save's age so the host can judge it, and says
 * players must rejoin. Declining leaves the save alone; only creating a
 * genuinely new table clears it, so a mis-click can't destroy it.
 *
 * @returns {{state: object, code: string|null}|null}
 */
function offerRestore() {
  const found = loadGame(window.localStorage);
  if (!found.ok) {
    if (found.reason === 'corrupt' || found.reason === 'version') {
      clearGame(window.localStorage);
      window.alert('A saved game was found but could not be read, so it has been discarded. Starting a new table.');
    }
    return null;
  }
  const accepted = window.confirm(
    `Restore your saved table from ${describeAge(found.ageMs)}?\n\n` +
      'The table, piles, scores and everyone\'s hands come back.\n\n' +
      'Players reconnect on their own \u2014 you\'ll see who\'s still missing, ' +
      'and the game resumes by itself once they\'re back.',
  );
  if (!accepted) return null;
  return { state: found.state, code: found.code, hostName: found.hostName };
}

async function resumeHostedTable() {
  const restored = offerRestore();
  if (!restored) return;

  role = 'host';
  // US-39: the saved table remembers who was hosting it, so restoring
  // doesn't ask again. A typed name still wins if there is one.
  myName = document.getElementById('host-name').value.trim() || restored.hostName || 'Host';
  session = Session.host({ name: myName, code: restored.code });
  const createErrorEl = document.getElementById('host-create-error');
  let reclaimed = true;
  try {
    myId = await session.ready();
  } catch {
    // The broker may refuse the old code (still held, or taken since).
    // Falling back is fine, but say so - guests hold the old code.
    reclaimed = false;
    session = Session.host({ name: myName });
    try {
      myId = await session.ready();
    } catch {
      createErrorEl.textContent = 'Could not restore the table (network issue). Try again.';
      createErrorEl.hidden = false;
      return;
    }
  }
  createErrorEl.hidden = true;

  // D33/US-43: KEEP the saved players, marked away until they come back.
  //
  // This line used to wipe them (`players: []`) with the comment "the
  // saved roster refers to ids from the previous session". That was true
  // before D27 and is not true now: a player's id IS their `playerKey`,
  // which their own browser holds across sessions. Wiping the roster
  // makes every returning key *unknown* to `resolvePlayer`, so it hands
  // out a fresh seat - and their restored hand, which is keyed by the old
  // key, is orphaned. Keeping them is what makes US-43 work at all.
  //
  // The previous host entry is dropped and re-seated under the current
  // id, because the host's id is a peer id rather than a playerKey.
  const savedPlayers = (restored.state.players ?? []).filter((p) => p.id !== restored.code);
  gameState = reduce(
    {
      ...restored.state,
      players: savedPlayers.map((p) => ({ ...p, connection: 'disconnected' })),
    },
    { type: 'JOIN', playerId: myId, name: myName },
  );
  awaitedReturners = expectedReturners(restored.state, restored.code);

  document.getElementById('host-form').hidden = true;
  // Resume goes straight back to the table. Deal & Start would begin a
  // *new round* - the whole point of restoring is to carry on the one
  // that was interrupted, so requiring it to see your own table is both
  // an extra step and a destructive one.
  //
  // This supersedes Smith's Gate 1 amendment 3 ("land on the share
  // screen"), and the reason it can: US-39 means guests rejoin on their
  // own, so the host no longer has to re-share the code to get players
  // back. If the code *changed*, that assumption breaks - so in that one
  // case we still show the share screen, because the code guests
  // remembered is now wrong.
  wireHostSession();
  showGameCode(myId);
  if (reclaimed) {
    // US-45: if anyone was at the table when it was saved, wait for them
    // and say who by name, rather than dropping the host into a game
    // whose other seats are silently empty.
    if (awaitedReturners.length > 0) {
      resumePending = true;
      document.getElementById('restore-waiting').hidden = false;
      renderWaitingForReturners();
      broadcastViews();
      showScreen(screens, 'host');
      document.getElementById('host-share').hidden = false;
      const shareEl = document.getElementById('share-code-container');
      renderShareCode(shareEl, { code: myId });
      document.getElementById('host-deck-config').textContent =
        `Deck: ${describeDeckConfig(gameState.deckConfig)}`;
      renderRosterOnly();
      return;
    }
    broadcastViews();
    showScreen(screens, 'game');
  } else {
    const shareContainer = document.getElementById('share-code-container');
    renderShareCode(shareContainer, { code: myId });
    document.getElementById('host-share').hidden = false;
    document.getElementById('host-deck-config').textContent =
      `Deck: ${describeDeckConfig(gameState.deckConfig)} — the table code changed, share the new one`;
    renderRosterOnly();
  }
}

document.getElementById('create-table').addEventListener('click', async () => {
  // A new table supersedes any save - clearing here (rather than on a
  // decline) means a mis-click on "no" never destroys the only copy.
  clearGame(window.localStorage);
  role = 'host';
  myName = document.getElementById('host-name').value.trim() || 'Host';
  expectedPlayers = Number(document.getElementById('host-expected-players').value) || 0;
  const deckConfig = {
    type: document.getElementById('host-deck-type').value,
    numDecks: Number(document.getElementById('host-num-decks').value),
    jokers: Number(document.getElementById('host-jokers').value),
  };
  // D46: GameConfig's first real field.
  const gameConfig = { allowsPlayerZones: document.getElementById('host-allow-player-zones').checked };

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

  gameState = reduce(createInitialState(deckConfig, Math.random, gameConfig), { type: 'JOIN', playerId: myId, name: myName });

  // Table is created - the setup form no longer does anything, so stop
  // implying it's still live (Smith Gate-close finding #2).
  document.getElementById('host-form').hidden = true;

  const shareContainer = document.getElementById('share-code-container');
  renderShareCode(shareContainer, { code: myId });
  showGameCode(myId);
  document.getElementById('host-share').hidden = false;
  document.getElementById('host-deck-config').textContent = `Deck: ${describeDeckConfig(deckConfig)}`;
  if (selectedPreset) {
    document.getElementById('cards-per-player').value = String(selectedPreset.cardsPerPlayer);
  }
  renderRosterOnly();

  wireHostSession();
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
  scheduleSave();
}

// US-37/D26: the host persists its own authoritative state. Debounced
// because `dispatch` is the funnel for *every* mutation, and a burst
// (dealing 10 cards to 8 players) shouldn't mean 80 serializations.
// US-38/D27: playerKey is the identity, peer id is just where it's
// currently reachable. Everything in game state is keyed by playerKey,
// so a refresh no longer orphans a hand.
const peerToKey = new Map();
const identityAnnounced = new Set();

let saveTimer = null;
function scheduleSave() {
  if (role !== 'host' || sessionEnded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (gameState) saveGame(window.localStorage, gameState, myId, myName);
  }, 400);
}

/** The table code, shown for the whole game (host and guest alike). */
function showGameCode(code) {
  document.getElementById('game-code').textContent = code;
  wireCopyCode(document.getElementById('copy-code-btn'), code);
}

function broadcastViews() {
  for (const player of gameState.players) {
    const view = viewFor(gameState, player.id);
    if (player.id === myId) {
      renderGameFromView(view);
    } else {
      // player.id is an identity (D27); the transport needs the address
      // it currently answers on. A player who's away has none - their
      // state simply waits for them.
      const peerId = peerFor(player.id, peerToKey);
      if (peerId) session.sendTo(peerId, makeStateMessage(view));
    }
  }
  renderRosterOnly();
}

// --- Join flow ---
/**
 * US-44/D32: reconnection is entirely the client's job - the host has no
 * way to reach a client that has lost it, and a restoring host re-claims
 * its own table code, so the address never changes.
 *
 * Backoff, to a BOUNDED budget. Smith Gate 2 #2 sets the floor, and it
 * isn't network flakiness: the host's restore is a `window.confirm`
 * waiting on a person who has just been surprised by a reload, so the
 * budget has to outlast someone arriving, reading and deciding. It is
 * finite because a host who *declines* gets a new code, and every
 * retrying client would otherwise hammer a code that no longer exists
 * forever.
 */
// Sums to ~51s over 8 attempts. Sized against Smith's Gate 2 floor - a
// host arriving at a reload, reading a confirm dialog and deciding - not
// against network flakiness, which would have justified something far
// shorter. Longer would also mean a client hammering a code that no
// longer exists (a host who *declines* the restore gets a new one).
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 6000, 8000, 10000, 10000, 10000];
/** How long one attempt may hang before it counts as failed - see `attemptReconnect`. */
const ATTEMPT_TIMEOUT_MS = 5000;
let reconnectAttempt = 0;
let reconnectTimer = null;
let reconnecting = false;

function stopReconnecting() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnecting = false;
  reconnectAttempt = 0;
}

function beginReconnecting() {
  if (reconnecting || sessionEnded) return;
  reconnecting = true;
  reconnectAttempt = 0;
  scheduleReconnect();
}

function scheduleReconnect() {
  const delay = RECONNECT_DELAYS_MS[reconnectAttempt];
  if (delay === undefined) {
    // Budget spent. Say so and stop - a loop with no end is a battery
    // cost the player never agreed to, and an app that looks busy forever
    // is worse than one that admits it failed (Smith Gate 1 answer 1).
    reconnecting = false;
    endSessionForGood('Could not reconnect to the host.', { retryable: true });
    return;
  }
  reconnectAttempt += 1;
  renderBanner(bannerEl,
    `Lost the host \u2014 reconnecting\u2026 (attempt ${reconnectAttempt} of ${RECONNECT_DELAYS_MS.length})`);
  reconnectTimer = setTimeout(attemptReconnect, delay);
}

async function attemptReconnect() {
  const remembered = recallSession(window.localStorage);
  if (!remembered) { stopReconnecting(); endSessionForGood('Host disconnected \u2014 session ended.'); return; }
  let storedKey = null;
  try { storedKey = window.localStorage.getItem(CLIENT_KEY_STORAGE); } catch { /* private mode */ }
  const attempt = Session.join(remembered.code, { name: remembered.name, playerKey: storedKey });
  try {
    // `ready()` resolves on the data connection opening. When the host
    // simply isn't there, PeerJS opens the *peer* happily and the
    // connection never opens - so `ready()` neither resolves nor rejects,
    // and without this race the retry loop stalls on the first attempt and
    // the budget can never be spent. Found by watching it never give up.
    myId = await Promise.race([
      attempt.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('reconnect timeout')), ATTEMPT_TIMEOUT_MS)),
    ]);
    session = attempt;
    wireGuestSession();
    stopReconnecting();
    renderBanner(bannerEl, '');
    showGameCode(remembered.code);
  } catch {
    // Drop the half-open peer, or one leaks per attempt for the whole budget.
    attempt.close();
    scheduleReconnect(); // still not there - back off further and try again
  }
}

document.getElementById('join-btn').addEventListener('click', () => {
  role = 'join';
  stopReconnecting();
  myName = document.getElementById('join-name').value.trim() || 'Player';
  const hostId = document.getElementById('join-code').value.trim();
  const statusEl = document.getElementById('join-status');
  statusEl.textContent = 'Connecting...';

  // US-38: present the identity the host issued us last time, if any.
  // The host validates it - an unknown or in-use key just gets a fresh
  // seat, so a stale key can never wedge the join.
  let storedKey = null;
  try { storedKey = window.localStorage.getItem(CLIENT_KEY_STORAGE); } catch { /* private mode */ }
  session = Session.join(hostId, { name: myName, playerKey: storedKey });
  session
    .ready()
    .then((id) => {
      myId = id;
      // US-39: remember where we were, so a reload rejoins the game in
      // progress instead of dropping us on an empty form.
      rememberSession(window.localStorage, { code: hostId, name: myName });
      showGameCode(hostId);
      statusEl.textContent = 'Connected. Waiting for host to deal...';
    })
    .catch(() => {
      statusEl.textContent = 'Could not connect. Check the code and try again.';
    });

  wireGuestSession();
});

/**
 * Everything a guest listens for. Extracted (US-44) because reconnecting
 * has to re-establish exactly the same wiring on a brand-new `Session` -
 * and a second, drifting copy of it is precisely the bug D28 spent a
 * whole phase avoiding on the drop path.
 */
function wireGuestSession() {
  session.on('data', (msg) => {
    if (msg.type === 'identity') {
      // The host decides who we are; we just remember it, so a refresh
      // brings us back to this seat and hand rather than a new one.
      try { window.localStorage.setItem(CLIENT_KEY_STORAGE, msg.playerKey); } catch { /* private mode */ }
      myId = msg.playerKey;
      return;
    }
    if (msg.type === 'motion') {
      applyIncomingMotion(msg.fromId, msg);
      return;
    }
    if (msg.type !== 'state') return;
    latestView = msg.payload;
    renderGameFromView(latestView);
    showScreen(screens, 'game');
  });

  // D32: losing the host is retryable. `forgetSession` is deliberately
  // NOT called here - it erases the code and name at exactly the moment
  // they become useful, which is why reconnecting was impossible before
  // this sprint. It moves to `endSessionForGood`, where the session
  // really is over.
  session.on('host-lost', () => {
    if (sessionEnded) return;
    beginReconnecting();
  });

  session.on('session-ended', () => endSessionForGood('Host disconnected — session ended.'));
}


/**
 * The session really is over: the retry budget is spent, or we were told
 * so outright. Only here does the remembered table get dropped.
 */
function endSessionForGood(message, { retryable = false } = {}) {
  if (sessionEnded) return;
  stopReconnecting();
  forgetSession(window.localStorage);
  renderBanner(bannerEl, retryable ? `${message} Reload to try again.` : message);
  sessionEnded = true;
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
}

// --- Shared game rendering ---
function currentView() {
  if (role === 'host') return gameState ? viewFor(gameState, myId) : null;
  return latestView;
}

function renderRosterOnly() {
  const view = currentView();
  if (!view) return;
  scheduleAutoStartCheck(); // US-42: the roster changing is exactly when to re-check
  maybeResumeRestored();    // US-45: and when to re-check who is back
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
    // No control strip here (Smith Gate 2 #2): this screen already has
    // "Deal & Start", and two adjacent deal controls with different
    // semantics is worse than the one badly-placed control we started with.
    renderDeck(document.getElementById('host-deck-area'), view.deckCount);
  }
  renderRoster(gameRosterEl, seatedOrder(players, myId), { ...opts, seated: true });
  // Scales the table surface's size with player count (style.css) so
  // seats have room to spread out - confirmed necessary at 8 players,
  // not just a theoretical density concern (Phase 26 T26.3 finding).
  document.getElementById('table-surface').style.setProperty('--seat-count', players.length);
  // US-41/D29: dealing lives on the deck, where the cards are - the whole
  // point of the story. Host-only; `pileLevelActions` enforces that.
  renderDeck(document.getElementById('game-deck-area'), view.deckCount, {
    isHost: role === 'host',
    dealCount: lastDealCount,
    splitCount: lastSplitCount,
    onDealCountChange: (n) => { lastDealCount = n; },
    onSplitCountChange: (n) => { lastSplitCount = n; },
    onPileAction: (action, count) => dealFromDeck(action, count),
  });
  // Sprint 12 (D34/D37, T53.2/T58.1): the hand's own pile anchor - Sort
  // by rank/suit and Pass, one control instead of three.
  renderPileAnchor(handAnchorEl, pileLevelActions('hand', { isOwner: true }), {
    pileLabel: 'Hand',
    labels: { pass: view.passed?.[myId] ? 'Unpass' : 'Pass' },
    onPileAction: (id) => {
      if (id === 'sortRank') sortHandByRank();
      else if (id === 'sortSuit') sortHandBySuit();
      else if (id === 'pass') togglePass();
    },
  });
}

function renderGameFromView(view) {
  const nameById = new Map(view.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));

  renderHand(handAreaEl, orderedHand(view.myHand), {
    onPlay: (card) => playCard(card.id, selectedVisibility()),
    onHandMotion: (active) => motionThrottler.schedule('hand', { active }),
    onReorder: (newOrderIds) => {
      handOrderIds = newOrderIds;
    },
    onCardDrag: broadcastCardDrag,
    // US-40/D28: on mouse the destination zone handles the drop, so the
    // hand never needed this. A touch drag is captured by the source
    // element, so the hand card is the one that has to dispatch it.
    onDropCard: (cardId, toZoneId, placement) => dropCardOnZone(cardId, toZoneId, placement),
  });
  const zoneOpts = {
    viewerId: myId,
    resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
    onReveal: (cardId) => revealCard(cardId),
    onRotate: (cardId) => rotateCard(cardId),
    onPickup: (cardId) => pickupCard(cardId),
    onMoveCard: (cardId, toZoneId) => moveCard(cardId, toZoneId),
    onCardLift: (cardId, active) => motionThrottler.schedule('card-lift', { cardId, active }),
    onDropCard: (cardId, toZoneId, placement) => dropCardOnZone(cardId, toZoneId, placement),
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
  // Sprint 12 (T56.1): shuffle/split moved onto the deck's own pile
  // anchor - this legacy row stays permanently hidden (not deleted)
  // per the same pattern as Phase 53/54/55's own migrated controls.
  renderRosterOnly();
}

function playCard(cardId, visibility, zoneId, placement = {}) {
  if (sessionEnded) return;
  const { targetCardId, side, layout } = placement;
  if (role === 'host') dispatch({ type: 'PLAY', playerId: myId, cardId, visibility, zoneId, targetCardId, side, layout });
  else session.send({ type: 'action', action: { type: 'PLAY', cardId, visibility, zoneId, targetCardId, side, layout } });
}

function revealCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'REVEAL', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'REVEAL', cardId } });
}

function rotateCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'ROTATE_CARD', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'ROTATE_CARD', cardId } });
}

function pickupCard(cardId) {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'PICKUP', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'PICKUP', cardId } });
}

function moveCard(cardId, toZoneId, placement = {}) {
  if (sessionEnded) return;
  const { targetCardId, side, layout } = placement;
  if (role === 'host') dispatch({ type: 'MOVE_CARD', playerId: myId, cardId, toZoneId, targetCardId, side, layout });
  else session.send({ type: 'action', action: { type: 'MOVE_CARD', cardId, toZoneId, targetCardId, side, layout } });
}

// US-28: dropping a dragged card on a zone plays it (if it came from
// hand) or moves it (if it was already on the table) - the drop target
// itself doesn't know or care which, it just hands back a card id and a
// destination zone. Always plays public on drop, matching the existing
// "primary gesture = public play" precedent (US-12); face-down stays
// button-only (Smith Gate 1: don't overload drag with a mid-drag choice).
// US-32/33: `placement` (from ui.js's drop-region hit test) carries the
// stack/overlap intent through unchanged - this function still doesn't
// need to know which mode was chosen, only to forward it.
function dropCardOnZone(cardId, targetZoneId, placement = {}) {
  if (sessionEnded) return;
  const view = currentView();
  if (!view) return;
  if (view.myHand.some((c) => c.id === cardId)) {
    playCard(cardId, selectedVisibility(), targetZoneId, placement);
  } else {
    moveCard(cardId, targetZoneId, placement);
  }
}

/** Transient, beside the Add Zone row - same "where the click that caused
 * it happened" pattern as `showDeckError` (US-41). */
function showZoneError(message) {
  const el = document.getElementById('zone-error');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showZoneError.timer);
  showZoneError.timer = setTimeout(() => { el.hidden = true; }, 4000);
}

document.getElementById('create-zone-btn').addEventListener('click', () => {
  if (sessionEnded) return;
  const nameInput = document.getElementById('new-zone-name');
  const name = nameInput.value.trim();
  if (!name) return; // Smith Gate 1: zones need a real name, no silent auto-numbering
  // D45: kind travels with the request - CREATE_ZONE (state.js) is the
  // actual authority on which kinds are legal, this is just what's on
  // the wire.
  const kind = document.getElementById('new-zone-kind').value;
  if (role === 'host') {
    // D46: CREATE_ZONE can now be rejected (GameConfig.allowsPlayerZones
    // false) - was an uncaught throw straight out of this handler before
    // D46 gave it a real way to fail (same gap US-41 named for Deal
    // before that story fixed it). A GUEST's rejected request has no
    // local exception to catch at all (the host's `reduce` runs remotely
    // and only `console.warn`s - the existing, established pattern for
    // every other rejected guest action, e.g. an invalid MOVE_CARD today).
    try {
      dispatch({ type: 'CREATE_ZONE', name, kind });
    } catch (err) {
      showZoneError(err.message);
      return;
    }
  } else {
    session.send({ type: 'action', action: { type: 'CREATE_ZONE', name, kind } });
  }
  nameInput.value = '';
});

// Sprint 12 (T56.1): named so the deck's pile anchor calls the same
// implementation the legacy shuffle/split buttons did.
function performShuffle() {
  if (sessionEnded) return;
  dispatch({ type: 'SHUFFLE_DECK' });
}
function performSplit(pileCount) {
  if (sessionEnded) return;
  try {
    dispatch({ type: 'SPLIT_DECK', pileCount });
  } catch (err) {
    // Nielsen #9: say what went wrong and what would work, in the same
    // place the action was taken - not a silent no-op.
    window.alert(err.message);
  }
}
// Sprint 12 (D34/D35/D36, T54.1): named so the deck's pile anchor - both
// its click/tap shortcut and its drag-onto-hand drop - calls the same
// implementation the legacy button did, rather than a second one.
function performDraw() {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'DRAW', playerId: myId });
  else session.send({ type: 'action', action: { type: 'DRAW' } });
}

// D35: the hand is Draw's one static, legal drop target (D36's whole
// point - it never needs computing). `preventDefault` is unconditional
// here because real browsers don't expose `dataTransfer` values during
// `dragover`, only at `drop` (see `pileActionFromDrop`'s own note) - so
// there is nothing to branch on yet; an ordinary card dropped on empty
// hand space (not on a reorder target) already falls through to a safe
// no-op the same way it did before this listener existed.
handAreaEl.addEventListener('dragover', (e) => e.preventDefault());
handAreaEl.addEventListener('drop', (e) => {
  e.preventDefault();
  if (pileActionFromDrop(e.dataTransfer) === 'draw') performDraw();
});

// --- Hand sort (US-23, D14): local-only, never broadcast. Writes into
// the same handOrderIds that manual drag-reorder writes into, so the two
// never fight (Smith Gate 1). Named so the pile anchor (Sprint 12,
// T53.2) has one implementation to call. ---
function sortHandByRank() {
  const view = currentView();
  if (!view) return;
  handOrderIds = sortByRank(view.myHand);
  renderGameFromView(view);
}
function sortHandBySuit() {
  const view = currentView();
  if (!view) return;
  handOrderIds = sortBySuit(view.myHand);
  renderGameFromView(view);
}

// --- Deal More (US-24): host-only, adds to existing hands without a
// reset. Deliberately a different label/section/style than "Deal &
// Start" so a mid-game host can't mis-tap into a reset (Smith Gate 1). ---
/** Remembers the host's last deal/split counts so a re-render doesn't
 *  reset an input the host already typed into - `renderDeck` rebuilds
 *  the pile anchor wholesale on every state broadcast. */
let lastDealCount = 1;
let lastSplitCount = 2;

/**
 * US-41/D29, Phase 56 (T56.1): every deck pile-level action - the deck's
 * pile anchor is the ONE thing that calls this now, having absorbed
 * both the legacy strip's deal/reshuffleDeal and the legacy shuffle/
 * split row. "Reshuffle & deal" is RESET then DEAL - two existing
 * dispatches rather than a third code path that could drift from
 * either.
 */
function dealFromDeck(action, count) {
  if (sessionEnded) return;
  if (action === 'draw') return performDraw();
  if (action === 'shuffle') return performShuffle();
  if (action === 'split') { lastSplitCount = count; return performSplit(count); }
  lastDealCount = count;
  try {
    if (action === 'reshuffleDeal') {
      dispatch({ type: 'RESET' });
      dispatch({ type: 'DEAL', cardsPerPlayer: count });
    } else {
      dispatch({ type: 'DEAL_MORE', cardsPerPlayer: count });
    }
  } catch (err) {
    // US-41 AC: "fail the way it already does - a clear message, no
    // partial deal". It did NOT already do that: the reducer's throw ran
    // straight out of the click handler as an uncaught error, so the host
    // saw nothing at all. Only visible now because moving the control
    // somewhere reachable made it easy to hit.
    showDeckError(err.message);
  }
}

/** Transient, beside the deck - where the click that caused it happened. */
function showDeckError(message) {
  const el = document.getElementById('deck-error');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showDeckError.timer);
  showDeckError.timer = setTimeout(() => { el.hidden = true; }, 4000);
}

// --- Pass marker (US-25): self-toggle only, like US-13's precedent. ---
function togglePass() {
  if (sessionEnded) return;
  if (role === 'host') dispatch({ type: 'TOGGLE_PASS', playerId: myId });
  else session.send({ type: 'action', action: { type: 'TOGGLE_PASS' } });
}

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

function relayMotion(fromPeerId, msg) {
  // D27: motion arrives addressed by peer id but is *labelled* by
  // identity - the cue says who is moving, and "who" survives a
  // reconnect while a peer id does not.
  const fromKey = peerToKey.get(fromPeerId) ?? fromPeerId;
  for (const player of gameState.players) {
    if (player.id === fromKey || player.id === myId) continue;
    const peerId = peerFor(player.id, peerToKey);
    if (peerId) session.sendTo(peerId, { ...msg, fromId: fromKey });
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

// --- Deep link + resume (?join=<hostId>, or the table we were last in) ---
// Runs at the very end of the module: it can *click* the join button, so
// every handler it depends on must already be attached.
(function resumeOrDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const remembered = recallSession(window.localStorage);
  const code = params.get('join') || remembered?.code;
  if (!code) return;

  document.getElementById('join-code').value = code;
  if (remembered?.name) document.getElementById('join-name').value = remembered.name;
  showScreen(screens, 'join');

  // US-39: auto-rejoin only when returning to a table we were already in
  // (we know its code *and* our name there). A bare shared ?join= link
  // still waits for a name, so it never signs someone in as whoever last
  // used this browser.
  if (remembered && remembered.code === code && remembered.name) {
    document.getElementById('join-status').textContent = 'Rejoining your table...';
    document.getElementById('join-btn').click();
  }
})();
