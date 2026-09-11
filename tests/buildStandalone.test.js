import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml } from '../tools/buildStandalone.mjs';

// One build, reused by every assertion below — esbuild + base64-ing
// assets/ (5MB+) isn't free, and none of these checks mutate the result.
const htmlPromise = buildStandaloneHtml();

test('standalone build has no file:// blockers left', async () => {
  const html = await htmlPromise;
  assert.ok(!html.includes('type="module"'), 'ES module scripts break under file://');
  assert.ok(!html.includes('unpkg.com'), 'must not depend on a CDN fetch for its own script');
  assert.ok(!html.includes('href="style.css"'), 'CSS must be inlined, not a relative link');
});

test('standalone build inlines every asset file as a data URI', async () => {
  const html = await htmlPromise;
  const match = html.match(/window\.__ASSETS__=(\{.*?\});<\/script>/s);
  assert.ok(match, 'expected a window.__ASSETS__ map in the output');
  const assetMap = JSON.parse(match[1]);
  assert.ok(Object.keys(assetMap).length > 0, 'asset map should not be empty');
  for (const dataUri of Object.values(assetMap)) {
    assert.match(dataUri, /^data:image\/webp;base64,/);
  }
  assert.ok(html.includes(assetMap['assets/brand/card-back.webp']), 'card-back art must be inlined into the CSS');
});

test('standalone build bundles the app JS inline', async () => {
  const html = await htmlPromise;
  assert.ok(html.includes('function') || html.includes('=>'), 'expected bundled app code inline');
  assert.ok(!html.includes('src="src/main.js"'), 'must not reference the source file by path');
});
