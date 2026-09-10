#!/usr/bin/env node
/**
 * Per-TEST-CASE coverage, not per-file: for every one of the 781 real
 * `test()` cases across `tests/*.test.js`, isolates that ONE case with
 * node's own `--test-name-pattern` (an official, built-in flag - no
 * invasive edits to the 29 test files, no bespoke instrumentation) and
 * measures its coverage under `c8`, same scope as `collectCoverage.mjs`
 * ("our code": src/**, tools/**, tests/designLint.mjs).
 *
 * WHY THIS EXISTS ALONGSIDE THE FILE-LEVEL PASS: file-level granularity
 * cannot see two tests in the SAME file that exercise identical lines -
 * exactly the shape a literal duplicate test takes. Verified empirically
 * before building this at scale (not assumed): a single isolated case
 * from `dropTarget.test.js` covered 128/131 statements against the
 * whole file's 131/131, confirming `--test-name-pattern` really does
 * skip the other tests rather than running everything anyway.
 *
 * Case NAMES, not source text, are the key - harvested by
 * `collectCoverage.mjs` from real TAP output (`# Subtest: <name>`), so
 * a computed/template-literal test name still matches correctly. Two
 * cases sharing one literal name cannot be isolated from each other by
 * a name pattern at all (both run every time); `collectCoverage.mjs`
 * already flags this in the manifest, and there are zero such
 * collisions in this suite today, so this script just refuses to run
 * if a future one appears rather than silently mis-attributing.
 *
 * Cost, verified before running all 781: ~0.8s/case dominated by
 * process-startup (npx+c8+node), not the test itself. Serial that is
 * ~10 minutes; this runs a bounded worker pool (default 8, override
 * via COVERAGE_CONCURRENCY) to cut wall time.
 *
 * Invoked by `make coverage-unit-deep` (bobp make coverage-unit-deep),
 * which itself depends on `coverage-unit` (needs its manifest as input).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE_MANIFEST = path.join(ROOT, 'coverage', 'per-test', '_manifest.json');
const OUT_DIR = path.join(ROOT, 'coverage', 'per-case');
const CONCURRENCY = Number(process.env.COVERAGE_CONCURRENCY ?? 8);

/** Same standard regex-escape every "build a pattern from arbitrary
 * user text" case needs - test names routinely contain the characters
 * that make an unescaped RegExp wrong: parens ("US-32/33 (D50)"),
 * dollar signs ("$50 chip"), plus/question marks, brackets. */
function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function statementTotals(coverageJson) {
  let total = 0;
  let covered = 0;
  for (const fileReport of Object.values(coverageJson)) {
    const hits = Object.values(fileReport.s ?? {});
    total += hits.length;
    covered += hits.filter((n) => n > 0).length;
  }
  return { total, covered, srcFiles: Object.keys(coverageJson).length };
}

function runOneCase({ testFile, slug, caseIndex, caseName }) {
  return new Promise((resolve) => {
    const c8Directory = mkdtempSync(path.join(tmpdir(), `c8-case-`));
    const pattern = `^${escapeRegExp(caseName)}$`;
    // Same PATH-resolved local dev tooling exception already
    // established in tools/imagegen/*.mjs, not a user-facing surface.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const child = spawn('npx',
      ['c8',
        '--include', 'src/**/*.js', '--include', 'tools/**/*.mjs', '--include', 'tests/designLint.mjs',
        '--exclude', 'coverage/**',
      // GENERATED data, not authored logic (its own header: "do not
      // edit" - compiled from content/rtg/**.yaml by `cards:build`).
      // Left in scope, every deck-touching test's coverage was ~80%
      // dominated by iterating this one 3,584-line card list, which
      // swamped the redundancy audit with false positives - two tests
      // asserting completely different things "looked" 100% redundant
      // because they both happened to construct a deck. Found live,
      // in the audit's own first real run (test_audit.md itself, not
      // guessed at): 80,158 flagged pairs (26% of all 305k), the top
      // of the table entirely fixture noise. Excluding it is a scope
      // correction, not a number-tuning hack - "coverage of hand-
      // written logic" was always the actual question being asked.
      '--exclude', 'src/decks/rtg/catalog.js',
        '--reporter=json', `--report-dir=${c8Directory}`,
        '--', 'node', '--test', `--test-name-pattern=${pattern}`,
        '--test-reporter=tap', '--test-reporter-destination=stdout',
        path.join('tests', testFile)],
      { cwd: ROOT },
    );
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.on('close', (code) => {
      const pass = Number(/^# pass (\d+)$/m.exec(stdout)?.[1] ?? 0);
      const fail = Number(/^# fail (\d+)$/m.exec(stdout)?.[1] ?? 0);
      let stats = { total: 0, covered: 0, srcFiles: 0 };
      let coverage = {};
      try {
        coverage = JSON.parse(readFileSync(path.join(c8Directory, 'coverage-final.json'), 'utf8'));
        stats = statementTotals(coverage);
      } catch {
        // No report written - treated as zero coverage, not a crash of
        // the whole batch; `pass`/`fail` still say whether the case
        // itself ran.
      }
      rmSync(c8Directory, { recursive: true, force: true });
      const outFile = `${slug}__${caseIndex}.json`;
      writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(coverage));
      resolve({
        testFile, slug, caseIndex, caseName, pass, fail, ...stats,
        reportFile: outFile, exitCode: code,
      });
    });
  });
}

/** A tiny worker-pool runner - `CONCURRENCY` in flight at once, next
 * task starts the moment a slot frees. No dependency pulled in for
 * this; the whole thing is ten lines. */
async function runPool(tasks, concurrency, onEach) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const result = await runOneCase(task);
      results.push(result);
      onEach(result, results.length, tasks.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function main() {
  const fileManifest = JSON.parse(readFileSync(FILE_MANIFEST, 'utf8'));
  const blocked = fileManifest.filter((f) => f.duplicateCaseNames?.length > 0);
  if (blocked.length > 0) {
    console.error('Refusing to run: these files have duplicate-named cases that ' +
      '--test-name-pattern cannot isolate from each other:');
    for (const f of blocked) console.error(`  ${f.testFile}: ${f.duplicateCaseNames.join(', ')}`);
    console.error('Rename the duplicates (or accept file-level granularity for them) and re-run.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  // `--only=<slug>[,<slug>...]` - re-collect specific files' cases
  // without redoing all 781 (used to smoke-test this script itself
  // before the first full run, and useful afterward whenever one file
  // changes rather than requiring a full re-collection).
  const onlyArgument = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArgument ? new Set(onlyArgument.slice('--only='.length).split(',')) : null;
  const scoped = only ? fileManifest.filter((f) => only.has(f.slug)) : fileManifest;
  const tasks = scoped.flatMap((f) =>
    f.caseNames.map((caseName, caseIndex) => ({ testFile: f.testFile, slug: f.slug, caseIndex, caseName })));

  console.log(`${tasks.length} test cases across ${fileManifest.length} files, concurrency=${CONCURRENCY}`);
  const startedAt = Date.now();
  const manifest = [];
  await runPool(tasks, CONCURRENCY, (result, done, totalCount) => {
    manifest.push(result);
    // Throttled: one line per case would be 781 lines of output to
    // read back. Every 25th plus the last, plus anything that failed
    // to run at all (exitCode nonzero with 0 pass/fail - a real crash,
    // not a normal test failure) or asserted false (fail > 0 - the
    // suite is expected fully green; a case failing HERE, isolated,
    // that passes in the full-file run would itself be a real finding
    // - inter-test coupling - worth surfacing immediately, not buried
    // in a manifest nobody reads until the report is built).
    const isNotable = result.fail > 0 || (result.exitCode !== 0 && result.pass === 0);
    if (isNotable || done === totalCount || done % 25 === 0) {
      const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(0);
      const flag = isNotable ? '  <-- NOTABLE (failed isolated; check for inter-test coupling)' : '';
      console.log(`[${done}/${totalCount}] ${elapsedS}s elapsed - last: ${result.slug} #${result.caseIndex}${flag}`);
    }
  });
  writeFileSync(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2));
  const notableRows = manifest.filter((m) => m.fail > 0 || (m.exitCode !== 0 && m.pass === 0));
  const totalS = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\nDone in ${totalS}s. ${manifest.length} cases, ${notableRows.length} notable.`);
  if (notableRows.length > 0) {
    console.log('Notable (failed in isolation - re-check against the full-file run):');
    for (const n of notableRows) console.log(`  ${n.testFile} :: ${n.caseName}`);
  }
  console.log(`Per-case reports: ${OUT_DIR}/*.json`);
}

await main();
