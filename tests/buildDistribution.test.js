import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { buildDistribution, JEV_ENTRIES } from '../tools/buildDistribution.mjs';

test('dist build gathers the plain static deploy surface, untransformed', async () => {
  const distribution = await buildDistribution();

  const html = await readFile(path.join(distribution, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="src/main.js"></script>'), 'index.html must be copied as-is (D1: no build step for a real static host)');
  assert.ok(html.includes('<link rel="stylesheet" href="style.css" />'), 'style.css must stay a relative link, not be inlined');

  await assert.doesNotReject(stat(path.join(distribution, 'style.css')));
  await assert.doesNotReject(stat(path.join(distribution, 'src', 'main.js')));
  await assert.doesNotReject(stat(path.join(distribution, 'assets', 'brand', 'card-back.webp')));
});

test('dist build packages the Jev processes as a self-contained, installable dist/jev/', async () => {
  const distribution = await buildDistribution();
  const jev = path.join(distribution, 'jev');

  // The three CLIs, the harness they drive a table through, the games'
  // files they read at runtime, and the app the headless bots load.
  for (const file of ['tools/jevTable.mjs', 'tools/jevPlayer.mjs', 'tools/jevGameMaster.mjs',
    'tests/harness/multiplayer.mjs', 'games/gin/turn.yaml', 'games/rtg/turn.yaml',
    'index.html', 'style.css', 'src/main.js', 'README.md']) {
    await assert.doesNotReject(stat(path.join(jev, file)), `dist/jev/${file} missing`);
  }

  // Every local import reachable from the CLIs is in the package: bundling
  // the PACKAGED entry points fails on the first one that is not.
  await assert.doesNotReject(esbuild.build({
    entryPoints: JEV_ENTRIES.map((entry) => path.join(jev, entry)),
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent', outdir: 'unused',
  }));

  // Runtime dependencies only - exactly what the CLIs import (or start,
  // for `peer`), pinned to the EXACT versions installed here, so an image
  // built from the package gets what was tested. No lint/test tooling.
  const jevPackage = JSON.parse(await readFile(path.join(jev, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(jevPackage.dependencies).toSorted((a, b) => a.localeCompare(b)),
    ['@typesafe-ai/sdk', 'peer', 'playwright', 'xstate', 'yaml']);
  for (const [name, version] of Object.entries(jevPackage.dependencies)) {
    const installed = JSON.parse(await readFile(path.join('node_modules', name, 'package.json'), 'utf8')).version;
    assert.equal(version, installed, `${name} must be pinned to the installed version`);
  }
  assert.equal(jevPackage.devDependencies, undefined);

  // The package is its own container build context (make export-jev-image).
  const dockerfile = await readFile(path.join(jev, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /^FROM /m);
  assert.match(await readFile(path.join(jev, '.dockerignore'), 'utf8'), /node_modules/);
});
