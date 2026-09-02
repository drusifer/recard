import { Session } from './session.js';
import { createInitialState, reduce, viewFor, DECK_PILE_ID } from './state.js';
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
import { seatedOrder } from './seating.js';
import { save as saveGame, load as loadGame, clear as clearGame, describeAge, expectedReturners } from './persistence.js';
import { CLIENT_KEY_STORAGE, resolvePlayer, peerFor, rememberSession, recallSession, forgetSession } from './identity.js';
import { loadPanelLayout, savePanelPosition, savePanelSize, applyPresetLayout } from './panelLayout.js';
import { saveLayoutOverride, deleteLayoutOverride, overridesForPreset, stableLayoutSubset } from './layoutOverrides.js';
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
zonesElement.addEventListener('dragover', (event) => event.preventDefault());
zonesElement.addEventListener('drop', (event) => {
  event.preventDefault();
  const pileId = pileDragFromDrop(event.dataTransfer);
  if (pileId) performMovePile(pileId, null);
});
// *nit (2026-08-27), direct user request ("save space"): one
// consolidated Score panel for every seated player, not one whole panel
// per player - a single fixed id is enough again, same as before the
// short-lived per-player-panel design it replaces.
const SCORE_PANEL_ID = 'score';
// Every id `deckPile.pileActions` can ever offer - `zoneOpts.onPileAction`
// (below) uses this to route a click to `dealFromDeck` instead of the
// hand's `pass`, without needing to know which pile kind is asking.
const DECK_ACTION_IDS = new Set(['draw', 'deal', 'reshuffleDeal', 'shuffle']);
let role = null; // 'host' | 'join'
let session = null;
let myId = null;
let myName = '';
let gameState = null; // authoritative, host only
let latestView = null; // last view received from host, join only
let isSessionEnded = false;

// *fix (direct user report: rejoining as the "joiner" left them looking
// at their own hand as if it were an opponent's). A guest's tab simply
// closing (not a real network drop) leaves the host's transport with no
// clean signal at all - PeerJS/WebRTC's own disconnect DETECTION can take
// far longer than a quick reload/rejoin does, so the host still thinks
// the old connection is live when the new one presents the same identity,
// and `resolvePlayer`'s anti-hijack guard (identity.js, working exactly
// as designed) mints a brand-new, empty one instead of resuming the real
// one. `session.close()` already tears the peer down cleanly (used by the
// join-retry loop) - just never got called on an ordinary tab close.
// One listener for the page's lifetime, reading `session`/`role` live
// (not captured), since both get reassigned across reconnect attempts.
globalThis.addEventListener('beforeunload', () => {
  if (role === 'join') session?.close();
});
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
  // US-83: TOTAL per kind, not one clause per declaration. A preset that
  // declares each pile separately (Recard the Gathering lists fourteen
  // decks by name so each gets its own deck list) previously rendered as
  // "1 deck + 1 deck + 1 deck + ..." fourteen times - technically
  // accurate and completely unreadable. Grouping is what the host
  // actually wants to know: how many of each thing is on the table.
  const totals = new Map();
  for (const { kind, ownerId, count = 1 } of pileDeclarations) {
    const key = `${kind}|${ownerId === 'perPlayer' ? 'perPlayer' : 'shared'}`;
    totals.set(key, (totals.get(key) ?? 0) + count);
  }
  const parts = [];
  for (const [key, count] of totals) {
    const [kind, scope] = key.split('|', 2);
    const word = count === 1 ? kind : `${kind}s`;
    parts.push(scope === 'perPlayer' ? `${count} ${word}/player` : `${count} ${word}`);
  }
  return parts.join(' + ');
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
const layoutSelect = document.querySelector('#host-layout');

// US-70 (D61): repopulate the Layout picker with every saved override
// recorded against THIS preset's name - `overridesForPreset` already
// does the filtering, so a save made under "War" never appears while
// "Solitaire" is selected.
function refreshLayoutOptions(presetName) {
  layoutSelect.replaceChildren();
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default';
  layoutSelect.append(defaultOption);
  for (const override of overridesForPreset(localStorage, presetName)) {
    const opt = document.createElement('option');
    opt.value = override.name;
    opt.textContent = override.name;
    layoutSelect.append(opt);
  }
  layoutSelect.value = '';
}

// Direct user request: "every game should ONLY be based on preset" - the
// dropdown always names a real preset now (no "Custom" option), so this
// runs both on every host change AND once at load to seed the read-only
// preview for whichever preset is selected first.
function onPresetSelected() {
  const preset = PRESETS.find((p) => p.name === presetSelect.value);
  selectedPreset = preset;
  refreshLayoutOptions(preset.name);
  const previewElement = document.querySelector('#host-preset-preview');
  const cardsWord = preset.cardsPerPlayer === 1 ? 'card' : 'cards';
  // D53 (Smith Gate 2): a preset that declares a starting table layout
  // says so in the preview too - the host sees what they're getting
  // before clicking Create Table, not only after.
  const zonesText = describeConfiguredZones(preset.piles);
  previewElement.textContent = `${describeDeckConfig(preset)}, ${preset.cardsPerPlayer} ${cardsWord}/player`
    + (zonesText ? ` — table: ${zonesText}` : '');
}
presetSelect.addEventListener('change', onPresetSelected);
onPresetSelected();

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
gameScreenElement.addEventListener('pointermove', (event) => {
  if (!isPointerActive || isSessionEnded) return;
  const rect = gameScreenElement.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
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
  // *fix (direct user report: rejoining as the "joiner" left them looking
  // at their OWN hand as if it were an opponent's, labeled with a name
  // that wasn't "You"). Root cause, confirmed live (held for 25s and
  // never resolved on its own): PeerJS/WebRTC's own disconnect detection
  // is unreliable enough that an abruptly closed tab's connection can
  // still look "connected" indefinitely. `identity.js`'s `resolvePlayer`
  // no longer refuses a returning key just because some OTHER peer id
  // still maps to it (direct user decision, weighing this against the
  // original anti-hijack intent: false-positived on ordinary reconnects
  // far more often than it ever caught a real second tab) - the loop
  // below actively evicts that other connection instead once it does.
  //
  // The two passes just below are `peerToKey`/`identityAnnounced` hygiene,
  // independent of the above: a peer that vanishes without ever producing
  // a `disconnected` roster entry would otherwise leak its mapping
  // forever, and a `disconnected` entry sharing the same roster snapshot
  // as a reconnecting one needs to be cleaned up before anything else
  // resolves this tick, regardless of the roster's own array order.
  const currentIds = new Set(transportRoster.map((r) => r.id));
  for (const id of peerToKey.keys()) if (!currentIds.has(id)) forgetPeer(id);
  for (const r of transportRoster) if (r.connection === 'disconnected') forgetPeer(r.id);
  for (const r of transportRoster) {
    if (r.connection === 'disconnected') continue;

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
      const resolved = resolvePlayer(r.playerKey, gameState.players);
      key = resolved.playerKey;
      // A returning key always reclaims its seat now (identity.js's own
      // comment) - if some OTHER peer id still holds it (a stale
      // connection the transport hasn't reported as closed yet), evict
      // that one for real rather than letting two peers share one key:
      // `closePeer` tears down its underlying connection (no leak) and
      // its own `close` handler drives the roster event that cleans up
      // `peerToKey` for it the normal way.
      for (const [otherId, otherKey] of peerToKey) {
        if (otherKey === key && otherId !== r.id) session.closePeer(otherId);
      }
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
  // D92: the preset's own starting deck, if it declares one
  // (`gameConfig.tableZone`) - RTG opts out entirely and deals 0 cards
  // to start, so `DEAL` finding no pile at this id is expected, not an
  // error (see `DEAL`'s own comment, state.js).
  dispatch({ type: 'DEAL', cardsPerPlayer, pileId: DECK_PILE_ID });
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
  // Direct user request: "every game should ONLY be based on preset" -
  // `deckConfig` is read entirely off the selected preset now (the
  // module-level `selectedPreset`, kept in sync by `onPresetSelected`),
  // never from a manual host control. This is also the fix for a real
  // bug that hiding-the-numDecks-control only papered over: `gameConfig`
  // below never actually forwarded a preset's own `tableZone` at all -
  // RTG's `tableZone: false` (state.js) was silently ignored at table
  // creation, so a real RTG table still got the default Deck/Table Zone
  // panels this whole thread exists to remove.
  const deckConfig = {
    type: selectedPreset.type ?? 'standard',
    numDecks: selectedPreset.numDecks,
    jokers: selectedPreset.jokers,
    ...(selectedPreset.deckList && { deckList: selectedPreset.deckList }),
  };
  // D46: GameConfig's first real field. D53: `piles` (renamed from
  // `zones` - D55, that name now belongs to the real Zone-entity list)
  // comes from the selected preset. `zones` carries any Zone entities
  // the preset itself declares (e.g. none today reach beyond the
  // always-present Table Zone - Gin Rummy's discard only ever references
  // it, never declares a new one).
  const gameConfig = {
    allowsPlayerZones: document.querySelector('#host-allow-player-zones').checked,
    tableZone: selectedPreset.tableZone ?? true,
    piles: selectedPreset.piles ?? [],
    zones: selectedPreset.zones ?? [],
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
    // *nit (direct user request, "make sure that number is initialized
    // from the preset"): the deck's OWN persistent deal-count input
    // (`lastDealCount`, its later Deal/Reshuffle&Deal clicks) was
    // always hardcoded to 1 regardless of preset - same value the
    // initial-deal `#cards-per-player` field above gets, so re-dealing
    // later defaults to the preset's own hand size instead of silently
    // resetting to 1.
    lastDealCount = selectedPreset.cardsPerPlayer;
    // UX follow-up (direct user request): "update the preset to use
    // this layout... and preset the layouts for the other games too" -
    // a preset's own `layout` (its shared, deterministically-id'd
    // panels only - never a per-player one) seeds this browser's local
    // panel arrangement (`panelLayout.js`) the moment its table is
    // actually created, not merely previewed in the dropdown.
    //
    // US-70 (D61): the "Layout" picker's choice, when it names a saved
    // override, takes over from the preset's own built-in `layout`
    // here - same `applyPresetLayout` call, just a different source
    // object. Falls back to the built-in default when "Default" (empty
    // value) is selected, or nothing was ever saved for this preset.
    const chosenOverrideName = layoutSelect.value;
    const chosenOverride = chosenOverrideName
      ? overridesForPreset(localStorage, selectedPreset.name).find((o) => o.name === chosenOverrideName)
      : null;
    applyPresetLayout(localStorage, chosenOverride?.layout ?? selectedPreset.layout);
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

// *nit (2026-08-27), direct user request: "update the score by typing it
// in" - same host-authoritative/guest-relays shape as every other
// dispatch here (`adjustScore` above, `performCreatePileWithCard`, ...).
function setScore(targetPlayerId, value) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'SET_SCORE', targetPlayerId, value }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'SET_SCORE', targetPlayerId, value } });
}

/**
 * *nit (2026-08-27), direct user request: "save space" - one
 * `<score-zone>` for every seated player with a score entry, instead of
 * one whole panel per player. `seated` (`seatedOrder`) both orders the
 * rows and supplies the viewer-relative "You" label, same as everywhere
 * else a seat list is used. `options.onAdjust`/`onSet` being absent
 * (session ended, or the frozen post-session re-render) renders the same
 * inert panel `renderZonePanel`'s own action-less case already does -
 * no separate "disabled" branch to keep in sync.
 */
function renderScoreZone(container, seated, scores, options) {
  const players = seated
    .filter((p) => scores?.[p.id] !== undefined)
    .map((p) => ({ id: p.id, name: p.id === myId ? 'You' : p.name, score: scores[p.id] }));
  if (players.length === 0) return;
  const scoreElement = document.createElement('score-zone');
  container.append(scoreElement);
  scoreElement.render(players, options);
  wirePanelLayout(scoreElement, SCORE_PANEL_ID, scoreElement.querySelector('.panel-title'), options);
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

// Free the seat's address but keep the player (and their hand) in state,
// so the key they hold can bring them back to it.
function forgetPeer(id) {
  const key = peerToKey.get(id);
  peerToKey.delete(id);
  identityAnnounced.delete(id);
  if (key) gameState = reduce(gameState, { type: 'SET_CONNECTION', playerId: key, connection: 'disconnected' });
}

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

document.querySelector('#join-btn').addEventListener('click', async () => {
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
  try {
    myId = await session.ready();
    // US-39: remember where we were, so a reload rejoins the game in
    // progress instead of dropping us on an empty form.
    rememberSession(localStorage, { code: hostId, name: myName });
    showGameCode(hostId);
    statusElement.textContent = 'Connected. Waiting for host to deal...';
  } catch {
    statusElement.textContent = 'Could not connect. Check the code and try again.';
  }

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
      // *nit (direct user request: "my hand is obscured and shows
      // [the host's] name instead of You"): a `state` broadcast can
      // legitimately race ahead of this `identity` message (both travel
      // over the same connection, but from separate host-side code
      // paths) - if it does, `renderGameFromView` runs once with the
      // OLD `myId`, every `pile.ownerId === myId` check (own-hand
      // visibility, the "You" zone title) comes out wrong, and nothing
      // re-renders again until some unrelated future game action -
      // same "re-render the cached view after a local-only change"
      // pattern `finishRestore` already uses, above.
      if (latestView) renderGameFromView(latestView);
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
    // Pile" - the deck is a real pile in `latestView.piles` now, so this
    // one `renderZones` call renders it too (grouped into the Table
    // Zone, inert - `frozenOpts` has no `isHost`/`onPileAction`, so
    // `pileLevelActions('deck', {isHost: false})` offers only `draw`,
    // and even that has nothing to dispatch to), matching every other
    // control in this frozen re-render. No separate `<deck-zone>`
    // element to build here any more.
    renderZones(zonesElement, latestView.piles, seatedOrder(latestView.players, myId), latestView.zones, frozenOptions);
    // Same inert Score panel the live render builds (every seated
    // player with a score, one consolidated panel), just no
    // adjust/set wiring - the session is over.
    const frozenSeated = seatedOrder(latestView.players, myId);
    renderScoreZone(zonesElement, frozenSeated, latestView.scores, {});
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
  };
  const hostRosterElement = document.querySelector('#host-roster');
  if (hostRosterElement) {
    renderRoster(hostRosterElement, players, options);
    // No control strip here (Smith Gate 2 #2): this screen already has
    // "Deal & Start", and two adjacent deal controls with different
    // semantics is worse than the one badly-placed control we started with.
    // D94: `view.deckCount` (a bespoke top-level field `viewFor` used to
    // maintain just for this one screen) is gone - derived straight from
    // `view.piles` instead, same as everything else reads a deck's size
    // (`pile.count ?? pile.cards.length`). `0` for a preset with no
    // starting deck (RTG, `gameConfig.tableZone: false`) - no such pile
    // to find, same as before.
    const deckPileView = view.piles.find((p) => p.id === DECK_PILE_ID);
    renderDeckStack(document.querySelector('#host-deck-area'), deckPileView?.count ?? deckPileView?.cards.length ?? 0);
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

// US-69/70 (D61): host-only - a saved override is keyed to the preset
// THIS table was created with, which only the host's own
// `selectedPreset` knows (presets/GameConfig.piles/zones are already
// host-only concepts in this codebase, not part of replicated state).
function updateLayoutControlsVisibility() {
  document.querySelector('#layout-controls').hidden = role !== 'host' || !selectedPreset;
}

function performSaveLayout() {
  if (role !== 'host' || !selectedPreset) return;
  const layout = stableLayoutSubset(loadPanelLayout(localStorage), gameState.gameConfig);
  saveLayoutOverride(localStorage, selectedPreset.name, selectedPreset.name, layout);
  globalThis.alert(`Layout saved as "${selectedPreset.name}".`);
}

function performSaveLayoutAs() {
  if (role !== 'host' || !selectedPreset) return;
  const name = globalThis.prompt('Save layout as:', selectedPreset.name)?.trim();
  if (!name) return;
  const existing = overridesForPreset(localStorage, selectedPreset.name).some((o) => o.name === name);
  if (existing && !globalThis.confirm(`"${name}" already exists. Overwrite it?`)) return;
  const layout = stableLayoutSubset(loadPanelLayout(localStorage), gameState.gameConfig);
  saveLayoutOverride(localStorage, name, selectedPreset.name, layout);
  globalThis.alert(`Layout saved as "${name}".`);
}

function performResetLayout() {
  if (role !== 'host' || !selectedPreset) return;
  if (!globalThis.confirm(`Reset "${selectedPreset.name}" to its built-in default layout? This only affects new games, not this table.`)) return;
  deleteLayoutOverride(localStorage, selectedPreset.name);
  globalThis.alert(`"${selectedPreset.name}" reset to its built-in default.`);
}

document.querySelector('#save-layout-btn').addEventListener('click', performSaveLayout);
document.querySelector('#save-layout-as-btn').addEventListener('click', performSaveLayoutAs);
document.querySelector('#reset-layout-btn').addEventListener('click', performResetLayout);

/**
 * Every pile-level action button dispatches through here (`renderPile`,
 * ui.js, one callback regardless of which pile kind offered the
 * action). A plain top-level function, not inlined in `renderGameFromView`
 * - keeps that already-large function's own complexity from absorbing
 * every branch of what is really a separate, self-contained dispatch
 * table. Every deck action (`dealFromDeck` already handles draw/deal/
 * reshuffleDeal/shuffle generically) is the one real dispatch table
 * beyond this. `pass` was removed outright (direct user request, "not a
 * requirement") - see its own git history for the full removal
 * (TOGGLE_PASS, `state.passed`, the roster's Passed tag).
 */
function handlePileAction(pileId, actionId, value) {
  // D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"):
  // no `pile.kind === 'deck'` gate here any more - `DECK_ACTION_IDS`
  // membership already uniquely identifies these four action ids
  // (`DeckPile.pileActions()` is what decides which pile kind's header
  // offers them in the first place), and the pileId itself is what
  // `dealFromDeck` targets now, not an assumed singleton.
  if (DECK_ACTION_IDS.has(actionId)) return dealFromDeck(pileId, actionId, lastDealCount);
  if (actionId === 'take') return performTakePile(pileId);
  if (actionId === 'hide') return performSetPileOrientation(pileId, false);
  if (actionId === 'show') return performSetPileOrientation(pileId, true);
  if (actionId === 'remove') return performRemovePile(pileId);
  if (actionId === 'untapAll') return performUntapAll(pileId);
  if (actionId === 'sortRank') return performSortPile(pileId, 'rank');
  if (actionId === 'sortSuit') return performSortPile(pileId, 'suit');
  // D92 (direct user request: "split should always fan the pile to
  // allow the guided picker" - deck included, no kind branch here at
  // all any more).
  if (actionId === 'split') return toggleSplitPicker(pileId);
  // *nit (direct user request): a real menu now (`ui.js`'s
  // `buildEnumActionMenu`) picks the target kind directly - `value` is
  // that choice, forwarded straight through. Replaces the old "advance
  // to the next kind in CHANGE_PILE_TYPE_CYCLE" cycling math (D71/
  // US-74) entirely; a menu makes "which kind is next" moot; a viewer
  // picks the one they want.
  if (actionId === 'changePileType') return performChangePileType(pileId, value);
}

function renderGameFromView(view) {
  updateLayoutControlsVisibility();
  const nameById = new Map(view.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));

  // UX follow-up (direct user request): "get rid of seat panel and
  // replace with a reg zone with a handpile" - the hand is a real
  // `hand`-kind pile now (`state.js`), rendered through the exact same
  // generic `renderPileCards`/`actionMenuEl` machinery as any other
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
    onMoveCard: (cardId, toPileId) => moveCard(cardId, toPileId),
    onCardLift: (cardId, active) => motionThrottler.schedule('card-lift', { cardId, active }),
    onDropCard: (cardId, toPileId, placement) => dropCardOnPile(cardId, toPileId, placement),
    // D91: `renderPile` (ui.js) checks `splitPicker?.pileId === pile.id`
    // to switch that one pile into the picker row; `onSplitCommit` is
    // only ever called FROM that row (a click on a chosen gap), so it
    // doesn't need its own pileId param - `splitPicker.pileId` already
    // says which pile.
    splitPicker,
    onSplitCommit: isSessionEnded ? null : (index) => performSplitCommit(index),
    // UX follow-up (direct user request): "like zones, Piles are
    // Actionable and should have a title bar with action buttons for
    // that pile type" - every pile's heading is a real action header now
    // (`renderPile`, `ui.js`). Dispatch table itself is `handlePileAction`
    // above (its own doc comment has the rest).
    onPileAction: isSessionEnded ? null : (pileId, actionId, value) => handlePileAction(pileId, actionId, value),
    // *nit (2026-08-26): "allow user to rename zones and piles - any
    // user can edit - persisted by host." Same `sessionEnded` gate
    // every other dispatching handler in this object already uses.
    onRenamePile: isSessionEnded ? null : (pileId, name) => performRenamePile(pileId, name),
    onRenameZone: isSessionEnded ? null : (zoneId, name) => performRenameZone(zoneId, name),
    onRemoveZone: isSessionEnded ? null : (zoneId) => performRemoveZone(zoneId),
    // (bloop: piles/zones/cards are all Movable)
    onMovePile: isSessionEnded ? null : (pileId, targetZoneId) => performMovePile(pileId, targetZoneId),
    // (direct user request) - dropping a pile directly onto another pile
    // merges its cards into the target and removes it once empty, no
    // matter which zone either one is in ("remove the weird zone
    // distinction, KISS" - superseded the earlier same-zone-reorder
    // split; `REORDER_PILE`, state.js, is unused from the UI now but
    // left in place, not deleted - a real, tested, independently-useful
    // action, just without a live trigger since this was its only one).
    onMergePile: isSessionEnded ? null : (pileId, targetPileId) => performMergePile(pileId, targetPileId),
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
  // `view.piles` now (`state.js`'s `viewFor`), so this ONE call also
  // builds and groups it into the Table Zone, exactly like Table/
  // Discard - no separate `<deck-zone>` element/property wiring needed
  // here any more (`<deck-stack>`, `src/components/DeckStack.js`, is
  // what `renderPile` uses for its row instead - see `zoneOpts.
  // dealCount`/`onDealCountChange` above for the one piece of deck-
  // specific state this file still owns: the Deal count input's value).
  renderZones(zonesElement, view.piles, seatedOrder(view.players, myId), view.zones, zoneOptions);
  // *nit (2026-08-27), direct user request: "save space" - ONE
  // consolidated `<score-zone>` listing every seated player, instead of
  // one whole panel per player. No per-seat default position needed any
  // more either: a single panel with no fixed "belongs near this one
  // seat" relationship just joins the Table Zone in `#zones`'s own
  // normal flex-wrap flow (`wirePanelLayout` only applies an absolute
  // position from a REAL stored one - dragging it is still possible,
  // same as any other panel), the same default every shared/standalone
  // zone already gets - no more seat-ring math to fight for clearance.
  renderScoreZone(zonesElement, seatedOrder(view.players, myId), view.scores, {
    onAdjust: isSessionEnded ? null : adjustScore,
    onSet: isSessionEnded ? null : setScore,
    ...zoneOptions,
  });
  renderRosterOnly();
}

function playCard(cardId, visibility, pileId, placement = {}) {
  if (isSessionEnded) return;
  const { targetCardId, side, layout } = placement;
  if (role === 'host') dispatch({ type: 'PLAY', playerId: myId, cardId, visibility, pileId, targetCardId, side, layout });
  else session.send({ type: 'action', action: { type: 'PLAY', cardId, visibility, pileId, targetCardId, side, layout } });
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

function moveCard(cardId, toPileId, placement = {}) {
  if (isSessionEnded) return;
  const { targetCardId, side, layout } = placement;
  if (role === 'host') dispatch({ type: 'MOVE_CARD', playerId: myId, cardId, toPileId, targetCardId, side, layout });
  else session.send({ type: 'action', action: { type: 'MOVE_CARD', cardId, toPileId, targetCardId, side, layout } });
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
//
// A card dragged FROM hand is ALWAYS dispatched as PLAY, even when it's
// dropped back onto that same hand (a reorder) - `HandPile.cardActions`
// (`HandPile.js`) only ever offers `'play'` as a way to remove a card
// from hand, never `'move'`/`'pickup'`, so PLAY is the only authorized
// dispatch for ANY hand-sourced drag. A same-pile "play" not being a
// real play (no visibility change, no genuine card-leaves-hand game
// event) is PLAY's own concern to recognize, not this function's - see
// its `state.js` doc comment.
function dropCardOnPile(cardId, targetPileId, placement = {}) {
  if (isSessionEnded) return;
  const view = currentView();
  if (!view) return;
  if (view.myHand.some((c) => c.id === cardId)) {
    // D51 follow-up: this now actually matches the comment above it -
    // drag always plays public, same as a plain tap. "Play hidden" is
    // its own explicit action (the hand card's hover row), never
    // reachable by dragging.
    playCard(cardId, 'public', targetPileId, placement);
    return;
  }
  // UX follow-up (direct user request): the hand pile is a real,
  // addressable pile now (`view.piles`), so a table card dropped onto
  // it needs PICKUP's own semantics (strips owner/faceUp/layout), not a
  // generic MOVE_CARD - dropping this into the plain `moveCard` branch
  // would leave those table-only fields sitting on a card that's
  // supposed to be a plain hand card.
  const targetPile = view.piles.find((p) => p.id === targetPileId);
  if (targetPile?.kind === 'hand' && targetPile.ownerId === myId) {
    pickupCard(cardId);
    return;
  }
  moveCard(cardId, targetPileId, placement);
}

// UX follow-up (direct user request): the Add Zone control (name input,
// kind selector, button, its transient error text) is removed from the
// bottom of the screen. CREATE_ZONE stays a real, dispatchable,
// fully-tested reducer action - only this manual UI entry point is gone.

// Sprint 12 (T56.1): named so the deck's pile anchor calls the same
// implementation the legacy shuffle button did. D92 (direct user
// request, "THERE SHOULD BE NO CANONICAL PILES"): `pileId` is the real
// target now - no host/guest branch needed, `shuffle` is host-only at
// the offer layer (`DeckPile.pileActions`) already.
function performShuffle(pileId) {
  if (isSessionEnded) return;
  dispatch({ type: 'SHUFFLE_DECK', pileId });
}

// Sprint 12 (D34/D35/D36, T54.1): named so the deck's pile anchor - both
// its click/tap shortcut and its drag-onto-hand drop - calls the same
// implementation the legacy button did, rather than a second one. D92:
// `pileId` is the real target now, no hardcoded deck constant.
function performDraw(pileId) {
  if (isSessionEnded) return;
  if (role === 'host') dispatch({ type: 'DRAW', playerId: myId, pileId });
  else session.send({ type: 'action', action: { type: 'DRAW', pileId } });
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
// `performTakePile`'s own precedent for a reducer throw the UI itself
// can't prevent in advance (here: a concurrent delete of the pile/zone
// between the dblclick and the commit).
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

// US-71/72/73 (D62/D63): same host-local/guest-relay + try/catch +
// `window.alert` precedent as every pile/zone action above - the
// reducer's empty-only/exemption throws are the real gate, this is
// just how they reach the user (Gate 1 Nielsen #9).
function performRemovePile(pileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'REMOVE_PILE', playerId: myId, pileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'REMOVE_PILE', pileId } });
}

function performRemoveZone(zoneId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'REMOVE_ZONE', playerId: myId, zoneId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'REMOVE_ZONE', zoneId } });
}

// D79 (US-82): the untap step. Same host-authoritative / guest-relay
// dispatch shape as every other pile action here.
function performUntapAll(pileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'UNTAP_ALL', playerId: myId, pileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'UNTAP_ALL', pileId } });
}

// D91: same dispatch shape as every other pile action here - `by` is
// forwarded straight through to `SORT_PILE` (state.js), which does the
// actual rank/suit ordering.
function performSortPile(pileId, by) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'SORT_PILE', playerId: myId, pileId, by }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'SORT_PILE', pileId, by } });
}

// D91: commits the Split picker (`splitPicker`, above) at the gap the
// player clicked - always `SPLIT_PILE`. Clears the picker either way,
// success or a reducer throw (Cancel-by-closing is already free via
// the button toggle in `handlePileAction`; a FAILED commit shouldn't
// leave the row stuck open on a picker the player just acted on).
function performSplitCommit(index) {
  if (isSessionEnded || !splitPicker) return;
  const { pileId } = splitPicker;
  splitPicker = null;
  if (role === 'host') {
    try { dispatch({ type: 'SPLIT_PILE', playerId: myId, pileId, index }); }
    catch (error) { globalThis.alert(error.message); rerender(); }
  } else session.send({ type: 'action', action: { type: 'SPLIT_PILE', pileId, index } });
}

function performChangePileType(pileId, kind) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'CHANGE_PILE_TYPE', playerId: myId, pileId, kind }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'CHANGE_PILE_TYPE', pileId, kind } });
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

// (direct user request) - "all piles can be dropped into any other
// pile... cards added to the target, dropped pile removed once empty."
// Same dispatch shape as every other pile-affecting action above.
function performMergePile(pileId, targetPileId) {
  if (isSessionEnded) return;
  if (role === 'host') {
    try { dispatch({ type: 'MERGE_PILE', playerId: myId, pileId, targetPileId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'MERGE_PILE', pileId, targetPileId } });
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
  // Same hand-vs-table source distinction `dropCardOnPile` already
  // makes - `state.js`'s own `CREATE_PILE` case re-derives it too
  // (never trusts the client alone for the PLAY-vs-MOVE authorization
  // shape), this just needs to know which existing pile to remove the
  // card FROM.
  const fromPileId = view.myHand.some((c) => c.id === cardId)
    ? view.piles.find((p) => p.kind === 'hand' && p.ownerId === myId)?.id
    : view.piles.find((p) => p.cards.some((c) => c.id === cardId))?.id;
  if (!fromPileId) return;
  if (role === 'host') {
    try { dispatch({ type: 'CREATE_PILE', playerId: myId, zoneId, fromPileId, cardId }); }
    catch (error) { globalThis.alert(error.message); }
  } else session.send({ type: 'action', action: { type: 'CREATE_PILE', zoneId, fromPileId, cardId } });
}

// D51/D67: a dragged table card (or, since D67, the deck's own exposed
// top card - same mechanism, no special case) landing on the hand pile
// is `dropCardOnPile`'s own kind==='hand' check - generic, handled by
// whichever zone-panel the drop actually lands on, not a bespoke
// listener on a dedicated hand element any more.

// --- Deal More (US-24): host-only, adds to existing hands without a
// reset. Deliberately a different label/section/style than "Deal &
// Start" so a mid-game host can't mis-tap into a reset (Smith Gate 1). ---
/** Remembers the host's last deal count so a re-render doesn't reset an
 *  input the host already typed into - `renderZones`/`<deck-stack>`
 *  rebuild the deck pile wholesale on every state broadcast.
 *
 *  *nit (direct user request, "fix the hand size default by including
 *  that in the preset data"): was hardcoded to `1`, disagreeing with
 *  `#cards-per-player`'s own hardcoded HTML default of `7` (index.html)
 *  - two magic numbers for the same concept, neither sourced from a
 *  preset. `selectedPreset` is already real by this point (`onPresetSelected()`
 *  ran synchronously at module load, above) - the initial default is
 *  just whichever preset the dropdown starts on, same source of truth
 *  `Create Table`'s own re-sync (below) already uses. */
let lastDealCount = selectedPreset.cardsPerPlayer;

// D91/D92 (direct user request, "we're missing... split pile" / "split
// should always fan the pile"): which pile (if any) is currently
// raised into the Split picker (`ui.js`'s `renderSplitPicker`, used by
// `<pile-panel>` AND `<deck-stack>` identically - no kind distinction)
// - real CLIENT-LOCAL UI state, same reasoning as `lastDealCount`
// above: this app tears down and rebuilds every pile's DOM on every
// broadcast, so a "stay raised until toggled off or committed" mode
// has nowhere else to live. Never sent to the reducer - only the
// eventual `SPLIT_PILE` dispatch (`performSplitCommit`, below) is a
// real state change.
let splitPicker = null; // { pileId: string } | null

/** Forces an immediate re-render off the CURRENT view for a purely
 * local UI-state change (the split picker opening/closing) that has no
 * server round trip to wait for - `currentView()` already handles the
 * host-vs-join split (`renderRosterOnly`'s own precedent). */
function rerender() {
  const view = currentView();
  if (view) renderGameFromView(view);
}

/** Opens (or, clicked again on the same pile, closes) the Split picker
 * for `pileId` - purely local, no dispatch. Switching to a DIFFERENT
 * pile's picker just replaces it outright, same "only one at a time"
 * simplification `lastDealCount` already makes for deal count. A plain
 * function rather than inlined in `handlePileAction` - keeps that
 * dispatcher a flat list of single-condition ifs, matching every other
 * entry in it. */
function toggleSplitPicker(pileId) {
  splitPicker = splitPicker?.pileId === pileId ? null : { pileId };
  rerender();
}

/**
 * US-41/D29, Phase 56 (T56.1): every deck pile-level action - the deck's
 * pile anchor is the ONE thing that calls this now, having absorbed
 * both the legacy strip's deal/reshuffleDeal and the legacy shuffle
 * row. "Reshuffle & deal" is RESET then DEAL - two existing dispatches
 * rather than a third code path that could drift from either.
 */
// D92 (direct user request, "THERE SHOULD BE NO CANONICAL PILES"):
// `pileId` is the specific pile whose header button was clicked -
// forwarded straight through for `draw`/`shuffle`/plain `deal`
// (`DEAL_MORE`). `reshuffleDeal` is the one real exception, and not a
// re-introduced canonical-pile assumption: `RESET` always rebuilds the
// preset's own starting deck at `DECK_PILE_ID` (its own declared
// contract, see state.js), wiping whatever pile structure existed
// before - the `DEAL` that follows targets THAT id, not the pile that
// was clicked, because after a reset that's genuinely where the fresh
// deck landed, full stop.
function dealFromDeck(pileId, action, count) {
  if (isSessionEnded) return;
  if (action === 'draw') return performDraw(pileId);
  if (action === 'shuffle') return performShuffle(pileId);
  lastDealCount = count;
  try {
    if (action === 'reshuffleDeal') {
      dispatch({ type: 'RESET' });
      dispatch({ type: 'DEAL', cardsPerPlayer: count, pileId: DECK_PILE_ID });
    } else {
      dispatch({ type: 'DEAL_MORE', cardsPerPlayer: count, pileId });
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
// only when public, and a public card always lives in a table-side
// pile, never a hand). Redacted placeholders (`card.faceDown: true`)
// have no rank/suit and are skipped - only a real, renderable card is
// ever returned.
function resolveVisibleCard(cardId) {
  const view = currentView();
  if (!view) return null;
  for (const pile of view.piles) {
    const card = pile.cards.find((c) => c.id === cardId);
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
// dragend "stopped" signal (see renderPileCards' dragend handlers,
// which now cover the hand's cards too) - sent as `active: false` so
// receivers clear the ghost
// promptly instead of waiting out the full TTL after a normal drop.
// *nit (D68, direct user request): "always use a coordinate relative
// to Player, remap relative to the player's position at the table" -
// every viewer renders every player's own hand pile somewhere
// (`data-pile-id="hand:<playerId>"`, `renderPileShell`), so it's a
// stable, always-present anchor - unlike an absolute screen fraction,
// which has no correct meaning across two viewers' genuinely
// independent, local `panelLayout.js` arrangements (D-numbered
// decision - each browser's own drag/resize history, never shared).
function playerAnchorRect(playerId) {
  const panel = gameScreenElement.querySelector(`[data-pile-id="hand:${CSS.escape(playerId)}"]`);
  return panel ? panel.getBoundingClientRect() : gameScreenElement.getBoundingClientRect();
}

function broadcastCardDrag(card, clientX, clientY) {
  if (!card) {
    motionThrottler.schedule('card-drag', { cardId: null, dx: 0, dy: 0, active: false });
    return;
  }
  const rect = gameScreenElement.getBoundingClientRect();
  const anchor = playerAnchorRect(myId);
  const originX = anchor.left + anchor.width / 2;
  const originY = anchor.top + anchor.height / 2;
  // Deliberately unclamped here - this is a pure offset from MY OWN
  // hand panel, not yet a renderable screen position. Clamping happens
  // once, on each receiver's own side, after re-anchoring against
  // THEIR rendering of my hand panel (`applyIncomingMotion` below).
  const dx = (clientX - originX) / rect.width;
  const dy = (clientY - originY) / rect.height;
  motionThrottler.schedule('card-drag', { ...cardDragPayload(card, dx, dy), active: true });
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
    // D68: `message.data.dx/dy` is an offset from the SENDER's own
    // hand-panel center, as they saw it on their own screen - re-anchor
    // it against MY OWN rendering of that same player's hand panel
    // (`playerAnchorRect`, wherever I've arranged it), not a shared
    // absolute position. Clamped here (once, at render time) so the
    // ghost stays on-screen even if the two viewers' layouts differ
    // enough to push the raw math past an edge.
    const rect = gameScreenElement.getBoundingClientRect();
    const anchor = playerAnchorRect(playerId);
    const anchorFracX = (anchor.left + anchor.width / 2 - rect.left) / rect.width;
    const anchorFracY = (anchor.top + anchor.height / 2 - rect.top) / rect.height;
    // *nit (direct user request): Y is inverted here - every viewer's
    // OWN hand renders near the bottom of their OWN screen, but an
    // OPPONENT's hand can render anywhere else on MY screen (often the
    // top). "Away from my own hand, toward the table" is `dy < 0` on
    // the sender's screen (their hand sits below); rendered as-is on a
    // viewer where that same player's hand sits ABOVE the anchor
    // instead, the ghost would move the wrong way relative to their
    // seat. Flipping the sign keeps "away from the dragger's own hand"
    // consistent regardless of which side of it their hand happens to
    // render on for this particular viewer. X is untouched - not
    // requested, and left/right isn't mirrored the same way seats are.
    const x = Math.min(1, Math.max(0, anchorFracX + message.data.dx));
    const y = Math.min(1, Math.max(0, anchorFracY - message.data.dy));
    updateCardDragGhost(gameScreenElement, playerId, card, x, y);
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
