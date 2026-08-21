/**
 * The standard deck type (D47, Sprint 17) - exactly `deck.js`'s
 * original `buildDeck` body, relocated so a second deck type
 * (`pinochleDeck.js`) can exist without this one changing at all.
 */

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/**
 * @param {{numDecks?: number, jokers?: number}} [options]
 * @returns {{id: string, rank: string, suit: string|null}[]}
 */
export function build({ numDecks = 1, jokers = 0 } = {}) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: `${rank}-${suit}-${d}`, rank, suit });
      }
    }
    for (let j = 0; j < jokers; j++) {
      deck.push({ id: `JOKER-${j}-${d}`, rank: 'JOKER', suit: null });
    }
  }
  return deck;
}
