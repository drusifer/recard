import { renderPileShell, renderPileCards, renderSplitPicker } from '../ui.js';
import { PILE_TYPES } from '../piles/pileTypes.js';

/**
 * `<chip-tray>` — a GROUPED pile, rendered the way a real tray looks
 * (direct user correction: "stacked chips should be in separate piles by
 * denomination. currently you are drawing them in an overlapping row
 * which doesn't make sense with chips"). Despite the tag name, this is
 * no longer chip-specific (US-112, "push some of that up") - `TokenPile`
 * renders through it too, grouped by colour instead of denomination.
 * Kept as `chip-tray`/`.chip-tray`/`.chip-stack` rather than renamed:
 * the tag/class names are cosmetic, and a rename sweep across style.css
 * risked regressions this fix didn't need to take on.
 *
 * The first cut reused `<pile-panel>`, which lays every pileable out in
 * ONE overlapping row. That is right for cards, where the row IS the
 * pile, and wrong for a grouped supply: a tray of mixed groups in a
 * single row reads as a smear, and the sorting `GroupedPile` maintains
 * buys nothing you can see. Same-group pieces belong in their OWN stack.
 *
 * Each group gets a column, and each column is rendered by the SAME
 * `renderPileCards` every other pile kind uses - passed a view of just
 * that group. That is what keeps every piece individually draggable,
 * right-clickable and targetable with no kind-specific interaction
 * code: only the LAYOUT differs, which is exactly the split `<fan-pile>`
 * and `<deck-stack>` already make.
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

      for (const [groupValue, group] of groupByValue(pile)) {
        const column = document.createElement('div');
        // `card-row` so every rule that styles a row of pileables still
        // applies; `chip-stack` only turns the direction vertical.
        column.className = 'card-row chip-stack';
        if (groupValue !== undefined) column.dataset.denom = String(groupValue);
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
 * A pile's own cards grouped by whatever `PILE_TYPES[pile.kind]`
 * declares as its `sortValue` (`GroupedPile`, `src/piles/`) - denomination
 * for a chip tray, colour for a token supply, generalized rather than
 * hardcoded to `card.denom` (US-112: that hardcoding is exactly why
 * adding a SECOND grouped kind meant duplicating this whole component
 * instead of it just working). Anything with no group value (a card
 * dropped onto a tray - the Core invariant means this pile accepts
 * anything, `GroupedPile` doesn't override `canAccept`) lands in one
 * final group of its own rather than vanishing.
 *
 * @param {{kind: string, cards: object[]}} pile
 * @returns {[unknown, object[]][]}
 */
function groupByValue(pile) {
  const sortValue = PILE_TYPES[pile.kind]?.sortValue ?? (() => {});
  const groups = new Map();
  for (const card of pile.cards) {
    const key = sortValue(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return Iterator.from(groups).toArray().toSorted(([a], [b]) => {
    if (a === b) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a > b ? -1 : 1;
  });
}

customElements.define('chip-tray', ChipTrayElement);
