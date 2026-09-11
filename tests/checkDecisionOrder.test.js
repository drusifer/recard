import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkDecisionOrder } from '../tools/checkDecisionOrder.mjs';

test('the real docs/ARCHITECTURE.md has no duplicate decision numbers', async () => {
  const text = await readFile(path.join(import.meta.dirname, '..', 'docs', 'ARCHITECTURE.md'), 'utf8');
  const { problems } = await checkDecisionOrder(text);
  const duplicates = problems.filter((p) => p.startsWith('Duplicate'));
  assert.deepEqual(duplicates, []);
});

test('notes (but does not fail on) a genuine out-of-order pair, as the legacy-section boundary', async () => {
  const text = [
    '## Core invariant',
    '### D10. Newest',
    '### D9. Older',
    '### D11. Out of order - newer than D10 but placed below it',
  ].join('\n');
  const { problems, notes } = await checkDecisionOrder(text);
  assert.deepEqual(problems, []);
  assert.ok(notes.some((n) => n.includes('Legacy (forward-chronological) section begins')));
});

test('does not flag a "(continued)" heading reusing its own number', async () => {
  const text = [
    '### D10. First',
    '### D10 (continued). More on the same decision',
    '### D9. Older',
  ].join('\n');
  const { problems } = await checkDecisionOrder(text);
  assert.deepEqual(problems, []);
});

test('flags a real duplicate that is not an adjacent continuation', async () => {
  const text = [
    '### D10. First use of D10',
    '### D9. Older',
    '### D10. Reused later - the actual D116 mistake this checker exists to catch',
  ].join('\n');
  const { problems } = await checkDecisionOrder(text);
  assert.ok(problems.some((p) => p.startsWith('Duplicate D10')));
});

test('treats a range heading as occupying every number in it', async () => {
  const text = [
    '### D12. Newest',
    '### D9-D11. A gap note covering three numbers',
    '### D8. Older still',
  ].join('\n');
  const { problems } = await checkDecisionOrder(text);
  assert.deepEqual(problems, []);
});
