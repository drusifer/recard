// US-129/D154: Gin's code, by name, for `games/gin/turn.yaml`. Gin's turn
// is COMPUTED, not judged: `GinTracker` reads it off the table snapshot,
// so there is no Jev in the turn itself - only in a step, where GinBot
// decides (rule list or question file, D148) and acts.

/**
 * @param {{ bot: import('./bot.mjs').GinBot, log?: (line: string) => void, onRecord?: Function }} services
 */
export function ginLibrary(services) {
  return {
    guards: {
      gin_phase: {
        doc: 'Gin: the table says it is phase `is` for me (draw | discard | wait | hand-over)',
        fn: ({ event }, parameters) => event.output?.phase === parameters.is,
      },
    },
    actions: {
      note_hand_over: {
        doc: 'Gin: log that a hand ended, and how many of the run\'s hands are done',
        fn: ({ context, event }) => {
          services.log?.(`hand ${event.output?.handNumber} over (${event.output?.outcome}) - ${context.hands_done}/${context.hands}`);
        },
      },
    },
    actors: {
      gin_look: {
        doc: 'Gin: read the table - whose move it is, and which hand',
        fn: async () => services.bot.look(),
      },
      gin_step: {
        doc: 'Gin: one decision (draw or discard) by the seated strategy, acted and said',
        fn: async () => {
          const record = await services.bot.step();
          services.onRecord?.(record);
          return { record, kind: record.decision?.type ?? 'wait' };
        },
      },
    },
  };
}
