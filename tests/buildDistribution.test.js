import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildDistribution } from '../tools/buildDistribution.mjs';

test('dist build gathers the plain static deploy surface, untransformed', async () => {
  const distribution = await buildDistribution();

  const html = await readFile(path.join(distribution, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="src/main.js"></script>'), 'index.html must be copied as-is (D1: no build step for a real static host)');
  assert.ok(html.includes('<link rel="stylesheet" href="style.css" />'), 'style.css must stay a relative link, not be inlined');

  await assert.doesNotReject(stat(path.join(distribution, 'style.css')));
  await assert.doesNotReject(stat(path.join(distribution, 'src', 'main.js')));
  await assert.doesNotReject(stat(path.join(distribution, 'assets', 'brand', 'card-back.webp')));
});
