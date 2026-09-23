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
  const arrived = new Set(tracked.arrivedThisTurn);
  const options = state.turn.is_mine
    ? (MY_PHASE[state.turn.phase]?.(state, arrived) ?? [])
    : defending(state);
  // Always available, and the only thing left once resources are spent.
  options.push({ id: 'pass', what: 'do nothing further' });
  return options;
}

const option = (id, what, card) => ({ id: card ? `${id}:${card.card}` : id, what, ...(card && { card: card.card }) });

/**
 * What each phase of MY turn offers - the phase picks, no branching.
 */
const MY_PHASE = {
  untap: () => [option('untap_all', 'untap everything I control')],
  draw: () => [option('draw', 'draw a card for the turn')],
  main(state) {
    // Land drops first, then spells - the order the Choice lists them.
    const lands = state.turn.land_played ? [] : state.me.hand.filter((card) => isLand(card));
    const spells = state.me.hand.filter((card) => !isLand(card) && canPay(card.cost, state.me.untapped_lands));
    return [
      ...lands.map((card) => option('play_land', 'put a land onto the battlefield', card)),
      ...spells.map((card) => option('cast', 'cast a spell from my hand', card)),
    ];
  },
  combat(state, arrived) {
    const ready = state.me.battlefield.filter((each) => isCreature(each) && !each.tapped && !arrived.has(each.card));
    return ready.map((card) => option('attack', 'attack with a creature', card));
  },
};

/**
 * Being drawn in on the opponent's turn: blocks and damage.
 */
function defending(state) {
  if (state.turn.attackers.length === 0) return [];
  const blockers = state.me.battlefield.filter((each) => isCreature(each) && !each.tapped);
  return [
    ...blockers.map((card) => option('block', 'block an attacking creature', card)),
    option('take_damage', 'take the damage that got through'),
  ];
}

/** True when nothing is left but passing - the turn has run out of
 *  resources on its own, with nothing counting steps. */
export const isOnlyPassing = (options) => options.length === 1 && options[0].id === 'pass';
