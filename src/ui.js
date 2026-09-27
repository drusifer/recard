import { pileLevelActions } from './pileActions.js';
import { seatPosition } from './seating.js';
import { cardElement, cardBackElement } from './pileCards.js';
import { attachTouchDrag } from './dragDrop.js';
import { ZONE_TYPES } from './zones/zoneTypes.js';

/**
 * D55 (Sprint 23): Zone is a real, independently-declared entity -
 * `zoneRecords` (`state.zones`, `viewFor`'s `zones`) is the real
 * registry a pile's own `zoneId` points into, and each record's own
 * `type` (`'shared'`/`'perPlayer'`, `src/zones/zoneTypes.js`) drives
 * its default class/position - the same one-module-per-type dispatch
 * `PILE_TYPES` already uses for Piles, instead of `ui.js` branching on
 * whether `ownerId` happens to be truthy. This function has zero
 * opinion about which Zone a pile starts in or how it got there
 * (`state.js`'s `GameConfig.zones`/`buildPiles`/`MOVE_PILE` own that
 * entirely) - it just groups `piles` by `zoneId` and renders one
 * generic `<zone-panel>` per group.
 *
 * A `perPlayer`-type Zone renders "in front of" its owner's seat by
 * default (its own type module's `defaultPosition`); a `shared`-type
 * Zone defaults to normal flex-wrap flow (`#zones`'s own CSS). Either
 * kind switches to an absolutely-positioned, plain top-left
 * `panel-moved` panel the first time it's dragged/resized
 * (`wirePanelLayout`, `opts.layout` - a LOCAL, per-browser preference,
 * `panelLayout.js`, not replicated game state).
 *
 * `seatedPlayers` must be in the same seat order used to render the
 * roster (viewer first, D18), so a personal Zone lands at the SAME
 * seat its owner's roster entry is drawn at; one with no seated owner
 * (shouldn't happen) is skipped defensively.
 */
/**
 * One Zone group's own render (US-107, cognitive-complexity extraction
 * from `renderZones` - unchanged, including its skip-defensively `return`
 * where the loop used to `continue`).
 *
 * `zoneId`/`record` is a validated reference (`state.js`'s `buildPiles`
 * throws at table-creation time on anything that isn't) - every group
 * here has a real record, no defensive fallback needed.
 */
function renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options) {
  const record = zoneRecords.find((z) => z.id === zoneId);
  const zoneType = ZONE_TYPES[record.type];

  let seatIndex = -1;
  if (record.ownerId) {
    seatIndex = seatedPlayers.findIndex((p) => p.id === record.ownerId);
    if (seatIndex === -1) return; // owner not in the current roster (shouldn't happen) - skip defensively
  }

  const zoneElement = document.createElement('zone-panel');
  container.append(zoneElement);

  if (!record.ownerId) {
    // *nit fix (direct user request, "don't hide zone headings
    // ever"): previously suppressed for a single-pile zone (the
    // reasoning being "the lone pile's own heading already says the
    // same thing") - reversed. The suppression is exactly what made
    // an ungrouped pile (`MOVE_PILE`'s own "drop on open table space"
    // case, `zoneId` freshly minted to the pile's own id) look
    // parentless: no visible Zone heading at all, only the pile's -
    // indistinguishable from a pile that was never grouped into a
    // real Zone at all. Always render it now, `record.name` as-is.
    zoneElement.render(record.id, record.name, pilesInZone, piles, options);
    return;
  }

  const ownerName = options.resolveOwnerName?.(record.ownerId) ?? record.ownerId;
  zoneElement.render(record.id, ownerName, pilesInZone, piles, options);
  // US-121/D142: a bot's thought bubble belongs on its SEAT - which is
  // this panel, since the in-game roster ring was retired. The
  // decisions come from the talk log (`decisionsBySpeaker`); which
  // bubble is open is client-local state `main.js` holds across the
  // re-render every broadcast causes.
  const thoughts = options.thoughts?.get(record.ownerId);
  if (thoughts?.decisions.length) {
    const bubble = document.createElement('thought-bubble');
    bubble.dataset.who = ownerName;
    bubble.dataset.playerId = record.ownerId;
    zoneElement.append(bubble);
    bubble.render({ decisions: thoughts.decisions, open: options.openThoughtId === record.ownerId });
  }
  // AFTER `.render()`, not before - `renderZonePanel`'s own first
  // line (`zoneEl.className = 'zone'`) would otherwise wipe this
  // class out.
  if (zoneType.className) zoneElement.classList.add(zoneType.className);
  // `wirePanelLayout` (called inside `render` above) only ever sets
  // `left`/`top` once a REAL stored position exists - a player zone
  // with none yet still needs its ring-position default, same as it
  // always has.
  if (!zoneElement.classList.contains('panel-moved')) {
    const pos = zoneType.defaultPosition(seatIndex, seatedPlayers.length);
    if (pos) {
      zoneElement.style.left = `${pos.leftPct}%`;
      zoneElement.style.top = `${pos.topPct}%`;
    }
  }
}

export function renderZones(container, piles, seatedPlayers, zoneRecords, options = {}) {
  container.replaceChildren();

  const byZoneId = new Map();
  for (const pile of piles) {
    if (!byZoneId.has(pile.zoneId)) byZoneId.set(pile.zoneId, []);
    byZoneId.get(pile.zoneId).push(pile);
  }

  for (const [zoneId, pilesInZone] of byZoneId) {
    renderOneZone(zoneId, pilesInZone, piles, zoneRecords, seatedPlayers, container, options);
  }
}

/**
 * Renders the draw deck as a small face-down stack with a count badge
 * (US-20) instead of just a text counter, plus (when relevant) the
 * always-visible Deal count input - purely presentational, draw
 * mechanics (US-7) are unchanged.
 *
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - this is now ONLY the deck's row
 * content (the stack + count input), the same role `<fan-pile>` plays
 * for a hand - the heading (title + Draw/Deal/Reshuffle/Shuffle/Split
 * buttons) is built generically by `<pile-panel>` now, via
 * `pileLevelActions('deck', ...)`, same as any other pile's heading.
 * Used both as `<deck-stack>`'s row inside `<pile-panel>` (`opts.isHost`
 * set) and directly by the pre-game preview screen (`#host-deck-area`,
 * no opts - no host controls exist on that screen at all).
 */
/**
 * How many decorative layers sit under the deck's top card - purely a
 * visual sense of thickness, capped so a 52-card deck doesn't render 51
 * elements nobody can see. One layer per ~8 cards reads as "thick",
 * "half", "nearly gone" without anyone counting them.
 */
function deckDepth(count) {
  return Math.min(5, Math.floor((count - 1) / 8));
}

export function renderDeckStack(container, count, options = {}) {
  container.replaceChildren();
  // `classList.add`, not `className =` - `#host-deck-area` (the pre-game
  // preview screen) already carries `.deck-area` from static markup and
  // must keep it; `<deck-stack>` (inside `<pile-panel>`) starts with none,
  // so adding is equivalent to setting there.
  container.classList.add('deck-area-row');

  // D29: the stack and the controls are SIBLINGS. The empty-deck
  // short-circuit below therefore hides the cards only - it used to hide
  // the whole container, which would have taken the deal controls with it
  // exactly when a host most needs them (Smith Gate 1 blocker). The fix
  // is the structure, not a special case inside it.
  const stack = document.createElement('div');
  stack.className = 'deck-stack';
  if (count > 0) {
    // D66/D67, direct user correction: "I should only see 1 card" -
    // was up to 3 purely decorative stacked backs; now exactly one
    // real card element, same as any other pile ever renders for a
    // single card. `options.topCard` (D67: `viewFor` now exposes a
    // hidden pile's own top card, redacted to `{id, faceDown: true}`)
    // carries the real id this needs to be a genuine drag source -
    // absent on the pre-game preview screen (`#host-deck-area`, no
    // game running yet), which stays a plain inert visual exactly as
    // before.
    // *nit (direct user request): "show the stacking for the deck of
    // cards. right now it looks like there's only 1 card there."
    //
    // This REVERSES D66/D67, which removed decorative backs on an
    // earlier direct correction ("I should only see 1 card"). Both are
    // recorded because the reason differs: that removal was about there
    // being three DRAGGABLE cards where one card should be; these layers
    // are inert (`pointer-events: none`, `aria-hidden`) and exist only
    // to give the deck depth. Exactly one real, draggable card still
    // sits on top, which is the part that correction was protecting.
    //
    // Depth scales with the deck so a thick one looks thick and the last
    // few cards visibly thin out - the count badge says the number, this
    // says "a lot" or "nearly gone" at a glance.
    // *nit: the box has to grow with the stack, or a full deck's lowest
    // layers are clipped ("a full deck needs a little more room then an
    // empty one"). Set from the real layer count so it shrinks back too.
    const depth = deckDepth(count);
    stack.style.setProperty('--deck-depth', `calc(${depth} * var(--stack-step))`);
    stack.style.setProperty('--deck-drift', `calc(${depth} * var(--stack-step-x))`);
    for (let layer = depth; layer > 0; layer--) {
      const shim = document.createElement('div');
      shim.className = 'deck-stack-layer';
      shim.style.setProperty('--layer', String(layer));
      shim.setAttribute('aria-hidden', 'true');
      stack.append(shim);
    }
    const back = cardBackElement(options.topCard);
    back.classList.add('deck-stack-card');
    stack.append(back);
    // D95 (direct user request: "make card counts a feature for all
    // Piles... like a badge"): every real pile now gets a universal
    // corner badge from `PileElement` itself - `<deck-stack>`'s OWN
    // badge here would double up with it. `options.pileId` is only ever
    // set by `DeckStackElement` (a real pile, wrapped in
    // `PileElement`); the pre-game preview screen (`#host-deck-area`)
    // calls this directly with no `pileId` and no `PileElement`
    // wrapper at all, so it still needs this one to show anything.
    if (!options.pileId) {
      const badge = document.createElement('span');
      badge.className = 'deck-count-badge';
      badge.textContent = count;
      stack.append(badge);
    }
    // D67, direct user correction ("drop isn't triggering an action
    // it's moving cards around... use the same mechanism as all the
    // other piles, this is a generic pile behavior for all piles"):
    // wired exactly like `renderPileCards`'s own per-card drag - a
    // real card id in `dataTransfer`, the same `onDropCard`/
    // `onCardDrag`/`attachTouchDrag` plumbing every other pile's cards
    // already use. No new mechanism, no pile-specific special case -
    // dropping this wherever it lands dispatches the ordinary MOVE/
    // PICKUP/MOVE path (`dropCardOnPile`, main.js) unchanged, because
    // it now carries a real, findable card id.
    if (options.topCard && options.onDropCard) {
      back.draggable = true;
      back.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', options.topCard.id);
      });
      back.addEventListener('drag', (event) => options.onCardDrag?.(options.topCard, event.clientX, event.clientY));
      back.addEventListener('dragend', () => options.onCardDrag?.(null, 0, 0));
      attachTouchDrag(back, options.topCard, {
        onDropCard: options.onDropCard,
        onCardDrag: options.onCardDrag,
        onCardLift: options.onCardLift,
      });
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'deck-empty';
    empty.textContent = 'Deck empty';
    stack.append(empty);
  }
  container.append(stack);

  // Deal's count input stays persistent/always-visible - unchanged from
  // D52. UX follow-up (direct user request): "just make the split action
  // always split in half" - no count input for split any more, it's a
  // one-click action like every other deck action now.
  // *fix (queued 2026-09-10, "All players have access to all pile
  // actions no matter what"): `deal`/`reshuffleDeal` are no longer
  // host-only, so this input shows for every viewer now.
  const actions = pileLevelActions('deck', {});
  if (actions.includes('deal') || actions.includes('reshuffleDeal')) {
    container.append(pileCountInput({
      value: options.dealCount ?? 1, onChange: options.onDealCountChange,
      min: 1, max: 20, ariaLabel: 'Cards to deal each player', inputId: 'deck-deal-count',
    }));
  }
}

/** D52: a small, always-visible number input for a pile-level action's
 * count setting (Deal's cards-per-player) - see `renderDeck`'s own
 * comment for why this lives outside the radial menu now. UX follow-up:
 * Split no longer has one - it always splits into 2, no count to set. */
function pileCountInput({ value, onChange, min, max, ariaLabel, inputId }) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min ?? 1);
  input.max = String(max ?? 20);
  input.value = String(value ?? min ?? 1);
  input.className = 'pile-anchor-count';
  if (inputId) input.id = inputId;
  input.setAttribute('aria-label', ariaLabel ?? 'Count');
  input.addEventListener('input', () => onChange?.(Number(input.value)));
  return input;
}

/**
 * A compact fan of face-down mini-cards representing another player's
 * hand (US-21) - capped at a handful of visible backs regardless of
 * actual hand size, so this stays compact even with 3+ players holding
 * 10+ cards each (Smith Gate 1). No count badge here - the roster row's
 * own `(N cards)` text is already the exact count (Smith Sprint 3
 * close-out finding: a second badge repeating the same number ran
 * together with the row text, redundant and visually squished).
 */
function renderMiniHand(container, count) {
  container.className = 'mini-hand';
  const shown = Math.min(count, 5);
  for (let index = 0; index < shown; index++) {
    const back = document.createElement('div');
    back.className = 'mini-card-back';
    back.style.marginLeft = index === 0 ? '0' : '-0.85rem';
    container.append(back);
  }
}


/**
 * `seated: true` (US-26, D18) positions each player absolutely around
 * the table surface instead of stacking them in a plain list - same
 * per-player info as before (Smith Gate 1: this redesign changes WHERE
 * it's drawn, not what it shows), plus an explicit "You" marker on the
 * viewer's own seat (Smith Gate 1: position alone is ambiguous).
 * `players` must already be in seat order (viewer first) when seated.
 */
/**
 * One roster row (US-107, cognitive-complexity extraction from
 * `renderRoster` - unchanged). A seat is one horizontal row:
 * [-] [who they are + score] [+]. The score buttons used to be appended
 * *after* the text inside the card, which on a narrow seat pushed them
 * out past its own edge and over whatever sat next to it. Flanking the
 * info keeps both 44px targets inside the card and makes the seat
 * wider-than-taller, which is what the table has room for.
 */
/**
 * The words on a roster entry: name, connection, and whatever else is
 * true of this player right now.
 */
function rosterLabel(p, { movingIds, myId, seated, isSpectator }) {
  const count = typeof p.handCount === 'number' ? ` (${p.handCount} cards)` : '';
  const moving = movingIds?.has(p.id) ? ' \u{270B} organizing hand' : '';
  const youTag = seated && p.id === myId ? ' \u{1F9D1} You' : '';
  const spectatorTag = isSpectator ? ' \u{1F440} spectating' : '';
  return `${p.name} - ${p.connection}${count}${moving}${youTag}${spectatorTag}`;
}

function scoreButton(text, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'score-btn';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function renderRosterEntry(container, p, index, players, { movingIds, scores, onAdjustScore, myId, seated } = {}) {
  const li = document.createElement('li');
  li.className = `roster-player roster-${p.connection}`;
  // US-124: a spectator is on the same roster as everyone else (D141),
  // marked rather than hidden - people need to know who is watching.
  const isSpectator = p.role === 'spectator';
  if (isSpectator) li.classList.add('roster-spectator');
  if (seated) {
    const { leftPct, topPct } = seatPosition(index, players.length);
    li.style.left = `${leftPct}%`;
    li.style.top = `${topPct}%`;
    li.classList.add('seat');
    if (p.id === myId) li.classList.add('seat-you');
  }
  const info = document.createElement('span');
  info.className = 'seat-info';
  info.append(rosterLabel(p, { movingIds, myId, seated, isSpectator }));

  if (p.id !== myId && typeof p.handCount === 'number') {
    const miniHandElement = document.createElement('div');
    renderMiniHand(miniHandElement, p.handCount);
    info.append(miniHandElement);
  }

  const hasScore = scores && Object.hasOwn(scores, p.id);
  if (hasScore) {
    const scoreElement = document.createElement('span');
    scoreElement.className = 'score-row';
    scoreElement.append(`Score: ${scores[p.id]}`);
    info.append(scoreElement);
  }

  if (hasScore && onAdjustScore) {
    li.append(scoreButton('-', () => onAdjustScore(p.id, -1)), info, scoreButton('+', () => onAdjustScore(p.id, 1)));
  } else {
    li.append(info);
  }

  container.append(li);
}

export function renderRoster(container, players, options = {}) {
  container.replaceChildren();
  // US-124/D141: spectators have no seat, so they take no place in the
  // ring - seat index and angle are computed against the SEATED players
  // only, and a spectator is drawn as a plain row instead.
  const seatedPlayers = players.filter((p) => p.role !== 'spectator');
  for (const p of players) {
    if (p.role !== 'spectator' || p.id === options.hideId) continue;
    renderRosterEntry(container, p, 0, seatedPlayers, { ...options, seated: false });
  }
  for (const [index, p] of seatedPlayers.entries()) {
    // UX follow-up: the viewer's own seat now lives in the merged
    // hand+zone panel (`renderSeatZones`'s `opts.own`), not the ring -
    // skipping the `<li>` here (not filtering `players` itself) keeps
    // everyone ELSE's seat index/angle math unchanged, since it's still
    // computed against the real roster length and position.
    if (p.id === options.hideId) continue;
    renderRosterEntry(container, p, index, seatedPlayers, options);
  }
}

/**
 * Renders the static rules-reference content (US-18) into a container.
 * One consistent block per game (goal/setup/turns), per Smith's Gate 1 AC.
 */
export function renderRulesPanel(container, rulesReference) {
  container.replaceChildren();
  for (const [name, entry] of Object.entries(rulesReference)) {
    const block = document.createElement('div');
    block.className = 'rules-entry';
    const heading = document.createElement('h3');
    heading.textContent = name;
    block.append(heading);

    const dl = document.createElement('dl');
    for (const [label, value] of [['Goal', entry.goal], ['Setup', entry.setup], ['Turns', entry.turns]]) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    }
    block.append(dl);
    container.append(block);
  }
}

/**
 * Toggles the "lifted" visual state on every rendered instance of a card
 * (a card can appear once per zone it's currently in - normally just
 * one place, but this stays correct regardless). Cosmetic only.
 */
export function setCardLifted(pileableId, active) {
  const els = document.querySelectorAll(`[data-pileable-id="${CSS.escape(pileableId)}"]`);
  for (const element of els) element.classList.toggle('card-lifted', active);
}

/**
 * Live remote cursor (US-22, D13): a small labeled dot positioned via
 * normalized (0-1) coordinates within `container` (the caller passes the
 * game screen element, matching how the position was captured).
 */
export function updateRemoteCursor(container, playerId, name, x, y) {
  let element = container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`);
  if (!element) {
    element = document.createElement('div');
    element.className = 'remote-cursor';
    element.dataset.cursorId = playerId;
    const label = document.createElement('span');
    label.className = 'remote-cursor-label';
    label.textContent = name;
    element.append(label);
    container.append(element);
  }
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
}

export function removeRemoteCursor(container, playerId) {
  container.querySelector(`[data-cursor-id="${CSS.escape(playerId)}"]`)?.remove();
}

/**
 * Live card-drag ghost (US-29, D19): same normalized-position pattern as
 * the remote cursor, but shows an actual card - its real face if `card`
 * is given (already resolved by the caller to a full `{id,rank,suit}`
 * object, only ever done for a card that's genuinely public), or a
 * generic anonymous back if `card` is `null` (still-hidden to this
 * viewer - D19's privacy rule, enforced by the sender never including a
 * resolvable id in the first place, not by this function).
 */
export function updateDragGhost(container, playerId, card, x, y) {
  let element = container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`);
  if (!element) {
    element = document.createElement('div');
    element.className = 'card-drag-ghost';
    element.dataset.cardDragId = playerId;
    container.append(element);
  }
  element.replaceChildren();
  element.append(card ? cardElement(card, { disabled: true }) : cardBackElement(null));
  element.style.left = `${x * 100}%`;
  element.style.top = `${y * 100}%`;
}

export function removeDragGhost(container, playerId) {
  container.querySelector(`[data-card-drag-id="${CSS.escape(playerId)}"]`)?.remove();
}

/**
 * @param {{tone?: 'danger'|'info'}} [options] Smith HCI finding (live,
 * US-116): every prior caller is a real problem (lost host, session
 * ended) - the shared `.banner` styling (red, `--danger`) fits those.
 * The New Game notice is neutral status, not a problem, so it opts into
 * `.banner-info` instead of inheriting the alarming default - existing
 * callers are unaffected (`tone` defaults to the original look).
 */
export function renderBanner(container, message, { tone = 'danger' } = {}) {
  container.textContent = message ?? '';
  container.hidden = !message;
  container.classList.toggle('banner-info', tone === 'info');
}

export function showScreen(screens, name) {
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
}

/**
 * *fix (direct user report): "rtg deck pile's cards too small and don't
 * match the top card" - the root cause was RtG cards being sized
 * through their OWN separate `.card-rtg`-scoped constants while the
 * deck stack's decorative depth layers (and its outer box) stayed sized
 * from the global `--card-w`/`--card-h`, so the two drifted apart.
 * Direct user correction: don't special-case RtG - every card
 * measurement (`.card`, `.deck-stack`, `.deck-stack-layer`,
 * `.deck-stack-card`, hand fan spread, ...) already reads `--card-w`/
 * `--card-h` from `style.css`'s `:root`; this just makes those two
 * tokens CONFIGURABLE per running game instead of fixed, since every
 * card in one game is the same size (`preset.cardSize` in
 * `presets.js`, threaded through `gameConfig.cardSize` - see
 * `configsForPreset`/`renderGameFromView` in `main.js`). A preset that
 * doesn't declare one (every preset but RtG) leaves the stylesheet's
 * own default in place - `size` absent clears any previous override
 * rather than leaving a stale one from whatever game ran before it.
 * @param {{w: string, h: string}|null|undefined} size
 */
export function applyCardSize(size) {
  const root = document.documentElement.style;
  if (size) {
    root.setProperty('--card-w', size.w);
    root.setProperty('--card-h', size.h);
    // `--card-aspect` (style.css's `.rtg-inspect-art`) needs a plain
    // number ratio, not lengths - `aspect-ratio` can't consume
    // `--card-w`/`--card-h` directly, so this derives the same ratio
    // numerically alongside them rather than leaving it to drift.
    // eslint-disable-next-line unicorn/prefer-number-coercion -- sizes carry units ('4.4rem'); Number() would be NaN
    root.setProperty('--card-aspect', `${Number.parseFloat(size.w)} / ${Number.parseFloat(size.h)}`);
  } else {
    root.removeProperty('--card-w');
    root.removeProperty('--card-h');
    root.removeProperty('--card-aspect');
  }
}
