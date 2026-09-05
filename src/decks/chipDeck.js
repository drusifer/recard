/**
 * The chip/token "deck" type (sprint pileObjects, US-105, D107).
 *
 * A chip supply is a deck of chips. That sounds like a pun and is
 * actually the whole design: a preset's declared pile is already
 * pre-stocked by calling `buildDeck` (D81), so expressing a supply as a
 * DECK_TYPE means `state.js` is not touched at all - no new preset
 * schema, no new reducer action, no new stocking path. D107 predicted
 * this before the phase started; `tests/chipDeck.test.js` is what makes
 * the prediction checkable.
 *
 * `shuffle` is applied to a declared pile's contents by `createInitialState`
 * the same way it is for cards. Shuffling chips is meaningless rather
 * than wrong, and NOT special-casing it is the point - a chip goes
 * through every path a card does.
 */
import { batchToken } from './batchToken.js';
import { CHIP_VALUES } from '../pileables/ChipPileable.js';

/** A palette, not a value scale (Smith Gate 1 condition A). Nothing
 * sums or orders these - `ChipPileable.sortActions` is empty, which is
 * what enforces it. They exist so a player can tell one chip from
 * another at rest. */
const CHIP_SETS = {
  /** One player's starting stack (direct user request: "chips in the
   * poker"). Deliberately small - a poker preset declares this
   * `perPlayer`, so the count here is multiplied by everyone at the
   * table, and 40 chips each would bury the table the way the first
   * Chips & Tokens preset did before Smith's `*user test` caught it. */
  'poker-stack': [
    { colour: 'white', count: 6 },
    { colour: 'red', count: 5 },
    { colour: 'blue', count: 4 },
    { colour: 'black', count: 2 },
  ],
  'standard-chips': [
    { colour: 'white', count: 10 },
    { colour: 'red', count: 10 },
    { colour: 'blue', count: 10 },
    { colour: 'green', count: 5 },
    { colour: 'black', count: 5 },
  ],
};

/** A token is a MARKED disc - the label is what distinguishes it from a
 * chip. Marks only: nothing increments them, and a counting token is a
 * different feature that was put to the user and ruled out of scope. */
const TOKEN_SETS = {
  'standard-tokens': [
    { colour: 'green', label: '+1', count: 8 },
    { colour: 'red', label: '-1', count: 8 },
    { colour: 'black', label: '!', count: 4 },
  ],
};

/**
 * @param {{deckList?: string}} options
 * @returns {{id: string, pileableType: string, colour: string, label?: string}[]}
 */
export function build({ deckList } = {}) {
  const isTokens = Object.hasOwn(TOKEN_SETS, deckList);
  const set = isTokens ? TOKEN_SETS[deckList] : CHIP_SETS[deckList];
  // Throws rather than returning an empty supply: a misspelled list name
  // would otherwise produce a preset that silently starts with no chips,
  // which looks exactly like the feature being broken. Same choice the
  // RtG deck type made for the same reason.
  if (!set) throw new Error(`Unknown chip/token list: "${deckList}"`);

  const pileableType = isTokens ? 'token' : 'chip';
  // Every BUILD gets its own id namespace. Chips are physically
  // interchangeable, but their ids are not: `assertCardsConserved` (D88)
  // treats the set of ids in play as a closed system, so two builds of
  // the same list - which is exactly what a `perPlayer` poker stack does,
  // once per player - would hand two players the same `chip-white-0` and
  // read as a duplication bug. It read as one, immediately: the guard
  // caught it the moment a second player joined.
  //
  // `batchToken` guards `crypto.randomUUID`, which exists only in a
  // secure context - calling it bare here broke Create Table over plain
  // HTTP, which is how this app is actually played (host on a LAN, peers
  // join by IP). The host builds and broadcasts, so nothing depends on
  // the token being reproducible across clients.
  const batch = batchToken();
  return set.flatMap(({ colour, label, count }) => {
    const marked = label ? `${label}-` : '';
    return Array.from({ length: count }, (_, index) => ({
      id: `${pileableType}-${batch}-${colour}-${marked}${index}`,
      pileableType,
      colour,
      // A chip's denomination comes from its colour, one table
      // (`CHIP_VALUES`) rather than repeated per set - a green chip is
      // 25 wherever it was built. Tokens have no denomination: they are
      // marks, and `TokenPileable.sortActions` stays empty because of it.
      ...(pileableType === 'chip' && { denom: CHIP_VALUES[colour] }),
      ...(label && { label }),
    }));
  });
}
