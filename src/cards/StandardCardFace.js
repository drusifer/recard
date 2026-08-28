/**
 * The standard 52-card face (D76) — rank + suit, exactly as `ui.js`'s
 * `cardElement` has always drawn it.
 *
 * This module is a RELOCATION, not a rewrite: the markup, class names
 * and the JOKER special case are byte-for-byte what shipped before the
 * `CARD_FACES` registry existed. That is the entire safety argument for
 * D76 — every existing preset renders identically, because this is
 * literally the same code, just reached through a registry lookup
 * instead of inline.
 */

const SUIT_SYMBOL = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const RED_SUITS = new Set(['diamonds', 'hearts']);

export const StandardCardFace = {
  /**
   * Extra class for the card shell — red suits print red.
   */
  className(card) {
    return RED_SUITS.has(card.suit) ? 'card-red' : '';
  },

  /**
   * Fill the card shell with this face's content. The shell itself
   * (the `<button class="card">`, its `dataset.cardId`, and every drag
   * / click / rotate behaviour attached to it) stays in `ui.js` — a
   * face renders CONTENT only, which is what keeps the table
   * simulation unchanged across face types.
   */
  render(element, card) {
    if (card.rank === 'JOKER') {
      const pip = document.createElement('span');
      pip.className = 'card-pip';
      pip.textContent = 'JOKER';
      pip.style.fontSize = '0.65rem';
      element.append(pip);
      return;
    }

    const symbol = SUIT_SYMBOL[card.suit];
    const corner = document.createElement('span');
    corner.className = 'card-corner';
    // non-breaking space - keeps "10 ♠" from wrapping mid-corner
    corner.textContent = `${card.rank}\u{A0}${symbol}`;
    const pip = document.createElement('span');
    pip.className = 'card-pip';
    pip.textContent = symbol;
    element.append(corner, pip);
  },
};
