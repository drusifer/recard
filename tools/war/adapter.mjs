// US-128/D153, US-129/D154: War as a Jev-player game.
//
//   bobp make jev-player GAME=war STRATEGY=mechanical CODE=ABC123
//
// War has exactly one player file (`games/war/players/mechanical.yaml`):
// there is no real choice in War to give it a second style of (see
// `games/war/questions.yaml`). This adapter only wires that one player
// and `games/war/turn.yaml` to the shared runner and the one generic seat.
import path from 'node:path';
import { UsageError } from '../jev/runner.mjs';
import { loadGameFiles } from '../jev/gameFiles.mjs';
import { loadTurn } from '../jev/machine.mjs';
import { genericLibrary, mergeLibraries } from '../jev/library.mjs';
import { MachineSeat } from '../jev/seat.mjs';
import { gameDirectory } from '../jev/games.mjs';
import { WarBot } from './bot.mjs';
import { warLibrary } from './library.mjs';

export const GAME_DIR = gameDirectory('war');

/**
 * War polls as fast as Gin: its move is read off the table, never asked.
 */
const POLL_MS = 200;

function machineFor(services) {
  const files = loadGameFiles(GAME_DIR);
  const library = mergeLibraries(genericLibrary(services), warLibrary(services));
  return loadTurn(path.join(GAME_DIR, 'turn.yaml'), { library, questions: Object.keys(files.questions) }).machine;
}

/**
 * One War seat at `peer`'s table. Exported so tests can sit one on a
 * fake table.
 * @param {{ peer: object, name: string, pollMs?: number }} options
 */
export function warSeat({ peer, name, pollMs = POLL_MS }) {
  const services = { peer, name, bot: new WarBot({ peer }) };
  return new MachineSeat({ machine: machineFor(services), services, pollMs });
}

/**
 * @type {import('../jev/runner.mjs').GameAdapter}
 */
export const adapter = {
  game: 'war',

  strategies: () => Object.fromEntries(Object.values(loadGameFiles(GAME_DIR).players)
    .map(({ name, description }) => [name, { name, description, usesJev: false }])),

  checkOptions(options) {
    if (options.first !== undefined && !['bot', 'opponent'].includes(options.first)) {
      throw new UsageError(`FIRST must be "bot" or "opponent", not "${options.first}" - War has no first mover, both flip independently`);
    }
    // A broken turn file is refused before any table is joined (Gate 1 C1).
    machineFor({ name: 'check', bot: new WarBot({ peer: null }) });
  },

  sit: ({ peer, name }) => warSeat({ peer, name }),

  summaryLine(record) {
    const { phase, cards, winner, isWarContinuation } = record;
    const count = `${cards.length} card(s)`;
    if (phase === 'collect') {
      const by = winner ? ` (${winner})` : '';
      return `war: collected ${count}${by}`;
    }
    const war = isWarContinuation ? ' (war!)' : '';
    return `war: ${phase}${war} - ${count}`;
  },
};
