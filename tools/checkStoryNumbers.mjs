/**
 * `docs/USER_STORIES.md` has no newest-first convention like
 * ARCHITECTURE.md's decisions do - stories are written forward-
 * chronologically and gaps in the sequence are expected (US-74 to
 * US-106, for instance). So unlike checkDecisionOrder.mjs, this only
 * checks for duplicate US-numbers - the actual bug it exists to catch
 * (US-117 was first drafted as US-110, already taken by an earlier
 * story, and only caught by eye during a 2026-09-11 groom).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'USER_STORIES.md');

const HEADING = /^### US-(\d+):/;

function findHeadings(text) {
  const lines = text.split('\n');
  const headings = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = HEADING.exec(line);
    if (!match) continue;
    headings.push({ line: lineIndex + 1, text: line.trim(), number: Number(match[1]) });
  }
  return headings;
}

function findDuplicates(headings) {
  const problems = [];
  const firstSeenAt = new Map();
  for (const heading of headings) {
    const prior = firstSeenAt.get(heading.number);
    if (prior !== undefined) {
      problems.push(`Duplicate US-${heading.number}: line ${prior.line} and line ${heading.line}`);
      continue;
    }
    firstSeenAt.set(heading.number, heading);
  }
  return problems;
}

export async function checkStoryNumbers(text) {
  const headings = findHeadings(text);
  const problems = findDuplicates(headings);
  return { headingCount: headings.length, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = await readFile(DOC, 'utf8');
  const { headingCount, problems } = await checkStoryNumbers(text);
  console.log(`Checked ${headingCount} story headings in ${path.relative(ROOT, DOC)}.`);
  if (problems.length === 0) {
    console.log('No duplicate story numbers. Clean.');
  } else {
    console.log(`${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
  }
}
