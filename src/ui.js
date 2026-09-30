import { seatPosition } from './seating.js';
import { cardElement, cardBackElement } from './pileCards.js';

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
 * Live remote cursor (US-22/D13, redesigned US-146/D168): a small labeled
 * dot that glides onto `pileElement`'s own on-screen center - resolved
 * from THIS viewer's own DOM (the caller already looked `pileElement` up
 * by id against its own rendering), never a coordinate carried over the
 * wire. Positioned as a `container`-relative percentage (the existing
 * normalized-position convention `updateDragGhost` also uses) so the
 * `.remote-cursor` CSS transition animates the glide the same way it
 * always has - only what it's aimed at has changed.
 */
export function updateRemoteCursor(container, playerId, name, pileElement) {
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
  const containerRect = container.getBoundingClientRect();
  const pileRect = pileElement.getBoundingClientRect();
  const x = (pileRect.left + pileRect.width / 2 - containerRect.left) / containerRect.width;
  const y = (pileRect.top + pileRect.height / 2 - containerRect.top) / containerRect.height;
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
