/**
 * Gathers the deploy surface into dist/ for uploading to a real static
 * host (rsync/scp/whatever gets files onto the site). Deliberately not a
 * bundle: D1 (docs/ARCHITECTURE.md) is "static site, no build step" - a
 * real HTTP host serves `<script type="module">` and relative asset
 * paths just fine, so this is a copy, not a transform. Contrast with
 * tools/buildStandalone.mjs, which exists only because file:// can't.
 */
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandaloneHtml } from './buildStandalone.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const ENTRIES = ['index.html', 'style.css', 'src', 'assets'];

export async function buildDistribution() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await Promise.all(ENTRIES.map((entry) =>
    cp(path.join(ROOT, entry), path.join(DIST, entry), { recursive: true })));
  // The single-file `file://` bundle ships alongside the deploy folder,
  // because this function CLEARS dist/ first - a bundle built into it
  // separately would simply vanish on the next `make dist`.
  await writeFile(path.join(DIST, 'recard-standalone.html'), await buildStandaloneHtml());
  return DIST;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distribution = await buildDistribution();
  console.log(`Wrote ${path.relative(ROOT, distribution)}/ — upload its contents to your static host.`);
}
