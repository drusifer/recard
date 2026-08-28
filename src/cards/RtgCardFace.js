/**
 * The Recard the Gathering card face (D76, US-80).
 *
 * At rest a card renders at roughly 43x59px on this table, which is
 * enough for art, a mana cost and a power/toughness box and nothing
 * else — Magic rules text is simply unreadable there. So an RtG card is
 * TWO renderings:
 *
 *   1. the resting face: art, cost pips, name strip, P/T
 *   2. an inspect overlay on hover/focus, at a readable size, carrying
 *      the full type line, rules text, flavour and stats
 *
 * The overlay is not a nicety — Smith made it a Gate-1 condition (C1)
 * for exactly this reason, and it had to ship in the same phase as the
 * face rather than be deferred, or the preset would be unusable.
 *
 * `.card-rtg` widens ONLY RtG cards (see style.css). The global
 * `--card-w`/`--card-h` are untouched, so no other preset changes size.
 */

/**
 * Mana pip colours, matching the art generator's palettes.
 */
const PIP_CLASS = {
  W: 'pip-w', U: 'pip-u', B: 'pip-b', R: 'pip-r', G: 'pip-g',
};

/**
 * The card's art, written by `make art` to `assets/cards/rtg/<id>.svg`.
 */
function artUrl(card) {
  // `cardId` is the PRINTED id; `id` is this physical copy's instance id
  // (D80 - four copies of one card need four distinct ids). Art is per
  // printed card, so it must key off `cardId` or all four copies 404.
  return `assets/cards/rtg/${card.cardId ?? card.id}.svg`;
}

function manaPips(symbols) {
  const wrap = document.createElement('span');
  wrap.className = 'rtg-cost';
  const list = symbols ?? [];
  for (const symbol of list) {
    const pip = document.createElement('span');
    pip.className = `rtg-pip ${PIP_CLASS[symbol] ?? 'pip-generic'}`;
    pip.textContent = symbol;
    wrap.append(pip);
  }
  return wrap;
}

/** "Creature — Human Soldier". Shared with the overlay and exported via
 * `cardFaces.js` so it has one definition. */
export function typeLine(card) {
  return card.subtype ? `${card.type} — ${card.subtype}` : (card.type ?? '');
}

function statsBox(card) {
  const box = document.createElement('span');
  box.className = 'rtg-stats';
  box.textContent = `${card.power}/${card.toughness}`;
  return box;
}

/**
 * The inspect overlay (Smith C1). Built lazily on first hover and
 * appended to `document.body` rather than to the card, so it can escape
 * the pile's `overflow` and the zone's stacking context — a preview
 * clipped by its own container is the classic failure here.
 */
function buildOverlay(card) {
  const overlay = document.createElement('div');
  overlay.className = 'rtg-inspect';

  const header = document.createElement('div');
  header.className = 'rtg-inspect-header';
  const name = document.createElement('span');
  name.className = 'rtg-inspect-name';
  name.textContent = card.name ?? card.id;
  header.append(name, manaPips(card.symbols));

  const art = document.createElement('img');
  art.className = 'rtg-inspect-art';
  art.src = artUrl(card);
  art.alt = '';

  const types = document.createElement('div');
  types.className = 'rtg-inspect-types';
  types.textContent = typeLine(card);

  const body = document.createElement('div');
  body.className = 'rtg-inspect-body';
  if (card.text) {
    const rules = document.createElement('p');
    rules.className = 'rtg-inspect-rules';
    rules.textContent = card.text;
    body.append(rules);
  }
  if (card.flavor) {
    const flavor = document.createElement('p');
    flavor.className = 'rtg-inspect-flavor';
    flavor.textContent = card.flavor;
    body.append(flavor);
  }

  overlay.append(header, art, types, body);
  if (card.power !== undefined) {
    const stats = document.createElement('div');
    stats.className = 'rtg-inspect-stats';
    stats.textContent = `${card.power}/${card.toughness}`;
    overlay.append(stats);
  }
  return overlay;
}

/**
 * One shared overlay element at a time - hovering a second card
 * replaces the first rather than stacking previews.
 */
const inspect = { overlay: null };

function closeInspect() {
  inspect.overlay?.remove();
  inspect.overlay = null;
}

function openInspect(element, card) {
  closeInspect();
  const overlay = buildOverlay(card);
  document.body.append(overlay);
  inspect.overlay = overlay;

  // Position beside the card, flipped to whichever side has room, and
  // clamped into the viewport so a card at the table edge still shows a
  // fully visible preview.
  const anchor = element.getBoundingClientRect();
  const box = overlay.getBoundingClientRect();
  const gap = 8;
  const left = anchor.right + gap + box.width > globalThis.innerWidth
    ? Math.max(gap, anchor.left - gap - box.width)
    : anchor.right + gap;
  const top = Math.min(
    Math.max(gap, anchor.top + anchor.height / 2 - box.height / 2),
    Math.max(gap, globalThis.innerHeight - box.height - gap),
  );
  overlay.style.left = `${Math.round(left)}px`;
  overlay.style.top = `${Math.round(top)}px`;
}

export const RtgCardFace = {
  className() {
    return 'card-rtg';
  },

  render(element, card) {
    const art = document.createElement('img');
    art.className = 'rtg-art';
    art.src = artUrl(card);
    art.alt = '';
    // Art is decorative here; the accessible name is the card's own.
    element.setAttribute('aria-label', card.name ?? card.id);
    element.title = card.name ?? card.id;

    const top = document.createElement('span');
    top.className = 'rtg-top';
    top.append(manaPips(card.symbols));

    const nameStrip = document.createElement('span');
    nameStrip.className = 'rtg-name';
    nameStrip.textContent = card.name ?? '';

    element.append(art, top, nameStrip);
    if (card.power !== undefined) element.append(statsBox(card));

    // Smith C1: hover AND focus, so the overlay is reachable without a
    // mouse - `reveal`/`rotate` already set the precedent that a card is
    // keyboard-operable.
    element.addEventListener('mouseenter', () => openInspect(element, card));
    element.addEventListener('focus', () => openInspect(element, card));
    element.addEventListener('mouseleave', closeInspect);
    element.addEventListener('blur', closeInspect);
    // A drag must not leave a preview stranded over the table.
    element.addEventListener('dragstart', closeInspect);
  },
};
