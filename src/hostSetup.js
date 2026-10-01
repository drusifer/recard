// US-144/D166: the host-setup/new-game cluster's pure/derivation helpers -
// moved out of main.js unchanged, "pure logic, no DOM" split (same
// convention as pileActions.js/touchDrag.js: DOM-building stays covered by
// the existing test-hostsetup/test-newgame browser suites, not new unit
// tests). DOM-building helpers (deckColorDots/renderDeckChoiceLabel/
// renderDeckChoices/chosenDeckIds) move alongside them in this same phase
// (US-144 AC1 groups them together) but stay uncovered by unit tests for
// that reason.
import { filterDeckChoicePiles } from './presets.js';
import { artUrl, rtgColorClasses, PIP_CLASS } from './cards/RtgCardFace.js';
import { Session } from './session.js';
import { createInitialState, reduce, reseatOwner, DECK_PILE_ID } from './state.js';
import { renderShareCode } from './qrcode.js';
import { resolvePlayer } from './identity.js';
import { load as loadGame, clear as clearGame, describeAge, expectedReturners } from './persistence.js';
import { showScreen, applyCardSize } from './ui.js';
import { rememberHostSettings } from './hostSettings.js';
import { overridesForPreset } from './layoutOverrides.js';
import { applyPresetLayout } from './panelLayout.js';

/** D49: named only when it's not the (unstated) default - "1 deck, 0
 * jokers" already means standard, every existing preset's preview text is
 * unchanged by this. */
export function describeDeckConfig({ type, numDecks, jokers }) {
  const deckWord = numDecks === 1 ? 'deck' : 'decks';
  const jokerWord = jokers === 1 ? 'joker' : 'jokers';
  const typePrefix = type && type !== 'standard' ? `${type} ` : '';
  return `${numDecks} ${typePrefix}${deckWord}, ${jokers} ${jokerWord}`;
}

/** D53: a one-line summary of a preset's declared `piles` (renamed from
 * `zones` - D55; Solitaire's 4 foundations + 7 cascades, Spit's 2
 * rank-adjacent piles + a stock per player), or `''` for every
 * pre-Sprint-22 preset that has none. */
export function describeConfiguredZones(pileDeclarations) {
  if (!pileDeclarations?.length) return '';
  // US-83: TOTAL per kind, not one clause per declaration.
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

/** A small row of mana-colour dots (`.rtg-pip`, the same visual vocabulary
 * `RtgCardFace.js`'s cost pips already use). Every dot gets a real name via
 * `title`/`aria-label` (WCAG 1.4.1 - colour is never the only carrier). */
const COLOR_NAME = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

export function deckColorDots(colors) {
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
// only select the first by default" - `colors[0]` is the grouping key
// (WUBRG order, then a trailing colourless bucket), sorted by NAME within
// a group.
const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G'];

/** @param {{colors?: string[]}[]} deckChoices
 * @returns {{color: string|null, decks: object[]}[]} */
export function groupDeckChoicesByColor(deckChoices) {
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

/**
 * One `<label>` grid cell for a single deck choice.
 */
export function renderDeckChoiceLabel(deck, isChecked) {
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
    art.addEventListener('error', () => art.remove());
    thumb.append(art);
  }

  const name = document.createElement('span');
  name.className = 'deck-choice-name';
  name.textContent = deck.name;

  label.append(checkbox, thumb, name, deckColorDots(deck.colors));
  return label;
}

/**
 * US-110: one checkbox per preset-declared `deckChoices` entry, grouped by
 * colour, only the first (post group/sort) checked by default unless
 * `remembered` (US-111) names a selection saved against THIS preset.
 * @param {HTMLElement} deckChoicesElement
 * @param {object} preset
 * @param {string[]|null} remembered
 */
export function renderDeckChoices(deckChoicesElement, preset, remembered) {
  deckChoicesElement.replaceChildren(deckChoicesElement.querySelector('legend'));
  if (!preset.deckChoices?.length) {
    deckChoicesElement.hidden = true;
    return;
  }
  deckChoicesElement.hidden = false;
  const groups = groupDeckChoicesByColor(preset.deckChoices);
  let isFirstDeck = true;
  for (const group of groups) {
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
 * offers no choices to make at all - `filterDeckChoicePiles`'s own "null
 * means every declared pile" contract.
 * @param {HTMLElement} deckChoicesElement
 */
export function chosenDeckIds(deckChoicesElement, preset) {
  if (!preset.deckChoices?.length) return null;
  return [...deckChoicesElement.querySelectorAll('input:checked')].map((element) => element.value);
}

/**
 * Direct user request: "every game should ONLY be based on preset" -
 * `deckConfig`/`gameConfig` are read entirely off the selected preset
 * (never a manual host control). Extracted (US-116) so New Game can build
 * the exact same shapes for a DIFFERENT preset without a second, drifting
 * copy of this logic - Create Table and New Game differ only in what they
 * do with the result.
 */
export function configsForPreset(preset, deckIds, allowsPlayerZones) {
  const deckConfig = {
    type: preset.type ?? 'standard',
    numDecks: preset.numDecks,
    jokers: preset.jokers,
    ...(preset.deckList && { deckList: preset.deckList }),
  };
  const gameConfig = {
    allowsPlayerZones,
    tableZone: preset.tableZone ?? true,
    piles: filterDeckChoicePiles(preset, deckIds),
    zones: preset.zones ?? [],
    cardsPerPlayer: preset.cardsPerPlayer,
    presetName: preset.name,
    cardSize: preset.cardSize,
    tableCanvasSize: preset.tableCanvasSize,
    tableSpread: preset.tableSpread,
    playerLimit: preset.playerLimit,
    // US-150: same "additive, explicit-list" field as the others above -
    // found missing here too (the exact bug `tableCanvasSize`'s own
    // state.js comment already warns about, at a SECOND layer this time).
    playerPileKind: preset.playerPileKind,
  };
  return { deckConfig, gameConfig };
}

/**
 * US-107 (cognitive-complexity pass): the body of the `roster` handler's
 * per-entry loop, extracted unchanged. Seats (or re-seats) exactly one
 * transport roster entry and returns the resulting game state; the
 * caller reassigns `state = seatRosterEntry(r, state, session)`. Mutates
 * `peerToKey`/`identityAnnounced` in place - only `state` (and, via
 * `session.sendTo`/`closePeer`, the transport) has a side effect that
 * has to flow back out.
 *
 * Don't seat a peer that is still `connecting`. D27 already refuses to
 * *announce* identity before the connection is open; seating them
 * earlier has the same defect one step upstream - the host can deal to
 * a peer whose identity hasn't settled, and it re-seats a moment later
 * as a stranger, stranding the dealt hand on a ghost. Sprint 10 fixed
 * this for auto-start by counting connected players; this fixes the
 * manual "Deal & Start" path too, at the source.
 *
 * @param {Map<string,string>} peerToKey
 * @param {Set<string>} identityAnnounced
 */
export function seatRosterEntry(r, state, session, peerToKey, identityAnnounced) {
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
export function offerRestore() {
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

/**
 * D166: the whole host-setup/new-game cluster minus Phase 1's pure
 * helpers - session wiring, resume/restore-waiting, startGame/auto-start,
 * and the New Game flow. `role`/`session`/`myId`/`myName`/`gameState`/
 * `lastDealCount`/`selectedPreset`/`requestedRole` cross into code that
 * stays in main.js (dispatch/talk/motion/rendering/the guest join flow),
 * so they flow through `read()`/`patch()` (D161's pattern) rather than
 * becoming private state here. `awaitedReturners`/`isResumePending`/
 * `expectedPlayers`/`autoStartTimer` are read by nothing outside this
 * cluster, so they ARE real private state.
 *
 * @param {object} dependencies
 * @param {() => {role, session, myId, myName, gameState, latestView, lastDealCount, selectedPreset}} dependencies.read
 * @param {(patch: object) => void} dependencies.patch - merges into main.js's own `let`s
 * @param {Map<string,string>} dependencies.peerToKey
 * @param {Set<string>} dependencies.identityAnnounced
 * @param {(id: string) => void} dependencies.forgetPeer
 * @param {(action: object) => void} dependencies.dispatch
 * @param {(speakerKey: string, msg: object) => void} dependencies.publishTalk
 * @param {(playerKey: string, msg: object) => void} dependencies.applyIncomingMotion
 * @param {(fromPeerId: string, msg: object) => void} dependencies.relayMotion
 * @param {() => void} dependencies.broadcastViews
 * @param {(view: object) => void} dependencies.renderGameFromView
 * @param {() => void} dependencies.renderRosterOnly
 * @param {(id: string) => void} dependencies.showGameCode
 * @param {() => boolean} dependencies.isSessionEnded
 * @param {object} dependencies.screens
 * @param {{applyFitZoom: () => void}} dependencies.zonesElement
 * @param {HTMLElement} dependencies.deckChoicesElement
 * @param {HTMLSelectElement} dependencies.layoutSelect
 */
export function createHostSession(dependencies) {
  const {
    read, patch, peerToKey, identityAnnounced, forgetPeer,
    dispatch, publishTalk, applyIncomingMotion, relayMotion,
    broadcastViews, renderGameFromView, renderRosterOnly,
    showGameCode, isSessionEnded, screens, zonesElement,
    deckChoicesElement, layoutSelect,
  } = dependencies;

  /**
   * US-45/D33: who a restored table is still waiting for. Only players
   * who were CONNECTED when the game was saved (Smith Gate 1 blocker -
   * someone who quit an hour before the reload is still in
   * `state.players`, and waiting for them means the resume never
   * fires). Private: nothing outside this cluster reads either field.
   */
  let awaitedReturners = [];
  let isResumePending = false;

  /**
   * Every host-side session handler, shared by creating a new table and
   * restoring a saved one - so the two paths can't drift apart.
   */
  function wireHostSession() {
    const { session } = read();
    session.on('roster', (transportRoster) => {
      // *fix (direct user report: rejoining as the "joiner" left them
      // looking at their OWN hand as if it were an opponent's, labeled
      // with a name that wasn't "You"). Root cause, confirmed live (held
      // for 25s and never resolved on its own): PeerJS/WebRTC's own
      // disconnect detection is unreliable enough that an abruptly
      // closed tab's connection can still look "connected" indefinitely.
      // `identity.js`'s `resolvePlayer` no longer refuses a returning
      // key just because some OTHER peer id still maps to it (direct
      // user decision, weighing this against the original anti-hijack
      // intent: false-positived on ordinary reconnects far more often
      // than it ever caught a real second tab) - `seatRosterEntry`
      // actively evicts that other connection instead once it does.
      //
      // The two passes just below are `peerToKey`/`identityAnnounced`
      // hygiene, independent of the above: a peer that vanishes without
      // ever producing a `disconnected` roster entry would otherwise
      // leak its mapping forever, and a `disconnected` entry sharing the
      // same roster snapshot as a reconnecting one needs to be cleaned
      // up before anything else resolves this tick, regardless of the
      // roster's own array order.
      const currentIds = new Set(transportRoster.map((r) => r.id));
      for (const id of peerToKey.keys()) if (!currentIds.has(id)) forgetPeer(id);
      for (const r of transportRoster) if (r.connection === 'disconnected') forgetPeer(r.id);
      let state = read().gameState;
      for (const r of transportRoster) state = seatRosterEntry(r, state, session, peerToKey, identityAnnounced);
      patch({ gameState: state });
      broadcastViews();
    });

    session.on('data', ({ fromId, msg }) => {
      if (msg.type === 'talk') {
        // D27/D138: the line is stamped with the identity this address
        // speaks for - never a name the sender claims. Unmapped peers
        // are ignored, same as their actions.
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
        // The transport tells us the *address*; authority is bound to
        // the identity that address currently speaks for (D27).
        // Unmapped peers are ignored rather than trusted.
        const actorKey = peerToKey.get(fromId);
        if (!actorKey) return;
        dispatch({ ...msg.action, playerId: actorKey });
      } catch (error) {
        console.warn('Rejected action from', fromId, error);
      }
    });
  }

  async function resumeHostedTable() {
    const restored = offerRestore();
    if (!restored) return;

    // US-39: the saved table remembers who was hosting it, so restoring
    // doesn't ask again. A typed name still wins if there is one.
    const myName = document.querySelector('#host-name').value.trim() || restored.hostName || 'Host';
    let session = Session.host({ name: myName, code: restored.code });
    const createErrorElement = document.querySelector('#host-create-error');
    let isReclaimed = true;
    let myId;
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

    // D33/US-43: KEEP the saved players, marked away until they come
    // back.
    //
    // This line used to wipe them (`players: []`) with the comment "the
    // saved roster refers to ids from the previous session". That was
    // true before D27 and is not true now: a player's id IS their
    // `playerKey`, which their own browser holds across sessions.
    // Wiping the roster makes every returning key *unknown* to
    // `resolvePlayer`, so it hands out a fresh seat - and their restored
    // hand, which is keyed by the old key, is orphaned. Keeping them is
    // what makes US-43 work at all.
    //
    // The previous host entry is dropped and re-seated under the
    // current id, because the host's id is a peer id rather than a
    // playerKey. *fix (direct user report): "chip tray dups again when
    // resuming an existing game". This used to DROP the saved host
    // entry and JOIN under the new peer id, which made JOIN treat the
    // host as a new player and build their declared `perPlayer` piles
    // all over again - a second chip tray, with the host's actual chips
    // stranded in the first one. `reseatOwner` MOVES them instead: the
    // player, their piles and contents, their zones and their score all
    // follow the new id, so JOIN recognises them and creates nothing.
    //
    // Pre-existing for every `perPlayer` declaration (Spit's stock,
    // RtG's battlefield/discard/exile); a stocked chip tray is just
    // impossible to miss.
    const reseated = reseatOwner(restored.state, restored.code, myId);
    const gameState = reduce(
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
    const lastDealCount = gameState.gameConfig?.cardsPerPlayer ?? read().lastDealCount;
    awaitedReturners = expectedReturners(restored.state, restored.code);
    patch({ role: 'host', myName, session, myId, gameState, lastDealCount });

    document.querySelector('#host-form').hidden = true;
    // Resume goes straight back to the table. Deal & Start would begin
    // a *new round* - the whole point of restoring is to carry on the
    // one that was interrupted, so requiring it to see your own table
    // is both an extra step and a destructive one.
    //
    // This supersedes Smith's Gate 1 amendment 3 ("land on the share
    // screen"), and the reason it can: US-39 means guests rejoin on
    // their own, so the host no longer has to re-share the code to get
    // players back. If the code *changed*, that assumption breaks - so
    // in that one case we still show the share screen, because the code
    // guests remembered is now wrong.
    wireHostSession();
    showGameCode(myId);
    if (isReclaimed) {
      // US-45: if anyone was at the table when it was saved, wait for
      // them and say who by name, rather than dropping the host into a
      // game whose other seats are silently empty.
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
   * Names still missing, resolved live against the current roster.
   */
  function stillMissing() {
    const { gameState } = read();
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
      // Smith Gate 1 #4: by NAME. "2 of 3" doesn't tell a host whether
      // to keep waiting; "Bob is still out" does.
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
    const { latestView } = read();
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

  /**
   * US-42/D30: how many players to wait for before starting on our own.
   * Host-local, never game state - see D30. Empty/0 means no auto-start,
   * which is exactly the behaviour before this existed. Private: nothing
   * outside this cluster reads it (create-table sets it, New Game's
   * `rememberHostSettings` call reads it, both inside this module).
   */
  let expectedPlayers = 0;
  let autoStartTimer = null;

  /**
   * Fires at most once, without needing a flag to say so: the guard is a
   * condition that is only true before the game begins (D30). `startGame`
   * leaves the share screen, so the trigger is structurally dead
   * afterwards - a player leaving and rejoining mid-game therefore cannot
   * re-deal a round in progress, and unlike a boolean this survives a
   * host reload with nothing extra to persist or reset.
   *
   * Auto-start must NOT run inline from the render path.
   *
   * `renderRosterOnly` is called from inside the `session.on('roster')`
   * handler, part-way through its loop over the transport roster - before
   * that peer's `SET_CONNECTION` has been applied and before `peerToKey` /
   * `identityAnnounced` are consistent for it. Starting the game there
   * dispatches and broadcasts mid-iteration, and the client ends up
   * joined twice: one ghost seat holding the dealt cards and one live
   * seat holding nothing. Observed exactly that - a roster reading "Dan -
   * disconnected (6 cards)" beside "Dan - connected (0 cards)".
   *
   * Deferring to a macrotask lets the roster handler finish and settle
   * identity first, so auto-start sees the same settled state a host
   * clicking the button by hand would have seen.
   */
  function scheduleAutoStartCheck() {
    if (!expectedPlayers || read().role !== 'host') return;
    clearTimeout(autoStartTimer);
    autoStartTimer = setTimeout(maybeAutoStart, 0);
  }

  function maybeAutoStart() {
    if (!expectedPlayers || isSessionEnded() || read().role !== 'host') return;
    // `showScreen` hides `#screen-host`, NOT `#host-share` (which is a
    // div inside it), so checking `#host-share.hidden` here was dead
    // code - it never became true. The game screen being visible is the
    // real "already started" signal.
    if (!screens.game.hidden) return;
    // CONNECTED players only, not seats. A peer appears on the roster
    // while still `connecting`, and dealing to it is the same mistake
    // D27 already documents for the identity announcement: the client
    // isn't ready to receive, never gets told which identity it is, and
    // reconnects as a stranger - leaving a ghost seat holding the dealt
    // cards and a live seat holding nothing. Waiting for `connected` is
    // the same settled-state condition D27 uses, not a timing guess.
    const joined = read().gameState?.players.filter((p) => p.connection === 'connected').length ?? 0;
    const statusElement = document.querySelector('#autostart-status');
    if (joined >= expectedPlayers) {
      // Zeroed BEFORE starting, not after. D30 argued the share-screen
      // check was a sufficient once-only guard; writing it showed it
      // isn't, because `startGame` dispatches first and only then leaves
      // the screen - so the re-render triggered by that dispatch
      // re-enters here with the screen still visible and the condition
      // still true, and recurses. The screen check still earns its place
      // for later rejoins; this closes the re-entrant path it can't see.
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

  async function createTable() {
    const createErrorElement = document.querySelector('#host-create-error');
    const { selectedPreset } = read();
    // US-110: a preset that offers deck choices must have at least one
    // checked - an empty table is never a valid game, and silently
    // falling back to "every deck" would defeat the whole point of the
    // control (the host unchecked them ON PURPOSE).
    const deckIds = chosenDeckIds(deckChoicesElement, selectedPreset);
    if (deckIds && deckIds.length === 0) {
      createErrorElement.textContent = 'Choose at least one deck.';
      createErrorElement.hidden = false;
      return;
    }
    createErrorElement.hidden = true;

    // A new table supersedes any save - clearing here (rather than on a
    // decline) means a mis-click on "no" never destroys the only copy.
    clearGame(localStorage);
    const myName = document.querySelector('#host-name').value.trim() || 'Host';
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

    const session = Session.host({ name: myName });
    let myId;
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
    const requestedRole = document.querySelector('#host-spectate')?.checked ? 'spectator' : 'player';
    const gameState = reduce(createInitialState(deckConfig, Math.random, gameConfig), { type: 'JOIN', playerId: myId, name: myName, role: requestedRole });
    patch({ role: 'host', myName, session, myId, gameState, requestedRole });

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
      // later defaults to the preset's own hand size instead of
      // silently resetting to 1.
      patch({ lastDealCount: selectedPreset.cardsPerPlayer });
      // UX follow-up (direct user request): "update the preset to use
      // this layout... and preset the layouts for the other games too" -
      // a preset's own `layout` (its shared, deterministically-id'd
      // panels only - never a per-player one) seeds this browser's
      // local panel arrangement (`panelLayout.js`) the moment its table
      // is actually created, not merely previewed in the dropdown.
      //
      // US-70 (D61): the "Layout" picker's choice, when it names a
      // saved override, takes over from the preset's own built-in
      // `layout` here - same `applyPresetLayout` call, just a different
      // source object. Falls back to the built-in default when
      // "Default" (empty value) is selected, or nothing was ever saved
      // for this preset.
      const chosenOverrideName = layoutSelect.value;
      const chosenOverride = chosenOverrideName
        ? overridesForPreset(localStorage, selectedPreset.name).find((o) => o.name === chosenOverrideName)
        : null;
      applyPresetLayout(localStorage, chosenOverride?.layout ?? selectedPreset.layout);
    }
    renderRosterOnly();

    wireHostSession();
  }

  // --- New Game (US-116): host swaps to a different preset, same table,
  // same code - no new session/`Session.host` call, unlike Create Table
  // just above. Reuses the exact same preset/deck-choice/layout DOM
  // (`#host-preset` etc.) rather than a second copy (Smith Gate 1 nit) -
  // only which field group is visible, and what the submit button does,
  // differs between the two flows. ---
  function startNewGameFlow() {
    const { role, gameState } = read();
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
    applyCardSize(read().gameState.gameConfig?.cardSize);
  }

  function startNewGame() {
    const errorElement = document.querySelector('#new-game-error');
    const { selectedPreset, myName } = read();
    const deckIds = chosenDeckIds(deckChoicesElement, selectedPreset);
    if (deckIds && deckIds.length === 0) {
      errorElement.textContent = 'Choose at least one deck.';
      errorElement.hidden = false;
      return;
    }
    errorElement.hidden = true;
    // Smith Gate 1 AC7: a confirm step, same `globalThis.confirm`
    // pattern `performResetLayout` already uses for its own destructive
    // action - this one is strictly more destructive (the whole table,
    // not just a saved layout), so it says exactly what's discarded.
    const proceed = globalThis.confirm(
      `Discard the current game and start "${selectedPreset.name}" instead? Scores and chips will reset.`);
    if (!proceed) return;

    const allowsPlayerZones = document.querySelector('#host-allow-player-zones').checked;
    const { deckConfig, gameConfig } = configsForPreset(selectedPreset, deckIds, allowsPlayerZones);
    rememberHostSettings(localStorage, {
      name: myName, presetName: selectedPreset.name, allowsPlayerZones, expectedPlayers, deckChoiceIds: deckIds,
    });
    dispatch({ type: 'NEW_GAME', deckConfig, gameConfig });
    patch({ lastDealCount: selectedPreset.cardsPerPlayer });
    // Same "Layout picker overrides the preset's own built-in layout"
    // choice Create Table's handler makes, above.
    const chosenOverrideName = layoutSelect.value;
    const chosenOverride = chosenOverrideName
      ? overridesForPreset(localStorage, selectedPreset.name).find((o) => o.name === chosenOverrideName)
      : null;
    applyPresetLayout(localStorage, chosenOverride?.layout ?? selectedPreset.layout);
    cancelNewGameFlow();
  }

  document.querySelector('#deal-btn').addEventListener('click', startGame);
  document.querySelector('#create-table').addEventListener('click', createTable);
  document.querySelector('#new-game-btn').addEventListener('click', startNewGameFlow);
  document.querySelector('#cancel-new-game-btn').addEventListener('click', cancelNewGameFlow);
  document.querySelector('#start-new-game-btn').addEventListener('click', startNewGame);

  return {
    wireHostSession, offerRestore, resumeHostedTable,
    stillMissing, renderWaitingForReturners, maybeResumeRestored, finishRestore,
    startGame, scheduleAutoStartCheck, maybeAutoStart,
    startNewGameFlow, cancelNewGameFlow,
  };
}
