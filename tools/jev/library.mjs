// US-129/D154: the names a turn file may use - the whole vocabulary
// between the files and the code. Every entry says in one line what it
// means (`doc`), and that line is what `make jev-library` lists and
// `docs/JEV_LIBRARY.md` is generated from (Smith, Gate 1 C2).
//
// Game-agnostic. A game plugs in through `services.game` hooks - how to
// read its table into state, what is legal in a phase, what the rules
// check, what a move does - and may add names of its own.

import { decide } from './decide.mjs';
import { verdictOf, askTable, floorFallback } from './escalate.mjs';
import { askPeer } from './table.mjs';

const verdictFromAnswer = (answer) => {
  if (answer === true) return 'yes';
  if (answer === false) return 'no';
  return 'unsure';
};

/**
 * A Choice's criteria for this turn's options, in the questions file's
 * own words: an option's KIND (`cast` in `cast:Bear`) picks the wording,
 * and a card, when there is one, is named by path-free value because it
 * is computed at play time, never written in the file.
 */
export function criteriaFor(question, options) {
  return Object.fromEntries(options.map((option) => {
    const [kind] = option.id.split(':', 1);
    const described = question.criteria?.[kind] ?? option.what;
    return [option.id, option.card ? `${described} (\`${option.card}\`)` : described];
  }));
}

/**
 * A question as TypeSafe takes it: only its own fields. Anything else in
 * a questions file (`applies_to`) is for the interpreter.
 */
export function asked({ type, instructions, criteria, levels }) {
  return { type, instructions, ...(criteria && { criteria }), ...(levels && { levels }) };
}

function escalationFor({ player, peer, name, answerMs, answerPollMs }) {
  if (player.escalation === 'ask_table') {
    return askTable((question) => askPeer({ peer, name, question, timeoutMs: answerMs, pollMs: answerPollMs }));
  }
  return floorFallback();
}

/**
 * @param {{ peer: object, judge: { systemOne: Function }, name: string,
 *   questions: Record<string, object>, player: { floor?: number, escalation?: string },
 *   game: { project: Function, options: Function, propose?: Function, act: Function },
 *   answerMs?: number, answerPollMs?: number, table?: { markSeen: Function },
 *   onRecord?: (record: object) => void }} services
 *   `table` and `onRecord` are filled in by the seat after this is built.
 */
export function genericLibrary(services) {
  return {
    guards: {
      verdict: {
        doc: 'the last judgment or table answer was `is` (yes | no | unsure) - or, with `of`, that answer to question `of` asked alongside it',
        fn: ({ event }, parameters) => {
          const reading = parameters.of === undefined ? event.output?.verdict : verdictOf(event.output?.checks?.[parameters.of] ?? 0);
          return reading === parameters.is;
        },
      },
      table_changed: {
        doc: 'the board or the talk moved since the last look (the bot\'s own lines excluded)',
        fn: ({ event }) => event.changed === true,
      },
      quiet_table: {
        doc: 'the board changed and nobody has spoken for `ms` since',
        fn: ({ event }, parameters) => (event.quietFor ?? 0) >= parameters.ms,
      },
      counted: {
        doc: 'context `field` has reached `at_least` (a number, or another context field)',
        fn: ({ context }, parameters) => {
          const limit = typeof parameters.at_least === 'string' ? context[parameters.at_least] : parameters.at_least;
          return context[parameters.field] >= limit;
        },
      },
      played: {
        doc: 'the step just taken was a move of kind `move` (e.g. pass, cast)',
        fn: ({ event }, parameters) => event.output?.kind === parameters.move,
      },
    },

    actions: {
      count: {
        doc: 'add one to context `field`',
        assign: ({ context }, parameters) => ({ [parameters.field]: (context[parameters.field] ?? 0) + 1 }),
      },
      track: {
        doc: 'keep what the last move changed (its `tracks`) in context',
        assign: ({ event }) => event.output?.tracks ?? {},
      },
      reset: {
        doc: 'set context fields to the values given in `to`',
        assign: (_, parameters) => ({ ...parameters.to }),
      },
      say: {
        doc: 'say `text` at the table',
        fn: (_, parameters) => { services.peer.say(parameters.text); },
      },
    },

    actors: {
      judge: {
        doc: 'ask Jev `question` (a Noul) about the table and talk; output verdict yes | no | unsure',
        fn: async ({ input }) => {
          const view = input.event.view ?? await services.peer.view();
          const talk = input.event.talk ?? await services.peer.talk();
          const projected = services.game.project(view, input.context, input.phase);
          const state = { ...projected, table_talk: talk.map(({ name, text }) => ({ name, text })) };
          const names = [input.question, ...(input.also ?? [])];
          const questions = Object.fromEntries(names.map((each) => [each, asked(services.questions[each])]));
          const response = await services.judge.systemOne({ state, questions });
          const answers = response.answers ?? {};
          return { verdict: verdictOf(answers[input.question]?.noul ?? 0), checks: Object.fromEntries(names.map((each) => [each, answers[each]?.noul ?? null])) };
        },
      },
      ask_table: {
        doc: 'say ONE yes/no question (`say`) and wait for a person\'s answer; output verdict yes | no | unsure',
        fn: async ({ input }) => {
          const { peer, name, answerMs, answerPollMs } = services;
          const answer = await askPeer({ peer, name, question: input.say, timeoutMs: answerMs, pollMs: answerPollMs });
          await services.table?.markSeen();
          return { verdict: verdictFromAnswer(answer), answered: answer };
        },
      },
      play: {
        doc: 'one step in `phase`: Jev picks from the legal options (`question`), the rules check it, and the move is made and said',
        fn: async ({ input }) => play(services, input),
      },
    },
  };
}

async function play(services, { context, phase, question: questionName }) {
  const { peer, judge, game, player } = services;
  const view = await peer.view();
  const state = game.project(view, context, phase);
  const options = game.options(state, phase, context);
  const question = services.questions[questionName];
  const byId = (id) => options.find((option) => option.id === id);
  const result = await decide({
    judge, state,
    choice: { key: questionName, instructions: question.instructions, criteria: criteriaFor(question, options) },
    unsure: services.unsure,
    floor: player.floor ?? 0,
    verify: (id) => verification(services, byId(id), state, context),
    escalation: escalationFor({ ...services, player }),
    fallback: options.at(-1).id, // the last option is the one that is always safe (pass)
  });
  const move = byId(result.option);
  const { actions = [], say = null, tracks = {}, data } = game.act(move, state, view, context);
  for (const action of actions) await peer.act(action);
  if (say) await peer.say(say, data ?? { kind: 'bot-move', move: move.id });
  const record = {
    at: new Date().toISOString(), phase, options: options.map((option) => option.id), picked: result.picked,
    move: move.id, confidence: result.confidence, checks: result.checks, asked: result.asked,
    ...(result.blocked && { blocked: { ...result.blocked, move: result.picked } }),
  };
  services.onRecord?.(record);
  return { record, move: move.id, kind: move.id.split(':', 1)[0], tracks };
}

/**
 * The rule questions that bear on `option`: those whose `applies_to`
 * names its kind (a questions-file fact, not code). The game describes
 * the proposed move; nothing to check means nothing is asked.
 */
function verification(services, option, state, context) {
  const [kind] = option.id.split(':', 1);
  const rules = Object.entries(services.questions).filter(([, question]) => question.applies_to?.includes(kind));
  if (rules.length === 0) return null;
  const proposed = services.game.propose?.(option, state, context) ?? { what: option.what, card: option.card ?? null };
  const card = option.card ? ` with ${option.card}` : '';
  return {
    state: { ...state, proposed },
    questions: Object.fromEntries(rules.map(([name, question]) => [name, asked(question)])),
    question: `Can I ${option.what}${card}?`,
  };
}

/**
 * Several libraries as one - a game's own names beside the generic ones.
 * A name defined twice is a mistake, not an override.
 */
export function mergeLibraries(...libraries) {
  const merged = { guards: {}, actions: {}, actors: {} };
  for (const library of libraries) {
    for (const [kind, names] of Object.entries(merged)) {
      const entries = Object.entries(library[kind] ?? {});
      for (const [name, entry] of entries) {
        if (Object.hasOwn(names, name)) throw new Error(`the library defines ${kind.slice(0, -1)} "${name}" twice`);
        names[name] = entry;
      }
    }
  }
  return merged;
}
