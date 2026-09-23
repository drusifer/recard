// US-128/D153: Gin Rummy as a Jev-player game. Everything that is not
// Gin - joining, spectator refusal, add-bot, quit - is the shared runner
// (`tools/jev/runner.mjs`); this is only what Gin itself decides.
//
//   bobp make jev-player GAME=gin STRATEGY=<name> CODE=ABC123 [FIRST=bot|opponent] [HANDS=1]
//
// Both kinds of strategy play (Smith C1): the D137 rule lists and the
// question files, through one lookup (`strategyKinds.mjs`, D148).
import { UsageError } from '../jev/runner.mjs';
import { GinBot, summaryLine } from './bot.mjs';
import { resolveStrategy, allStrategyNames } from './strategyKinds.mjs';

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
  },

  // GinBot IS Gin's seat (D153): the MCP `gin_turn` tool drives the same
  // class one `step()` at a time.
  sit: ({ peer, strategy, judge, options, log }) => new GinBot({
    peer, strategy, judge, firstPlayer: options.first, hands: Number(options.hands), log,
  }),

  summaryLine: (record) => (record.announcement ? `${summaryLine(record)} | said "${record.announcement}"` : summaryLine(record)),
};
