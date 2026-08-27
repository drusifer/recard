import { renderZonePanel } from '../ui.js';

/**
 * UX follow-up (direct user request): "zone is one thing, pile is
 * another - don't overload zone-panel to do everything." `<zone-panel>`
 * renders a ZONE: the bordered/padded/positioned box, one title bar
 * (or none, for the common single-pile case - see `renderZonePanel`'s
 * own doc comment), and every Pile it holds as a `<pile-panel>` child
 * (`src/components/PilePanel.js`). One generic element handles all
 * three shapes `renderZones` (`ui.js`) builds: a standalone shared
 * zone (one pile), the grouped Table Zone (Table/Discard/Deck), and
 * each player's own Zone (hand, plus any other personal pile) - varying
 * only in the `piles` list and `title` passed to `.render(...)`, never
 * in the element itself.
 *
 * Deliberately does NOT reimplement any of that - `render()` just calls
 * the existing, already-proven `renderZonePanel(container, id, title,
 * piles, allZones, opts)` (`ui.js`) with `this` as the container, same
 * "thin adapter around proven logic" shape every component in this
 * pass uses.
 */
export class ZonePanelElement extends HTMLElement {
  render(id, title, piles, allZones, options) {
    renderZonePanel(this, id, title, piles, allZones, options);
  }
}

customElements.define('zone-panel', ZonePanelElement);
