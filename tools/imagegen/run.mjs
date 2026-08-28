/**
 * imagegen — the generation runner (I/O shell around the pure modules).
 *
 * Everything here exists because a real 132-image run went wrong in a
 * specific way first:
 *
 * - **Resumable.** Generation is slow and quota-limited, so a run must
 *   never repay for an image it already has. Re-running is the recovery
 *   procedure, not a fresh start.
 * - **Quota is terminal, not transient.** Retrying an exhausted quota
 *   burns wall-clock on a guaranteed failure and buries the real reason:
 *   one run reported 13 generic "failures" whose actual cause was a
 *   4-hour quota lockout. First quota error stops the whole run.
 * - **Validate by dimensions, never bytes.** The two smallest images in
 *   one run (40 KB, 57 KB) were perfectly good art that simply
 *   compressed well. A size threshold would have deleted them.
 * - **Bounded concurrency.** Parallelism helps, but only up to the
 *   backend's tolerance; past that it spends quota faster without
 *   finishing sooner.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, rename, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { backendFor } from './backends.mjs';
import { imageIsValid } from './validate.mjs';

const QUOTA_MARKER = '.quota-exhausted';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Run one backend command, capturing combined output. Never rejects —
 * a non-zero exit is data, not an exception, because the runner decides
 * what it means. */
function runCommand(command, commandArguments, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', (error) => resolve({ code: -1, output: `${output}\n${error.message}` }));
    child.on('close', (code) => resolve({ code, output }));
  });
}

/**
 * For a backend that ignores the requested path (`writesToOutPath:
 * false`), find what it actually produced and move it into place. It may
 * also have appended a suffix when it regenerated (`<id>_2.png`), so the
 * newest match wins.
 */
async function claimFromScratch(backend, id, outPath) {
  const scratch = path.join(os.homedir(), backend.scratchDir);
  let entries;
  try {
    entries = await readdir(scratch);
  } catch {
    return false;
  }
  const matches = entries.filter((n) => n === `${id}.png` || n.startsWith(`${id}_`));
  if (matches.length === 0) return false;

  // Newest by name is good enough: the suffix increments per regenerate.
  const chosen = matches.toSorted((a, b) => b.localeCompare(a))[0];
  await rename(path.join(scratch, chosen), outPath);
  return true;
}

/**
 * Generate one image. Returns 'ok' | 'skip' | 'fail' | 'quota'.
 */
async function generateOne(item, options) {
  const { backend, outDir, style, retries, minSize } = options;
  const outPath = path.join(outDir, `${item.id}.png`);

  if (await exists(outPath) && await imageIsValid(outPath, minSize)) return 'skip';

  for (let attempt = 1; attempt <= retries; attempt++) {
    const { command, args } = backend.command(item.id, item.prompt, outPath, style);
    const { output } = await runCommand(command, args, outDir);

    const landed = backend.writesToOutPath
      ? await exists(outPath)
      : await claimFromScratch(backend, item.id, outPath);

    if (landed && await imageIsValid(outPath, minSize)) return 'ok';

    if (backend.isQuotaError(output)) return 'quota';
  }
  return 'fail';
}

/**
 * Generate every item, `parallel` at a time.
 *
 * @param {{id: string, prompt: string}[]} items
 * @param {{backend: string, outDir: string, style?: string,
 *   parallel?: number, retries?: number, minSize?: number,
 *   onResult?: (result: string, item: object, done: number) => void}} options
 */
export async function generateAll(items, options) {
  const config = {
    backend: backendFor(options.backend),
    outDir: options.outDir,
    style: options.style ?? '',
    retries: options.retries ?? 2,
    minSize: options.minSize ?? 512,
  };
  await mkdir(config.outDir, { recursive: true });

  const marker = path.join(config.outDir, QUOTA_MARKER);
  const totals = { ok: 0, skip: 0, fail: 0, quota: 0 };
  let cursor = 0;
  let done = 0;
  let didExhaustQuota = false;

  const worker = async () => {
    while (!didExhaustQuota && cursor < items.length) {
      const item = items[cursor++];
      const result = await generateOne(item, config);
      if (result === 'quota') {
        // First quota error stops everyone: every further call is a
        // guaranteed failure.
        didExhaustQuota = true;
        await writeFile(marker, new Date().toISOString());
      }
      totals[result] += 1;
      done += 1;
      options.onResult?.(result, item, done);
    }
  };

  const lanes = Math.max(1, Math.min(options.parallel ?? 3, items.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return { ...totals, didExhaustQuota };
}
