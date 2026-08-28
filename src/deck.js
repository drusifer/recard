import { DECK_TYPES } from './decks/deckTypes.js';

// Re-exported for backward compatibility - `standardDeck.js` (D47) is
// now the source of truth for these, `deck.js` just forwards them so no
// existing caller (or test) needed to change import paths.
export { RANKS, SUITS } from './decks/standardDeck.js';

/**
 * `type` (D47/D38's `DeckDefinition`) dispatches to `DECK_TYPES`
 * (`src/decks/*.js`) instead of this function knowing how to build
 * every deck type itself - the same registry-dispatch shape as
 * `PILE_TYPES` (D42) and `ACTIONS` (D44). Defaults to `'standard'`,
 * matching every prior sprint's behavior exactly (no caller has ever
 * passed a `type` before this field existed).
 * @param {{type?: string, numDecks?: number, jokers?: number, deckList?: string}} [options]
 * @returns {{id: string, rank: string, suit: string|null}[]}
 */
export function buildDeck({ type = 'standard', numDecks: numberDecks = 1, jokers = 0, deckList } = {}) {
  const deckType = DECK_TYPES[type];
  if (!deckType) throw new Error(`Unknown deck type: "${type}"`);
  // `deckList` (D80) is additive - it names which catalogued list a
  // deck type should build, and is simply ignored by every deck type
  // that doesn't have lists (standard, pinochle), so no existing caller
  // changes behaviour.
  return deckType.build({ numDecks: numberDecks, jokers, deckList });
}

/**
 * Fisher-Yates shuffle. Does not mutate the input; `rng` defaults to
 * Math.random but accepts a seeded generator for deterministic tests.
 * @param {Array} deck
 * @param {() => number} [rng]
 */
export function shuffle(deck, rng = Math.random) {
  const result = [...deck];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temporary = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = temporary;
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
export function deal(deck, numberPlayers, cardsPerPlayer) {
  const totalNeeded = numberPlayers * cardsPerPlayer;
  if (totalNeeded > deck.length) {
    throw new Error(
      `Cannot deal ${cardsPerPlayer} cards to ${numberPlayers} players: deck only has ${deck.length} cards`,
    );
  }

  const hands = Array.from({ length: numberPlayers }, () => []);
  const remaining = [...deck];
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (let p = 0; p < numberPlayers; p++) {
      hands[p].push(remaining.shift());
    }
  }
  return { hands, remaining };
}
