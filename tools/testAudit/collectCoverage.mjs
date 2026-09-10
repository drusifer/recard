#!/usr/bin/env node
/**
 * Runs each unit test FILE in `tests/*.test.js` in its own process, under
 * `c8`, coverage restricted to `src/**` (never `node_modules`, `tests`
 * itself, or `tools`) - "our code, not deps". Each file's Istanbul-format
 * coverage report is written to its own JSON file under
 * `coverage/per-test/<slug>.json`, plus a `_manifest.json` summarizing
 * pass/fail counts and basic per-file stats (used by `analyze.py`, but
 * also readable on its own for a quick pass/fail/duration scan).
 *
 * GRANULARITY, STATED PLAINLY: this isolates at the test FILE level, not
 * the individual `test()` case. Node's coverage is process-wide - getting
 * per-case attribution would mean one process per `test()` call (hundreds
 * of processes for this suite), which is not what "run each test in
 * isolation" buys here for the cost. File-level isolation is still real
 * signal for the actual ask (duplicate/wasteful TEST FILES, coverage
 * gaps) since this repo already organizes one file per concern - see
 * `test_audit.md`'s own Methodology section for the same caveat.
 *
 * Invoked by `make coverage-unit` (bobp make coverage-unit), not run
 * directly in normal workflow.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTS_DIR = path.join(ROOT, 'tests');
const OUT_DIR = path.join(ROOT, 'coverage', 'per-test');

/** Every unit test file this audit covers - `tests/*.test.js`, the exact
 * glob `npm test` itself uses. Deliberately excludes `*.browser.mjs`
 * (Playwright/integration, needs a live server+browser, not "unit") and
 * the two `designLint*.mjs` files (not `node --test` files at all). */
function unitTestFiles() {
  return readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.test.js'))
    .toSorted((a, b) => a.localeCompare(b));
}

/** `# pass N` / `# fail N` from node's own TAP summary - parsed rather
 * than re-run through a second reporter, so the manifest's pass/fail
 * count is guaranteed to match the exact run that produced the coverage
 * beside it. Forced via `--test-reporter=tap` in the spawn below (the
 * DEFAULT reporter is "spec", whose summary reads `ℹ pass N`, not
 * TAP's stable `# pass N` - found live: the first run of this script
 * parsed every file as "0 pass / 0 fail" against real green suites). */
function parseTapSummary(tapOutput) {
  const pass = Number(/^# pass (\d+)$/m.exec(tapOutput)?.[1] ?? 0);
  const fail = Number(/^# fail (\d+)$/m.exec(tapOutput)?.[1] ?? 0);
  const duration = Number(/^# duration_ms (\S+)$/m.exec(tapOutput)?.[1] ?? 0);
  return { pass, fail, duration };
}

/** Every top-level test's exact runtime name, in order - `# Subtest:
 * <name>` lines in node's own TAP output. Parsed from the real run
 * rather than grepped from source (`grep "^test\("`) because a test's
 * declared name can be a template literal or a computed string; TAP
 * always reports the actual name that ran, which is the one thing
 * `--test-name-pattern` (the per-CASE coverage pass, `collect
 * CoverageByCase.mjs`) can actually match against. Two tests sharing
 * one literal name are flagged, not silently merged: `--test-name-
 * pattern` cannot tell them apart, so both would run together on
 * every attempt to isolate either - that pass records them as one
 * GROUPED case rather than pretending they were split. */
function parseCaseNames(tapOutput) {
  const names = tapOutput.matchAll(/^# Subtest: (.+)$/gm).map((m) => m[1]).toArray();
  const seen = new Map();
  for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
  const duplicates = seen.entries().filter(([, count]) => count > 1).map(([name]) => name).toArray();
  return { names, duplicates };
}

/** Coverable-statement counts for one file's Istanbul report - a
 * statement is "covered" when its hit count (`s[id]`) is > 0. Summed
 * across every src file the test touched, for the manifest's quick
 * per-test-file coverage-size column. */
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

function runOne(testFile) {
  const slug = testFile.replace(/\.test\.js$/, '');
  const c8Directory = mkdtempSync(path.join(tmpdir(), `c8-${slug}-`));
  // PATH-resolved local dev tooling exception already established in
  // tools/imagegen/*.mjs, not a user-facing surface.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const result = spawnSync('npx',
    ['c8',
      // "Our code, not deps": src/ is the app, tools/ is real
      // project-authored build/lint tooling (not node_modules), and
      // designLint.mjs is the one logic module that happens to live
      // in tests/ rather than tools/ (its sibling .check.mjs is a thin
      // CLI entrypoint around it, not tested directly - left out on
      // purpose, same reasoning `main.js` itself is thin wiring around
      // `ui.js`/`state.js`).
      '--include', 'src/**/*.js', '--include', 'tools/**/*.mjs', '--include', 'tests/designLint.mjs',
      // c8's DEFAULT exclude list includes `test{,s}/**` - a blanket
      // rule that wins over the explicit --include above and silently
      // zeroed out designLint.mjs's coverage (it lives in tests/, even
      // though it isn't itself a test file). Excludes are already
      // precise via --include; the only exclude actually needed is the
      // report's own output directory.
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
      '--', 'node', '--test', '--test-reporter=tap', '--test-reporter-destination=stdout',
      path.join('tests', testFile)],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const tap = parseTapSummary(result.stdout ?? '');
  const { names: caseNames, duplicates: duplicateCaseNames } = parseCaseNames(result.stdout ?? '');
  let coverage = {};
  let stats = { total: 0, covered: 0, srcFiles: 0 };
  try {
    coverage = JSON.parse(readFileSync(path.join(c8Directory, 'coverage-final.json'), 'utf8'));
    stats = statementTotals(coverage);
  } catch {
    // A test file that crashed the process (never reached c8's report
    // write) still gets a manifest row - `pass`/`fail` from the TAP
    // summary above says why, and `analyze.py` treats a missing report
    // as "no coverage data", not a silent zero.
  }
  rmSync(c8Directory, { recursive: true, force: true });
  writeFileSync(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(coverage));
  return {
    testFile, slug, ...tap, ...stats, caseNames, duplicateCaseNames,
    crashed: result.status !== 0 && tap.fail === 0,
  };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = unitTestFiles();
  const manifest = [];
  for (const [index, file] of files.entries()) {
    process.stdout.write(`[${index + 1}/${files.length}] ${file} ... `);
    const row = runOne(file);
    manifest.push(row);
    const outcome = row.crashed ? 'CRASHED' : `${row.pass} pass / ${row.fail} fail`;
    process.stdout.write(
      `${outcome}, ${row.covered}/${row.total} statements across ${row.srcFiles} src files\n`,
    );
  }
  writeFileSync(path.join(OUT_DIR, '_manifest.json'), JSON.stringify(manifest, null, 2));
  const crashedFiles = manifest.filter((m) => m.crashed).map((m) => m.testFile);
  console.log(`\n${manifest.length} test files processed, ${crashedFiles.length} crashed.`);
  if (crashedFiles.length > 0) console.log('Crashed:', crashedFiles.join(', '));
  console.log(`Per-file reports: ${OUT_DIR}/*.json`);
}

main();
