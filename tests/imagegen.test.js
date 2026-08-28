import test from 'node:test';
import assert from 'node:assert/strict';

import { parseManifest } from '../tools/imagegen/manifest.mjs';
import { BACKENDS, backendFor, buildPrompt } from '../tools/imagegen/backends.mjs';

// --- manifest ----------------------------------------------------------

test('parseManifest: reads tab-separated id/prompt pairs', () => {
  const items = parseManifest('a\tone prompt\nb\ttwo prompt\n', 'jobs.tsv');
  assert.deepEqual(items, [
    { id: 'a', prompt: 'one prompt' },
    { id: 'b', prompt: 'two prompt' },
  ]);
});

test('parseManifest: a prompt may contain tabs beyond the first separator', () => {
  // Only the FIRST tab delimits; splitting on every tab would silently
  // truncate any prompt that happens to contain one.
  assert.equal(parseManifest('a\tone\ttwo\n', 'j.tsv')[0].prompt, 'one\ttwo');
});

test('parseManifest: skips blank lines and # comments', () => {
  assert.equal(parseManifest('# note\n\na\tp\n\n', 'j.tsv').length, 1);
});

test('parseManifest: reads a JSON manifest too', () => {
  const items = parseManifest('[{"id":"a","prompt":"p"}]', 'jobs.json');
  assert.deepEqual(items, [{ id: 'a', prompt: 'p' }]);
});

test('parseManifest: rejects an entry missing id or prompt, naming the line', () => {
  assert.throws(() => parseManifest('a\n', 'j.tsv'), /line 1/);
  assert.throws(() => parseManifest('[{"id":"a"}]', 'j.json'), /prompt/);
});

test('parseManifest: rejects duplicate ids — they would overwrite each other', () => {
  assert.throws(() => parseManifest('a\tp\na\tq\n', 'j.tsv'), /duplicate.*"a"/i);
});

test('parseManifest: rejects an id that is unsafe as a filename', () => {
  // An id becomes `<outDir>/<id>.png`; `../` would escape the output dir.
  assert.throws(() => parseManifest('../evil\tp\n', 'j.tsv'), /unsafe/i);
  assert.throws(() => parseManifest('a/b\tp\n', 'j.tsv'), /unsafe/i);
});

// --- backends ----------------------------------------------------------

test('BACKENDS: every backend exposes the same contract', () => {
  for (const [name, backend] of Object.entries(BACKENDS)) {
    assert.equal(typeof backend.command, 'function', `${name}.command`);
    assert.equal(typeof backend.isQuotaError, 'function', `${name}.isQuotaError`);
    assert.equal(typeof backend.writesToOutPath, 'boolean', `${name}.writesToOutPath`);
  }
});

test('backendFor: unknown backend fails loudly rather than defaulting', () => {
  // Silently falling back would burn a whole run on the wrong generator.
  assert.throws(() => backendFor('dall-e'), /unknown backend/i);
  assert.equal(backendFor('codex'), BACKENDS.codex);
});

test('codex backend: puts the absolute output path in the prompt', () => {
  const { command, args } = BACKENDS.codex.command('c1', 'a knight', '/out/c1.png', '');
  assert.equal(command, 'codex');
  assert.ok(args.join(' ').includes('/out/c1.png'));
});

test('codex backend: writes directly to the requested path', () => {
  // This is the property that makes parallel runs safe, unlike a backend
  // that writes into one shared scratch directory.
  assert.equal(BACKENDS.codex.writesToOutPath, true);
});

test('quota detection: recognises the real messages, not just the word', () => {
  assert.ok(BACKENDS.codex.isQuotaError('Error: usage limit reached. Resets in 4h6m'));
  assert.ok(BACKENDS.codex.isQuotaError('429 Too Many Requests'));
  assert.ok(BACKENDS.agy.isQuotaError('Individual quota reached. Please upgrade'));
  assert.ok(!BACKENDS.codex.isQuotaError('painted the image successfully'));
});

// --- prompt assembly ---------------------------------------------------

test('buildPrompt: combines subject with the shared style', () => {
  const p = buildPrompt('a lone knight', 'oil painting, no text');
  assert.ok(p.includes('a lone knight'));
  assert.ok(p.includes('oil painting, no text'));
});

test('buildPrompt: works with no style at all', () => {
  assert.ok(buildPrompt('a lone knight', '').includes('a lone knight'));
});

test('buildPrompt: always demands real raster art, never code-drawn', () => {
  // An agent asked for "an image" will sometimes write a Python script
  // that draws one - which looks nothing like generated art. Observed in
  // a real run, hence an explicit instruction every backend inherits.
  assert.match(buildPrompt('x', ''), /do not write code|not code-drawn/i);
});
