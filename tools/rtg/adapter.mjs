// US-127/D151, US-128/D153: an RtG player that joins a table you are
// hosting, through the shared runner (`tools/jev/runner.mjs`) - which is
// how it answers "Add Jev bot" and "leave" like every other game.
//
//   bobp make jev-player GAME=rtg STRATEGY=rules CODE=ABC123 [DECK=<pile id>] [STEPS=12]
//
// RtG plays by the rules in its own game file, so `rules` is the only
// strategy there is.
import { UsageError } from '../jev/runner.mjs';
import { loadGame, RTG } from './gameFile.mjs';
import { RtgSeat } from './seat.mjs';

/**
 * @type {import('../jev/runner.mjs').GameAdapter}
 */
export const adapter = {
  game: 'rtg',

  strategies: () => ({
    rules: { name: 'rules', description: 'plays by the rules written in its game file', usesJev: true },
  }),

  checkOptions(options) {
    if (options.steps === undefined) return;
    const steps = Number(options.steps);
    if (!Number.isSafeInteger(steps) || steps < 1) throw new UsageError(`STEPS must be a whole number >= 1, not "${options.steps}"`);
  },

  async sit({ peer, judge, options, name, log }) {
    const seat = new RtgSeat({
      peer, game: loadGame(RTG), judge, name, deck: options.deck,
      steps: options.steps === undefined ? undefined : Number(options.steps), log,
    });
    await seat.join();
    return seat;
  },

  summaryLine(entry) {
    const { blocked } = entry;
    return blocked ? `rtg: ${entry.move} (blocked by ${blocked.rule}: ${blocked.why})` : `rtg: ${entry.move}`;
  },
};
