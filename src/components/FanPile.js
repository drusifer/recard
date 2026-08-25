import { renderPileShell, renderZoneCards } from '../ui.js';

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
 * `rowShape: 'fan'` (`handPile.js`, read via `rowShapeFor`), the same
 * way it picks `<deck-stack>` for `'stack'` and `<pile-panel>` for the
 * default `'flat'` case - three equally-thin components now, none
 * nesting inside another.
 *
 * `renderPileShell` (`ui.js`) is what's actually SHARED across all
 * three: the header, the addressability, the drop wiring. This only
 * supplies the one thing unique to a fan - the row's own fanned card
 * layout (`renderZoneCards`'s `opts.fan` branch: each card's `--raise-
 * base` rotate/translateY, identical to `renderHand`'s old formula).
 */
export class FanPileElement extends HTMLElement {
  render(zone, allZones, opts) {
    renderPileShell(this, zone, allZones, opts, (container) => {
      const row = document.createElement('div');
      row.className = 'card-row fan-row';
      container.appendChild(row);
      renderZoneCards(row, zone, allZones, { ...opts, fan: true });
      return row;
    });
  }
}

customElements.define('fan-pile', FanPileElement);
