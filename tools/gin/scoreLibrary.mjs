// Gin's scoring code, by name, for `games/gin/scoring.yaml` (sibling of
// `tools/gin/library.mjs`, which is turn.yaml's own). No Jev here either
// - scoring is pure arithmetic over two already-finished hands
// (`tools/gin/scoring.mjs`), same "the file names it, code computes it"
// split the turn library already uses.
import { scoreHand } from './scoring.mjs';

/**
 * @param {{ log?: (line: string) => void }} services
 */
export function ginScoreLibrary(services) {
  return {
    guards: {
      gin_target_reached: {
        doc: 'Gin: some player\'s running total has reached (or passed) the target',
        fn: ({ context }) => Object.values(context.totals).some((total) => total >= context.target),
      },
    },
    actions: {
      gin_award: {
        doc: 'Gin: adds the scored hand\'s points to its winner\'s running total',
        assign: ({ context, event }) => ({
          totals: { ...context.totals, [event.output.winnerId]: (context.totals[event.output.winnerId] ?? 0) + event.output.points },
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
      gin_score: {
        doc: 'Gin: scores one finished hand (HAND_OVER\'s knockerHand/opponentHand/outcome/knockerId/opponentId) by standard rules',
        fn: async ({ input }) => {
          const { event } = input;
          const result = scoreHand({ knockerHand: event.knockerHand, opponentHand: event.opponentHand, outcome: event.outcome });
          const winnerId = result.winner === 'knocker' ? event.knockerId : event.opponentId;
          services.log?.(`hand scored: ${winnerId} +${result.points} (${event.outcome}${result.undercut ? ', undercut' : ''})`);
          return { winnerId, points: result.points, ...result };
        },
      },
    },
  };
}
