// Every game the Jev tools know. A game is an adapter for the shared
// runner (US-128/D153) plus a directory of files (US-129/D154):
// `games/<game>/`. One registry for everything that starts one -
// `jevPlayer.mjs` seats a bot, `jevTable.mjs` hosts a table, `jevGame
// Master.mjs` detects one from a live table - so a new game is one more
// entry in EACH of the two maps below (both here, nothing in any tool
// itself) rather than three files knowing a game exists.
import { fileURLToPath, URL } from 'node:url';

export const GAMES = {
  gin: () => import('../gin/adapter.mjs'),
  rtg: () => import('../rtg/adapter.mjs'),
  war: () => import('../war/adapter.mjs'),
};

/**
 * The table's own preset NAME (`src/presets.js`'s `name`) for each game -
 * a peer only ever sees that human-facing string over the wire
 * (`view.gameConfig.presetName`), never a `GAMES` key. Used by
 * `jevGameMaster.mjs` to detect which game is on a live table without
 * being told.
 */
export const PRESET_NAMES = { war: 'War', gin: 'Gin Rummy', rtg: 'Recard the Gathering' };

/**
 * `games/<game>`, wherever the tool was started from.
 */
export const gameDirectory = (game) => fileURLToPath(new URL(`../../games/${game}`, import.meta.url));
