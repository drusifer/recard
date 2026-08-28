/**
 * Recard the Gathering — deck balance rules (US-76, D78).
 *
 * "Balanced" is otherwise a matter of taste and unverifiable. This
 * module makes it MEASURABLE: every rule below is a number a deck either
 * satisfies or doesn't, checked by `npm run lint:decks` before any deck
 * ships. That mirrors `lint:design`'s existing role for layout, and this
 * project's own standing "measure, don't eyeball" discipline.
 *
 * Pure and I/O-free, same as `cardSchema.mjs` - `lintDecks.mjs` is the
 * thin shell that reads files and prints.
 */
import { WUBRG } from './cardSchema.mjs';

/**
 * Land counts for a 60-card deck, by archetype. Sourced from standard
 * constructed guidance (~40% lands, i.e. 24 in a 60-card deck; aggro
 * runs leaner because a low curve doesn't need a 4th land on turn 4,
 * control runs heavier to reliably reach its expensive spells).
 *
 * These are inclusive `[min, max]` bounds and are asserted directly by
 * the test suite - they're the entire basis of the land check and are
 * exactly the kind of number that gets quietly "tidied" into something
 * unsourced.
 */
export const ARCHETYPE_LAND_BANDS = {
  aggro: [20, 23],
  midrange: [24, 25],
  control: [25, 27],
};

export const DECK_SIZE = 60;
export const MAX_COPIES = 4;

/** A left-skewed bell curve, expressed as two bounds on the SPELLS (not
 * the whole deck): plenty of early plays, few expensive ones. */
const MIN_CHEAP_SPELL_RATIO = 0.4; // at least 40% of spells at cmc <= 2
const MAX_EXPENSIVE_SPELL_RATIO = 0.15; // at most 15% of spells at cmc >= 5

/** Two-colour decks need enough lands producing each colour to actually
 * cast their spells on curve; the standard guidance is 15-16 sources
 * minimum in a 60-card deck. */
const MIN_SOURCES_PER_COLOR = 15;

const isLand = (card) => card.type === 'Land';
const isBasicLand = (card) => isLand(card) && (card.subtype ?? '').startsWith('Basic Land');

/**
 * Which colors a land can produce, parsed from the land's OWN rules text
 * rather than from its subtype. One source of truth, and duals work
 * through the same path as basics without a second mechanism.
 *
 * @param {object} card
 * @returns {string[]} colors in WUBRG order
 */
export function landColorSources(card) {
  if (!isLand(card)) return [];
  const produced = new Set();
  // `Add {W}`, `Add {W} or {U}`, `Add {W}{W}` - collect every symbol in
  // any "Add ..." clause up to the sentence end.
  const addClauses = (card.text ?? '').matchAll(/Add ([^.]*)/g).toArray();
  for (const [, clause] of addClauses) {
    const symbols = clause.matchAll(/\{([^{}]*)\}/g).toArray();
    for (const [, symbol] of symbols) {
      if (WUBRG.includes(symbol)) produced.add(symbol);
    }
  }
  return WUBRG.filter((color) => produced.has(color));
}

/**
 * Measure a deck. Separated from `validateDeck` because the numbers are
 * worth reporting on their own (a curve histogram is how you FIX an
 * unbalanced deck, not just detect one).
 *
 * @param {{cards: {id: string, count: number}[]}} deck
 * @param {Map<string, object>} pool
 * @returns {{size: number, lands: number, spells: number,
 *   curve: Record<number, number>, sources: Record<string, number>,
 *   missing: string[]}}
 */
export function deckStats(deck, pool) {
  const stats = {
    size: 0, lands: 0, spells: 0, curve: {}, sources: {}, missing: [],
  };
  for (const color of WUBRG) stats.sources[color] = 0;

  const entries = deck.cards ?? [];
  for (const { id, count } of entries) {
    const card = pool.get(id);
    if (!card) {
      stats.missing.push(id);
      continue;
    }
    stats.size += count;
    if (isLand(card)) {
      stats.lands += count;
      for (const color of landColorSources(card)) stats.sources[color] += count;
    } else {
      // Lands are cmc 0 but are not spells - bucketing them would make
      // every deck look like it had a superb early curve.
      stats.spells += count;
      stats.curve[card.cmc] = (stats.curve[card.cmc] ?? 0) + count;
    }
  }
  return stats;
}

/**
 * Every balance rule, as errors (empty when the deck is legal). Reports
 * all violations at once - fixing one rule per run across 15 decks would
 * be a long afternoon.
 *
 * @param {object} deck
 * @param {Map<string, object>} pool
 * @returns {string[]}
 */
export function validateDeck(deck, pool) {
  const where = `deck "${deck.id ?? '(no id)'}"`;
  const stats = deckStats(deck, pool);

  return [
    ...stats.missing.map((id) => `${where}: unknown card id "${id}"`),
    ...sizeErrors(deck, stats, pool, where),
    ...landErrors(deck, stats, where),
    ...curveErrors(stats, where),
    ...colorErrors(deck, stats, pool, where),
  ];
}

function sizeErrors(deck, stats, pool, where) {
  const errors = [];
  if (stats.size !== DECK_SIZE) {
    errors.push(`${where}: must be exactly ${DECK_SIZE} cards, has ${stats.size}`);
  }
  const entries = deck.cards ?? [];
  for (const { id, count } of entries) {
    const card = pool.get(id);
    // Basic lands are exempt - 24 Plains is legal and universal.
    if (card && !isBasicLand(card) && count > MAX_COPIES) {
      errors.push(`${where}: at most ${MAX_COPIES} copies of "${id}", has ${count}`);
    }
  }
  return errors;
}

function landErrors(deck, stats, where) {
  const band = ARCHETYPE_LAND_BANDS[deck.archetype];
  if (!band) {
    return [`${where}: unknown archetype "${deck.archetype}" (expected one of ${Object.keys(ARCHETYPE_LAND_BANDS).join(', ')})`];
  }
  const [min, max] = band;
  return stats.lands < min || stats.lands > max
    ? [`${where}: ${deck.archetype} wants ${min}-${max} lands, has ${stats.lands}`]
    : [];
}

function curveErrors(stats, where) {
  if (stats.spells === 0) return [];
  const errors = [];
  const cheap = (stats.curve[0] ?? 0) + (stats.curve[1] ?? 0) + (stats.curve[2] ?? 0);
  let expensive = 0;
  for (const [cmc, count] of Object.entries(stats.curve)) {
    if (Number(cmc) >= 5) expensive += count;
  }

  const minCheap = Math.ceil(stats.spells * MIN_CHEAP_SPELL_RATIO);
  const maxExpensive = Math.floor(stats.spells * MAX_EXPENSIVE_SPELL_RATIO);
  if (cheap < minCheap) {
    errors.push(`${where}: curve is too top-heavy — needs >= ${minCheap} cheap spells (cmc<=2), has ${cheap}`);
  }
  if (expensive > maxExpensive) {
    errors.push(`${where}: curve has too many expensive spells (cmc>=5) — max ${maxExpensive}, has ${expensive}`);
  }
  return errors;
}

function colorErrors(deck, stats, pool, where) {
  const declared = new Set(deck.colors);
  const errors = [];

  const entries = deck.cards ?? [];
  for (const { id } of entries) {
    const card = pool.get(id);
    if (!card) continue;
    const offending = (card.colors ?? []).filter((color) => !declared.has(color));
    if (offending.length > 0) {
      errors.push(`${where}: card "${id}" has colour(s) ${offending.join('')} outside the deck's colours ${[...declared].join('')}`);
    }
  }

  // Only meaningful for multicolour decks - a mono deck's single colour
  // is covered by the land-count band already.
  if (declared.size > 1) {
    const deckColors = WUBRG.filter((color) => declared.has(color));
    for (const color of deckColors) {
      if (stats.sources[color] < MIN_SOURCES_PER_COLOR) {
        errors.push(`${where}: only ${stats.sources[color]} sources of ${color}, needs >= ${MIN_SOURCES_PER_COLOR}`);
      }
    }
  }
  return errors;
}
