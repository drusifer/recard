// Every game the Jev tools know. A game is an adapter for the shared
// runner (US-128/D153) plus a directory of files (US-129/D154):
// `games/<game>/`. One registry for everything that starts one -
// `jevPlayer.mjs` seats a bot, `jevTable.mjs` hosts a table - so a new
// game is one more entry here and nothing else in either tool.
import { fileURLToPath, URL } from 'node:url';

export const GAMES = {
  gin: () => import('../gin/adapter.mjs'),
  rtg: () => import('../rtg/adapter.mjs'),
};

/**
 * `games/<game>`, wherever the tool was started from.
 */
export const gameDirectory = (game) => fileURLToPath(new URL(`../../games/${game}`, import.meta.url));
