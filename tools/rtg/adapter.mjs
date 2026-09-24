// US-127/D151, US-128/D153, US-129/D154: RtG as a Jev-player game.
//
//   bobp make jev-player GAME=rtg STRATEGY=<player file> CODE=ABC123 [DECK=<pile id>] [STEPS=12]
//
// Everything RtG-specific that is not a fact is a FILE in `games/rtg/`:
// the turn (turn.yaml), what Jev is asked (questions.yaml), the rules
// those questions cite (rules.yaml) and each player (players/*.yaml). A
// new player is a new file there. This adapter only wires them to the
// shared runner and the one generic seat.
import { fileURLToPath, URL } from 'node:url';
import { UsageError } from '../jev/runner.mjs';
import { loadGameFiles, questionsFor } from '../jev/gameFiles.mjs';
import { loadTurn } from '../jev/machine.mjs';
import { genericLibrary, mergeLibraries } from '../jev/library.mjs';
import { MachineSeat } from '../jev/seat.mjs';
import { rtgHooks, rtgLibrary } from './library.mjs';

export const GAME_DIR = fileURLToPath(new URL('../../games/rtg', import.meta.url));

/**
 * The turn file, loaded against a library built for `services` - the
 * same check at start-up (no table yet) as when a bot sits down.
 */
function machineFor(files, services) {
  const library = mergeLibraries(genericLibrary(services), rtgLibrary({ name: services.name }));
  return loadTurn(files.turnFile, { library, questions: Object.keys(files.questions) }).machine;
}

/**
 * One RtG seat: `player` from the game's files, at `peer`'s table.
 * Exported so tests can sit a seat with a scripted judge and a fake table.
 * @param {{ peer: object, judge: object, name: string, player: string,
 *   deck?: string, steps?: number, clock?: () => number, pollMs?: number,
 *   answerMs?: number, answerPollMs?: number }} options
 */
export async function rtgSeat({ peer, judge, name, player, deck, steps, clock, pollMs, answerMs, answerPollMs }) {
  const files = loadGameFiles(GAME_DIR);
  const chosen = files.players[player];
  const myId = await peer.myId();
  const services = {
    peer, judge, name, player: chosen, questions: questionsFor(files, chosen),
    game: rtgHooks({ rules: files.rules, myId, name, deck }), answerMs, answerPollMs,
  };
  const input = steps === undefined ? {} : { steps };
  return new MachineSeat({ machine: machineFor(files, services), services, input, clock, pollMs });
}

/**
 * @type {import('../jev/runner.mjs').GameAdapter}
 */
export const adapter = {
  game: 'rtg',

  strategies: () => Object.fromEntries(Object.values(loadGameFiles(GAME_DIR).players)
    .map(({ name, description }) => [name, { name, description, usesJev: true }])),

  checkOptions(options) {
    if (options.steps !== undefined) {
      const steps = Number(options.steps);
      if (!Number.isSafeInteger(steps) || steps < 1) throw new UsageError(`STEPS must be a whole number >= 1, not "${options.steps}"`);
    }
    // A broken turn file is refused before any table is joined (Gate 1 C1).
    machineFor(loadGameFiles(GAME_DIR), { name: 'check' });
  },

  sit: ({ peer, strategy, judge, options, name }) => rtgSeat({
    peer, judge, name, player: strategy.name, deck: options.deck,
    steps: options.steps === undefined ? undefined : Number(options.steps),
  }),

  summaryLine(entry) {
    const { blocked } = entry;
    const move = `rtg: ${entry.phase} ${entry.move}`;
    return blocked ? `${move} (blocked by ${blocked.rule}: ${blocked.why})` : move;
  },
};
