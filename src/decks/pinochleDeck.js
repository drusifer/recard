/**
 * The Pinochle deck type (D47, Sprint 17) - the second deck type,
 * proving `DeckDefinition` really is a different axis from Pile type
 * (D38's rejected alternative): a Deck PILE's behavior (stack, draw
 * from top) is identical regardless of which deck type fills it.
 *
 * A single pinochle deck is 48 cards: TWO copies each of 9/10/J/Q/K/A
 * in every suit - no 2 through 8, no jokers. `numDecks` combines whole
 * pinochle decks (2 = 96 cards), matching `standardDeck`'s own meaning
 * of the parameter rather than inventing a second convention.
 */

export const RANKS = ['9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const COPIES_PER_DECK = 2;

/**
 * `jokers` is accepted (same call shape as `standardDeck.build`, so
 * `deckTypes.js`'s registry can call either uniformly) but deliberately
 * unused - pinochle has no joker in its own rules. Silently ignoring it
 * rather than throwing: passing 0 (the default) is the common case and
 * should just work; a caller who explicitly asks for jokers on a
 * pinochle deck is asking for something outside this deck type's own
 * rules, not making a mistake worth failing loudly over.
 * @param {{numDecks?: number, jokers?: number}} [options]
 * @returns {{id: string, rank: string, suit: string|null}[]}
 */
export function build({ numDecks: numberDecks = 1 } = {}) {
  const deck = [];
  for (let d = 0; d < numberDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        for (let copy = 0; copy < COPIES_PER_DECK; copy++) {
          deck.push({ id: `${rank}-${suit}-${d}-${copy}`, rank, suit });
        }
      }
    }
  }
  return deck;
}
