/**
 * Bundles the whole app into one self-contained .html file that runs via
 * `file://` — no static host, no dev server. Generated, never hand-edited:
 * re-run `make build-standalone` after any source change.
 *
 * Three things a plain static deploy gets for free that a single file
 * doesn't, each handled here:
 *   - `<script type="module">` can't import across `file://` (CORS) — esbuild
 *     bundles src/main.js's whole import graph into one plain IIFE.
 *   - PeerJS is loaded from a CDN in index.html — vendored from
 *     node_modules/peerjs instead so the file has no external <script src>.
 *   - `assets/cards/rtg/<id>.webp` paths are built at runtime (`artUrl()`,
 *     one per printed card) and can't be rewritten by a static text pass.
 *     Every file under assets/ is base64-inlined into a `window.__ASSETS__`
 *     path->data-URI map instead, and `src/assetPath.js` (`resolveAssetPath`)
 *     is the one seam `artUrl()` and style.css's card-back reference both
 *     go through to resolve against it.
 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'recard-standalone.html');

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  }));
  return files.flat();
}

const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

async function buildAssetMap() {
  const assetsDirectory = path.join(ROOT, 'assets');
  const files = await walkFiles(assetsDirectory);
  const map = {};
  for (const file of files) {
    const relativePath = 'assets/' + path.relative(assetsDirectory, file).split(path.sep).join('/');
    const mime = MIME[path.extname(file)] ?? 'application/octet-stream';
    const data = await readFile(file);
    map[relativePath] = `data:${mime};base64,${data.toString('base64')}`;
  }
  return map;
}

export async function buildStandaloneHtml() {
  const [html, css, peerjs, assetMap, bundle] = await Promise.all([
    readFile(path.join(ROOT, 'index.html'), 'utf8'),
    readFile(path.join(ROOT, 'style.css'), 'utf8'),
    readFile(path.join(ROOT, 'node_modules', 'peerjs', 'dist', 'peerjs.min.js'), 'utf8'),
    buildAssetMap(),
    esbuild.build({
      entryPoints: [path.join(ROOT, 'src', 'main.js')],
      bundle: true,
      format: 'iife',
      minify: true,
      write: false,
    }),
  ]);

  // Minified after the card-back swap, not before: minifying first would
  // require re-deriving the (possibly reformatted) url("...") text to
  // splice the data URI into, for no benefit - the swap is a single
  // literal substring either way.
  const swappedCss = css.split('url("assets/brand/card-back.webp")')
    .join(`url("${assetMap['assets/brand/card-back.webp']}")`);
  const cssResult = await esbuild.transform(swappedCss, { loader: 'css', minify: true });
  const inlinedCss = cssResult.code;

  const appJs = bundle.outputFiles[0].text;
  const assetMapJson = JSON.stringify(assetMap);

  const peerjsTag = '<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>';
  const styleTag = '<link rel="stylesheet" href="style.css" />';
  const mainTag = '<script type="module" src="src/main.js"></script>';

  return html
    .split(peerjsTag).join(`<script>${peerjs}</script>`)
    .split(styleTag).join(`<style>${inlinedCss}</style>`)
    .split(mainTag).join(`<script>window.__ASSETS__=${assetMapJson};</script>\n  <script>${appJs}</script>`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = await buildStandaloneHtml();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, html);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${(html.length / 1024 / 1024).toFixed(1)}MB)`);
}
