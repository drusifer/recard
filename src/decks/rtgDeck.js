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
 * gets a unique instance id, and keeps its PRINTED id in `printedId` for
 * art lookup (`assets/cards/rtg/<printedId>.svg`) and catalog joins.
 *
 * The full printed data travels on the card, exactly as a standard card
 * carries its own `rank`/`suit`. That is deliberately the SAME shape the
 * table already replicates and redacts, rather than a catalog lookup
 * bolted into the render path — minimum deviation, minimum risk to the
 * table simulation.
 */
import { CARDS, DECKS } from './rtg/catalog.js';
import { batchToken } from './batchToken.js';

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

  // PRE-EXISTING BUG, fixed 2026-09-03. D80 intended "each physical card
  // gets a unique instance id", and `${id}#${copy}` is unique WITHIN one
  // deck - but repeats in every deck containing the same printed card.
  // The RtG preset puts 15 decks on one table and basic lands are in most
  // of them, so the table started with ~90 duplicate ids;
  // `assertCardsConserved` (D88) treats ids in play as a closed set and
  // threw on the first action, which is JOIN. Creating an RtG table
  // therefore failed outright, and no test caught it because every test
  // built ONE deck.
  //
  // The deck-scoped batch token is what makes the id genuinely per
  // PHYSICAL card. `printedId` still repeats, deliberately - four copies
  // of a card share one picture, and art keys off that.
  const batch = batchToken();
  const deck = [];
  for (const { id, count } of list.cards) {
    const printed = BY_ID.get(id);
    if (!printed) throw new Error(`Deck "${list.id}" references unknown card "${id}"`);
    for (let copy = 0; copy < count; copy++) {
      deck.push({ ...printed, id: `${id}#${batch}-${copy}`, printedId: id });
    }
  }
  return deck;
}

// Direct user request ("use an image from one of the powerful cards in
// each deck"): a deck picker needs ONE representative card, not the
// full 60. Rarity first (the catalog only prints common/uncommon/rare
// today, but this reads right the moment a mythic is ever added), then
// highest mana cost as the tiebreaker within a rarity - the biggest,
// splashiest thing the deck can cast is what a player recognizes a
// deck BY. Lands are excluded outright; a land is never what makes a
// deck feel like itself.
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3 };

function signatureCardFor(list) {
  let best = null;
  for (const { id } of list.cards) {
    const card = BY_ID.get(id);
    if (!card || card.type === 'Land') continue;
    const rank = RARITY_RANK[card.rarity] ?? -1;
    const bestRank = best ? RARITY_RANK[best.rarity] ?? -1 : -1;
    if (rank > bestRank || (rank === bestRank && (card.cmc ?? 0) > (best?.cmc ?? 0))) best = card;
  }
  return best;
}

/**
 * The catalogued deck lists, for a preset or a picker to offer.
 * `signatureCard` is `{id, printedId, name}` for the deck's own
 * flashiest non-land card - `printedId` and `id` are the SAME value
 * here (this is catalog data, not a physical dealt copy, so there is no
 * per-copy instance id to distinguish, unlike `build()`'s output) but
 * named to match `RtgCardFace.js`'s own `artUrl(card)` contract
 * (`card.printedId ?? card.id`), so a picker can reuse that function
 * directly instead of re-deriving the art path a second way.
 */
export function deckLists() {
  return DECKS.map((list) => {
    const signature = signatureCardFor(list);
    return {
      id: list.id, name: list.name, colors: list.colors, archetype: list.archetype, description: list.description,
      signatureCard: signature ? { id: signature.id, printedId: signature.id, name: signature.name } : null,
    };
  });
}
