import { renderActionHeader } from '../ui.js';

/**
 * UX follow-up (direct user request): "maybe make header-actions a
 * WebComponent?" - continues the same pattern every other piece of this
 * pass follows (`ScoreZone.js`/`DeckZone.js`/`ZonePanel.js`/`SeatZone.js`/
 * `FanPile.js`): light DOM, a `.render(...)` method, a thin adapter
 * around the same proven `renderActionHeader` (`ui.js`) every pile/zone
 * title bar already used - not a rewrite.
 *
 * `<header-actions>` is what BOTH the deck's own title bar and every
 * `<zone-panel>`/`<seat-zone>`'s heading are built from now - "like
 * zones, Piles are Actionable and should have a title bar with action
 * buttons for that pile type" (the user's own framing): this is that
 * one actionable title bar, reused everywhere a pile needs one, instead
 * of a bespoke heading-building function per call site.
 */
export class HeaderActionsElement extends HTMLElement {
  render(titleText, actionIds, options) {
    renderActionHeader(this, titleText, actionIds, options);
  }
}

customElements.define('header-actions', HeaderActionsElement);
