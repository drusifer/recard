import { PileElement } from './PileElement.js';
import { renderDeckStack } from '../ui.js';

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
 * `PileElement` is what's actually SHARED across all
 * three: the header, the addressability, the drop wiring. This only
 * supplies the one thing unique to a deck - the row's own stack+badge
 * visual and Deal count input, via the already-proven `renderDeckStack`.
 */
export class DeckStackElement extends PileElement {
  buildRow(container, pile, allPiles, options) {
    const row = document.createElement('div');
    container.append(row);
    renderDeckStack(row, pile.count ?? pile.cards.length, { ...options, pileId: pile.id, topCard: pile.cards[0] });
    return row;
  }
}

customElements.define('deck-stack', DeckStackElement);
