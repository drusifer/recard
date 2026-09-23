// US-128/D153, US-129/D154: Gin Rummy as a Jev-player game.
//
//   bobp make jev-player GAME=gin STRATEGY=<player file or rule list> CODE=ABC123 [FIRST=bot|opponent] [HANDS=1]
//
// Gin's turn is `games/gin/turn.yaml`; its question-file players are
// `games/gin/players/*.yaml`. The D137 rule lists stay code (D148) and
// play through the same turn: a step is GinBot's, whichever kind decides.
import path from 'node:path';
import { UsageError } from '../jev/runner.mjs';
import { loadGameFiles } from '../jev/gameFiles.mjs';
import { loadTurn } from '../jev/machine.mjs';
import { genericLibrary, mergeLibraries } from '../jev/library.mjs';
import { MachineSeat } from '../jev/seat.mjs';
import { GinBot, summaryLine } from './bot.mjs';
import { ginLibrary } from './library.mjs';
import { GAME_DIR } from './strategyFile.mjs';
import { resolveStrategy, allStrategyNames } from './strategyKinds.mjs';

/**
 * Gin polls faster than a judged game: its turn is read, not asked.
 */
const POLL_MS = 200;

function machineFor(services) {
  const files = loadGameFiles(GAME_DIR);
  const library = mergeLibraries(genericLibrary(services), ginLibrary(services));
  return loadTurn(path.join(GAME_DIR, 'turn.yaml'), { library, questions: Object.keys(files.questions) }).machine;
}

/**
 * One Gin seat at `peer`'s table. Exported so tests can sit one on a
 * fake table.
 * @param {{ peer: object, strategy: object, judge?: object|null, name: string,
 *   firstPlayer?: 'bot'|'opponent', hands?: number, log?: (line: string) => void, pollMs?: number }} options
 */
export function ginSeat({ peer, strategy, judge = null, name, firstPlayer = 'bot', hands = 1, log, pollMs = POLL_MS }) {
  const services = { peer, name, log, bot: new GinBot({ peer, strategy, judge, firstPlayer }) };
  return new MachineSeat({ machine: machineFor(services), services, input: { hands }, pollMs });
}

/**
 * @type {import('../jev/runner.mjs').GameAdapter}
 */
export const adapter = {
  game: 'gin',

  strategies: () => Object.fromEntries(allStrategyNames().map((name) => [name, resolveStrategy(name)])),

  checkOptions(options) {
    if (!['bot', 'opponent'].includes(options.first)) throw new UsageError(`FIRST must be "bot" or "opponent", not "${options.first}"`);
    const hands = Number(options.hands);
    if (!Number.isSafeInteger(hands) || hands < 1) throw new UsageError(`HANDS must be a whole number >= 1, not "${options.hands}"`);
    // A broken turn file is refused before any table is joined (Gate 1 C1).
    machineFor({ name: 'check' });
  },

  sit: ({ peer, strategy, judge, options, name, log }) => ginSeat({
    peer, strategy, judge, name, firstPlayer: options.first, hands: Number(options.hands), log,
  }),

  summaryLine: (record) => (record.announcement ? `${summaryLine(record)} | said "${record.announcement}"` : summaryLine(record)),
};
