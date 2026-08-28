/**
 * Recard the Gathering — card schema and mana-cost parsing (US-75, D77).
 *
 * Pure and I/O-free, like `seating.js`/`handOrder.js`/`dropTarget.js` in
 * `src/`: the rules are the interesting part and are only directly
 * testable if they aren't tangled up with reading files. `compile.mjs`
 * is the thin I/O shell around this.
 *
 * Lives under `tools/` rather than `src/` because nothing the browser
 * loads imports it - the app reads the COMPILED `cards.json`, never the
 * YAML or this validator (D77's pipeline split). That's also why the
 * `yaml` dependency is a devDependency: the build needs it, the app
 * never does.
 */

/** Magic's own canonical color order. Fixing it here (rather than
 * preserving whatever order a cost happened to be written in) means two
 * cards with the same colors always compare equal - the balance
 * linter's color-identity check (US-76) depends on that. */
export const WUBRG = ['W', 'U', 'B', 'R', 'G'];

export const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Planeswalker'];
export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

/** An `art:` prompt shorter than this can't describe subject +
 * composition + palette, which is the whole point of the field (D77) -
 * it exists so real generated illustration can be swapped in later
 * without re-authoring the pool. A placeholder would compile fine and
 * be useless at that moment, so it's rejected at authoring time. */
const MIN_ART_PROMPT_LENGTH = 30;

/** Lore (`flavor:`) is REQUIRED on every card - direct user request
 * (2026-08-28), "add lore to the cards as well". Enforced rather than
 * left optional so a 135-card pool can't quietly ship with lore on only
 * the cards that happened to get attention. The floor is lower than
 * art's: a good flavor line is often a single short sentence. */
const MIN_FLAVOR_LENGTH = 16;

/**
 * Parse a Magic-style mana cost into its derived `cmc` and `colors`.
 *
 * `cmc` and `colors` are DERIVED here, never authored on the card. Hand-
 * authoring them is exactly how a pool drifts: the cost says one thing,
 * the card's own `cmc` field says another, and the balance linter then
 * measures a mana curve that isn't real.
 *
 * @param {string} cost e.g. `'{2}{W}{W}'`, or `''` for a land
 * @returns {{cmc: number, colors: string[], symbols: string[]}}
 * @throws {Error} on a malformed cost - scoring one as 0 would quietly
 *   flatten the curve instead of failing the build.
 */
export function parseManaCost(cost) {
  if (typeof cost !== 'string') throw new TypeError('mana cost must be a string');
  if (cost === '') return { cmc: 0, colors: [], symbols: [] };

  const matches = cost.matchAll(/\{([^{}]*)\}/g).toArray();
  const consumed = matches.reduce((total, match) => total + match[0].length, 0);
  if (consumed !== cost.length) {
    throw new Error(`Invalid mana cost "${cost}": every symbol must be brace-wrapped`);
  }

  let cmc = 0;
  const colors = new Set();
  const symbols = [];
  for (const [, symbol] of matches) {
    symbols.push(symbol);
    if (WUBRG.includes(symbol)) {
      cmc += 1;
      colors.add(symbol);
    } else if (symbol === 'C') {
      cmc += 1; // colorless, contributes no color identity
    } else if (symbol === 'X') {
      // X contributes nothing to cmc outside the stack, per the real
      // rule - listed explicitly so it reads as handled, not forgotten.
    } else if (/^\d+$/.test(symbol)) {
      cmc += Number(symbol);
    } else {
      throw new Error(`Invalid mana cost "${cost}": unknown symbol "{${symbol}}"`);
    }
  }
  return { cmc, colors: WUBRG.filter((color) => colors.has(color)), symbols };
}

/**
 * Structural validation for one card. Returns an array of human-readable
 * errors (empty when valid) rather than throwing on the first problem -
 * a 135-card pool fixed one field per compile run would be 135 round
 * trips.
 *
 * Balance rules (deck size, land ratio, curve) are deliberately NOT here
 * - those are deck-level and belong to the balance linter (US-76).
 *
 * @param {object} card
 * @returns {string[]}
 */
export function validateCard(card) {
  const where = card?.id ? `card "${card.id}"` : 'card (no id)';
  if (!card || typeof card !== 'object') return [`${where}: not an object`];

  return [
    ...requiredFieldErrors(card, where),
    ...enumerationErrors(card, where),
    ...costErrors(card, where),
    ...statErrors(card, where),
  ];
}

function requiredFieldErrors(card, where) {
  return ['id', 'name', 'type', 'rarity', 'art', 'flavor']
    .filter((field) => typeof card[field] !== 'string' || card[field].trim() === '')
    .map((field) => `${where}: missing required field "${field}"`);
}

function enumerationErrors(card, where) {
  const errors = [];
  if (card.type !== undefined && !CARD_TYPES.includes(card.type)) {
    errors.push(`${where}: unknown type "${card.type}" (expected one of ${CARD_TYPES.join(', ')})`);
  }
  if (card.rarity !== undefined && !RARITIES.includes(card.rarity)) {
    errors.push(`${where}: unknown rarity "${card.rarity}" (expected one of ${RARITIES.join(', ')})`);
  }
  const art = typeof card.art === 'string' ? card.art.trim() : '';
  if (art.length > 0 && art.length < MIN_ART_PROMPT_LENGTH) {
    errors.push(`${where}: "art" is too short to work as an image prompt (min ${MIN_ART_PROMPT_LENGTH} chars)`);
  }
  const flavor = typeof card.flavor === 'string' ? card.flavor.trim() : '';
  if (flavor.length > 0 && flavor.length < MIN_FLAVOR_LENGTH) {
    errors.push(`${where}: "flavor" is too short to read as lore (min ${MIN_FLAVOR_LENGTH} chars)`);
  }
  return errors;
}

/** A malformed cost is REPORTED, not thrown - one bad card must not
 * abort the pass and hide every other card's errors. */
function costErrors(card, where) {
  const cost = card.cost ?? '';
  try {
    parseManaCost(cost);
  } catch (error) {
    return [`${where}: ${error.message}`];
  }
  return cost !== '' && card.type === 'Land'
    ? [`${where}: a Land must have an empty cost, got "${cost}"`]
    : [];
}

function statErrors(card, where) {
  const isCreature = card.type === 'Creature';
  return ['power', 'toughness'].flatMap((stat) => {
    if (isCreature && !Number.isSafeInteger(card[stat])) {
      return [`${where}: a Creature must have an integer "${stat}"`];
    }
    if (!isCreature && card[stat] !== undefined) {
      return [`${where}: a non-Creature must not have "${stat}"`];
    }
    return [];
  });
}

/**
 * Validate a whole pool: every card structurally, plus the one invariant
 * that only exists across cards - id uniqueness. Ids are what deck lists
 * reference, so a duplicate silently redefines a card in every deck that
 * uses it.
 *
 * @param {object[]} cards
 * @returns {string[]}
 */
export function validateCardPool(cards) {
  const errors = cards.flatMap((card) => validateCard(card));

  const seen = new Set();
  for (const card of cards) {
    if (card?.id === undefined) continue;
    if (seen.has(card.id)) errors.push(`duplicate card id "${card.id}"`);
    seen.add(card.id);
  }
  return errors;
}
