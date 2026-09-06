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
 * Mana pip colours, matching the art generator's palettes. Exported so
 * the host form's deck picker (US-110 follow-up: "show the deck
 * colors") can build the same colour dots this card face already uses
 * for cost pips, rather than a second colour-to-swatch mapping.
 */
export const PIP_CLASS = {
  W: 'pip-w', U: 'pip-u', B: 'pip-b', R: 'pip-r', G: 'pip-g',
};

/**
 * The card's art, written by `make art` to `assets/cards/rtg/<id>.webp`.
 * Exported so a caller with only catalog data (no dealt physical card) -
 * the deck picker's own `signatureCard`, `{id, printedId, name}` - can
 * still resolve the same URL this card face renders, rather than
 * re-deriving the path a second way.
 *
 * Real generated illustration, not the procedural placeholder this
 * started as (US-79) - each card's `art:` prompt is painted by the `agy`
 * CLI and downscaled to 512px WebP. That swap is exactly what D77's
 * prompt-per-card design existed to allow, and it needed no change to
 * the card pool at all.
 */
export function artUrl(card) {
  // `printedId` is the PRINTED id; `id` is this physical copy's instance id
  // (D80 - four copies of one card need four distinct ids). Art is per
  // printed card, so it must key off `printedId` or all four copies 404.
  return `assets/cards/rtg/${card.printedId ?? card.id}.webp`;
}

/** Colour-to-CSS-class mapping (`.rtg-c-w` etc, style.css - each sets
 * the `--rtg-fallback-a`/`-b` custom properties `.rtg-art-missing`'s
 * gradient reads). Exported as `rtgColorClasses` so a caller that
 * already has a plain colour-letter array (the deck picker's own
 * `deck.colors`, catalog data) doesn't have to re-derive it from a
 * dealt card's `text`/`colors` fields the way `colorClasses` below
 * does. */
export function rtgColorClasses(colors) {
  return colors?.length > 0 ? colors.map((c) => `rtg-c-${c.toLowerCase()}`) : ['rtg-c-c'];
}

/** Colour classes for a card with no art yet, so the fallback panel
 * still reads as the right colour. A land is keyed off the mana it
 * produces, matching how the rest of the set treats colourless lands. */
function colorClasses(card) {
  const colors = card.colors?.length > 0
    ? card.colors
    : ['W', 'U', 'B', 'R', 'G'].filter((c) => (card.text ?? '').includes(`{${c}}`));
  return rtgColorClasses(colors);
}

// *nit (direct user request): "replace {T} with a bent arrow tap
// symbol" - a real Magic card never prints the letter T for tap, it
// prints this glyph. `manaSymbolElement`'s only reader of `symbol ===
// 'T'` lives here, one place, so the cost line and rules-text glyphs
// (`renderRulesText`, below) render tap identically.
const TAP_GLYPH = '↷';

/** One colour-coded circular pip for a single `{X}` mana/tap symbol -
 * shared by the cost line (`manaPips`) and inline rules-text symbols
 * (`renderRulesText`), so both read the same glyph vocabulary instead
 * of each inventing its own. The letter itself stays the visible,
 * accessible label (colour is decoration, same reasoning `RtgCardFace`
 * already documents elsewhere) - `{T}` is the one exception, since its
 * real printed symbol never was a letter to begin with. */
function manaSymbolElement(symbol) {
  const pip = document.createElement('span');
  if (symbol === 'T') {
    pip.className = 'rtg-pip pip-tap';
    pip.textContent = TAP_GLYPH;
    pip.setAttribute('aria-label', 'Tap');
  } else {
    pip.className = `rtg-pip ${PIP_CLASS[symbol] ?? 'pip-generic'}`;
    pip.textContent = symbol;
  }
  return pip;
}

function manaPips(symbols) {
  const wrap = document.createElement('span');
  wrap.className = 'rtg-cost';
  const list = symbols ?? [];
  for (const symbol of list) wrap.append(manaSymbolElement(symbol));
  return wrap;
}

// *nit (direct user request): "show the mana requirements as glyphs
// not {u} etc" - rules text (`card.text`, e.g. "{T}: Add {W} or
// {U}.") is raw MTG templating shorthand, shown verbatim before this
// (`rules.textContent = card.text`). Splits out every `{X}` token and
// replaces it with the same real glyph pip the cost line uses, leaving
// the surrounding prose as plain text nodes.
function renderRulesText(container, text) {
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('{', cursor);
    const close = open === -1 ? -1 : text.indexOf('}', open + 1);
    if (open === -1 || close === -1) {
      container.append(document.createTextNode(text.slice(cursor)));
      return;
    }
    if (open > cursor) container.append(document.createTextNode(text.slice(cursor, open)));
    container.append(manaSymbolElement(text.slice(open + 1, close)));
    cursor = close + 1;
  }
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
    renderRulesText(rules, card.text);
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
  // *fix (real bug, found live): a right-click's own "Move" choice
  // highlights every valid destination with `.pile-target` (ui.js) -
  // while that's active, the pointer sitting still over the ORIGINATING
  // card can still fire a fresh `mouseenter` (the row it's in gets
  // reflowed/re-created under it), reopening this preview UNDER the
  // menu and, now that a bigger RtG card anchors it further across the
  // table, sometimes directly over the very pile-target the click needs
  // to land on. A card menu open or a move in progress both mean the
  // pointer's real job right now is picking a destination, not previewing.
  if (document.querySelector('.card-context-menu, .pile-target')) return;
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
    // Art generation is quota-limited and runs as a separate build step,
    // so a card may legitimately have no image yet. Degrade to a
    // colour-keyed panel rather than showing a broken-image icon - the
    // card is still fully playable without its illustration.
    art.addEventListener('error', () => {
      art.remove();
      element.classList.add('rtg-art-missing', ...colorClasses(card));
    });
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
    // *fix (real bug, found live): right-clicking a card for its context
    // menu doesn't fire `mouseleave` first (the pointer never actually
    // moves), so the hover preview stayed open UNDERNEATH the menu -
    // and, now that a bigger RtG card anchors it further across the
    // table, sometimes directly over the very pile-target the menu's
    // own "Move" choice needs clicked next, silently eating that click.
    element.addEventListener('contextmenu', closeInspect);
  },
};
