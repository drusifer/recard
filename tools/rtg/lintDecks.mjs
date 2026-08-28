/**
 * Recard the Gathering — deck balance linter (US-76, D78).
 *
 * The I/O shell around `deckSchema.mjs`. Reads the compiled card pool
 * and every authored deck list, checks each deck against the balance
 * rules, and exits non-zero on any violation - the same shape and role
 * `lint:design` already has for layout.
 *
 * Prints each failing deck's measured stats alongside its errors: the
 * curve histogram is how you FIX an unbalanced deck, not merely detect
 * one, so a bare "curve is too top-heavy" would be a worse tool.
 *
 * Usage: `npm run lint:decks` (or `make lint-decks`)
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deckStats, validateDeck } from './deckSchema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'src/decks/rtg/catalog.js');

/** A compact histogram, e.g. `1:8 2:8 3:12 5:4` - readable at a glance
 * and diffable between runs. */
function formatCurve(curve) {
  return Object.keys(curve)
    .map(Number)
    .toSorted((a, b) => a - b)
    .map((cmc) => `${cmc}:${curve[cmc]}`)
    .join(' ');
}

async function main() {
  // Imports the COMPILED catalog, so `make lint-decks` always measures
  // exactly what the app will load - not a second read of the YAML that
  // could disagree with it.
  const { CARDS, DECKS } = await import(pathToFileURL(CATALOG).href);
  const pool = new Map(CARDS.map((card) => [card.id, card]));
  const decks = DECKS;

  if (decks.length === 0) {
    console.log('lint:decks — no decks authored yet');
    return;
  }

  let failed = 0;
  for (const deck of decks) {
    const errors = validateDeck(deck, pool);
    if (errors.length === 0) continue;
    failed += 1;
    const stats = deckStats(deck, pool);
    console.error(`\n✖ ${deck.name ?? deck.id} (${(deck.colors ?? []).join('') || 'C'}, ${deck.archetype})`);
    console.error(`  ${stats.size} cards — ${stats.lands} lands / ${stats.spells} spells   curve ${formatCurve(stats.curve)}`);
    for (const error of errors) console.error(`    ✖ ${error}`);
  }

  if (failed > 0) {
    console.error(`\nlint:decks — ${failed} of ${decks.length} deck(s) failed balance checks`);
    console.error('See docs/RTG_DESIGN.md "Balance is a lint check" for the rules being applied.');
    process.exitCode = 1;
    return;
  }
  console.log(`lint:decks — ${decks.length} deck(s) balanced`);
}

await main();
