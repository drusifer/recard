#!/usr/bin/env node
/**
 * Static import graph of `src/**` - the actual module wiring of the
 * app, not test coverage (Trin's `tools/testAudit/` already covers
 * that angle; this is a different question - "what depends on what",
 * independent of any test). Real data: regex-extracted `import ...
 * from '...'` specifiers, resolved relative to each file, restricted
 * to this project's own modules (a bare-specifier import - none exist
 * in src/ today - would be dropped, not fabricated as a node).
 *
 * Regex extraction rather than a full parser: this codebase's own
 * ESM import style is consistent (`import { a, b } from '../x.js'` /
 * `import x from './y.js'`, always at top level, one statement per
 * line) - verified by grepping the actual import lines below before
 * trusting the pattern, not assumed.
 *
 * Output: `tools/codeConnectome/graph.json` - {nodes: [{id, dir, loc,
 * exportCount}], links: [{source, target}]}. Consumed by the
 * connectome Artifact (data is embedded directly into that HTML at
 * publish time, this file is not fetched at runtime).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'tools', 'codeConnectome', 'graph.json');

function walk(directory) {
  const out = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// `export { x } from './y.js'` re-exports are real dependency edges
// too - verified two exist in src/ (`Pileable.js` from `pileTypes.js`
// sibling, `typeLine` from `cardFaces.js`) before deciding they'd be
// silently dropped by an import-only pattern.
//
// Bounded by `;` (excluded from the lazy match, `[^;]*?`) rather than
// spelling out the three ES import shapes (brace list / namespace /
// bare default) as an alternation - two earlier versions of this line
// each satisfied one eslint rule and failed another: an open `[\s\S]*?`
// span (real multi-line braced imports exist here - found live,
// silently dropping 2 real edges before this was noticed) flagged for
// super-linear backtracking risk; a three-way alternation spelling out
// each shape flagged for excess regex complexity. A statement can't
// contain a literal `;` before its own terminator, so excluding it is
// a real, structural bound - as safe as the brace-bounded `[^}]*`
// elsewhere in this pattern - without needing to model the shapes at
// all, which is also simply less code for the same guarantee.
const IMPORT_RE = /^(?:import|export)[^;]*?\sfrom\s+['"](\.[^'"]+)['"];?\s*$/gm;
const EXPORT_RE = /^export\s+(?:const|function|class|let)\s+\w+|^export\s*\{/gm;

function resolveImport(fromFile, spec) {
  const resolved = path.normalize(path.join(path.dirname(fromFile), spec));
  return resolved.endsWith('.js') ? resolved : `${resolved}.js`;
}

/** One node per src file, plus every resolved import edge. `missing`
 * collects specifiers that resolved OUTSIDE src/ (e.g. into cards/ -
 * expected, not an error) so `main()` can report them without this
 * function needing to know how they're reported. */
function buildNodesAndLinks(files) {
  const relativeById = new Map(files.map((file) => [file, path.relative(ROOT, file)]));
  const nodes = [];
  const links = [];
  const missing = new Set();

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const id = relativeById.get(file);
    nodes.push({
      id,
      dir: path.relative(SRC, path.dirname(file)) || '(root)',
      loc: text.split('\n').length,
      exportCount: text.matchAll(EXPORT_RE).toArray().length,
    });

    for (const match of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, match[1]);
      if (relativeById.has(target)) links.push({ source: id, target: relativeById.get(target) });
      else missing.add(`${id} -> ${match[1]}`);
    }
  }
  return { nodes, links, missing };
}

/** Fan-in/fan-out per node - real architecture signal (which files are
 * hubs vs. leaves), computed once here rather than re-derived
 * client-side from the links array on every page load. Mutates each
 * node in place - `nodes` is this module's own freshly-built array,
 * never a caller's shared state. */
function annotateFanInOut(nodes, links) {
  const fanIn = new Map(nodes.map((n) => [n.id, 0]));
  const fanOut = new Map(nodes.map((n) => [n.id, 0]));
  for (const link of links) {
    fanOut.set(link.source, (fanOut.get(link.source) ?? 0) + 1);
    fanIn.set(link.target, (fanIn.get(link.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.fanIn = fanIn.get(node.id) ?? 0;
    node.fanOut = fanOut.get(node.id) ?? 0;
  }
}

/** Import-cycle detection (DFS, white/gray/black colouring) - a real
 * architectural fact about THIS codebase, not decoration: a clean
 * layered import graph has none, and that is worth stating plainly
 * rather than assumed. Every node in any cycle found is flagged on the
 * node itself (`inCycle`), not just counted, so the page can highlight
 * them. Returns the raw cycle paths too, for the JSON's own record. */
function detectCycles(nodes, links) {
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const link of links) adjacency.get(link.source)?.push(link.target);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const state = new Map(nodes.map((n) => [n.id, WHITE]));
  const cycles = [];

  function visit(id, stack) {
    state.set(id, GRAY);
    stack.push(id);
    const outEdges = adjacency.get(id) ?? [];
    for (const next of outEdges) {
      if (state.get(next) === GRAY) cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (state.get(next) === WHITE) visit(next, stack);
    }
    stack.pop();
    state.set(id, BLACK);
  }
  for (const node of nodes) if (state.get(node.id) === WHITE) visit(node.id, []);

  const cycleMembers = new Set(cycles.flat());
  for (const node of nodes) node.inCycle = cycleMembers.has(node.id);
  return cycles;
}

function main() {
  const files = walk(SRC);
  const { nodes, links, missing } = buildNodesAndLinks(files);
  annotateFanInOut(nodes, links);
  const cycles = detectCycles(nodes, links);

  writeFileSync(OUT, JSON.stringify({ nodes, links, cycles }, null, 2));
  console.log(`${nodes.length} src files, ${links.length} import edges, ${cycles.length} import cycle(s).`);
  if (missing.size > 0) {
    console.log(`${missing.size} import(s) resolved outside src/ (skipped, expected - e.g. cards/cardFaces.js):`);
    for (const m of missing) console.log(`  ${m}`);
  }
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

main();
