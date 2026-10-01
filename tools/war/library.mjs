// US-129/D154 shape: War's names, by analogy with `tools/gin/library.mjs`
// (`gin_look`/`gin_step`) - a bot's whole turn is computed, not judged
// (`games/war/questions.yaml`), so there is no Jev anywhere in this file.

/**
 * @param {{ bot: import('./bot.mjs').WarBot, onRecord?: Function }} services
 */
export function warLibrary(services) {
  return {
    guards: {
      war_phase: {
        doc: 'War: the table says it is phase `is` for me (flip | collect | wait | done)',
        fn: ({ event }, parameters) => event.output?.phase === parameters.is,
      },
    },
    actions: {},
    actors: {
      war_look: {
        doc: 'War: read the table - whose move it is, and whether the war procedure is owed',
        fn: async () => services.bot.look(),
      },
      war_step: {
        doc: 'War: flip this round\'s card (with the war procedure on a tie) or collect a won pile, acted and said',
        fn: async () => {
          const record = await services.bot.step();
          services.onRecord?.(record);
          return { record, kind: record.phase };
        },
      },
    },
  };
}
