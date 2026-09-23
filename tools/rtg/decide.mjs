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
import { askTable, UNSURE } from '../jev/escalate.mjs';
import { decide } from '../jev/decide.mjs';

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
      const described = game.step.criteria[option.id.split(':', 1)[0]] ?? option.what;
      return [option.id, option.card ? `${described} (\`${option.card}\`)` : described];
    })),
  };
}

/**
 * One step (`tools/jev/decide.mjs`): the Choice over this turn's legal
 * options, then the constraints on the pick. RtG's escalation policy is
 * the table itself (D151): an unconvinced constraint is ASKED.
 * @param {{ game: object, state: object, tracked?: object, judge: object,
 *   unsure?: number, ask?: (question: string) => Promise<boolean|null> }} input
 *   `ask` puts a question to the table and resolves what it was told -
 *   `null` when nobody answered.
 */
export async function decideStep({ game, state, tracked = {}, judge, unsure = UNSURE, ask }) {
  const options = legalOptions(state, tracked);
  const pass = options.at(-1); // options.at(-1) is always `pass`
  const byId = (id) => options.find((option) => option.id === id);
  const { instructions, criteria } = stepQuestion(game, options);

  const result = await decide({
    judge, state, unsure,
    choice: { key: '__step__', instructions, criteria },
    verify: (id) => verification(game, state, tracked, byId(id)),
    escalation: askTable(ask),
    fallback: pass.id,
  });

  const record = {
    options: options.map((option) => option.id), picked: result.picked,
    confidence: result.confidence, distribution: result.distribution,
    checks: result.checks, asked: result.asked,
  };
  // Pass, rather than play something illegal.
  if (result.blocked) record.blocked = { rule: result.blocked.rule, move: result.picked, why: result.blocked.why };
  return { move: byId(result.option), record };
}

/** The constraints that bear on `picked`, as a verify step - or `null`
 *  when nothing needs checking (passing, taking damage, a move with no
 *  rules of its own). */
function verification(game, state, tracked, picked) {
  if (picked.id === 'pass' || picked.id === 'take_damage') return null;
  const [kind] = picked.id.split(':', 1);
  const constraints = constraintsFor(game, kind);
  if (Object.keys(constraints).length === 0) return null;
  const proposed = {
    what: picked.what, card: picked.card ?? null, cost: cardCost(state, picked.card),
    arrived_this_turn: (tracked.arrivedThisTurn ?? []).includes(picked.card), tapped: false,
  };
  const withCard = picked.card ? ` with ${picked.card}` : '';
  return {
    state: { ...state, rules: game.rules, proposed },
    questions: constraints,
    question: `Can I ${picked.what}${withCard}?`,
  };
}

function cardCost(state, name) {
  if (!name) return '';
  const found = [...state.me.hand, ...state.me.battlefield, ...state.me.lands].find((card) => card.card === name);
  return found?.cost ?? '';
}
