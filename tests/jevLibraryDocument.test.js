// US-129 Gate 1 C2: an author can see every name a turn file may use,
// with what it means - listed from the CLI and in docs/JEV_LIBRARY.md,
// both generated from the library itself so they cannot drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { renderLibraryDocument, allLibraries } from '../tools/jev/libraryDocument.mjs';

test('every name in every library says what it means', () => {
  for (const { title, library } of allLibraries()) {
    for (const [kind, entries] of Object.entries(library)) {
      for (const [name, entry] of Object.entries(entries)) {
        assert.ok(typeof entry.doc === 'string' && entry.doc.length > 10, `${title} ${kind} "${name}" has no doc`);
      }
    }
  }
});

test('docs/JEV_LIBRARY.md is exactly what the library generates - regenerate with `bobp make jev-library-doc`', () => {
  const written = readFileSync(new URL('../docs/JEV_LIBRARY.md', import.meta.url), 'utf8');
  assert.equal(written, renderLibraryDocument(), 'docs/JEV_LIBRARY.md is stale: run `bobp make jev-library-doc`');
});

test('the listing names the game-specific entries under their game', () => {
  const markdown = renderLibraryDocument();
  assert.match(markdown, /## Generic[\s\S]*`judge`/);
  assert.match(markdown, /## rtg[\s\S]*`heard_attack`/);
  assert.match(markdown, /## gin[\s\S]*`gin_step`/);
});
