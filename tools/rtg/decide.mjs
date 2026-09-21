// US-127/D151: one decision - what next, and is it allowed?
//
// Two requests, for the same reason Gin's are (D150): the constraints
// judge a PROPOSED move, so they cannot be asked until there is one.
//   1. `__step__` - a Choice over the legal options (`options.mjs`),
//      described in the game file's own words.
//   2. the constraints that apply to that move, each citing a rule.
//
// An unconvinced constraint is not thresholded into a verdict: the bot
// asks the table and abides by the answer (the user's own call). A move
// nobody objects to is played.

import { legalOptions } from './options.mjs';

/** Which constraints apply to a move of this KIND - asking "may this
 *  creature block" about a land is noise nobody has to read. `kind` is
 *  the option id's stem (`play_land`, `cast`), not its prose, so the
 *  mapping cannot drift when a description is reworded. */
export function constraintsFor(game, kind) {
  const applies = {
    play_land: ['one_land_per_turn', 'timing_is_right'],
    cast: ['can_pay_for_it', 'timing_is_right'],
    attack: ['creature_can_attack', 'timing_is_right'],
    block: ['block_is_legal'],
  }[kind] ?? [];
  return Object.fromEntries(applies.filter((name) => game.constraints[name]).map((name) => [name, game.constraints[name]]));
}

/** The step question: the game's own instructions, over this turn's
 *  legal options, each described by the game file. */
export function stepQuestion(game, options) {
  return {
    type: 'choice',
    instructions: game.step.instructions,
    criteria: Object.fromEntries(options.map((option) => {
      const described = game.step.criteria[option.id.split(':')[0]] ?? option.what;
      return [option.id, option.card ? `${described} (\`${option.card}\`)` : described];
    })),
  };
}

/**
 * @param {{ game: object, state: object, tracked?: object, judge: object,
 *   unsure?: number, ask?: (question: string) => Promise<boolean|null> }} input
 *   `ask` puts a question to the table and resolves what it was told -
 *   `null` when nobody answered.
 */
export async function decideStep({ game, state, tracked = {}, judge, unsure = 0.35, ask }) {
  const options = legalOptions(state, tracked);
  const step = stepQuestion(game, options);
  const chosen = (await judge.systemOne({ state, questions: { __step__: step } })).answers?.__step__;
  const picked = options.find((option) => option.id === chosen?.choice) ?? options.at(-1); // options.at(-1) is always `pass`

  const record = {
    options: options.map((option) => option.id), picked: picked.id,
    confidence: chosen?.confidence ?? null, distribution: chosen?.probabilities ?? null,
    checks: {}, asked: null,
  };
  if (picked.id === 'pass' || picked.id === 'take_damage') return { move: picked, record };

  const constraints = constraintsFor(game, picked.id.split(':')[0]);
  if (Object.keys(constraints).length === 0) return { move: picked, record };

  const proposed = { what: picked.what, card: picked.card ?? null, cost: cardCost(state, picked.card), arrived_this_turn: (tracked.arrivedThisTurn ?? []).includes(picked.card), tapped: false };
  const verdicts = (await judge.systemOne({ state: { ...state, rules: game.rules, proposed }, questions: constraints })).answers ?? {};

  // Sort the verdicts first, then ask ONCE. A person at a table does
  // not ask two questions about one move, and two talk lines about the
  // same card read as confusion rather than diligence.
  const uncertain = [];
  for (const [name, verdict] of Object.entries(verdicts)) {
    record.checks[name] = verdict.noul;
    if (verdict.noul <= unsure) return blocked(record, name, picked, options);
    if (verdict.noul < 1 - unsure) uncertain.push(name);
  }
  if (uncertain.length > 0) {
    const told = ask ? await ask(`Can I ${picked.what}${picked.card ? ` with ${picked.card}` : ''}?`) : null;
    record.asked = { rules: uncertain, answered: told };
    if (told !== true) return blocked(record, uncertain[0], picked, options, told === null ? 'nobody answered' : 'the table said no');
  }
  return { move: picked, record };
}

function blocked(record, rule, picked, options, why = 'the rule says no') {
  record.blocked = { rule, move: picked.id, why };
  return { move: options.at(-1), record }; // pass, rather than play something illegal
}

function cardCost(state, name) {
  if (!name) return '';
  const found = [...state.me.hand, ...state.me.battlefield, ...state.me.lands].find((card) => card.card === name);
  return found?.cost ?? '';
}
