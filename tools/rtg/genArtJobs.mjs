/**
 * Recard the Gathering — build the art job list (US-79).
 *
 * Emits `<card-id>\t<art prompt>` per line from the compiled catalog,
 * for `genArtAgy.sh` to consume. Kept separate from the shell script so
 * the catalog stays the single source of prompts and the shell never
 * has to parse JS.
 *
 * The prompt is each card's own authored `art:` field, whitespace-
 * collapsed (it's a folded YAML scalar, so it arrives with newlines).
 *
 * Usage: `node tools/rtg/genArtJobs.mjs > jobs.tsv`
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = path.join(ROOT, 'src/decks/rtg/catalog.js');

const { CARDS } = await import(pathToFileURL(CATALOG).href);

for (const card of CARDS) {
  const prompt = card.art.replaceAll(/\s+/g, ' ').trim();
  console.log(`${card.id}\t${prompt}`);
}
