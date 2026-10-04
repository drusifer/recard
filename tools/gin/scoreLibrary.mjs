// Gin's scoring code, by name, for `games/gin/scoring.yaml` (sibling of
// `tools/gin/library.mjs`, which is turn.yaml's own). No Jev here -
// scoring is pure rules, not judgment. `gin_measure` is the one piece
// that calls real card logic (`measureHand`, meld-finding/lay-off);
// everything else here is a small, named, one-line rule - undercut?
// gin? which bonus? - the SAME split turn.yaml's own library already
// uses (guards/actions as trivial comparisons, the file as the shape),
// not a monolithic scoring function.
import { measureHand } from './scoring.mjs';

export function ginScoreLibrary(services) {
  return {
    guards: {
      gin_is_gin: {
        doc: 'Gin: this hand ended in gin, not a knock - gin can never be undercut',
        fn: ({ context }) => context.outcome === 'gin',
      },
      gin_is_undercut: {
        doc: 'Gin: the opponent\'s deadwood, after lay-off, is at or below the knocker\'s - a knock only (checked after gin_is_gin)',
        fn: ({ context }) => context.opponentDeadwoodAfterLayoff <= context.knockerDeadwood,
      },
      gin_target_reached: {
        doc: 'Gin: some player\'s running total has reached (or passed) the target',
        fn: ({ context }) => Object.values(context.totals).some((total) => total >= context.target),
      },
    },
    actions: {
      gin_remember_hand: {
        doc: 'Gin: copies HAND_OVER\'s who/how into context, before the melds are even measured',
        assign: ({ event }) => ({ knockerId: event.knockerId, opponentId: event.opponentId, outcome: event.outcome }),
      },
      gin_remember_measurement: {
        doc: 'Gin: copies gin_measure\'s raw deadwood numbers into context',
        assign: ({ event }) => ({ knockerDeadwood: event.output.knockerDeadwood, opponentDeadwoodAfterLayoff: event.output.opponentDeadwoodAfterLayoff }),
      },
      gin_award_gin: {
        doc: 'Gin: the knocker gets the opponent\'s full (lay-off-forbidden) deadwood, plus the gin bonus',
        assign: ({ context }) => ({
          totals: { ...context.totals, [context.knockerId]: (context.totals[context.knockerId] ?? 0) + context.opponentDeadwoodAfterLayoff + context.ginBonus },
        }),
      },
      gin_award_knock: {
        doc: 'Gin: the knocker gets the deadwood DIFFERENCE, no bonus',
        assign: ({ context }) => ({
          totals: { ...context.totals, [context.knockerId]: (context.totals[context.knockerId] ?? 0) + (context.opponentDeadwoodAfterLayoff - context.knockerDeadwood) },
        }),
      },
      gin_award_undercut: {
        doc: 'Gin: the OPPONENT gets the deadwood difference instead, plus the undercut bonus',
        assign: ({ context }) => ({
          totals: { ...context.totals, [context.opponentId]: (context.totals[context.opponentId] ?? 0) + (context.knockerDeadwood - context.opponentDeadwoodAfterLayoff) + context.undercutBonus },
        }),
      },
      note_game_over: {
        doc: 'Gin: logs the final totals and who won',
        fn: ({ context }) => {
          const [winnerId, points] = Object.entries(context.totals).toSorted((a, b) => b[1] - a[1])[0];
          services.log?.(`game over: ${winnerId} wins with ${points} (target ${context.target}) - totals ${JSON.stringify(context.totals)}`);
        },
      },
    },
    actors: {
      gin_measure: {
        doc: 'Gin: melds both final hands and lays the opponent\'s deadwood off (forbidden on gin) - the one piece of real card logic (cards.mjs)',
        fn: async ({ input }) => {
          const { event } = input;
          const result = measureHand({ knockerHand: event.knockerHand, opponentHand: event.opponentHand, outcome: event.outcome });
          services.log?.(`hand measured: knocker ${result.knockerDeadwood} deadwood, opponent ${result.opponentDeadwoodAfterLayoff} after ${result.laidOff} laid off`);
          return result;
        },
      },
    },
  };
}
