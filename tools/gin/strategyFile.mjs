// US-125/D147, as files by US-129/D154: a Gin question-file strategy is a
// PLAYER in `games/gin/players/`, asking the questions in
// `games/gin/questions.yaml` in its own wording. This assembles the shape
// Gin's decision code reads (a read step, a move step, a confidence
// floor); every check - no literals, a description, real question names -
// is the game-files loader's (`tools/jev/gameFiles.mjs`).

import { fileURLToPath, URL } from 'node:url';
import { loadGameFiles, questionsFor } from '../jev/gameFiles.mjs';

export const GAME_DIR = fileURLToPath(new URL('../../games/gin', import.meta.url));

/**
 * The Gin players that ship, by file name.
 */
export function listStrategies() {
  return Object.keys(loadGameFiles(GAME_DIR).players);
}

/**
 * One Gin player as a strategy (D150): a read step, a move step, and the
 * confidence the file is willing to act on.
 * @param {string} name
 */
export function loadStrategy(name) {
  const files = loadGameFiles(GAME_DIR);
  const player = files.players[name];
  if (!player) throw new Error(`unknown gin strategy "${name}" - choose one of: ${Object.keys(files.players).join(', ')}`);
  const asked = questionsFor(files, player);
  return {
    name,
    description: player.description,
    confidence_floor: player.floor,
    read: { opponent_is_close: asked.opponent_is_close, opponent_wants: asked.opponent_wants },
    move: asked.move,
  };
}
