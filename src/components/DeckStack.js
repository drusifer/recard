import { renderPileShell, renderDeckStack, renderSplitPicker } from '../ui.js';

/**
 * UX follow-up (direct user request): "a Deck is a specific kind of
 * Pile... it is not a Zone at all" - then, later the same day: "pile-
 * panel and header-actions should be internalized in the fan-pile
 * webcomponent... same for all Pile type components." `<deck-stack>`
 * is now a COMPLETE Pile on its own - its own "Actionable" title bar
 * (Draw/Deal/Reshuffle/Shuffle/Split), its own stack+badge visual, its
 * own drop-target wiring - not a bare row `<pile-panel>` used to wrap
 * with a separately-built header. `renderZones` (`ui.js`) picks this
 * element directly for any pile whose CLASS declares `static component = 'deck-stack'`
 * (`DeckPile.js`, read via `componentFor`), the same way it picks
 * `<fan-pile>` for `'fan'` and `<pile-panel>` for the default `'flat'`
 * case - three equally-thin components now, none nesting in another.
 *
 * `renderPileShell` (`ui.js`) is what's actually SHARED across all
 * three: the header, the addressability, the drop wiring. This only
 * supplies the one thing unique to a deck - the row's own stack+badge
 * visual and Deal count input, via the already-proven `renderDeckStack`.
 */
export class DeckStackElement extends HTMLElement {
  render(pile, allPiles, options) {
    // D92 (direct user request: "split should always fan the pile to
    // allow the guided picker" - deck included): identical branch to
    // `renderPile`'s own (ui.js) - a deck toggled into the picker
    // (`options.splitPicker`) renders the same `renderSplitPicker` row
    // every other pile kind gets, not a deck-specific shortcut.
    if (options.splitPicker?.pileId === pile.id) {
      renderPileShell(this, pile, allPiles, options, (container) => renderSplitPicker(container, pile, options));
      return;
    }
    renderPileShell(this, pile, allPiles, options, (container) => {
      const row = document.createElement('div');
      container.append(row);
      // D84: `pile.cards` carries the deck's full, real contents now
      // (TOTAL PERMISSIVE - the data was never redacted, only who sees
      // it visually) - `renderDeckStack` still only ever shows the top
      // one as the stack's own drag source, same mechanism as any other
      // pile's top card.
      renderDeckStack(row, pile.count ?? pile.cards.length, { ...options, pileId: pile.id, topCard: pile.cards[0] });
      return row;
    });
  }
}

customElements.define('deck-stack', DeckStackElement);
