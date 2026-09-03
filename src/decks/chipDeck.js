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

/** A palette, not a value scale (Smith Gate 1 condition A). Nothing
 * sums or orders these - `ChipPileable.sortActions` is empty, which is
 * what enforces it. They exist so a player can tell one chip from
 * another at rest. */
const CHIP_SETS = {
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
  return set.flatMap(({ colour, label, count }) => {
    const marked = label ? `${label}-` : '';
    return Array.from({ length: count }, (_, index) => ({
      id: `${pileableType}-${colour}-${marked}${index}`,
      pileableType,
      colour,
      ...(label && { label }),
    }));
  });
}
