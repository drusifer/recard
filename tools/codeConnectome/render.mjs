#!/usr/bin/env node
/**
 * Injects `graph.json` (from `buildGraph.mjs`) into `template.html`
 * and writes `connectome.html` - the same two-step pipeline used to
 * build the published "Recard Connectome" artifact, kept as a real
 * script rather than the one-off inline substitution it started as,
 * so a future re-run after the codebase changes is `node
 * tools/codeConnectome/buildGraph.mjs && node
 * tools/codeConnectome/render.mjs`, not a repeat of hand-editing.
 *
 * Data is embedded directly into the page (no fetch at runtime),
 * matching every other self-contained artifact this project has
 * shipped - `connectome.html` is what gets republished to the
 * Artifact.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const template = readFileSync(path.join(DIR, 'template.html'), 'utf8');
const graph = JSON.parse(readFileSync(path.join(DIR, 'graph.json'), 'utf8'));

// decks/rtg (1 file) merges into decks/ for a clean 7-slot categorical
// palette - the same merge the connectome's legend/colour key assume.
for (const node of graph.nodes) {
  if (node.dir === 'decks/rtg') node.dir = 'decks';
}

// A replacer FUNCTION, not a string - graph data could legitimately
// contain a literal "$" (a file path, a test name) that a string
// replacement value would misread as a $&/$1-style pattern.
const out = template.replace('__GRAPH_JSON__', () => JSON.stringify(graph));
writeFileSync(path.join(DIR, 'connectome.html'), out);
console.log(`Wrote ${path.relative(process.cwd(), path.join(DIR, 'connectome.html'))} (${out.length} bytes)`);
console.log('Republish via the Artifact tool to update the live page.');
