import { Session } from './session.js';
import { createInitialState, reduce, viewFor } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from './protocol.js';
import { renderShareCode, wireCopyCode } from './qrcode.js';
import {
  renderZones,
  renderRoster,
  renderRulesPanel,
  renderBanner,
  renderDeckStack,
  wirePanelLayout,
  showScreen,
  updateRemoteCursor,
  removeRemoteCursor,
  setCardLifted,
  updateCardDragGhost,
  removeCardDragGhost,
  pileDragFromDrop,
} from './ui.js';
import { PRESETS } from './presets.js';
import { RULES_REFERENCE } from './rulesReference.js';
import { seatedOrder, seatPosition } from './seating.js';
import { save as saveGame, load as loadGame, clear as clearGame, describeAge, expectedReturners } from './persistence.js';
import { CLIENT_KEY_STORAGE, resolvePlayer, peerFor, rememberSession, recallSession, forgetSession } from './identity.js';
import { loadPanelLayout, savePanelPosition, savePanelSize, applyPresetLayout } from './panelLayout.js';
// UX follow-up (direct user request): Score is a native Web Component
// (customElements, light DOM) - importing it (and every pile/zone
// component below) for its registration side effect
// (`customElements.define(...)`), same as any other module that just
// needs to run once at load. `renderDeckStack` (above, from './ui.js')
// stays imported too - `#host-deck-area` (the pre-game preview screen,
// not a `#zones` panel) calls it directly on a plain div, no component
// needed there.
import './components/ScoreZone.js';
import './components/ZonePanel.js';
import './components/PilePanel.js';
import './components/FanPile.js';
import './components/DeckStack.js';
import './components/HeaderActions.js';

const MOTION_FLUSH_MS = 50;
const MOTION_TTL_MS = 2000; // auto-clear a stale "organizing hand" cue if the end-event is dropped

const screens = {
  landing: document.querySelector('#screen-landing'),
  host: document.querySelector('#screen-host'),
  join: document.querySelector('#screen-join'),
  game: document.querySelector('#screen-game'),
};
const bannerElement = document.querySelector('#banner');

// UX follow-up (direct user request): "just have table-surface -> zone"
// - every pile/zone panel (shared, personal, the deck) is a direct
// child of this one flat container now, no `#table-center`/
// `#table-area`/`#seat-zones` split.
const zonesElement = document.querySelector('#zones');
// (bloop: piles/zones/cards are all Movable) - "drop here to ungroup"
// (Phase 72's own task.md AC): a pile dropped on the open TABLE
// background, not onto any specific Zone, becomes its own standalone
// Zone (`MOVE_PILE` with no target - D55's existing ungroup design).
// Wired once, here, directly on the persistent `#zones` container
// (survives `renderZones`' own innerHTML rebuilds) rather than
// re-attached every render. Every Zone's own drop handler
// (`renderZonePanel`, `ui.js`) `stopPropagation()`s a pile-token drop
// it actually handles, so this only ever fires for a drop that lands
// on truly empty space between zones, never a double-dispatch.
zonesElement.addEventListener('dragover', (e) => e.preventDefault());
zonesElement.addEventListener('drop', (e) => {
  e.preventDefault();
  const pileId = pileDragFromDrop(e.dataTransfer);
  if (pileId) performMovePile(pileId, null);
});
// Only ever built for the VIEWER's own score (other players' scores
// show in the roster list, `renderRoster`'s own thing) - one browser,
// one own-score panel, so a single fixed id is enough.
const SCORE_PANEL_ID = 'score';
// Every id `deckPile.pileActions` can ever offer - `zoneOpts.onPileAction`
// (below) uses this to route a click to `dealFromDeck` instead of the
// hand's `pass`, without needing to know which pile kind is asking.
const DECK_ACTION_IDS = new Set(['draw', 'deal', 'reshuffleDeal', 'shuffle', 'split']);
let role = null; // 'host' | 'join'
let session = null;
let myId = null;
let myName = '';
let gameState = null; // authoritative, host only
let latestView = null; // last view received from host, join only
let isSessionEnded = false;
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

/** D53: a one-line summary of a preset's declared `piles` (renamed from
 * `zones` - D55; Solitaire's 4 foundations + 7 cascades, Spit's 2
 * rank-adjacent piles + a stock per player), or `''` for every
 * pre-Sprint-22 preset that has none. */
function describeConfiguredZones(pileDeclarations) {
  if (!pileDeclarations?.length) return '';
  return pileDeclarations
    .map(({ kind, ownerId, count = 1 }) => {
      const word = count === 1 ? kind : `${kind}s`;
      return ownerId === 'perPlayer' ? `${count} ${word}/player` : `${count} ${word}`;
    })
    .join(' + ');
}

// --- Rules reference (US-18): a toggleable overlay, not a showScreen()
// swap, so opening it never loses table state (Smith Gate 1 AC). ---
renderRulesPanel(document.querySelector('#rules-content'), RULES_REFERENCE);
document.querySelector('#rules-toggle').addEventListener('click', () => {
  document.querySelector('#rules-panel').hidden = false;
});
document.querySelector('#rules-close').addEventListener('click', () => {
  document.querySelector('#rules-panel').hidden = true;
});

// --- Presets (US-15) ---
const presetSelect = document.querySelector('#host-preset');
for (const preset of PRESETS) {
  const opt = document.createElement('option');
  opt.value = preset.name;
  opt.textContent = preset.name;
  presetSelect.append(opt);
}
presetSelect.addEventListener('change', () => {
  const preset = PRESETS.find((p) => p.name === presetSelect.value);
  const previewElement = document.querySelector('#host-preset-preview');
  selectedPreset = preset ?? null;
  if (!preset) {
    previewElement.hidden = true;
    return;
  }
  // D49: `type` is optional on a preset ('standard' by omission, same
  // default createInitialState/buildDeck already use) - most presets
  // never set it, so this must not clobber a host's own manual
  // deck-type choice with 'standard' every time they merely preview a
  // preset that doesn't care.
  if (preset.type) document.querySelector('#host-deck-type').value = preset.type;
  document.querySelector('#host-num-decks').value = String(preset.numDecks);
  document.querySelector('#host-jokers').value = String(preset.jokers);
  const cardsWord = preset.cardsPerPlayer === 1 ? 'card' : 'cards';
  // D53 (Smith Gate 2): a preset that declares a starting table layout
  // says so in the preview too, same "prefill on select" spirit as the
  // deck/deal fields above - the host sees what they're getting before
  // clicking Create Table, not only after.
  const zonesText = describeConfiguredZones(preset.piles);
  previewElement.textContent = `${describeDeckConfig(preset)}, ${preset.cardsPerPlayer} ${cardsWord}/player`
    + (zonesText ? ` — table: ${zonesText}` : '');
  previewElement.hidden = false;
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
const gameScreenElement = document.querySelector('#screen-game');
let isPointerActive = false;
gameScreenElement.addEventListener('pointerdown', () => {
  isPointerActive = true;
});
globalThis.addEventListener('pointerup', () => {
  isPointerActive = false;
});
gameScreenElement.addEventListener('pointermove', (e) => {
  if (!isPointerActive || isSessionEnded) return;
  const rect = gameScreenElement.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
  motionThrottler.schedule('cursor', { x, y });
});

// --- Landing ---
// --- Resume (landing screen) -------------------------------------------
// One button covers both roles: if this browser was hosting, restore the
// table; if it was playing, rejoin it. Disabled (not hidden) when there's
// nothing to resume, so the option is still discoverable.
const resumeButton = document.querySelector('#resume-game');
const resumeHint = document.querySelector('#resume-hint');

function refreshResumeOption() {
  const savedHost = loadGame(localStorage);
  const savedGuest = recallSession(localStorage);
  if (savedHost.ok) {
    resumeButton.disabled = false;
    resumeHint.textContent = `You were hosting a table, saved ${describeAge(savedHost.ageMs)}.`;
    resumeButton.dataset.mode = 'host';
  } else if (savedGuest) {
    resumeButton.disabled = false;
    resumeHint.textContent = `You were playing at table ${savedGuest.code} as ${savedGuest.name}.`;
    resumeButton.dataset.mode = 'guest';
  } else {
    resumeButton.disabled = true;
    resumeHint.textContent = '';
    delete resumeButton.dataset.mode;
  }
}
refreshResumeOption();

resumeButton.addEventListener('click', () => {
  if (resumeButton.dataset.mode === 'host') { resumeHostedTable(); return; }
  const remembered = recallSession(localStorage);
  if (!remembered) return;
  document.querySelector('#join-code').value = remembered.code;
  document.querySelector('#join-name').value = remembered.name;
  showScreen(screens, 'join');
  document.querySelector('#join-btn').click();
});

document.querySelector('#show-host').addEventListener('click', () => {
  showScreen(screens, 'host');
});
document.querySelector('#show-join').addEventListener('click', () => showScreen(screens, 'join'));


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
    if (gameState.players.every((p) => p.id !== key)) {
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
  } catch (error) {
    console.warn('Rejected action from', fromId, error);
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
let isResumePending = false;

/**
Names still missing, resolved live against the current roster.
*/
function stillMissing() {
  const back = new Set((gameState?.players ?? [])
    .filter((p) => p.connection === 'connected').map((p) => p.id));
  return awaitedReturners.filter((p) => !back.has(p.id));
}

function renderWaitingForReturners() {
  const element = document.querySelector('#restore-waiting');
  if (!element) return;
  if (!isResumePending) { element.hidden = true; return; }
  const missing = stillMissing();
  const back = awaitedReturners.length - missing.length;
  element.hidden = false;
  element.querySelector('.waiting-summary').textContent =
    missing.length === 0
      ? 'Everyone is back \u{2014} resuming\u{2026}'
      : `Waiting for ${missing.length} of ${awaitedReturners.length} players to reconnect (${back} back).`;
  const list = element.querySelector('.waiting-list');
  list.replaceChildren();
  for (const p of awaitedReturners) {
    const li = document.createElement('li');
    const isBack = missing.every((m) => m.id !== p.id);
    li.className = isBack ? 'returner-back' : 'returner-missing';
    // Smith Gate 1 #4: by NAME. "2 of 3" doesn't tell a host whether to
    // keep waiting; "Bob is still out" does.
    li.textContent = `${p.name} \u{2014} ${isBack ? 'back' : 'still disconnected'}`;
    list.append(li);
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
  if (!isResumePending) return;
  renderWaitingForReturners();
  if (stillMissing().length > 0) return;
  finishRestore();
}

function finishRestore() {
  if (!isResumePending) return;
  isResumePending = false;
  document.querySelector('#restore-waiting').hidden = true;
  document.querySelector('#host-share').hidden = true;
  broadcastViews();
  if (latestView) renderGameFromView(latestView);
  showScreen(screens, 'game');
}

function startGame() {
  const cardsPerPlayer = Number(document.querySelector('#cards-per-player').value);
  dispatch({ type: 'DEAL', cardsPerPlayer });
  showScreen(screens, 'game');
}

document.querySelector('#deal-btn').addEventListener('click', startGame);

// US-45 AC: a table that can only resume at full strength is a table one
// closed tab can hold hostage. Clears the same flag the auto-resume does,
// so the two paths can never both fire.
document.querySelector('#resume-anyway-btn').addEventListener('click', finishRestore);

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
  if (role !== 'host' || !expectedPlayers || isSessionEnded) return;
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
  const statusElement = document.querySelector('#autostart-status');
  if (joined >= expectedPlayers) {
    // Zeroed BEFORE starting, not after. D30 argued the share-screen
    // check was a sufficient once-only guard; writing it showed it isn't,
    // because `startGame` dispatches first and only then leaves the
    // screen - so the re-render triggered by that dispatch re-enters here
    // with the screen still visible and the condition still true, and
    // recurses. The screen check still earns its place for later rejoins;
    // this closes the re-entrant path it can't see.
    expectedPlayers = 0;
    statusElement.hidden = true;
    startGame();
    return;
  }
  // Smith Gate 1 #3: state what we're waiting for, before it happens.
  statusElement.textContent =
    `Starting automatically when ${expectedPlayers} players have joined \u{2014} ${joined} so far.`;
  statusElement.hidden = false;
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
  const found = loadGame(localStorage);
  if (!found.ok) {
    if (found.reason === 'corrupt' || found.reason === 'version') {
      clearGame(localStorage);
      globalThis.alert('A saved game was found but could not be read, so it has been discarded. Starting a new table.');
    }
    return null;
  }
  const accepted = globalThis.confirm(
    `Restore your saved table from ${describeAge(found.ageMs)}?\n\n` +
      'The table, piles, scores and everyone\'s hands come back.\n\n' +
      'Players reconnect on their own \u{2014} you\'ll see who\'s still missing, ' +
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
  myName = document.querySelector('#host-name').value.trim() || restored.hostName || 'Host';
  session = Session.host({ name: myName, code: restored.code });
  const createErrorElement = document.querySelector('#host-create-error');
  let isReclaimed = true;
  try {
    myId = await session.ready();
  } catch {
    // The broker may refuse the old code (still held, or taken since).
    // Falling back is fine, but say so - guests hold the old code.
    isReclaimed = false;
    session = Session.host({ name: myName });
    try {
      myId = await session.ready();
    } catch {
      createErrorElement.textContent = 'Could not restore the table (network issue). Try again.';
      createErrorElement.hidden = false;
      return;
    }
  }
  createErrorElement.hidden = true;

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

  document.querySelector('#host-form').hidden = true;
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
  if (isReclaimed) {
    // US-45: if anyone was at the table when it was saved, wait for them
    // and say who by name, rather than dropping the host into a game
    // whose other seats are silently empty.
    if (awaitedReturners.length > 0) {
      isResumePending = true;
      document.querySelector('#restore-waiting').hidden = false;
      renderWaitingForReturners();
      broadcastViews();
      showScreen(screens, 'host');
      document.querySelector('#host-share').hidden = false;
      const shareElement = document.querySelector('#share-code-container');
      renderShareCode(shareElement, { code: myId });
      document.querySelector('#host-deck-config').textContent =
        `Deck: ${describeDeckConfig(gameState.deckConfig)}`;
      renderRosterOnly();
      return;
    }
    broadcastViews();
    showScreen(screens, 'game');
  } else {
    const shareContainer = document.querySelector('#share-code-container');
    renderShareCode(shareContainer, { code: myId });
    document.querySelector('#host-share').hidden = false;
    document.querySelector('#host-deck-config').textContent =
      `Deck: ${describeDeckConfig(gameState.deckConfig)} — the table code changed, share the new one`;
    renderRosterOnly();
  }
}

document.querySelector('#create-table').addEventListener('click', async () => {
  // A new table supersedes any save - clearing here (rather than on a
  // decline) means a mis-click on "no" never destroys the only copy.
  clearGame(localStorage);
  role = 'host';
  myName = document.querySelector('#host-name').value.trim() || 'Host';
  expectedPlayers = Number(document.querySelector('#host-expected-players').value) || 0;
  const deckConfig = {
    type: document.querySelector('#host-deck-type').value,
    numDecks: Number(document.querySelector('#host-num-decks').value),
    jokers: Number(document.querySelector('#host-jokers').value),
  };
  // D46: GameConfig's first real field. D53: `piles` (renamed from
  // `zones` - D55, that name now belongs to the real Zone-entity list)
  // comes from the selected preset (if any) - no manual host UI for it
  // this sprint, matching the AC ("a preset MAY declare a starting
  // layout"). `zones` carries any Zone entities the preset itself
  // declares (e.g. none today reach beyond the always-present Table
  // Zone - Gin Rummy's discard only ever references it, never declares
  // a new one).
  const gameConfig = {
    allowsPlayerZones: document.querySelector('#host-allow-player-zones').checked,
    piles: selectedPreset?.piles ?? [],
    zones: selectedPreset?.zones ?? [],
  };

  session = Session.host({ name: myName });
  const createErrorElement = document.querySelector('#host-create-error');
  try {
    myId = await session.ready();
  } catch (error) {
    createErrorElement.textContent = 'Could not create a table (code collision or network issue). Try again.';
    createErrorElement.hidden = false;
    console.warn('host session failed to open', error);
    return;
  }
  createErrorElement.hidden = true;

  gameState = reduce(createInitialState(deckConfig, Math.random, gameConfig), { type: 'JOIN', playerId: myId, name: myName });

  // Table is created - the setup form no longer does anything, so stop
  // implying it's still live (Smith Gate-close finding #2).
  document.querySelector('#host-form').hidden = true;

  const shareContainer = document.querySelector('#share-code-container');
  renderShareCode(shareContainer, { code: myId });
  showGameCode(myId);
  document.querySelector('#host-share').hidden = false;
  document.querySelector('#host-deck-config').textContent = `Deck: ${describeDeckConfig(deckConfig)}`;
  if (selectedPreset) {
    document.querySelector('#cards-per-player').value = String(selectedPreset.cardsPerPlayer);
    // UX follow-up (direct user request): "update the preset to use
    // this layout... and preset the layouts for the other games too" -
    // a preset's own `layout` (its shared, deterministically-id'd
    // panels only - never a per-player one) seeds this browser's local
    // panel arrangement (`panelLayout.js`) the moment its table is
    // actually created, not merely previewed in the dropdown.
    applyPresetLayout(localStorage, selectedPreset.layout);
  }
  renderRosterOnly();

  wireHostSession();
});

// UX follow-up (direct user request): Reset/Reset Scores/Add Zone
// controls removed from the bottom of the screen. RESET/RESET_SCORES/
// CREATE_ZONE stay real, dispatchable, fully-tested reducer actions
// (state.test.js, e2e) - only their UI entry points are gone, disclosed
// to the user as a real functionality gap, not silently dropped.

function adjustScore(targetPlayerId, delta) {
  if (isSessionEnded) return;
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
  if (role !== 'host' || isSessionEnded) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (gameState) saveGame(localStorage, gameState, myId, myName);
  }, 400);
}

/**
The table code, shown for the whole game (host and guest alike).
*/
function showGameCode(code) {
  document.querySelector('#game-code').textContent = code;
  wireCopyCode(document.querySelector('#copy-code-btn'), code);
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
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 6000, 8000, 10_000, 10_000, 10_000];
/**
How long one attempt may hang before it counts as failed - see `attemptReconnect`.
*/
const ATTEMPT_TIMEOUT_MS = 5000;
let reconnectAttempt = 0;
let reconnectTimer = null;
let isReconnecting = false;

function stopReconnecting() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  isReconnecting = false;
  reconnectAttempt = 0;
}

function beginReconnecting() {
  if (isReconnecting || isSessionEnded) return;
  isReconnecting = true;
  reconnectAttempt = 0;
  scheduleReconnect();
}

function scheduleReconnect() {
  const delay = RECONNECT_DELAYS_MS[reconnectAttempt];
  if (delay === undefined) {
    // Budget spent. Say so and stop - a loop with no end is a battery
    // cost the player never agreed to, and an app that looks busy forever
    // is worse than one that admits it failed (Smith Gate 1 answer 1).
    isReconnecting = false;
    endSessionForGood('Could not reconnect to the host.', { retryable: true });
    return;
  }
  reconnectAttempt += 1;
  renderBanner(bannerElement,
    `Lost the host \u{2014} reconnecting\u{2026} (attempt ${reconnectAttempt} of ${RECONNECT_DELAYS_MS.length})`);
  reconnectTimer = setTimeout(attemptReconnect, delay);
}

async function attemptReconnect() {
  const remembered = recallSession(localStorage);
  if (!remembered) { stopReconnecting(); endSessionForGood('Host disconnected \u{2014} session ended.'); return; }
  let storedKey = null;
  try { storedKey = localStorage.getItem(CLIENT_KEY_STORAGE); } catch { /* private mode */ }
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
    renderBanner(bannerElement, '');
    showGameCode(remembered.code);
  } catch {
    // Drop the half-open peer, or one leaks per attempt for the whole budget.
    attempt.close();
    scheduleReconnect(); // still not there - back off further and try again
  }
}

document.querySelector('#join-btn').addEventListener('click', () => {
  role = 'join';
  stopReconnecting();
  myName = document.querySelector('#join-name').value.trim() || 'Player';
  const hostId = document.querySelector('#join-code').value.trim();
  const statusElement = document.querySelector('#join-status');
  statusElement.textContent = 'Connecting...';

  // US-38: present the identity the host issued us last time, if any.
  // The host validates it - an unknown or in-use key just gets a fresh
  // seat, so a stale key can never wedge the join.
  let storedKey = null;
  try { storedKey = localStorage.getItem(CLIENT_KEY_STORAGE); } catch { /* private mode */ }
  session = Session.join(hostId, { name: myName, playerKey: storedKey });
  session
    .ready()
    .then((id) => {
      myId = id;
      // US-39: remember where we were, so a reload rejoins the game in
      // progress instead of dropping us on an empty form.
      rememberSession(localStorage, { code: hostId, name: myName });
      showGameCode(hostId);
      statusElement.textContent = 'Connected. Waiting for host to deal...';
    })
    .catch(() => {
      statusElement.textContent = 'Could not connect. Check the code and try again.';
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
  session.on('data', (message) => {
    if (message.type === 'identity') {
      // The host decides who we are; we just remember it, so a refresh
      // brings us back to this seat and hand rather than a new one.
      try { localStorage.setItem(CLIENT_KEY_STORAGE, message.playerKey); } catch { /* private mode */ }
      myId = message.playerKey;
      return;
    }
    if (message.type === 'motion') {
      applyIncomingMotion(message.fromId, message);
      return;
    }
    if (message.type !== 'state') return;
    latestView = message.payload;
    renderGameFromView(latestView);
    showScreen(screens, 'game');
  });

  // D32: losing the host is retryable. `forgetSession` is deliberately
  // NOT called here - it erases the code and name at exactly the moment
  // they become useful, which is why reconnecting was impossible before
  // this sprint. It moves to `endSessionForGood`, where the session
  // really is over.
  session.on('host-lost', () => {
    if (isSessionEnded) return;
    beginReconnecting();
  });

  session.on('session-ended', () => endSessionForGood('Host disconnected — session ended.'));
}


/**
 * The session really is over: the retry budget is spent, or we were told
 * so outright. Only here does the remembered table get dropped.
 */
function endSessionForGood(message, { retryable = false } = {}) {
  if (isSessionEnded) return;
  stopReconnecting();
  forgetSession(localStorage);
  renderBanner(bannerElement, retryable ? `${message} Reload to try again.` : message);
  isSessionEnded = true;
  // Re-render with no action handlers so every control (hand cards,
  // reveal/pickup buttons) is inert, and force the roster to reflect
  // reality instead of the last-known (now stale) connection states
  // (Smith Gate-close finding #1 — don't leave any control looking
  // live once the session is actually over).
  if (latestView) {
    const nameById = new Map(latestView.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));
    const frozenOptions = {
      resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
    };
    // UX follow-up (direct user request): "a Deck is a specific kind of
    // Pile" - the deck is a real pile in `latestView.zones` now, so this
    // one `renderZones` call renders it too (grouped into the Table
    // Zone, inert - `frozenOpts` has no `isHost`/`onPileAction`, so
    // `pileLevelActions('deck', {isHost: false})` offers only `draw`,
    // and even that has nothing to dispatch to), matching every other
    // control in this frozen re-render. No separate `<deck-zone>`
    // element to build here any more.
    renderZones(zonesElement, latestView.zones, seatedOrder(latestView.players, myId), latestView.zoneRecords, frozenOptions);
    // Same inert Score panels the live render builds (one per seated
    // player with a score, "need a score zone for our opponent" too),
    // just no move/resize/adjust wiring - the session is over.
    const frozenSeated = seatedOrder(latestView.players, myId);
    for (const [seatIndex, player] of frozenSeated.entries()) {
      if (latestView.scores?.[player.id] === undefined) continue;
      const scoreElement = document.createElement('score-zone');
      scoreElement.score = latestView.scores[player.id];
      if (player.id !== myId) scoreElement.label = `${player.name} Score`;
      scoreElement.classList.add('panel-moved');
      const seatDefault = seatPosition(seatIndex, frozenSeated.length, 26);
      scoreElement.style.position = 'absolute';
      scoreElement.style.left = `${seatDefault.leftPct}%`;
      scoreElement.style.top = `${Math.max(seatDefault.topPct - 14, 4)}%`;
      zonesElement.append(scoreElement);
    }
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
  if (isSessionEnded) players = players.map((p) => ({ ...p, connection: 'disconnected' }));
  const options = {
    movingIds,
    scores: view.scores,
    onAdjustScore: isSessionEnded ? null : adjustScore,
    myId,
    passed: view.passed,
  };
  const hostRosterElement = document.querySelector('#host-roster');
  if (hostRosterElement) {
    renderRoster(hostRosterElement, players, options);
    // No control strip here (Smith Gate 2 #2): this screen already has
    // "Deal & Start", and two adjacent deal controls with different
    // semantics is worse than the one badly-placed control we started with.
    renderDeckStack(document.querySelector('#host-deck-area'), view.deckCount);
  }
  // UX follow-up (direct user request): the in-game roster ring
  // (`#game-roster`) is retired entirely - every player's seat is its
  // own `<zone-panel>` now (grouping the hand pile, plus any other
  // personal pile), `renderGameFromView`/`renderZones` already builds
  // inside `#zones`. Nothing here rebuilds that; this function only
  // still owns `#host-roster` (the pre-game screen, which has no
  // piles/zones concept at all) and the seat-count CSS var below.
  //
  // Scales the table surface's size with player count (style.css) so
  // seats have room to spread out - confirmed necessary at 8 players,
  // not just a theoretical density concern (Phase 26 T26.3 finding).
  document.querySelector('#table-surface').style.setProperty('--seat-count', players.length);
}

function renderGameFromView(view) {
  const nameById = new Map(view.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));

  // UX follow-up (direct user request): "get rid of seat panel and
  // replace with a reg zone with a handpile" - the hand is a real
  // `hand`-kind pile now (`state.js`), rendered through the exact same
  // generic `renderZoneCards`/`actionMenuEl` machinery as any other
  // pile's cards (as a `<pile-panel>` grouped into the owner's own
  // `<zone-panel>`, `src/components/PilePanel.js`/`ZonePanel.js`). No
  // separate `handOpts`/`own` object, no bespoke fan/reorder/motion/
  // sort/pass wiring - `onPlay` below is the one new callback the
  // generic per-card action menu needs (`play` was always in
  // `cardActions` for a hand's owner, nothing dispatched it
  // yet).
  //
  // NOTE (flagged, not yet done): hand-order persistence (D14), sort/
  // pass, and the "organizing hand" motion cue are all temporarily gone
  // - direct instruction was to get the pile rendering working first,
  // parity/polish is a following step.
  const zoneOptions = {
    viewerId: myId,
    resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
    onPlay: isSessionEnded ? null : (cardId, targetId) => playCard(cardId, 'public', targetId),
    onReveal: (cardId) => revealCard(cardId),
    onRotate: (cardId) => rotateCard(cardId),
    onPickup: (cardId) => pickupCard(cardId),
    onMoveCard: (cardId, toZoneId) => moveCard(cardId, toZoneId),
    onCardLift: (cardId, active) => motionThrottler.schedule('card-lift', { cardId, active }),
    onDropCard: (cardId, toZoneId, placement) => dropCardOnZone(cardId, toZoneId, placement),
    // D35: a dragged pile-action token (Draw is the only draggable one
    // today) dropped on any zone panel - generalizes what used to be the
    // merged own-zone panel's own bespoke hand-drop check.
    onPileActionDrop: isSessionEnded ? null : (actionId) => { if (actionId === 'draw') performDraw(); },
    // UX follow-up (direct user request): "like zones, Piles are
    // Actionable and should have a title bar with action buttons for
    // that pile type" - every pile's heading is a real action header now
    // (`renderPile`, `ui.js`), dispatched generically through one
    // callback regardless of which pile kind offered the action.
    // `pileLevelActions('hand', {isOwner})`'s other two (sortRank/
    // sortSuit) are filtered out before they ever reach here (see
    // `renderPile`'s own note) - `pass` and every deck action
    // (`dealFromDeck` already handles draw/deal/reshuffleDeal/shuffle/
    // split generically) are the two real dispatch tables today.
    onPileAction: isSessionEnded ? null : (pileId, actionId) => {
      if (actionId === 'pass') return togglePass();
      // Sprint 23: `split` is offered by BOTH the deck (`SPLIT_DECK`,
      // deck-only pile count) and a zone/discard pile (`SPLIT_PILE`,
      // this specific pile in half) - the same action id means a
      // different reducer action depending on WHICH pile's own header
      // it was clicked in, so that's resolved by the acted-upon pile's
      // own kind, not the id alone.
      const pile = view.zones.find((z) => z.id === pileId);
      if (pile?.kind === 'deck' && DECK_ACTION_IDS.has(actionId)) return dealFromDeck(actionId, lastDealCount);
      if (actionId === 'split') return performSplitPile(pileId);
      if (actionId === 'take') return performTakePile(pileId);
      if (actionId === 'hide') return performSetPileOrientation(pileId, false);
      if (actionId === 'show') return performSetPileOrientation(pileId, true);
    },
    // *nit (2026-08-26): "allow user to rename zones and piles - any
    // user can edit - persisted by host." Same `sessionEnded` gate
    // every other dispatching handler in this object already uses.
    onRenamePile: isSessionEnded ? null : (pileId, name) => performRenamePile(pileId, name),
    onRenameZone: isSessionEnded ? null : (zoneId, name) => performRenameZone(zoneId, name),
    // (bloop: piles/zones/cards are all Movable)
    onMovePile: isSessionEnded ? null : (pileId, targetZoneId) => performMovePile(pileId, targetZoneId),
    // *nit (2026-08-26): "relocated within their zone (ordering)" -
    // every pile can be reordered among its own zone's siblings, even
    // a kind `onMovePile`/`MOVE_PILE` would reject for a cross-zone
    // move (purely cosmetic, no game-rule concern either way).
    onReorderPile: isSessionEnded ? null : (pileId, beforePileId) => performReorderPile(pileId, beforePileId),
    onDropCardOnZone: isSessionEnded ? null : (cardId, zoneId) => performCreatePileWithCard(cardId, zoneId),
    isHost: role === 'host',
    // US-41/D29: dealing lives on the deck, where the cards are - the
    // whole point of the story. Read/written here since the deck now
    // renders through the exact same generic pile pipeline (`<deck-
    // stack>`, `renderPile`'s row) as any other pile, not a bespoke
    // `<deck-zone>` element with its own property surface any more.
    dealCount: lastDealCount,
    onDealCountChange: isSessionEnded ? null : (value) => { lastDealCount = value; },
    onCardDrag: broadcastCardDrag,
    // UX follow-up (direct user request): panel position/size is a
    // local, per-browser preference (`panelLayout.js`) - read fresh on
    // every render so a drag/resize persisted by `movePanel`/
    // `resizePanel` below shows up on the very next render, same as it
    // did when this was replicated state. Overrides the computed
    // default position when present; `movePanel`/`resizePanel` are what
    // a title-bar drag/corner-handle drag (`ui.js`'s `attachPanelDrag`/
    // `attachPanelResize`) call on release. *nit (2026-08-26) history:
    // `onMovePanel` was briefly removed, then directly restored - see
    // `wirePanelLayout`'s own comment ("zones can be moved anywhere on
    // the table").
    layout: loadPanelLayout(localStorage),
    onMovePanel: movePanel,
    onResizePanel: resizePanel,
  };
  // UX follow-up (direct user request): "just have table-surface ->
  // zone" - one render call builds every pile/zone panel (shared AND
  // personal, D17/US-27's per-seat placement included) as a direct
  // child of `#zones`, no separate shared-vs-personal container split.
  // UX follow-up (direct user request): "a Deck is a specific kind of
  // Pile... it is not a Zone at all" - the deck is a real pile in
  // `view.zones` now (`state.js`'s `viewFor`), so this ONE call also
  // builds and groups it into the Table Zone, exactly like Table/
  // Discard - no separate `<deck-zone>` element/property wiring needed
  // here any more (`<deck-stack>`, `src/components/DeckStack.js`, is
  // what `renderPile` uses for its row instead - see `zoneOpts.
  // dealCount`/`onDealCountChange` above for the one piece of deck-
  // specific state this file still owns: the Deal count input's value).
  renderZones(zonesElement, view.zones, seatedOrder(view.players, myId), view.zoneRecords, zoneOptions);
  // UX follow-up (direct user request): Score is a real sibling
  // `<score-zone>` Web Component now (`src/components/ScoreZone.js`),
  // not content nested inside the own-zone panel - built the same
  // "fresh element, wired through wirePanelLayout" way the deck is.
  // UX follow-up (direct user request): "need a score zone for our
  // opponent" - every seated player with a score entry gets their own
  // `<score-zone>` now (not just the viewer's own), same component,
  // labeled with their name and positioned near THEIR OWN seat instead
  // of always seat 0. Anyone may adjust anyone's score (`onAdjustScore`
  // was never owner-gated even back when this lived in the roster).
  const seated = seatedOrder(view.players, myId);
  for (const [seatIndex, player] of seated.entries()) {
    if (view.scores?.[player.id] === undefined) continue;
    const isMe = player.id === myId;
    const scoreElement = document.createElement('score-zone');
    scoreElement.score = view.scores[player.id];
    scoreElement.adjustable = !isSessionEnded;
    if (!isMe) scoreElement.label = `${player.name} Score`;
    scoreElement.addEventListener('score-adjust', (e) => adjustScore(player.id, e.detail.delta));
    zonesElement.append(scoreElement);
    const panelId = isMe ? SCORE_PANEL_ID : `score-${player.id}`;
    wirePanelLayout(scoreElement, panelId, scoreElement.querySelector('.panel-title'), zoneOptions);
    if (!scoreElement.classList.contains('panel-moved')) {
      // No stored position yet - default near THIS player's own seat
      // ring point (same one their personal zone uses), offset up so it
      // doesn't land exactly on top of it before either panel has ever
      // been moved.
      const seatDefault = seatPosition(seatIndex, seated.length, 26);
      scoreElement.classList.add('panel-moved');
      scoreElement.style.position = 'absolute';
      scoreElement.style.left = `${seatDefault.leftPct}%`;
      scoreElement.style.top = `${Math.max(seatDefault.topPct - 14, 4)}%`;
    }
  }
  renderRosterOnly();
}

function playCard(cardId, visibility, zoneId, placement = {}) {
  if (isSessionEnded) return;
  const { targetCardId, side, layout } = placement;
  if (role === 'host') dispatch({ type: 'PLAY', playerId: myId, cardId, visibility, zoneId, targetCardId, side, layout });
  else session.send({ type: 'action', action: { type: 'PLAY', cardId, visibility, zoneId, targetCardId, side, layout } });
}

function revealCard(cardId) {
  if (isSessionEnded) return;
  if (role === 'host') dispatch({ type: 'REVEAL', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'REVEAL', cardId } });
}

function rotateCard(cardId) {
  if (isSessionEnded) return;
  if (role === 'host') dispatch({ type: 'ROTATE_CARD', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'ROTATE_CARD', cardId } });
}

// UX follow-up (direct user request): panel positions/sizes are LOCAL,
// per-browser preference now, not replicated game state - every table
// starts from the same computed default arrangement, and each viewer's
// own drag/resize adjustments are theirs alone (`panelLayout.js`,
// `window.localStorage`). Dragging a panel's title dispatches this on
// release; the drag itself already applied the style live (`ui.js`),
// so this just persists it for the NEXT render (`renderGameFromView`
// reads `loadPanelLayout` fresh every time) - nothing to send anywhere.
// *nit (2026-08-26) history: briefly removed, then directly restored -
// see `wirePanelLayout`'s own comment. Zone panels only now (a Pile's
// own title uses native drag for a different capability instead).
function movePanel(id, x, y) {
  savePanelPosition(localStorage, id, x, y);
}

// The resize-handle counterpart to movePanel above - same local-only
// shape. Both axes together (the corner handle always drags width AND
// height at once, matching its own two-way cursor).
function resizePanel(id, w, h) {
  savePanelSize(localStorage, id, w, h);
}

function pickupCard(cardId) {
  if (isSessionEnded) return;
  if (role === 'host') dispatch({ type: 'PICKUP', playerId: myId, cardId });
  else session.send({ type: 'action', action: { type: 'PICKUP', cardId } });
}

function moveCard(cardId, toZoneId, placement = {}) {
  if (isSessionEnded) return;
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
  if (isSessionEnded) return;
  const view = currentView();
  if (!view) return;
  if (view.myHand.some((c) => c.id === cardId)) {
    // D51 follow-up: this now actually matches the comment above it -
    // drag always plays public, same as a plain tap. "Play hidden" is
    // its own explicit action (the hand card's hover row), never
    // reachable by dragging.
    playCard(cardId, 'public', targetZoneId, placement);
    return;
  }
  // UX follow-up (direct user request): the hand pile is a real,
  // addressable zone now (`view.zones`), so a table card dropped onto
  // it needs PICKUP's own semantics (strips owner/faceUp/layout), not a
  // generic MOVE_CARD - dropping this into the plain `moveCard` branch
  // would leave those table-only fields sitting on a card that's
  // supposed to be a plain hand card.
  const targetZone = view.zones.find((z) => z.id === targetZoneId);
  if (targetZone?.kind === 'hand' && targetZone.ownerId === myId) {
    pickupCard(cardId);
    return;
  }
  moveCard(cardId, targetZoneId, placement);
}

// UX follow-up (direct user request): the Add Zone control (name input,
// kind selector, button, its transient error text) is removed from the
// bottom of the screen. CREATE_ZONE stays a real, dispatchable,
// fully-tested reducer action - only this manual UI entry point is gone.

// Sprint 12 (T56.1): named so the deck's pile anchor calls the same
// implementation the legacy shuffle/split buttons did.
function performShuffle() {
  if (isSessionEnded) return;
  dispatch({ type: 'SHUFFLE_DECK' });
}
// UX follow-up (direct user request): "just make the split action
// always split in half. One split should result in 2 piles." No count
// to choose any more - always exactly 2.
const SPLIT_PILE_COUNT = 2;
function performSplit() {
  if (isSessionEnded) return;
  try {
    dispatch({ type: 'SPLIT_DECK', pileCount: SPLIT_PILE_COUNT });
  } catch (error) {
    // Nielsen #9: say what went wrong and what would work, in the same
    // place the action was taken - not a silent no-op.
    globalThis.alert(error.message);
  }
}
// Sprint 12 (D34/D35/D36, T54.1): named so the deck's pile anchor - both
// its click/tap shortcut and its drag-onto-hand drop - calls the same
// implementation the legacy button did, rather than a second one.
function performDraw() {
  if (isSessionEnded) return;
  if (role === 'host') dispatch({ type: 'DRAW', playerId: myId });
  else session.send({ type: 'action', action: { type: 'DRAW' } });
}

// Sprint 23 (US-60/61/62, Phase 70): unlike `performSplit`/`performDraw`
// above (the DECK's own actions), these act on a `zone`/`discard` pile
// named by `pileId`, open to any player (owner or a shared pile) - so
// they need the same host-local/guest-relay branch `performDraw`/
// `togglePass` already use, not `performSplit`'s bare host-only
// `dispatch` (a zone/discard action can come from a GUEST). Wrapped in
// try/catch + `window.alert` on the host-local path, same Nielsen #9
// precedent as `performSplit` - the reducer's authorization/eligibility
// throws would otherwise run silently off the click handler.
function performSplitPile(pileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'SPLIT_PILE', playerId: myId, pileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'SPLIT_PILE', pileId } });
}

function performTakePile(pileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'TAKE_PILE', playerId: myId, pileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'TAKE_PILE', pileId } });
}

function performSetPileOrientation(pileId, faceUp) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'SET_PILE_ORIENTATION', playerId: myId, pileId, faceUp }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'SET_PILE_ORIENTATION', pileId, faceUp } });
}

// *nit (2026-08-26): rename, any player - same dispatch shape as every
// other pile-affecting action above. `window.alert` on failure matches
// `performSplitPile`/`performTakePile`'s own precedent for a reducer
// throw the UI itself can't prevent in advance (here: a concurrent
// delete of the pile/zone between the dblclick and the commit).
function performRenamePile(pileId, name) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'RENAME_PILE', playerId: myId, pileId, name }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'RENAME_PILE', pileId, name } });
}

function performRenameZone(zoneId, name) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'RENAME_ZONE', playerId: myId, zoneId, name }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'RENAME_ZONE', zoneId, name } });
}

// (bloop: piles/zones/cards are all Movable) - reparent a pile
// (`targetZoneId: null` ungroups into a fresh standalone Zone, D55's
// existing design). Same dispatch shape as every other pile-affecting
// action above.
function performMovePile(pileId, targetZoneId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'MOVE_PILE', playerId: myId, pileId, targetZoneId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'MOVE_PILE', pileId, targetZoneId } });
}

// *nit (2026-08-26): reorder a pile among its own zone's siblings -
// same dispatch shape as every other pile-affecting action, purely
// cosmetic (no authorization beyond "these two piles share a zone",
// which the reducer itself re-checks).
function performReorderPile(pileId, beforePileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'REORDER_PILE', playerId: myId, pileId, beforePileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'REORDER_PILE', pileId, beforePileId } });
}


// A card dropped on a Zone's own empty space spawns a brand-new pile
// there, seeded with that card - one atomic dispatch (`CREATE_PILE`,
// `state.js`) rather than create-then-move as two separate actions,
// which would race a guest's own relayed send against the host's
// broadcast of the intermediate state.
function performCreatePileWithCard(cardId, zoneId) {
  if (isSessionEnded) return;
  const view = currentView();
  if (!view) return;
  // Same hand-vs-table source distinction `dropCardOnZone` already
  // makes - `state.js`'s own `CREATE_PILE` case re-derives it too
  // (never trusts the client alone for the PLAY-vs-MOVE authorization
  // shape), this just needs to know which existing pile to remove the
  // card FROM.
  const fromPileId = view.myHand.some((c) => c.id === cardId)
    ? view.zones.find((z) => z.kind === 'hand' && z.ownerId === myId)?.id
    : view.zones.find((z) => z.cards.some((c) => c.id === cardId))?.id;
  if (!fromPileId) return;
  if (role === 'host') {
    try { dispatch({ type: 'CREATE_PILE', playerId: myId, zoneId, fromPileId, cardId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'CREATE_PILE', zoneId, fromPileId, cardId } });
}

// D35/D51 (both drop behaviors): Draw's action-token drop is
// `zoneOpts.onPileActionDrop` above; a dragged table card landing on the
// hand pile is `dropCardOnZone`'s own kind==='hand' check - both
// generic, handled by whichever zone-panel the drop actually lands on,
// not a bespoke listener on a dedicated hand element any more.

// NOTE (flagged, not yet done): hand sort (US-23, D14) had no UI trigger
// left once the merged own-zone panel (and its always-visible Sort/Pass
// buttons) was retired for the plain seat-zone pile - `handOrder.js`
// (`reconcileOrder`/`sortByRank`/`sortBySuit`) is unused by `main.js` now,
// not deleted, since restoring pile-level action buttons generically
// (matching `pileLevelActions`) is exactly the kind of follow-up this
// pass deferred.

// --- Deal More (US-24): host-only, adds to existing hands without a
// reset. Deliberately a different label/section/style than "Deal &
// Start" so a mid-game host can't mis-tap into a reset (Smith Gate 1). ---
/** Remembers the host's last deal count so a re-render doesn't reset an
 *  input the host already typed into - `renderZones`/`<deck-stack>`
 *  rebuild the deck pile wholesale on every state broadcast. Split has
 *  no count of its own any more (`SPLIT_PILE_COUNT`, always 2). */
let lastDealCount = 1;

/**
 * US-41/D29, Phase 56 (T56.1): every deck pile-level action - the deck's
 * pile anchor is the ONE thing that calls this now, having absorbed
 * both the legacy strip's deal/reshuffleDeal and the legacy shuffle/
 * split row. "Reshuffle & deal" is RESET then DEAL - two existing
 * dispatches rather than a third code path that could drift from
 * either.
 */
function dealFromDeck(action, count) {
  if (isSessionEnded) return;
  if (action === 'draw') return performDraw();
  if (action === 'shuffle') return performShuffle();
  if (action === 'split') return performSplit();
  lastDealCount = count;
  try {
    if (action === 'reshuffleDeal') {
      dispatch({ type: 'RESET' });
      dispatch({ type: 'DEAL', cardsPerPlayer: count });
    } else {
      dispatch({ type: 'DEAL_MORE', cardsPerPlayer: count });
    }
  } catch (error) {
    // US-41 AC: "fail the way it already does - a clear message, no
    // partial deal". It did NOT already do that: the reducer's throw ran
    // straight out of the click handler as an uncaught error, so the host
    // saw nothing at all. Only visible now because moving the control
    // somewhere reachable made it easy to hit.
    showDeckError(error.message);
  }
}

/**
Transient, beside the deck - where the click that caused it happened.
*/
function showDeckError(message) {
  const element = document.querySelector('#deck-error');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(showDeckError.timer);
  showDeckError.timer = setTimeout(() => { element.hidden = true; }, 4000);
}

// --- Pass marker (US-25): self-toggle only, like US-13's precedent. ---
function togglePass() {
  if (isSessionEnded) return;
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
    setTimeout(() => removeRemoteCursor(gameScreenElement, playerId), MOTION_TTL_MS),
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
    setTimeout(() => removeCardDragGhost(gameScreenElement, playerId), MOTION_TTL_MS),
  );
}

// US-29/D19: broadcasts live position while dragging, extending D13's
// existing throttled channel with one new kind. `card: null` is the
// dragend "stopped" signal (see renderZoneCards' dragend handlers,
// which now cover the hand's cards too) - sent as `active: false` so
// receivers clear the ghost
// promptly instead of waiting out the full TTL after a normal drop.
function broadcastCardDrag(card, clientX, clientY) {
  if (!card) {
    motionThrottler.schedule('card-drag', { cardId: null, x: 0, y: 0, active: false });
    return;
  }
  const rect = gameScreenElement.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  motionThrottler.schedule('card-drag', { ...cardDragPayload(card, x, y), active: true });
}

function applyIncomingMotion(playerId, message) {
  switch (message.kind) {
  case 'hand': {
    markMoving(playerId, message.data.active);
    renderRosterOnly();
  
  break;
  }
  case 'cursor': {
    if (playerId === myId) return; // never render my own cursor back at me
    updateRemoteCursor(gameScreenElement, playerId, resolvePlayerName(playerId), message.data.x, message.data.y);
    markCursorStale(playerId);
  
  break;
  }
  case 'card-lift': {
    setCardLifted(message.data.cardId, message.data.active);
  
  break;
  }
  case 'card-drag': {
    if (playerId === myId) return; // never render my own drag ghost back at me
    if (!message.data.active) {
      clearTimeout(cardDragTimers.get(playerId));
      removeCardDragGhost(gameScreenElement, playerId);
      return;
    }
    const card = message.data.cardId ? resolveVisibleCard(message.data.cardId) : null;
    updateCardDragGhost(gameScreenElement, playerId, card, message.data.x, message.data.y);
    markCardDragStale(playerId);
  
  break;
  }
  // No default
  }
}

function relayMotion(fromPeerId, message) {
  // D27: motion arrives addressed by peer id but is *labelled* by
  // identity - the cue says who is moving, and "who" survives a
  // reconnect while a peer id does not.
  const fromKey = peerToKey.get(fromPeerId) ?? fromPeerId;
  for (const player of gameState.players) {
    if (player.id === fromKey || player.id === myId) continue;
    const peerId = peerFor(player.id, peerToKey);
    if (peerId) session.sendTo(peerId, { ...message, fromId: fromKey });
  }
}

setInterval(() => {
  if (!session || isSessionEnded) return;
  for (const { key, data } of motionThrottler.drain()) {
    const message = makeMotionMessage(key, data);
    applyIncomingMotion(myId, message);
    if (role === 'host') relayMotion(myId, message);
    else session.send(message);
  }
}, MOTION_FLUSH_MS);

// --- Deep link + resume (?join=<hostId>, or the table we were last in) ---
// Runs at the very end of the module: it can *click* the join button, so
// every handler it depends on must already be attached.
(function resumeOrDeepLink() {
  const parameters = new URLSearchParams(globalThis.location.search);
  const remembered = recallSession(localStorage);
  const code = parameters.get('join') || remembered?.code;
  if (!code) return;

  document.querySelector('#join-code').value = code;
  if (remembered?.name) document.querySelector('#join-name').value = remembered.name;
  showScreen(screens, 'join');

  // US-39: auto-rejoin only when returning to a table we were already in
  // (we know its code *and* our name there). A bare shared ?join= link
  // still waits for a name, so it never signs someone in as whoever last
  // used this browser.
  if (remembered && remembered.code === code && remembered.name) {
    document.querySelector('#join-status').textContent = 'Rejoining your table...';
    document.querySelector('#join-btn').click();
  }
})();
