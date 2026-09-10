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
      // *nit (direct user request, "align cascades to the top"):
      // `stacksDownward` (`GroupedPile`, opt-in - `LandsPile` only) flips
      // the tray from chips' own bottom-aligned/grows-up default to
      // top-aligned/grows-down, the same direction a cascade already
      // reads in. One modifier class, not a second component.
      tray.className = PILE_TYPES[pile.kind]?.stacksDownward ? 'chip-tray chip-tray-downward' : 'chip-tray';
      container.append(tray);

      // D129: the tray no longer builds its own columns or positions
      // anything. `renderPileCards` renders EVERY pile as a row of
      // `Stack`s now - which is exactly what a tray already was - and
      // hands back the stack elements it made. All this component adds
      // is the per-stack badge.
      tray.className += ' card-row';
      const renderedStacks = renderPileCards(tray, pile, allPiles, options);

      for (const { stack, element } of renderedStacks) {
        // *nit (direct user request): "display the total manacount in a
        // cool way, when tapping" - `groupBadge` is opt-in (`LandsPile`
        // only; the `GroupedPile` default is absent, so chips/tokens are
        // unaffected). Derived fresh from this stack's own cards every
        // render, so it always reflects the real tapped/untapped state,
        // never a separately-tracked count that could drift from it.
        if (stack.id !== undefined) element.dataset.denom = String(stack.id);
        const badge = PILE_TYPES[pile.kind]?.groupBadge?.(stack.pileables);
        if (badge) {
          const badgeElement = document.createElement('span');
          badgeElement.className = `chip-stack-badge ${badge.className}`;
          badgeElement.textContent = badge.text;
          badgeElement.title = badge.title;
          element.append(badgeElement);
        }
      }
      return tray;
    });
  }
}

customElements.define('chip-tray', ChipTrayElement);
