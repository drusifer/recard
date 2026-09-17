import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkStoryNumbers } from '../tools/checkStoryNumbers.mjs';

test('the real docs/USER_STORIES.md has no duplicate story numbers', async () => {
  const text = await readFile(path.join(import.meta.dirname, '..', 'docs', 'USER_STORIES.md'), 'utf8');
  const { problems } = await checkStoryNumbers(text);
  assert.deepEqual(problems, []);
});

test('flags a duplicate US-number', async () => {
  const text = [
    '### US-10: First',
    '### US-11: Second',
    '### US-10: Reused - the actual US-110/US-117 mistake this checker exists to catch',
  ].join('\n');
  const { problems } = await checkStoryNumbers(text);
  assert.ok(problems.some((p) => p.startsWith('Duplicate US-10')));
});

test('does not flag distinct, non-sequential story numbers', async () => {
  const text = [
    '### US-1: First',
    '### US-74: Skips ahead, no gap-filling required',
    '### US-106: Skips further',
  ].join('\n');
  const { problems } = await checkStoryNumbers(text);
  assert.deepEqual(problems, []);
});

test('ignores headings that are not US-N story headings', async () => {
  const text = [
    '### US-1: First',
    '## Some other section',
    '### Not a story heading',
  ].join('\n');
  const { headingCount, problems } = await checkStoryNumbers(text);
  assert.equal(headingCount, 1);
  assert.deepEqual(problems, []);
});
