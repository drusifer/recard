/**
 * Recard the Gathering — write one art SVG per card (US-79, D77).
 *
 * The I/O shell around `art.mjs`. Reads the compiled pool and writes
 * `assets/cards/rtg/<id>.svg` for every card.
 *
 * Output goes to `assets/`, not `build/` — `build/` is gitignored and
 * these ship with the app.
 *
 * Because `cardArtSvg` is deterministic, re-running this is a no-op in
 * the diff unless a card's id, type or colours actually changed.
 *
 * Usage: `npm run cards:art` (or `make art`)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cardArtSvg } from './art.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'src/decks/rtg/catalog.js');
const OUT_DIR = path.join(ROOT, 'assets/cards/rtg');

async function main() {
  const { CARDS: cards } = await import(pathToFileURL(CATALOG).href);
  await mkdir(OUT_DIR, { recursive: true });

  for (const card of cards) {
    await writeFile(path.join(OUT_DIR, `${card.id}.svg`), `${cardArtSvg(card)}\n`);
  }
  console.log(`cards:art — ${cards.length} svg(s) → ${path.relative(ROOT, OUT_DIR)}`);
}

await main();
