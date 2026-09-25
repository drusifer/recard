#!/usr/bin/env node
// US-131: the README of every Jev game, generated from its files.
//
//   bobp make jev-readme   write games/<game>/README.md for every game
import { writeFileSync } from 'node:fs';
import { GAMES } from './jev/games.mjs';
import { renderGameReadme, readmeFile } from './jev/gameReadme.mjs';

for (const game of Object.keys(GAMES)) {
  writeFileSync(readmeFile(game), renderGameReadme(game));
  process.stdout.write(`wrote ${readmeFile(game)}\n`);
}
