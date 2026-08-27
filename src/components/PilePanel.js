import { renderPile } from '../ui.js';

/**
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another - don't overload zone-panel to do everything." `<pile-panel>`
 * is the FLAT-row case (`componentFor(kind) === 'pile-panel'` - every kind
 * except a hand's fan or a deck's stack, `pileActions.js`): its own
 * "Actionable" title bar and a plain wrapped card row, plus its own
 * drop-target wiring (`renderPile`, `ui.js`, itself a thin wrapper
 * around the shared `renderPileShell`) - never a Zone's box (border/
 * padding/background) and never its own move/resize. A Pile always
 * lives inside a `<zone-panel>` (`src/components/ZonePanel.js`), which
 * owns both of those exactly once for everything inside it.
 *
 * Equally thin as `<fan-pile>`/`<deck-stack>` now - none of the three
 * nests inside another any more, `renderZones` picks whichever one a
 * pile class's own `component` calls for.
 */
export class PilePanelElement extends HTMLElement {
  render(zone, allZones, options) {
    renderPile(this, zone, allZones, options);
  }
}

customElements.define('pile-panel', PilePanelElement);
