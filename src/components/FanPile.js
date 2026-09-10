import { renderPileShell, renderPileCards } from '../ui.js';

/**
 * UX follow-up (direct user request): "create WebComponents for the
 * different pile types... fix the fan layout issue by implementing
 * FanPile" - then, later the same day: "pile-panel and header-actions
 * should be internalized in the fan-pile webcomponent... same for all
 * Pile type components." `<fan-pile>` is now a COMPLETE Pile on its
 * own - its own "Actionable" title bar, its own fanned/overlapping
 * cards, its own drop-target wiring - not a bare row that `<pile-panel>`
 * used to wrap with a separately-built header. `renderZones` (`ui.js`)
 * picks this element directly for any pile whose TYPE declares
 * `static component = 'fan-pile'` (`HandPile.js`, read via `componentFor`), the same
 * way it picks `<deck-stack>` for `'stack'` and `<pile-panel>` for the
 * default `'flat'` case - three equally-thin components now, none
 * nesting inside another.
 *
 * `renderPileShell` (`ui.js`) is what's actually SHARED across all
 * three: the header, the addressability, the drop wiring.
 *
 * D129: this component supplies NOTHING layout-related any more. A fan
 * is a stack layout (`Stackable`'s `FAN`, declared by
 * `HandPile.stackDirection`), so the arc comes out of the same
 * `renderPileCards` call every other pile makes. The `opts.fan` flag
 * and `applyFanOffset` that used to live behind it are deleted - a
 * hand's position and its arc came from two different mechanisms, and
 * that was the last place two layout mechanisms coexisted.
 */
export class FanPileElement extends HTMLElement {
  render(pile, allPiles, options) {
    renderPileShell(this, pile, allPiles, options, (container) => {
      const row = document.createElement('div');
      row.className = 'card-row fan-row';
      container.append(row);
      renderPileCards(row, pile, allPiles, options);
      return row;
    });
  }
}

customElements.define('fan-pile', FanPileElement);
