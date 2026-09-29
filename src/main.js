import { Session } from './session.js';
import { createSessionLifecycle } from './sessionLifecycle.js';
import { createTableActions } from './tableActions.js';
import { createInitialState, reduce, viewFor, reseatOwner, DECK_PILE_ID } from './state.js';
import { makeStateMessage, makeMotionMessage, createMotionThrottler, cardDragPayload } from './protocol.js';
import { renderShareCode, wireCopyCode } from './qrcode.js';
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
import { PRESETS, filterDeckChoicePiles } from './presets.js';
import { RULES_REFERENCE } from './rulesReference.js';
import { seatedOrder } from './seating.js';
import { save as saveGame, load as loadGame, clear as clearGame, describeAge, expectedReturners } from './persistence.js';
import { CLIENT_KEY_STORAGE, resolvePlayer, peerFor, rememberSession, recallSession, forgetSession } from './identity.js';
import { rememberHostSettings, recallHostSettings } from './hostSettings.js';
import { artUrl, rtgColorClasses, PIP_CLASS } from './cards/RtgCardFace.js';
import { loadPanelLayout, savePanelPosition, savePanelSize, applyPresetLayout } from './panelLayout.js';
import { overridesForPreset } from './layoutOverrides.js';
import { wireLayoutControls } from './layoutSave.js';
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

/** A small row of mana-colour dots (`.rtg-pip`, the same visual
 * vocabulary `RtgCardFace.js`'s cost pips already use) - direct
 * follow-up request: "show the deck colors". Shown regardless of
 * whether the signature card's art actually loads, since art alone
 * doesn't read as "these are this deck's colours" to someone who
 * doesn't already know the set. */
// Smith UX review: a bare colour dot conveys nothing to a screen reader,
// and nothing to a player who doesn't already know MTG's letter-to-
// colour convention (WCAG 1.4.1 - colour must never be the only carrier
// of information). Every dot gets a real name via `title`/`aria-label`,
// the same "colour is decoration, text is the real signal" pattern
// `RtgCardFace.js`'s own mana pips already follow (they render the
// letter as visible text; a color-only DOT has no such text of its own,
// so this is where it has to live instead).
const COLOR_NAME = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

function deckColorDots(colors) {
  const wrap = document.createElement('span');
  wrap.className = 'rtg-cost deck-choice-colors';
  const colorList = colors ?? [];
  for (const color of colorList) {
    const dot = document.createElement('span');
    dot.className = `rtg-pip ${PIP_CLASS[color] ?? 'pip-generic'}`;
    const name = COLOR_NAME[color] ?? color;
    dot.title = name;
    dot.setAttribute('aria-label', name);
    wrap.append(dot);
  }
  return wrap;
}

// *nit (direct user request): "group decks by color and sort by name...
// only select the first by default" - `colors[0]` (WUBRG order, then a
// trailing colourless bucket) is the grouping key rather than the full
// `colors` set, since a guild deck's two-colour set would otherwise put
// it in its own group of one - grouping by first colour instead clusters
// every White deck (mono AND every White guild pairing) together, same
// "which colour does this deck read as" heuristic MTG's own guild wheel
// uses. Sorted by NAME within a group, not declaration order, so the
// grid reads as an actual alphabetical picker rather than "whatever
// order presets.js happened to list them in".
const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** @param {{colors?: string[]}[]} deckChoices
 * @returns {{color: string|null, decks: object[]}[]} */
function groupDeckChoicesByColor(deckChoices) {
  const byColor = new Map();
  for (const deck of deckChoices) {
    const key = deck.colors?.[0] ?? null;
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push(deck);
  }
  const orderedKeys = [...WUBRG_ORDER.filter((color) => byColor.has(color)), ...(byColor.has(null) ? [null] : [])];
  return orderedKeys.map((color) => ({
    color,
    decks: byColor.get(color).toSorted((a, b) => a.name.localeCompare(b.name)),
  }));
}

// US-110: one checkbox per preset-declared `deckChoices` entry (RtG
// today - "we don't need all the decks in every game"). A preset with
// no `deckChoices` hides the fieldset entirely, exactly the pre-US-110
// look for every other game. Only the FIRST deck (post group/sort) is
// checked by default now - direct user request, reversing US-110's
// original "every deck checked" default now that there's a real
// alphabetical order to have a "first" at all. A REMEMBERED selection
// (US-111) still wins over that default when it was saved against THIS
// same preset - switching presets mid-session and back doesn't try to
// carry a choice list that might not even apply to the new preset's
// decks.
//
// Direct follow-up request: "use an image from one of the powerful
// cards in each deck and show the deck colors" - each choice shows its
// own `signatureCard`'s art (`deckLists()`'s own highest-rarity, highest-
// cmc, non-land pick) plus a color-dot row. Reuses `RtgCardFace.js`'s
// exact `artUrl`/fallback-class machinery rather than inventing a
// second art-resolution path - a missing image degrades to the same
// colour-keyed gradient a dealt card with no art falls back to.
/** One `<label>` grid cell for a single deck choice - extracted out of
 * `renderDeckChoices`'s loop purely to stay under the lint's cognitive-
 * complexity ceiling once grouping/heading logic joined it. */
function renderDeckChoiceLabel(deck, isChecked) {
  const label = document.createElement('label');
  label.className = 'deck-choice';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = deck.id;
  checkbox.checked = isChecked;

  const thumb = document.createElement('span');
  thumb.className = `deck-choice-art ${rtgColorClasses(deck.colors).join(' ')}`;
  if (deck.signatureCard) {
    const art = document.createElement('img');
    art.src = artUrl(deck.signatureCard);
    art.alt = '';
    // Same "degrade to a colour panel, never a broken-image icon" rule
    // `RtgCardFace.js`'s own resting face already follows - art
    // generation is quota-limited and may legitimately be missing.
    art.addEventListener('error', () => art.remove());
    thumb.append(art);
  }

  const name = document.createElement('span');
  name.className = 'deck-choice-name';
  name.textContent = deck.name;

  label.append(checkbox, thumb, name, deckColorDots(deck.colors));
  return label;
}

function renderDeckChoices(preset) {
  deckChoicesElement.replaceChildren(deckChoicesElement.querySelector('legend'));
  if (!preset.deckChoices?.length) {
    deckChoicesElement.hidden = true;
    return;
  }
  deckChoicesElement.hidden = false;
  const remembered = rememberedHostSettings?.presetName === preset.name ? rememberedHostSettings.deckChoiceIds : null;
  const groups = groupDeckChoicesByColor(preset.deckChoices);
  let isFirstDeck = true;
  for (const group of groups) {
    // A heading per colour only earns its place once there's more than
    // one group to tell apart - a preset whose decks carry no `colors`
    // at all (every non-RtG multi-deck game, today none) renders one
    // plain grid, exactly the pre-grouping look.
    if (groups.length > 1) {
      const heading = document.createElement('div');
      heading.className = 'deck-choice-group-heading';
      heading.textContent = group.color ? COLOR_NAME[group.color] : 'Colorless';
      deckChoicesElement.append(heading);
    }
    for (const deck of group.decks) {
      const isChecked = remembered ? remembered.includes(deck.id) : isFirstDeck;
      isFirstDeck = false;
      deckChoicesElement.append(renderDeckChoiceLabel(deck, isChecked));
    }
  }
}

/** The checked deck-choice ids for `preset`, or `null` when the preset
 * offers no choices to make at all - `filterDeckChoicePiles`'s own
 * "null means every declared pile" contract. */
function chosenDeckIds(preset) {
  if (!preset.deckChoices?.length) return null;
  return [...deckChoicesElement.querySelectorAll('input:checked')].map((element) => element.value);
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
  renderDeckChoices(preset);
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
  if (!isPointerActive || isSessionEnded()) return;
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
 * US-107 (cognitive-complexity pass): the body of the `roster` handler's
 * per-entry loop, extracted unchanged. Seats (or re-seats) exactly one
 * transport roster entry and returns the resulting game state; the
 * caller reassigns `gameState = seatRosterEntry(r, gameState)`. Mutates
 * the module's `peerToKey`/`identityAnnounced` maps in place, same as
 * before the extraction - only `gameState` threads through explicitly,
 * since it's the one piece of this that has to flow back out.
 *
 * Don't seat a peer that is still `connecting`. D27 already refuses to
 * *announce* identity before the connection is open; seating them
 * earlier has the same defect one step upstream - the host can deal to
 * a peer whose identity hasn't settled, and it re-seats a moment later
 * as a stranger, stranding the dealt hand on a ghost. Sprint 10 fixed
 * this for auto-start by counting connected players; this fixes the
 * manual "Deal & Start" path too, at the source.
 */
function seatRosterEntry(r, state) {
  if (r.connection === 'disconnected') return state;
  if (r.connection !== 'connected' && !peerToKey.has(r.id)) return state;

  let key = peerToKey.get(r.id);
  if (!key) {
    const resolved = resolvePlayer(r.playerKey, state.players);
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
  let next = state;
  if (next.players.every((p) => p.id !== key)) {
    next = reduce(next, { type: 'JOIN', playerId: key, name: r.name, role: r.role });
  }
  return reduce(next, { type: 'SET_CONNECTION', playerId: key, connection: r.connection });
}

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
  // far more often than it ever caught a real second tab) - `seatRosterEntry`
  // actively evicts that other connection instead once it does.
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
  for (const r of transportRoster) gameState = seatRosterEntry(r, gameState);
  broadcastViews();
});

session.on('data', ({ fromId, msg }) => {
  if (msg.type === 'talk') {
    // D27/D138: the line is stamped with the identity this address
    // speaks for - never a name the sender claims. Unmapped peers are
    // ignored, same as their actions.
    const speakerKey = peerToKey.get(fromId);
    if (speakerKey) publishTalk(speakerKey, msg);
    return;
  }
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
// US-124: the role this client ASKED for on the join screen; compared
// against the role the host actually gave it, to explain a downgrade.
let requestedRole = 'player';
let isForcedSpectatorNoticed = false;

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
  zonesElement.applyFitZoom(); // the surface just became visible - see applyFitZoom's own declaration
}

function startGame() {
  const cardsPerPlayer = Number(document.querySelector('#cards-per-player').value);
  // D92: the preset's own starting deck, if it declares one
  // (`gameConfig.tableZone`) - RTG opts out entirely and deals 0 cards
  // to start, so `DEAL` finding no pile at this id is expected, not an
  // error (see `DEAL`'s own comment, state.js).
  dispatch({ type: 'DEAL', cardsPerPlayer, pileId: DECK_PILE_ID });
  showScreen(screens, 'game');
  zonesElement.applyFitZoom(); // the surface just became visible - see applyFitZoom's own declaration
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
  if (role !== 'host' || !expectedPlayers || isSessionEnded()) return;
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
  // *fix (direct user report): "chip tray dups again when resuming an
  // existing game". This used to DROP the saved host entry and JOIN
  // under the new peer id, which made JOIN treat the host as a new
  // player and build their declared `perPlayer` piles all over again -
  // a second chip tray, with the host's actual chips stranded in the
  // first one. `reseatOwner` MOVES them instead: the player, their
  // piles and contents, their zones and their score all follow the new
  // id, so JOIN recognises them and creates nothing.
  //
  // Pre-existing for every `perPlayer` declaration (Spit's stock, RtG's
  // battlefield/discard/exile); a stocked chip tray is just impossible
  // to miss.
  const reseated = reseatOwner(restored.state, restored.code, myId);
  gameState = reduce(
    {
      ...reseated,
      players: reseated.players.map((p) => (p.id === myId ? p : { ...p, connection: 'disconnected' })),
    },
    { type: 'JOIN', playerId: myId, name: myName },
  );
  // *fix (direct user report): a resumed table never shows the share
  // screen, which is the only place `lastDealCount` was seeded from a
  // preset - so Reshuffle & deal used the FIRST preset's hand size
  // (War's 26: the whole deck between two players). The restored table
  // knows its own, so take it from there.
  lastDealCount = gameState.gameConfig?.cardsPerPlayer ?? lastDealCount;
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
    zonesElement.applyFitZoom(); // the surface just became visible - see applyFitZoom's own declaration
  } else {
    const shareContainer = document.querySelector('#share-code-container');
    renderShareCode(shareContainer, { code: myId });
    document.querySelector('#host-share').hidden = false;
    document.querySelector('#host-deck-config').textContent =
      `Deck: ${describeDeckConfig(gameState.deckConfig)} — the table code changed, share the new one`;
    renderRosterOnly();
  }
}

/**
 * Direct user request: "every game should ONLY be based on preset" -
 * `deckConfig`/`gameConfig` are read entirely off the selected preset
 * (never a manual host control). Extracted (US-116) so New Game can
 * build the exact same shapes for a DIFFERENT preset without a second,
 * drifting copy of this logic - Create Table and New Game differ only
 * in what they do with the result.
 */
function configsForPreset(preset, deckIds, allowsPlayerZones) {
  const deckConfig = {
    type: preset.type ?? 'standard',
    numDecks: preset.numDecks,
    jokers: preset.jokers,
    ...(preset.deckList && { deckList: preset.deckList }),
  };
  // D46: GameConfig's first real field. D53: `piles` (renamed from
  // `zones` - D55, that name now belongs to the real Zone-entity list)
  // comes from the selected preset - US-110: filtered down to only the
  // chosen deck choices (`deckIds`), if the preset offers any at all;
  // every other pile passes through unchanged (`filterDeckChoicePiles`'s
  // own contract). `zones` carries any Zone entities the preset itself
  // declares (e.g. none today reach beyond the always-present Table
  // Zone - Gin Rummy's discard only ever references it, never declares
  // a new one).
  const gameConfig = {
    allowsPlayerZones,
    tableZone: preset.tableZone ?? true,
    piles: filterDeckChoicePiles(preset, deckIds),
    zones: preset.zones ?? [],
    // Carried in the TABLE's config, not just this browser's
    // `lastDealCount` - see `createInitialState`. A restored table has
    // no share screen to re-seed that local value from.
    cardsPerPlayer: preset.cardsPerPlayer,
    // D116: the only way a GUEST can tell which game is live (New Game
    // notice, `noticeNewGameIfPresetChanged`).
    presetName: preset.name,
    // *fix (direct user report): "rtg deck pile's cards too small and
    // don't match the top card" - carried into the real table's
    // `gameConfig` so a GUEST's own render (`applyCardSize`,
    // `renderGameFromView`) sizes cards the same way the host's
    // pre-game preview already does (`onPresetSelected`, below).
    cardSize: preset.cardSize,
    // D134: a preset MAY declare its own table canvas size (the fixed
    // local frame `computeFitZoom` fits to the real viewport - see
    // `tableZoom.js`) when the shared default doesn't suit its own
    // layout's footprint. `undefined` when absent - `applyFitZoom`
    // (main.js) falls back to `TABLE_CANVAS_SIZE` itself.
    tableCanvasSize: preset.tableCanvasSize,
    // How much the built-in Table pile overlaps its cards (`undefined`:
    // the plain pile's own default).
    tableSpread: preset.tableSpread,
    // D141 (US-124): how many SEATS the game has (Gin = 2); everyone
    // after that joins as a spectator.
    playerLimit: preset.playerLimit,
  };
  return { deckConfig, gameConfig };
}

document.querySelector('#create-table').addEventListener('click', async () => {
  const createErrorElement = document.querySelector('#host-create-error');
  // US-110: a preset that offers deck choices must have at least one
  // checked - an empty table is never a valid game, and silently
  // falling back to "every deck" would defeat the whole point of the
  // control (the host unchecked them ON PURPOSE).
  const deckIds = chosenDeckIds(selectedPreset);
  if (deckIds && deckIds.length === 0) {
    createErrorElement.textContent = 'Choose at least one deck.';
    createErrorElement.hidden = false;
    return;
  }
  createErrorElement.hidden = true;

  // A new table supersedes any save - clearing here (rather than on a
  // decline) means a mis-click on "no" never destroys the only copy.
  clearGame(localStorage);
  role = 'host';
  myName = document.querySelector('#host-name').value.trim() || 'Host';
  expectedPlayers = Number(document.querySelector('#host-expected-players').value) || 0;
  const allowsPlayerZones = document.querySelector('#host-allow-player-zones').checked;
  const { deckConfig, gameConfig } = configsForPreset(selectedPreset, deckIds, allowsPlayerZones);
  // US-111 (direct user request: "make the game params sticky"):
  // written on every successful table creation, overwriting whatever
  // the last session left - see `hostSettings.js`'s own "last one wins"
  // shape. Written here (before the session/table actually opens)
  // rather than at the end of this handler so an early return above
  // (no decks chosen) never gets this far and never overwrites a good
  // memory with a table that was never created.
  rememberHostSettings(localStorage, {
    name: myName,
    presetName: selectedPreset.name,
    allowsPlayerZones,
    expectedPlayers,
    deckChoiceIds: deckIds,
  });

  session = Session.host({ name: myName });
  try {
    myId = await session.ready();
  } catch (error) {
    createErrorElement.textContent = 'Could not create a table (code collision or network issue). Try again.';
    createErrorElement.hidden = false;
    console.warn('host session failed to open', error);
    return;
  }
  createErrorElement.hidden = true;

  // US-124 AC2: a host who is only watching takes no seat, so the game
  // is just the players (two bots, say) - the table still runs here.
  requestedRole = document.querySelector('#host-spectate')?.checked ? 'spectator' : 'player';
  gameState = reduce(createInitialState(deckConfig, Math.random, gameConfig), { type: 'JOIN', playerId: myId, name: myName, role: requestedRole });

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

// --- New Game (US-116): host swaps to a different preset, same table,
// same code - no new session/`Session.host` call, unlike Create Table
// just above. Reuses the exact same preset/deck-choice/layout DOM
// (`#host-preset` etc.) rather than a second copy (Smith Gate 1 nit) -
// only which field group is visible, and what the submit button does,
// differs between the two flows. ---
function startNewGameFlow() {
  if (role !== 'host' || !gameState) return;
  document.querySelector('#host-create-only-fields').hidden = true;
  document.querySelector('#host-newgame-only-fields').hidden = false;
  document.querySelector('#new-game-error').hidden = true;
  document.querySelector('#host-share').hidden = true;
  document.querySelector('#host-form').hidden = false;
  showScreen(screens, 'host');
}

function cancelNewGameFlow() {
  document.querySelector('#host-create-only-fields').hidden = false;
  document.querySelector('#host-newgame-only-fields').hidden = true;
  document.querySelector('#host-form').hidden = true;
  document.querySelector('#host-share').hidden = false;
  showScreen(screens, 'game');
  zonesElement.applyFitZoom(); // the surface just became visible - see applyFitZoom's own declaration
  // Undoes any preview drift from changing the preset dropdown while
  // this picker was open (`onPresetSelected` applies a card size live,
  // for the picker's OWN preview) - Cancel means the table underneath
  // never actually changed, so its real size must still win.
  applyCardSize(gameState.gameConfig?.cardSize);
}

document.querySelector('#new-game-btn').addEventListener('click', startNewGameFlow);
document.querySelector('#cancel-new-game-btn').addEventListener('click', cancelNewGameFlow);

document.querySelector('#start-new-game-btn').addEventListener('click', () => {
  const errorElement = document.querySelector('#new-game-error');
  const deckIds = chosenDeckIds(selectedPreset);
  if (deckIds && deckIds.length === 0) {
    errorElement.textContent = 'Choose at least one deck.';
    errorElement.hidden = false;
    return;
  }
  errorElement.hidden = true;
  // Smith Gate 1 AC7: a confirm step, same `globalThis.confirm` pattern
  // `performResetLayout` already uses for its own destructive action -
  // this one is strictly more destructive (the whole table, not just a
  // saved layout), so it says exactly what's discarded.
  const proceed = globalThis.confirm(
    `Discard the current game and start "${selectedPreset.name}" instead? Scores and chips will reset.`);
  if (!proceed) return;

  const allowsPlayerZones = document.querySelector('#host-allow-player-zones').checked;
  const { deckConfig, gameConfig } = configsForPreset(selectedPreset, deckIds, allowsPlayerZones);
  rememberHostSettings(localStorage, {
    name: myName, presetName: selectedPreset.name, allowsPlayerZones, expectedPlayers, deckChoiceIds: deckIds,
  });
  dispatch({ type: 'NEW_GAME', deckConfig, gameConfig });
  lastDealCount = selectedPreset.cardsPerPlayer;
  // Same "Layout picker overrides the preset's own built-in layout"
  // choice Create Table's handler makes, above.
  const chosenOverrideName = layoutSelect.value;
  const chosenOverride = chosenOverrideName
    ? overridesForPreset(localStorage, selectedPreset.name).find((o) => o.name === chosenOverrideName)
    : null;
  applyPresetLayout(localStorage, chosenOverride?.layout ?? selectedPreset.layout);
  cancelNewGameFlow();
});

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
    updateRemoteCursor(gameScreenElement, playerId, resolvePlayerName(playerId), message.data.x, message.data.y);
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
