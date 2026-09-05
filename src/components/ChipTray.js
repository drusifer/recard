import { renderPileShell, renderPileCards, renderSplitPicker } from '../ui.js';

/**
 * `<chip-tray>` — a chip pile, rendered the way a real tray looks
 * (direct user correction: "stacked chips should be in separate piles by
 * denomination. currently you are drawing them in an overlapping row
 * which doesn't make sense with chips").
 *
 * The first cut reused `<pile-panel>`, which lays every pileable out in
 * ONE overlapping row. That is right for cards, where the row IS the
 * pile, and wrong for chips: a tray of mixed denominations in a single
 * row reads as a smear, and the sorting `ChipPile` maintains buys
 * nothing you can see. Chips of a value belong in their OWN stack.
 *
 * Each denomination gets a column, and each column is rendered by the
 * SAME `renderPileCards` every other pile kind uses - passed a view of
 * just that group. That is what keeps every chip individually
 * draggable, right-clickable and targetable with no chip-specific
 * interaction code: only the LAYOUT differs, which is exactly the split
 * `<fan-pile>` and `<deck-stack>` already make.
 */
export class ChipTrayElement extends HTMLElement {
  render(pile, allPiles, options) {
    // Same picker branch every other pile component has: a tray toggled
    // into Split renders the shared picker, not a tray-specific one.
    if (options.splitPicker?.pileId === pile.id) {
      renderPileShell(this, pile, allPiles, options, (container) => renderSplitPicker(container, pile, options));
      return;
    }

    renderPileShell(this, pile, allPiles, options, (container) => {
      const tray = document.createElement('div');
      tray.className = 'chip-tray';
      container.append(tray);

      for (const [denom, group] of groupByDenomination(pile.cards)) {
        const column = document.createElement('div');
        // `card-row` so every rule that styles a row of pileables still
        // applies; `chip-stack` only turns the direction vertical.
        column.className = 'card-row chip-stack';
        if (denom !== undefined) column.dataset.denom = String(denom);
        tray.append(column);
        renderPileCards(column, { ...pile, cards: group }, allPiles, options);
        // *nit ("a slight diagonal from lower left to upper right"):
        // each chip's position in its own stack, so CSS can drift it
        // sideways progressively. A margin cannot do this - margins do
        // not accumulate down a flex column, so every chip after the
        // first would shift by the same amount. Set here rather than in
        // `renderPileCards`, which knows nothing about stacking.
        for (const [index, chip] of [...column.children].entries()) {
          chip.style.setProperty('--stack-index', String(index));
        }
      }
      return tray;
    });
  }
}

/**
 * Chips grouped by denomination, highest first - and anything WITHOUT a
 * denomination in one final group of its own.
 *
 * That last group is not a defensive nicety: a chip tray accepts any
 * pileable (the Core invariant - `ChipPile` deliberately does not
 * override `canAccept`), so a card really can be dropped on one, and it
 * has to render somewhere rather than vanish.
 *
 * @param {{denom?: number}[]} cards
 * @returns {[number|undefined, object[]][]}
 */
function groupByDenomination(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = card.denom;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return Iterator.from(groups).toArray().toSorted(([a], [b]) => {
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return b - a;
  });
}

customElements.define('chip-tray', ChipTrayElement);
