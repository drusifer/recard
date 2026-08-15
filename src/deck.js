export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

/**
 * @param {{numDecks?: number, jokers?: number}} [options]
 * @returns {{id: string, rank: string, suit: string|null}[]}
 */
export function buildDeck({ numDecks = 1, jokers = 0 } = {}) {
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

/**
 * Fisher-Yates shuffle. Does not mutate the input; `rng` defaults to
 * Math.random but accepts a seeded generator for deterministic tests.
 * @param {Array} deck
 * @param {() => number} [rng]
 */
export function shuffle(deck, rng = Math.random) {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deals round-robin from the front of `deck` into `numPlayers` hands of
 * `cardsPerPlayer` cards each, mirroring how a physical deal works.
 * @param {Array} deck
 * @param {number} numPlayers
 * @param {number} cardsPerPlayer
 */
export function deal(deck, numPlayers, cardsPerPlayer) {
  const totalNeeded = numPlayers * cardsPerPlayer;
  if (totalNeeded > deck.length) {
    throw new Error(
      `Cannot deal ${cardsPerPlayer} cards to ${numPlayers} players: deck only has ${deck.length} cards`,
    );
  }

  const hands = Array.from({ length: numPlayers }, () => []);
  const remaining = [...deck];
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (let p = 0; p < numPlayers; p++) {
      hands[p].push(remaining.shift());
    }
  }
  return { hands, remaining };
}
