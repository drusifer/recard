#!/usr/bin/env node
/**
 * imagegen — generate a set of images from a manifest of prompts, then
 * pack them into web-sized assets.
 *
 * A general tool, not a Recard one: give it a list of `<id>` + `<prompt>`
 * and it paints each one via a pluggable CLI backend, resumably.
 *
 *   imagegen gen  --manifest jobs.tsv --out build/raw [options]
 *   imagegen pack --in build/raw --out assets/img [options]
 *
 * gen options:
 *   --backend <name>   codex (default) | agy      see backends.mjs
 *   --style "..."      style suffix applied to every prompt
 *   --parallel N       concurrent generations (default 3)
 *   --retries N        attempts per image (default 2), quota never retried
 *   --min-size N       reject images smaller than N px (default 512)
 *
 * pack options:
 *   --size N           longest edge, aspect preserved (default 512)
 *   --quality N        WebP quality (default 82)
 *   --format webp|png|jpeg
 *
 * Generation is RESUMABLE: an image that already exists and validates is
 * skipped, so re-running after a quota lockout or interruption picks up
 * exactly where it stopped.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseManifest } from './manifest.mjs';
import { generateAll } from './run.mjs';
import { packAll } from './pack.mjs';

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) options[key] = true;
    else { options[key] = next; index++; }
  }
  return options;
}

const USAGE = `imagegen gen  --manifest <file> --out <dir> [--backend codex|agy] [--style "..."] [--parallel N] [--retries N] [--min-size N]
imagegen pack --in <dir> --out <dir> [--size N] [--quality N] [--format webp|png|jpeg]`;

async function gen(options) {
  const manifestPath = options.manifest;
  const outputDirectory = options.out;
  if (!manifestPath || !outputDirectory) throw new Error(`gen needs --manifest and --out\n\n${USAGE}`);

  const items = parseManifest(await readFile(manifestPath, 'utf8'), path.basename(manifestPath));
  console.log(`imagegen — ${items.length} image(s), backend ${options.backend ?? 'codex'}, ${options.parallel ?? 3} at a time`);

  const started = Date.now();
  const totals = await generateAll(items, {
    backend: options.backend ?? 'codex',
    outDir: outputDirectory,
    style: options.style === true ? '' : (options.style ?? ''),
    parallel: Number(options.parallel ?? 3),
    retries: Number(options.retries ?? 2),
    minSize: Number(options['min-size'] ?? 512),
    onResult(result, item, done) {
      const label = { ok: 'ok   ', skip: 'skip ', fail: 'FAIL ', quota: 'QUOTA' }[result];
      console.log(`${label} [${done}/${items.length}] ${item.id}`);
    },
  });

  const mins = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`\nimagegen — ${totals.ok} generated, ${totals.skip} already present, ${totals.fail} failed in ${mins} min`);
  if (totals.didExhaustQuota) {
    // Exit non-zero so a Makefile or CI step notices, and say plainly
    // what to do: re-running is the whole recovery procedure.
    console.error('\n✖ Backend quota exhausted — run stopped early.');
    console.error('  Re-run the same command when the quota resets; finished images are skipped.');
    process.exitCode = 2;
  } else if (totals.fail > 0) {
    process.exitCode = 1;
  }
}

async function pack(options) {
  const inputDirectory = options.in;
  const outputDirectory = options.out;
  if (!inputDirectory || !outputDirectory) throw new Error(`pack needs --in and --out\n\n${USAGE}`);

  const result = await packAll({
    inDir: inputDirectory,
    outDir: outputDirectory,
    size: Number(options.size ?? 512),
    quality: Number(options.quality ?? 82),
    format: options.format ?? 'webp',
  });
  console.log(`imagegen — packed ${result.packed}/${result.total} → ${outputDirectory} (${result.size}px ${result.format} q${result.quality})`);
  if (result.packed < result.total) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
const options = parseArguments(rest);

try {
  if (command === 'gen') await gen(options);
  else if (command === 'pack') await pack(options);
  else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`imagegen: ${error.message}`);
  process.exitCode = 1;
}
