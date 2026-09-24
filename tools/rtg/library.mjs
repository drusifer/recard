// US-129/D154: RtG's code, by name - the facts a turn file cannot state.
// How the table reads as RtG state (with its rules), what is legal in a
// phase (resources, D151), what a proposed move is, and what a move does
// on the table. The FLOW - phases, whose turn, when to ask - is
// `games/rtg/turn.yaml`, not here.

import { buildRtgState } from './playState.mjs';
import { legalOptions } from './options.mjs';
import { actionsFor } from './moves.mjs';
import { readAnnouncement } from './table.mjs';

/**
 * Phases of MY turn. Any other phase (watching, defending) is theirs.
 */
const MY_PHASES = new Set(['untap', 'draw', 'main', 'combat']);

function pileIds(view, myId, deck) {
  const mine = (kind) => view.piles.find((pile) => pile.kind === kind && pile.ownerId === myId)?.id;
  return {
    lands: mine('lands') ?? mine('battlefield'),
    stack: view.piles.find((pile) => pile.kind === 'stack')?.id ?? 'stack',
    library: deck ?? view.piles.find((pile) => pile.kind === 'deck')?.id,
  };
}

function cardCost(state, name) {
  if (!name) return '';
  const cards = [...state.me.hand, ...state.me.battlefield, ...state.me.lands];
  return cards.find((card) => card.card === name)?.cost ?? '';
}

/**
 * The game hooks the generic library calls (`tools/jev/library.mjs`).
 * @param {{ rules: object, myId: string, name?: string, deck?: string }} options
 *   `name` is the seat name, so a question can tell a line meant for me.
 */
export function rtgHooks({ rules, myId, name, deck }) {
  return {
    project(view, context, phase = 'unknown') {
      const turn = { is_mine: MY_PHASES.has(phase), phase, land_played: context.land_played === true, attackers: context.attackers ?? [] };
      const state = buildRtgState(view, myId, turn);
      return { ...state, me: { ...state.me, name }, rules };
    },
    options: (state, _phase, context) => legalOptions(state, { arrivedThisTurn: context.arrivedThisTurn }),
    propose: (option, state, context) => ({
      what: option.what, card: option.card ?? null, cost: cardCost(state, option.card),
      arrived_this_turn: (context.arrivedThisTurn ?? []).includes(option.card), tapped: false,
    }),
    act(move, state, view, context) {
      const { actions, say, tracks = {} } = actionsFor(move, state, pileIds(view, myId, deck));
      // The turn file owns the phase; the move keeps only its facts.
      const { phase: _phase, arrived, ...kept } = tracks;
      if (arrived) kept.arrivedThisTurn = [...(context.arrivedThisTurn ?? []), arrived];
      return { actions, say, tracks: kept, data: { kind: 'rtg-move', move: move.id } };
    },
  };
}

const attacksIn = (heard, name) => (heard ?? []).map((entry) => readAnnouncement(entry, name)).filter((read) => read?.phase === 'combat');

/**
 * RtG's own names for a turn file, beside the generic library's.
 * @param {{ name: string }} options the name this bot sits under
 */
export function rtgLibrary({ name }) {
  return {
    guards: {
      heard_attack: {
        doc: 'RtG: someone just announced an attack ("attacking with ...")',
        fn: ({ event }) => attacksIn(event.heard, name).length > 0,
      },
    },
    actions: {
      hear_attackers: {
        doc: 'RtG: remember who was just announced as attacking',
        assign: ({ event }) => ({ attackers: attacksIn(event.heard, name).flatMap((read) => read.attackers) }),
      },
    },
    actors: {},
  };
}
