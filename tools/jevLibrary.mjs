#!/usr/bin/env node
// US-129 Gate 1 C2: every name a turn file may use, and what it means.
//
//   bobp make jev-library       print it
//   bobp make jev-library-doc   write docs/JEV_LIBRARY.md
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { renderLibraryDocument } from './jev/libraryDocument.mjs';

const DOCUMENT = fileURLToPath(new URL('../docs/JEV_LIBRARY.md', import.meta.url));

if (process.argv.includes('--write')) {
  writeFileSync(DOCUMENT, renderLibraryDocument());
  process.stdout.write(`wrote ${DOCUMENT}\n`);
} else {
  process.stdout.write(renderLibraryDocument());
}
