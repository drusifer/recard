/**
 * Gathers the deploy surface into dist/ for uploading to a real static
 * host (rsync/scp/whatever gets files onto the site). Deliberately not a
 * bundle: D1 (docs/ARCHITECTURE.md) is "static site, no build step" - a
 * real HTTP host serves `<script type="module">` and relative asset
 * paths just fine, so this is a copy, not a transform. Contrast with
 * tools/buildStandalone.mjs, which exists only because file:// can't.
 */
import { cp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { buildStandaloneHtml } from './buildStandalone.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const ENTRIES = ['index.html', 'style.css', 'src', 'assets'];

/**
 * The Jev processes a person runs on a box of their own (`dist/jev/`).
 */
export const JEV_ENTRIES = ['tools/jevTable.mjs', 'tools/jevPlayer.mjs', 'tools/jevGameMaster.mjs'];
/**
 * Started as a process (`localPeerServer.mjs` runs its bin), never imported.
 */
const JEV_SPAWNED_PACKAGES = ['peer'];

export async function buildDistribution() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await Promise.all(ENTRIES.map((entry) =>
    cp(path.join(ROOT, entry), path.join(DIST, entry), { recursive: true })));
  // The single-file `file://` bundle ships alongside the deploy folder,
  // because this function CLEARS dist/ first - a bundle built into it
  // separately would simply vanish on the next `make dist`.
  await writeFile(path.join(DIST, 'recard-standalone.html'), await buildStandaloneHtml());
  await buildJevPackage(path.join(DIST, 'jev'));
  return DIST;
}

/**
 * The Jev CLIs (jev-table / jev-player / jev-game-master) as a package
 * that runs anywhere with Node: `npm install` there, then play or watch.
 * They find the app, `games/` and each other by paths relative to their
 * own files (the harness serves its `../..` to the headless bots), so the
 * package keeps the repo's layout - only pruned to what they reach.
 * esbuild's import graph says which source files and packages that is,
 * so a new import is picked up without editing a list here.
 */
async function buildJevPackage(target) {
  const { metafile } = await esbuild.build({
    absWorkingDir: ROOT, entryPoints: JEV_ENTRIES, bundle: true, platform: 'node', format: 'esm',
    packages: 'external', write: false, metafile: true, outdir: 'unused', logLevel: 'silent',
  });
  const sources = Object.keys(metafile.inputs);
  const imported = Object.values(metafile.inputs).flatMap((input) => input.imports)
    .filter((entry) => entry.external && !entry.path.startsWith('node:'))
    .map((entry) => packageName(entry.path));
  // Exact installed versions, not the repo's ranges: an image built from
  // this package (`make export-jev-image`) gets what was tested here.
  const names = [...new Set([...imported, ...JEV_SPAWNED_PACKAGES])].toSorted((a, b) => a.localeCompare(b));
  const dependencies = Object.fromEntries(await Promise.all(names.map(async (name) =>
    [name, JSON.parse(await readFile(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version])));

  await mkdir(target, { recursive: true });
  // The app is what the bots' headless browsers (and anyone watching on
  // the box's port) load; `games/` is read at runtime, not imported.
  const whole = [...ENTRIES, 'games'];
  const isCovered = (source) => whole.some((entry) => source === entry || source.startsWith(`${entry}/`));
  await Promise.all([...whole, ...sources.filter((source) => !isCovered(source))].map((entry) =>
    cp(path.join(ROOT, entry), path.join(target, entry), { recursive: true })));
  await writeFile(path.join(target, 'package.json'), `${JSON.stringify({
    name: 'recard-jev', private: true, type: 'module',
    scripts: {
      setup: 'npm install --omit=dev && npx playwright install chromium',
      'jev-table': 'node tools/jevTable.mjs',
      'jev-player': 'node tools/jevPlayer.mjs',
      'jev-game-master': 'node tools/jevGameMaster.mjs',
    },
    dependencies,
  }, null, 2)}\n`);
  await cp(path.join(ROOT, 'tools', 'jevPackage.README.md'), path.join(target, 'README.md'));
  // Its own container build context (`make export-jev-image`).
  await cp(path.join(ROOT, 'tools', 'jevPackage.Dockerfile'), path.join(target, 'Dockerfile'));
  await writeFile(path.join(target, '.dockerignore'), 'node_modules\nbuild\n');
}

/**
 * `@scope/name/sub` -> `@scope/name`; `name/sub` -> `name`.
 */
function packageName(specifier) {
  const parts = specifier.split('/');
  return (specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)).join('/');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distribution = await buildDistribution();
  console.log(`Wrote ${path.relative(ROOT, distribution)}/ — upload its contents to your static host.`);
}
