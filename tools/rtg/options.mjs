// US-127/D151: what this player could legally do right now.
//
// Computed from RESOURCES, not from a coded turn order: an untapped
// land, the one land drop, a creature that is untapped and has been
// here since the turn began. Every action consumes one of those, so the
// option set SHRINKS as a turn proceeds and ends at "pass" - which is
// why nothing counts steps (the user's own point: mana is the budget).
//
// This is also what makes an illegal move unreachable rather than
// merely unlikely: an option that is not here cannot be chosen.

import { canPay } from './playState.mjs';

const isLand = (card) => /land/i.test(card.type ?? '');
const isCreature = (card) => /creature/i.test(card.type ?? '');

/**
 * @param {ReturnType<import('./playState.mjs').buildRtgState>} state
 * @param {{ arrivedThisTurn?: string[] }} [tracked] creatures that came
 *   down this turn - summoning sickness is a fact about history, and
 *   the bot tracks it the same way it tracks whose turn it is.
 * @returns {{ id: string, what: string, card?: string }[]}
 */
export function legalOptions(state, tracked = {}) {
  const options = [];
  const arrived = new Set(tracked.arrivedThisTurn ?? []);
  const mine = state.turn.is_mine;

  if (mine && state.turn.phase === 'untap') options.push({ id: 'untap_all', what: 'untap everything I control' });
  if (mine && state.turn.phase === 'draw') options.push({ id: 'draw', what: 'draw a card for the turn' });

  if (mine && state.turn.phase === 'main') {
    if (!state.turn.land_played) {
      for (const card of state.me.hand.filter((each) => isLand(each))) {
        options.push({ id: `play_land:${card.card}`, what: 'put a land onto the battlefield', card: card.card });
      }
    }
    for (const card of state.me.hand.filter((each) => !isLand(each))) {
      if (canPay(card.cost, state.me.untapped_lands)) {
        options.push({ id: `cast:${card.card}`, what: 'cast a spell from my hand', card: card.card });
      }
    }
  }

  if (mine && state.turn.phase === 'combat') {
    for (const card of state.me.battlefield.filter((each) => isCreature(each) && !each.tapped && !arrived.has(each.card))) {
      options.push({ id: `attack:${card.card}`, what: 'attack with a creature', card: card.card });
    }
  }

  // Being drawn in on the opponent's turn: blocks and damage.
  if (!mine && state.turn.attackers.length > 0) {
    for (const card of state.me.battlefield.filter((each) => isCreature(each) && !each.tapped)) {
      options.push({ id: `block:${card.card}`, what: 'block an attacking creature', card: card.card });
    }
    options.push({ id: 'take_damage', what: 'take the damage that got through' });
  }

  // Always available, and the only thing left once resources are spent.
  options.push({ id: 'pass', what: 'do nothing further' });
  return options;
}

/** True when nothing is left but passing - the turn has run out of
 *  resources on its own, with nothing counting steps. */
export const onlyPassing = (options) => options.length === 1 && options[0].id === 'pass';
