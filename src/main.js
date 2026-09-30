import { Session } from './session.js';
import { createSessionLifecycle } from './sessionLifecycle.js';
import { createTableActions } from './tableActions.js';
import { reduce, viewFor, DECK_PILE_ID } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from './protocol.js';
import { wireCopyCode } from './qrcode.js';
import { TABLE_CANVAS_SIZE } from './tableZoom.js';
import {
  renderRoster,
  renderRulesPanel,
  renderBanner,
  applyCardSize,
  showScreen,
  updateRemoteCursor,
  removeRemoteCursor,
  setCardLifted,
  updateDragGhost,
  removeDragGhost,
} from './ui.js';
import { pileDragFromDrop } from './dragDrop.js';
import { wirePanelLayout } from './panelInteraction.js';
import { renderDeckStack } from './deckStack.js';
import { renderZones } from './renderZones.js';
import { createStaleTracker } from './staleTimers.js';
import { PRESETS } from './presets.js';
import { RULES_REFERENCE } from './rulesReference.js';
import { seatedOrder } from './seating.js';
import { save as saveGame, load as loadGame, describeAge } from './persistence.js';
import { CLIENT_KEY_STORAGE, peerFor, rememberSession, recallSession, forgetSession } from './identity.js';
import { recallHostSettings } from './hostSettings.js';
import { loadPanelLayout, savePanelPosition, savePanelSize } from './panelLayout.js';
import { overridesForPreset } from './layoutOverrides.js';
import { wireLayoutControls } from './layoutSave.js';
import {
  describeDeckConfig,
  describeConfiguredZones,
  renderDeckChoices,
  createHostSession,
} from './hostSetup.js';
// UX follow-up (direct user request): Score is a native Web Component
// (customElements, light DOM) - importing it (and every pile/zone
// component below) for its registration side effect
// (`customElements.define(...)`), same as any other module that just
// needs to run once at load. `renderDeckStack` (above, from './deckStack.js')
// stays imported too - `#host-deck-area` (the pre-game preview screen,
// not a `#zones` panel) calls it directly on a plain div, no component
// needed there.
import './components/ScoreZone.js';
import './components/TableView.js';
import './components/ZonePanel.js';
import './components/PilePanel.js';
import './components/FanPile.js';
import './components/DeckStack.js';
import './components/TableTalk.js';
import './components/AddBot.js';
import './components/ThoughtBubble.js';
import { createTalkLog, makeTalkMessage, hostLine } from './tableTalk.js';
import { botOffers, spawnResult, spawnRequestLine } from './botOffers.js';
import { decisionsBySpeaker } from './botThoughts.js';
import { colorForPlayer } from './playerColors.js';
import { captureRects, travels, playTravels, glow } from './cardMotion.js';
import './components/ChipTray.js';
import './components/HeaderActions.js';
import './components/SpreadSlider.js';

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
  if (pileId) tableActions.performMovePile(pileId, null);
});
// US-1xx: `<table-view>` (the `#zones` element itself, `TableView.js`)
// owns the camera and focus-zoom now - it wires both the moment it
// connects (module load; `#zones` is static markup, already in the DOM
// by the time this module's imports run). `tableView.applyFitZoom()` is
// still called again after every `renderZones` (see there for why:
// `#screen-game`/`.table-surface` measure zero-size until the game
// screen is actually shown).
// *nit (2026-08-27), direct user request ("save space"): one
// consolidated Score panel for every seated player, not one whole panel
// per player - a single fixed id is enough again, same as before the
// short-lived per-player-panel design it replaces.
const SCORE_PANEL_ID = 'score';
let role = null; // 'host' | 'join'
let session = null;
let myId = null;
let myName = '';
let gameState = null; // authoritative, host only
let latestView = null; // last view received from host, join only
// D138: table talk - not game state; host-ordered, relayed to everyone.
const talkLog = createTalkLog();
// D163: the guest's connection to the host - live, reconnecting (with
// a retry count), or ended for good - as a real machine instead of
// scattered flags. `isSessionEnded()` reads its terminal state; every
// old `if (isSessionEnded) return` guard becomes a call to it.
const sessionActor = createSessionLifecycle();
const isSessionEnded = () => sessionActor.matches('ended');

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

const layoutControls = wireLayoutControls(() => ({ role, selectedPreset, gameState }));

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
const deckChoicesElement = document.querySelector('#host-deck-choices');

// US-110/US-111 (direct user request: "make the game params sticky so
// it remembers the previous session - just the last one"): read ONCE at
// load, before the preset dropdown/deck-choice checkboxes render for the
// first time, so their initial state can reflect it. Sticky by
// overwrite (see `hostSettings.js`) - this is always the single most
// recent host session, never a history to pick from.
const rememberedHostSettings = recallHostSettings(localStorage);
if (rememberedHostSettings) {
  document.querySelector('#host-name').value = rememberedHostSettings.name;
  // Only trust a remembered preset name that still names a REAL preset -
  // one removed since the last session must fall back to the dropdown's
  // own first option, never silently select nothing.
  if (PRESETS.some((p) => p.name === rememberedHostSettings.presetName)) {
    presetSelect.value = rememberedHostSettings.presetName;
  }
  document.querySelector('#host-allow-player-zones').checked = rememberedHostSettings.allowsPlayerZones;
  if (rememberedHostSettings.expectedPlayers > 0) {
    document.querySelector('#host-expected-players').value = String(rememberedHostSettings.expectedPlayers);
  }
}

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
  const remembered = rememberedHostSettings?.presetName === preset.name ? rememberedHostSettings.deckChoiceIds : null;
  renderDeckChoices(deckChoicesElement, preset, remembered);
  // *fix (direct user report): "rtg deck pile's cards too small and
  // don't match the top card" - previews the SAME card size the real
  // table will use (`configsForPreset` carries `preset.cardSize`
  // through to `gameConfig`) on `#host-deck-area`'s pre-game deck
  // preview, not just after Create Table. Also fires while picking a
  // preset for New Game (same dropdown) - harmless, since the live
  // game screen sits hidden behind that picker either way
  // (`cancelNewGameFlow` restores the actual running game's own size
  // if Cancel is clicked after changing this selection).
  applyCardSize(preset.cardSize);
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
const moveTracker = createStaleTracker((id) => { movingIds.delete(id); renderRosterOnly(); }, MOTION_TTL_MS);
const cursorTracker = createStaleTracker((id) => removeRemoteCursor(gameScreenElement, id), MOTION_TTL_MS);
const dragTracker = createStaleTracker((id) => removeDragGhost(gameScreenElement, id), MOTION_TTL_MS);

// --- Live cursor (US-22/D13, redesigned US-146/D168): while the pointer
// is down anywhere on the game screen, broadcast which PILE (if any) it
// is currently over - never raw coordinates. A fraction of the sender's
// own screen has no correct meaning on a receiver's own, genuinely local
// panel layout (D61/D68); a pile id does, resolved against the
// receiver's OWN DOM in `applyIncomingMotion` below. ---
const gameScreenElement = document.querySelector('#screen-game');
let isPointerActive = false;
// The pile last broadcast this gesture (or `null` for "no pile") - only
// sent again on CHANGE, so entering/leaving a pile is one message, not
// one per throttled tick. Reset on pointerup so the NEXT gesture always
// sends its own first pile fresh, even if it happens to start over the
// same one the last gesture ended on (whose broadcast a receiver's own
// staleness timer may since have cleared).
let lastHoveredPileId = null;
gameScreenElement.addEventListener('pointerdown', () => {
  isPointerActive = true;
});
globalThis.addEventListener('pointerup', () => {
  isPointerActive = false;
  lastHoveredPileId = null;
});
gameScreenElement.addEventListener('pointermove', (event) => {
  if (!isPointerActive || isSessionEnded()) return;
  const pileId = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pile-id]')?.dataset.pileId ?? null;
  if (pileId === lastHoveredPileId) return;
  lastHoveredPileId = pileId;
  motionThrottler.schedule('cursor', { pileId });
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

// US-124: the role this client ASKED for on the join screen; compared
// against the role the host actually gave it, to explain a downgrade.
// Crosses into the guest join flow below, so it stays here (D166) rather
// than becoming hostSetup.js private state.
let requestedRole = 'player';
let isForcedSpectatorNoticed = false;

// D166: the whole host-setup/new-game cluster (session wiring, resume/
// restore-waiting, startGame/auto-start, New Game) lives in hostSetup.js
// - `role`/`session`/`myId`/`myName`/`gameState`/`lastDealCount`/
// `selectedPreset`/`requestedRole` cross into code that stays here
// (dispatch/talk/motion/rendering/the guest join flow), so they flow
// through `read()`/`patch()` rather than becoming private state there.
// `peerToKey`/`identityAnnounced` are used by `dispatch()`/
// `publishTalk()`/`applyIncomingMotion()` below too, so they stay here
// and are passed by reference.
const peerToKey = new Map();
const identityAnnounced = new Set();

const hostSession = createHostSession({
  read: () => ({ role, session, myId, myName, gameState, latestView, lastDealCount, selectedPreset }),
  patch: (p) => {
    if ('role' in p) role = p.role;
    if ('session' in p) session = p.session;
    if ('myId' in p) myId = p.myId;
    if ('myName' in p) myName = p.myName;
    if ('gameState' in p) gameState = p.gameState;
    if ('lastDealCount' in p) lastDealCount = p.lastDealCount;
    if ('requestedRole' in p) requestedRole = p.requestedRole;
  },
  peerToKey,
  identityAnnounced,
  forgetPeer: (id) => forgetPeer(id),
  dispatch: (action) => dispatch(action),
  publishTalk: (speakerKey, message) => publishTalk(speakerKey, message),
  applyIncomingMotion: (playerKey, message) => applyIncomingMotion(playerKey, message),
  relayMotion: (fromPeerId, message) => relayMotion(fromPeerId, message),
  broadcastViews: () => broadcastViews(),
  renderGameFromView: (view) => renderGameFromView(view),
  renderRosterOnly: () => renderRosterOnly(),
  showGameCode: (code) => showGameCode(code),
  isSessionEnded: () => isSessionEnded(),
  screens,
  zonesElement,
  deckChoicesElement,
  layoutSelect,
});
const { resumeHostedTable, maybeResumeRestored, finishRestore, scheduleAutoStartCheck } = hostSession;

// US-45 AC: a table that can only resume at full strength is a table one
// closed tab can hold hostage. Clears the same flag the auto-resume does,
// so the two paths can never both fire.
document.querySelector('#resume-anyway-btn').addEventListener('click', finishRestore);

// UX follow-up (direct user request): Reset/Reset Scores/Add Zone
// controls removed from the bottom of the screen. RESET/RESET_SCORES/
// CREATE_ZONE stay real, dispatchable, fully-tested reducer actions
// (state.test.js, e2e) - only their UI entry points are gone, disclosed
// to the user as a real functionality gap, not silently dropped.

function adjustScore(targetPlayerId, delta) {
  if (isSessionEnded()) return;
  submitAction({ type: 'ADJUST_SCORE', targetPlayerId, delta });
}

// *nit (2026-08-27), direct user request: "update the score by typing it
// dispatch here (`adjustScore` above, `performCreatePileWithCard`, ...).
function setScore(targetPlayerId, value) {
  if (isSessionEnded()) return;
  try { submitAction({ type: 'SET_SCORE', targetPlayerId, value }); }
  catch (error) { globalThis.alert(error.message); }
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

/**
 * US-118: the one funnel every player action goes through. The host
 * reduces it locally; a guest relays it over the data channel and the
 * host reduces it there, stamping `playerId` from the sending
 * connection's identity (D27) - the same stamp the host gives its own
 * `myId` here. A host-side reducer throw propagates to the caller; a
 * guest never runs the reducer, so it has nothing local to throw.
 */
function submitAction(action) {
  if (role === 'host') dispatch({ ...action, playerId: myId });
  else session.send({ type: 'action', action });
}

/**
 * Every `perform*` below that has nothing of its own to check first is
 * exactly this one guard plus `submitAction` - the shape US-107 already
 * named for `whenLive`'s object-literal siblings. One place, not one
 * copy per action.
 */
function dispatchAction(action) {
  if (isSessionEnded()) return;
  submitAction(action);
}

/**
 * The same shape, for an action whose reducer validates and can THROW
 * (D-numbered guards like "must be empty first") - the one thing that
 * differs between `perform*` functions, so it stays its own helper
 * rather than folding into `dispatchAction` and adding a try/catch no
 * presentation-only action (spread, flip, shuffle...) ever needed.
 */
function dispatchOrAlert(action) {
  if (isSessionEnded()) return;
  try { submitAction(action); }
  catch (error) { globalThis.alert(error.message); }
}

/**
 * US-118: the multi-player test harness's page-side hook
 * (`tests/harness/multiplayer.mjs`). Exposed unconditionally (D1, no
 * build step) - not a new trust surface: any player can already call
 * `session.send` from devtools, and the host authorizes by the sending
 * connection's identity, never by UI origin (D27).
 */
// eslint-disable-next-line unicorn/no-global-object-property-assignment -- publishing this hook on the page's global IS the point
globalThis.__recardHarness = {
  act: submitAction,
  view: currentView,
  myId: () => myId,
  // US-119: this player's protocol traffic (read-only), `{type, limit}`.
  traffic: (options) => session?.traffic.entries(options) ?? [],
  // D138: table talk.
  say: (text, data) => say(text, data),
  talk: () => talkLog.entries(),
  // D164: swaps the reconnect flow's `setTimeout`/`clearTimeout` - lets
  // an integration test run the real RECONNECT_DELAYS_MS/ATTEMPT_TIMEOUT_MS
  // schedule (unchanged) compressed, instead of waiting out a real ~51s
  // budget for real. `clock` is `{ setTimeout, clearTimeout }`.
  setReconnectClock: (clock) => { reconnectClock = clock; },
  // A live test's way to make a host really disappear: destroys this
  // page's own PeerJS peer outright (`session.close()`), which tears
  // down every connection under it - the same "host really gone" a
  // crashed tab produces, but deterministic and fast to detect, unlike
  // relying on WebRTC's own failure timeout (which this environment does
  // not reach in any useful window).
  disconnect: () => session?.close(),
};

/**
 * D138: host only - stamps a line with its speaker's seat name, logs it,
 * and relays the stamped entry to every guest (the speaker included), so
 * the host's order is the one order every screen shows.
 */
function publishTalk(speakerKey, message) {
  let line;
  try {
    // A "/roll" is rolled HERE, by the host, as the line is stamped.
    line = hostLine(makeTalkMessage(message.text, message.data));
  } catch (error) {
    console.warn('Rejected table talk from', speakerKey, error);
    return;
  }
  const name = gameState?.players.find((player) => player.id === speakerKey)?.name ?? speakerKey;
  const entry = talkLog.add({ from: speakerKey, name, text: line.text, ...(line.data !== undefined && { data: line.data }) });
  renderTalk();
  const players = gameState?.players ?? [];
  for (const player of players) {
    if (player.id === myId) continue;
    const peerId = peerFor(player.id, peerToKey);
    if (peerId) session.sendTo(peerId, { type: 'talk', entry });
  }
}

/**
 * D138: say a line to the table. A guest's line goes to the host, which
 * stamps and relays it back - it appears here when it comes back.
 */
function say(text, data) {
  const message = makeTalkMessage(text, data);
  if (role === 'host') publishTalk(myId, message);
  else session.send(message);
}

function renderTalk() {
  document.querySelector('table-talk')?.render(talkLog.entries());
  renderAddBot();
  // A new decision changes what the bubbles show, and the roster is
  // where they live - same "re-render the cached view after a local
  // change" pattern the split picker uses.
  rerender();
}

// US-121: which bot's thought bubble this client has open. Client-local
// (everyone chooses for themselves, AC5) and held here because every
// broadcast rebuilds the roster DOM underneath it.
let openThoughtId = null;

document.addEventListener('thought-toggle', (event) => {
  const bubble = event.target.closest?.('thought-bubble');
  if (!bubble) return;
  openThoughtId = event.detail.open ? bubble.dataset.playerId : null;
});

// US-122: the bot this client last asked for, so the control can say
// what came of it. Local only - someone else's request is their own
// business, and the talk log already shows everyone the answer.
let myBotRequest = null;

/**
 * US-122/D143: offer "Add Jev bot" exactly while a Jev player is at the
 * table to answer it, and follow this client's own request through to
 * its answer (Smith, Gate 1 condition 3 - pressing it must visibly do
 * something while a bot takes seconds to sit down).
 */
function renderAddBot() {
  const control = document.querySelector('add-bot');
  if (!control) return;
  const talk = talkLog.entries();
  const [offer] = botOffers(talk, currentView()?.players ?? []);
  let status = '';
  if (myBotRequest) {
    const result = spawnResult(talk, myBotRequest.requestId);
    if (result?.ok) {
      status = `${myBotRequest.strategy} bot is joining.`;
      myBotRequest = null;
    } else if (result) {
      status = `Could not add a ${myBotRequest.strategy} bot: ${result.error ?? 'the Jev player refused'}`;
      myBotRequest = null;
    } else {
      status = `Asking ${myBotRequest.by} for a ${myBotRequest.strategy} bot\u{2026}`;
    }
  }
  control.render({ offer: offer ?? null, status });
}

document.querySelector('add-bot')?.addEventListener('add-bot', (event) => {
  const requestId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  myBotRequest = { requestId, strategy: event.detail.strategy, by: event.detail.by };
  const line = spawnRequestLine({ game: event.detail.game ?? 'gin', strategy: event.detail.strategy, requestId });
  try {
    say(line.text, line.data);
  } catch (error) {
    myBotRequest = null;
    console.warn(error);
  }
  renderAddBot();
});

document.querySelector('table-talk')?.addEventListener('talk-say', (event) => {
  try {
    say(event.detail.text);
  } catch (error) {
    console.warn(error);
  }
});

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
// so a refresh no longer orphans a hand. (`peerToKey`/`identityAnnounced`
// themselves are declared above, alongside `createHostSession` - D166,
// they cross into `dispatch`/`publishTalk`/`applyIncomingMotion` below.)

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
  if (role !== 'host' || isSessionEnded()) return;
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
// D164: `setTimeout`/`clearTimeout` for BOTH the inter-attempt delay and
// the per-attempt timeout race, injectable so a test can run the REAL
// schedule above (unchanged in production) compressed instead of
// waiting out a real ~51s budget - "override the clock", not the
// numbers. Reachable only via `setReconnectClock` on `__recardHarness`
// (below), same "not a new trust surface" reasoning as every other hook
// there: page-local, no server round-trip, harmless from devtools too.
let reconnectClock = { setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis) };
// D163: only the raw timer handle stays a plain variable - the retry
// COUNT and whether we're even reconnecting now live in `sessionActor`
// (`sessionLifecycle.js`), which is what makes the guards below
// structural instead of manual: `HOST_LOST` is only handled from
// `live`, so a stray/duplicate one while already reconnecting (or
// already ended) is simply not handled - no `if` needed here for it.
let reconnectTimer = null;

function stopReconnecting() {
  reconnectClock.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function beginReconnecting() {
  if (!sessionActor.matches('live')) return;
  sessionActor.send({ type: 'HOST_LOST' });
  scheduleReconnect();
}

function scheduleReconnect() {
  const delay = RECONNECT_DELAYS_MS[sessionActor.context().attempt];
  if (delay === undefined) {
    // Budget spent. Say so and stop - a loop with no end is a battery
    // cost the player never agreed to, and an app that looks busy forever
    // is worse than one that admits it failed (Smith Gate 1 answer 1).
    endSessionForGood('Could not reconnect to the host.', { retryable: true });
    return;
  }
  sessionActor.send({ type: 'RETRY' });
  const attempt = sessionActor.context().attempt;
  renderBanner(bannerElement,
    `Lost the host \u{2014} reconnecting\u{2026} (attempt ${attempt} of ${RECONNECT_DELAYS_MS.length})`);
  reconnectTimer = reconnectClock.setTimeout(attemptReconnect, delay);
}

async function attemptReconnect() {
  const remembered = recallSession(localStorage);
  if (!remembered) { stopReconnecting(); endSessionForGood('Host disconnected \u{2014} session ended.'); return; }
  let storedKey = null;
  try { storedKey = localStorage.getItem(CLIENT_KEY_STORAGE); } catch { /* private mode */ }
  const attempt = Session.join(remembered.code, { name: remembered.name, playerKey: storedKey, role: requestedRole });
  try {
    // `ready()` resolves on the data connection opening. When the host
    // simply isn't there, PeerJS opens the *peer* happily and the
    // connection never opens - so `ready()` neither resolves nor rejects,
    // and without this race the retry loop stalls on the first attempt and
    // the budget can never be spent. Found by watching it never give up.
    myId = await Promise.race([
      attempt.ready(),
      new Promise((_, reject) => reconnectClock.setTimeout(() => reject(new Error('reconnect timeout')), ATTEMPT_TIMEOUT_MS)),
    ]);
    session = attempt;
    wireGuestSession();
    stopReconnecting();
    sessionActor.send({ type: 'RECONNECTED' });
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
  // US-124: what this person asked to be. The host still decides - a
  // full or already-started table seats them as a spectator either way,
  // and `noticeForcedSpectator` (below) tells them which it was.
  requestedRole = document.querySelector('#join-role').value === 'spectator' ? 'spectator' : 'player';
  session = Session.join(hostId, { name: myName, playerKey: storedKey, role: requestedRole });
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
    if (message.type === 'talk') {
      talkLog.add(message.entry);
      renderTalk();
      return;
    }
    if (message.type !== 'state') return;
    latestView = message.payload;
    renderGameFromView(latestView);
    showScreen(screens, 'game');
    zonesElement.applyFitZoom(); // the surface just became visible - see applyFitZoom's own declaration
  });

  // D32: losing the host is retryable. `forgetSession` is deliberately
  // NOT called here - it erases the code and name at exactly the moment
  // they become useful, which is why reconnecting was impossible before
  // this sprint. It moves to `endSessionForGood`, where the session
  // really is over.
  // `beginReconnecting`'s own guard (only `live` handles `HOST_LOST`)
  // already covers "already ended" and "already reconnecting" - no
  // wrapper needed here.
  session.on('host-lost', beginReconnecting);

  session.on('session-ended', () => endSessionForGood('Host disconnected — session ended.'));
}


/**
 * The session really is over: the retry budget is spent, or we were told
 * so outright. Only here does the remembered table get dropped.
 */
function endSessionForGood(message, { retryable = false } = {}) {
  if (isSessionEnded()) return;
  stopReconnecting();
  sessionActor.send({ type: 'SESSION_ENDED' });
  forgetSession(localStorage);
  renderBanner(bannerElement, retryable ? `${message} Reload to try again.` : message);
  // Re-render with no action handlers so every control (hand cards,
  // reveal/pickup buttons) is inert, and force the roster to reflect
  // reality instead of the last-known (now stale) connection states
  // (Smith Gate-close finding #1 — don't leave any control looking
  // live once the session is actually over).
  if (latestView) {
    const nameById = new Map(latestView.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));
    const frozenOptions = {
      resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
      camera: zonesElement.camera,
    };
    // UX follow-up (direct user request): "a Deck is a specific kind of
    // Pile" - the deck is a real pile in `latestView.piles` now, so this
    // one `renderZones` call renders it too (grouped into the Table
    // Zone, inert - `frozenOptions` has no `onPileAction`, so its
    // buttons have nothing to dispatch to), matching every other
    // control in this frozen re-render. No separate `<deck-zone>`
    // element to build here any more.
    renderZones(zonesElement, latestView.piles, seatedOrder(latestView.players, myId), latestView.zones, frozenOptions);
    // Same inert Score panel the live render builds (every seated
    // player with a score, one consolidated panel), just no
    // adjust/set wiring - the session is over.
    const frozenSeated = seatedOrder(latestView.players, myId);
    renderScoreZone(zonesElement, frozenSeated, latestView.scores, { camera: zonesElement.camera });
    zonesElement.reapplyFocusZoom();
  }
  renderRosterOnly();
}

// --- Shared game rendering ---
function currentView() {
  if (role === 'host') return gameState ? viewFor(gameState, myId) : null;
  return latestView;
}

// US-117 phase 111 (D132, direct user correction - no auto-fit): a
// per-player manual table zoom, a wheel control (`tableZoom.js`).
// Local-only view state (D130) - no reducer action, no persistence,
// wired once at startup rather than per-render since nothing about it
// depends on `latestView`/`gameState`.
//
// *fix (direct user request, 2026-09-16): "like the zoom wheel on a
// mouse" as its own manual control, not the real scroll wheel - a
// vertical drag replaces the old `<input type=range>` dial outright.
// *fix (direct user request, 2026-09-17): the S/M/L/XL preset buttons
// this control originally shipped alongside are gone too, no back-
// compat shim - the wheel is the only control now.
// Dragging the wheel UP (negative pointer delta) zooms in, DOWN zooms
// out (`zoomFromWheelDrag`).
function renderRosterOnly() {
  const view = currentView();
  if (!view) return;
  scheduleAutoStartCheck(); // US-42: the roster changing is exactly when to re-check
  maybeResumeRestored();    // US-45: and when to re-check who is back
  let players = rosterWithCounts(view);
  if (isSessionEnded()) players = players.map((p) => ({ ...p, connection: 'disconnected' }));
  const options = {
    movingIds,
    scores: view.scores,
    onAdjustScore: isSessionEnded() ? null : adjustScore,
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

// US-107 (D114-adjacent, cognitive-complexity pass): extracted straight
// out of `renderGameFromView`, unchanged - just moved out from under it,
// since sonarjs's dispatch-table false-positive read every callback
// property and every isSessionEnded ternary in this object literal as
// the SAME function's own branching. Zero behavior change: same object
// shape, same closures over the module's session-state (`isSessionEnded`,
// `role`, `myId`, `splitPicker`, `lastDealCount`, `motionThrottler`).
//
// UX follow-up (direct user request): "get rid of seat panel and
// replace with a reg zone with a handpile" - the hand is a real
// `hand`-kind pile now (`state.js`), rendered through the exact same
// generic `renderPileCards`/`actionMenuEl` machinery as any other
// pile's cards (as a `<pile-panel>` grouped into the owner's own
// `<zone-panel>`, `src/components/PilePanel.js`/`ZonePanel.js`). No
// separate `handOpts`/`own` object, no bespoke fan/reorder/motion/
// sort/pass wiring - a hand's cards go through `onMoveCard` like
// every other pile's do (D102: `onPlay`, and the `play` verb behind
// it, are retired - nothing ever read this option).
//
// NOTE (flagged, not yet done): hand-order persistence (D14), sort/
// pass, and the "organizing hand" motion cue are all temporarily gone
// - direct instruction was to get the pile rendering working first,
// parity/polish is a following step.
// US-107: every `isSessionEnded ? null : fn` pair below shares one
// condition - factored into a single guard so the object literal states
// the rule once instead of nine times. Every wrapped function already
// matched its property's call signature exactly (checked against each
// `function perform*`/`handlePileAction` definition), so the guard can
// hold the real function reference directly - no arity-preserving arrow
// wrapper needed either.
function whenLive(handler) {
  return isSessionEnded() ? null : handler;
}

function buildZoneOptions(nameById) {
  return {
    viewerId: myId,
    // *fix (2026-09-17): threaded through to `wirePanelLayout` ->
    // `attachPanelDrag`/`attachPanelResize`, which need it to convert a
    // screen-space pointer delta into the local-space delta a panel's
    // own `left`/`top` actually use - see `TableView.js`'s `camera` for
    // the full reasoning.
    camera: zonesElement.camera,
    resolveOwnerName: (ownerId) => nameById.get(ownerId) ?? ownerId,
    // US-121/D142: each bot's own decisions, filtered out of the talk
    // log (the history IS the log), and which bubble this client has
    // open - the bubble hangs off its owner's seat panel.
    thoughts: decisionsBySpeaker(talkLog.entries()),
    openThoughtId,
    onReveal: tableActions.revealCard,
    onRotate: tableActions.rotateCard,
    onPickup: tableActions.pickupCard,
    onMoveCard: tableActions.moveCard,
    onCardLift: (pileableId, active) => motionThrottler.schedule('card-lift', { pileableId, active }),
    onDropCard: tableActions.dropCardOnPile,
    // D91: `<pile-panel>` checks `splitPicker?.pileId === pile.id`
    // to switch that one pile into the picker row; `onSplitCommit` is
    // only ever called FROM that row (a click on a chosen gap), so it
    // doesn't need its own pileId param - `splitPicker.pileId` already
    // says which pile.
    splitPicker: tableActions.splitPicker,
    onSplitCommit: whenLive(tableActions.performSplitCommit),
    // UX follow-up (direct user request): "like zones, Piles are
    // Actionable and should have a title bar with action buttons for
    // that pile type" - every pile's heading is a real action header now
    // (`<pile-panel>`). Dispatch table itself is `tableActions.handlePileAction`
    // (`src/tableActions.js`, its own doc comment has the rest).
    onPileAction: whenLive(tableActions.handlePileAction),
    // D129: one stack's own actions, from its gear emblem.
    onStackAction: whenLive(tableActions.handleStackAction),
    // *nit (2026-08-26): "allow user to rename zones and piles - any
    // user can edit - persisted by host." Same `sessionEnded` gate
    // every other dispatching handler in this object already uses.
    onRenamePile: whenLive(tableActions.performRenamePile),
    onRenameZone: whenLive(tableActions.performRenameZone),
    onRemoveZone: whenLive(tableActions.performRemoveZone),
    // (bloop: piles/zones/cards are all Movable)
    onMovePile: whenLive(tableActions.performMovePile),
    // (direct user request) - dropping a pile directly onto another pile
    // merges its cards into the target and removes it once empty, no
    // matter which zone either one is in ("remove the weird zone
    // distinction, KISS" - superseded the earlier same-zone-reorder
    // split; `REORDER_PILE`, state.js, is unused from the UI now but
    // left in place, not deleted - a real, tested, independently-useful
    // action, just without a live trigger since this was its only one).
    onMergePile: whenLive(tableActions.performMergePile),
    onDropCardOnZone: whenLive(tableActions.performCreatePileWithCard),
    // US-41/D29: dealing lives on the deck, where the cards are - the
    // whole point of the story. Read/written here since the deck now
    // renders through the exact same generic pile pipeline (`<deck-
    // stack>`, `<pile-panel>`'s row) as any other pile, not a bespoke
    // `<deck-zone>` element with its own property surface any more.
    dealCount: lastDealCount,
    onDealCountChange: whenLive((value) => { lastDealCount = value; }),
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
}

// US-123/D144: the fade timers for cards glowing on THIS screen, and
// the last touch this client has already shown. Local, never shared -
// a glow is not worth a broadcast to start or to end.
const glowTimers = new Map();
let lastShownTouchSeq = 0;

function renderGameFromView(view) {
  noticeNewGameIfPresetChanged(view);
  noticeForcedSpectator(view);
  // Where every card is BEFORE this render redraws the table - the
  // other half of the travel is taken right after (D144).
  const rectsBefore = captureRects(document);
  // *fix (direct user report): "rtg deck pile's cards too small and
  // don't match the top card" - the single render funnel both host and
  // guest go through, so this is what keeps a GUEST's own cards sized
  // correctly too, not just the host's local preview.
  applyCardSize(view.gameConfig?.cardSize);
  layoutControls.updateLayoutControlsVisibility();
  const nameById = new Map(view.players.map((p) => [p.id, p.id === myId ? 'You' : p.name]));
  const zoneOptions = buildZoneOptions(nameById);
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
  // what `<pile-panel>` uses for its row instead - see `zoneOpts.
  // dealCount`/`onDealCountChange` above for the one piece of deck-
  // specific state this file still owns: the Deal count input's value).
  renderZones(zonesElement, view.piles, seatedOrder(view.players, myId), view.zones, zoneOptions);
  // D134: the ACTIVE preset's own canvas size (if it declared one -
  // `configsForPreset` threads `tableCanvasSize` through the same way
  // as `cardSize`), read fresh every render since `New Game` can swap
  // presets without recreating the table.
  // `setCanvasSize` re-fits immediately - the table (and its real
  // `.table-surface` size) only exists from here on, so this is also
  // the first call that can actually see real layout.
  zonesElement.setCanvasSize(view.gameConfig?.tableCanvasSize ?? TABLE_CANVAS_SIZE);
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
    onAdjust: whenLive(adjustScore),
    onSet: whenLive(setScore),
    ...zoneOptions,
  });
  zonesElement.reapplyFocusZoom();
  renderRosterOnly();
  // US-123/D144: the table has just been redrawn - play the difference
  // (every card that changed place travels from where it was), then
  // glow whatever this action touched, in the colour of whoever did it.
  playTravels(document, travels(rectsBefore, captureRects(document)));
  const touch = view.lastTouch;
  if (touch?.seq > lastShownTouchSeq) {
    lastShownTouchSeq = touch.seq;
    glow(document, touch.pileableIds ?? [], colorForPlayer(view.players, touch.by), glowTimers);
  }
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

// US-1xx: every player-triggered game action (`src/tableActions.js`) -
// a small, explicit interface, not a redesign of who owns what. Function
// declarations below are hoisted, so this can sit here, next to the one
// piece of state it shares with host-setup, rather than needing to be
// textually after every dependency it closes over.
const tableActions = createTableActions({
  currentView,
  submitAction,
  dispatchAction,
  dispatchOrAlert,
  isSessionEnded,
  getMyId: () => myId,
  getLastDealCount: () => lastDealCount,
  rerender,
});

// --- New Game (US-116): host swaps to a different preset, same table ---

/** Sentinel distinct from any real `presetName` (including `undefined`,
 * which a pre-D116/no-name preset legitimately has) - marks "no render
 * has happened yet for this table", so the very first render never
 * reads as a preset CHANGE and pops the notice below. */
const NO_RENDER_YET = Symbol('no-render-yet');
let lastSeenPresetName = NO_RENDER_YET;
let newGameNoticeTimer = null;

/** Smith Gate 1 amendment 2: a guest's screen changes out from under
 * them the moment the host confirms New Game (NEW_GAME wipes their hand
 * same as any other pile) - a silent wipe reads as a bug, so this names
 * what happened. Detected off the replicated `gameConfig.presetName`
 * (D116) rather than a one-off network message, since every render
 * already carries the current view. */
function noticeNewGameIfPresetChanged(view) {
  const presetName = view.gameConfig?.presetName;
  const isRealChange = lastSeenPresetName !== NO_RENDER_YET && presetName !== lastSeenPresetName;
  lastSeenPresetName = presetName;
  if (!isRealChange) return;
  clearTimeout(newGameNoticeTimer);
  renderBanner(bannerElement, presetName ? `Host started a new game: ${presetName}` : 'Host started a new game.', { tone: 'info' });
  newGameNoticeTimer = setTimeout(() => renderBanner(bannerElement, ''), 5000);
}

/**
 * US-124 (Smith Gate 1 condition 2): someone who asked to PLAY and was
 * seated as a spectator has to be told, in words, which limit they hit
 * - a silent role change reads as the app being broken. Both reasons
 * are derivable from the view the guest already has (D141), so nothing
 * on the wire carries this. Said once: the view re-renders constantly,
 * and repeating the banner would bury whatever else happens next.
 */
function noticeForcedSpectator(view) {
  if (isForcedSpectatorNoticed || requestedRole !== 'player') return;
  const me = view.players?.find((p) => p.id === myId);
  if (me?.role !== 'spectator') return;
  isForcedSpectatorNoticed = true;
  const limit = view.gameConfig?.playerLimit;
  const players = limit ? ` (${limit} players)` : '';
  const message = view.dealtThisGame
    ? "The game has already started \u{2014} you've joined as a spectator."
    : `The game is full${players} \u{2014} you've joined as a spectator.`;
  renderBanner(bannerElement, message, { tone: 'info' });
}

/** Forces an immediate re-render off the CURRENT view for a purely
 * local UI-state change (the split picker opening/closing) that has no
 * server round trip to wait for - `currentView()` already handles the
 * host-vs-join split (`renderRosterOnly`'s own precedent). */
function rerender() {
  const view = currentView();
  if (view) renderGameFromView(view);
}

// --- Motion (US-11): best-effort, cosmetic only. See protocol.js/ARCHITECTURE.md D4. ---
function markMoving(playerId, active) {
  if (active) {
    movingIds.add(playerId);
    moveTracker.refresh(playerId);
  } else {
    movingIds.delete(playerId);
    moveTracker.cancel(playerId);
  }
}

function resolvePlayerName(playerId) {
  const view = currentView();
  return view?.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function markCursorStale(playerId) {
  cursorTracker.refresh(playerId);
}

// D19: finds a card's full data among whatever's currently visible to
// THIS viewer (own hand excluded - a dragged card broadcasts identity
// only when public, and a public card always lives in a table-side
// pile, never a hand). Redacted placeholders (`card.faceDown: true`)
// have no rank/suit and are skipped - only a real, renderable card is
// ever returned.
function resolveVisibleCard(pileableId) {
  const view = currentView();
  if (!view) return null;
  for (const pile of view.piles) {
    const card = pile.cards.find((c) => c.id === pileableId);
    if (card && !card.faceDown) return card;
  }
  return null;
}

function markCardDragStale(playerId) {
  dragTracker.refresh(playerId);
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
// (`data-pile-id="hand:<playerId>"`, `PileElement`), so it's a
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
    motionThrottler.schedule('card-drag', { pileableId: null, dx: 0, dy: 0, active: false });
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
    // US-146/D168: resolved against THIS viewer's own DOM - a pile id
    // means the same thing everywhere, unlike a raw screen fraction did.
    // No id, or a pile this viewer doesn't render at all, removes the
    // cursor outright - there is nothing correct to glide to.
    const pileElement = message.data.pileId
      ? gameScreenElement.querySelector(`[data-pile-id="${CSS.escape(message.data.pileId)}"]`)
      : null;
    if (!pileElement) {
      removeRemoteCursor(gameScreenElement, playerId);
      break;
    }
    updateRemoteCursor(gameScreenElement, playerId, resolvePlayerName(playerId), pileElement);
    markCursorStale(playerId);

  break;
  }
  case 'card-lift': {
    setCardLifted(message.data.pileableId, message.data.active);
  
  break;
  }
  case 'card-drag': {
    if (playerId === myId) return; // never render my own drag ghost back at me
    if (!message.data.active) {
      dragTracker.fireNow(playerId);
      return;
    }
    const card = message.data.pileableId ? resolveVisibleCard(message.data.pileableId) : null;
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
    updateDragGhost(gameScreenElement, playerId, card, x, y);
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
  // *fix (direct user report): `gameState` too, not just `session`.
  // `relayMotion` reads `gameState.players`, and the two are set at
  // different moments - so any pointer movement before a table exists
  // (or after a JOIN that threw, which is how this surfaced) crashed
  // here every flush, filling the console with "Cannot read properties
  // of null (reading 'players')". The precondition was incomplete, not
  // `relayMotion`; guarding it there instead would leave the same hole
  // for every future reader of `gameState` in this loop.
  if (!session || !gameState || isSessionEnded()) return;
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
