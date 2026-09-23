// US-127 follow-up / D152: whose turn is it - judged, not tracked.
//
// RtG's table is fully permissive (D82-D85): the opponent's board is
// already real data, not something to infer or ask about. So this asks
// nothing about STATE - it hands the live board plus the ordered table
// talk log to the game's own `their_turn_is_over` constraint and reads
// the answer. No diff tracker, no event log: the cards are already out,
// and table talk is what establishes the sequence between them.
//
// Escalating to a direct "are you done?" (decide.mjs's `ask`) stays
// reserved for when THIS comes back unconvinced - never for checking
// something the board already shows.

import { verdictOf, UNSURE } from '../jev/escalate.mjs';

/**
 * @param {{ game: object, state: object, talk: {name: string, text: string}[],
 *   judge: { systemOne: Function }, unsure?: number }} input
 * @returns {Promise<{ isOver: boolean, unclear: boolean, checks: object }>}
 */
export async function turnStatus({ game, state, talk, judge, unsure = UNSURE }) {
  const withTalk = { ...state, table_talk: talk.map(({ name, text }) => ({ name, text })) };
  const questions = {
    attack_phase_complete: game.constraints.attack_phase_complete,
    their_turn_is_over: game.constraints.their_turn_is_over,
  };
  const response = await judge.systemOne({ state: withTalk, questions });
  const answers = response.answers ?? {};
  const over = answers.their_turn_is_over?.noul ?? 0;
  const reading = verdictOf(over, unsure);
  return {
    isOver: reading === 'yes',
    unclear: reading === 'unsure',
    checks: {
      attack_phase_complete: answers.attack_phase_complete?.noul ?? null,
      their_turn_is_over: over,
    },
  };
}
