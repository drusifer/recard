/**
 * `docs/DECISIONS.md` is newest-first for its modern section (its
 * own header: "the highest number is always the current binding
 * state") - but only from D82 down to the top; below that it's a
 * legacy block written forward-chronologically (D1...D81, pre-dating
 * the "continuous numbering, newest-first" convention) and is
 * deliberately NOT reordered here - doing so would rewrite a large,
 * stable, heavily-cross-referenced part of the project's history for
 * no benefit. This checker auto-detects where descending order stops
 * holding and treats everything below that point as the legacy
 * section (ordering unchecked there, only duplicates still matter).
 *
 * Two heading shapes both count as "not a new decision, don't flag as
 * a duplicate": a range like "D126-D128" (one entry covering several
 * numbers), and a same-number continuation like "D45 (continued)" or
 * "D53 follow-up" immediately after its own D45/D53 entry - a real
 * project convention, not a mistake. Only a same-number heading that
 * ISN'T immediately adjacent to its own first occurrence is a real bug
 * (this is exactly what caught D116 being assigned twice, 2026-09-10 -
 * one from a day before the other, nowhere near adjacent).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'DECISIONS.md');

const HEADING = /^### D(\d+)(?:-D(\d+))?\b/;

function findHeadings(text) {
  const lines = text.split('\n');
  const headings = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = HEADING.exec(line);
    if (!match) continue;
    const low = Number(match[1]);
    const high = match[2] ? Number(match[2]) : low;
    headings.push({ line: lineIndex + 1, text: line.trim(), low, high });
  }
  return headings;
}

// Same number reappearing is fine directly after its own first heading
// (a "(continued)"/"follow-up" section) - only a same number reappearing
// LATER, non-adjacently, is the real duplicate-assignment bug.
function findDuplicates(headings) {
  const problems = [];
  const lastSeenAt = new Map();
  for (const [headingIndex, heading] of headings.entries()) {
    for (let n = heading.low; n <= heading.high; n++) {
      const prior = lastSeenAt.get(n);
      if (prior !== undefined && prior !== headingIndex - 1) {
        problems.push(`Duplicate D${n}: line ${headings[prior].line} and line ${heading.line}`);
      }
      lastSeenAt.set(n, headingIndex);
    }
  }
  return problems;
}

// Descending (strictly, allowing an equal-number continuation) while it
// holds; the first STRICT increase is where the legacy forward-
// chronological block begins - stop checking order from there on.
function findLegacySectionStart(headings) {
  for (const [headingIndex, heading] of headings.entries()) {
    if (headingIndex === 0) continue;
    if (heading.high > headings[headingIndex - 1].low) return heading;
  }
  return null;
}

export async function checkDecisionOrder(text) {
  const headings = findHeadings(text);
  const problems = findDuplicates(headings);

  const legacyStart = findLegacySectionStart(headings);
  const notes = legacyStart
    ? [`Legacy (forward-chronological) section begins at line ${legacyStart.line}: `
      + `"${legacyStart.text}" - not checked for order below this point.`]
    : [];

  return { headingCount: headings.length, problems, notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = await readFile(DOC, 'utf8');
  const { headingCount, problems, notes } = await checkDecisionOrder(text);
  console.log(`Checked ${headingCount} decision headings in ${path.relative(ROOT, DOC)}.`);
  for (const note of notes) console.log(`  (info) ${note}`);
  if (problems.length === 0) {
    console.log('No duplicate decision numbers, and the modern section is newest-first. Clean.');
  } else {
    console.log(`${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
  }
}
