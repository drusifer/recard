/**
 * The Recard the Gathering deck type (D80, US-81).
 *
 * Expands a named deck list from the compiled catalog into 60 physical
 * cards, the same way `standardDeck.js` expands ranks x suits into 52.
 * A new deck type is one module plus one `DECK_TYPES` entry (D47) —
 * nothing about how the table deals, shuffles or draws changes.
 *
 * INSTANCE ID vs PRINTED ID
 * A deck runs four copies of the same printed card. `state.js` keys
 * every card on `card.id`, so four cards sharing one id would behave as
 * a single card (move one, move them all). Each physical card therefore
 * gets a unique instance id, and keeps its PRINTED id in `cardId` for
 * art lookup (`assets/cards/rtg/<cardId>.svg`) and catalog joins.
 *
 * The full printed data travels on the card, exactly as a standard card
 * carries its own `rank`/`suit`. That is deliberately the SAME shape the
 * table already replicates and redacts, rather than a catalog lookup
 * bolted into the render path — minimum deviation, minimum risk to the
 * table simulation.
 */
import { CARDS, DECKS } from './rtg/catalog.js';

const BY_ID = new Map(CARDS.map((card) => [card.id, card]));

/**
 * @param {{deckList?: string}} [options] which catalogued deck to build;
 *   defaults to the first deck in the catalog so a preset that omits it
 *   still yields a playable library.
 * @returns {object[]} 60 cards, each with a unique `id`
 */
export function build({ deckList } = {}) {
  const list = deckList ? DECKS.find((deck) => deck.id === deckList) : DECKS[0];
  if (!list) {
    throw new Error(`Unknown rtg deck list: "${deckList}" (have: ${DECKS.map((d) => d.id).join(', ')})`);
  }

  const deck = [];
  for (const { id, count } of list.cards) {
    const printed = BY_ID.get(id);
    if (!printed) throw new Error(`Deck "${list.id}" references unknown card "${id}"`);
    for (let copy = 0; copy < count; copy++) {
      deck.push({ ...printed, id: `${id}#${copy}`, cardId: id });
    }
  }
  return deck;
}

/**
 * The catalogued deck lists, for a preset or a picker to offer.
 */
export function deckLists() {
  return DECKS.map(({ id, name, colors, archetype, description }) => ({
    id, name, colors, archetype, description,
  }));
}
