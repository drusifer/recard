// US-127/D151: carrying out a decided move on a real table.
//
// Recard referees nothing, so every move here is ordinary table
// mechanics - move a card, rotate it to tap - plus a sentence on table
// talk saying what was done, because the table hears rather than
// detects (D151). Kept pure-ish: it returns the actions and the line,
// and the runner sends them.

import { landsToTap } from './playState.mjs';

/**
@returns {{ actions: object[], say: string|null, tracks?: object }}
*/
export function actionsFor(move, state, ids) {
  const card = (name) => [...state.me.hand, ...state.me.battlefield, ...state.me.lands]
    .find((each) => each.card === name)?.id ?? name;

  switch (move.id.split(':', 1)[0]) {
    case 'untap_all': {
      return {
        actions: [...state.me.lands, ...state.me.battlefield].filter((each) => each.tapped)
          .map((each) => ({ type: 'ROTATE', pileableId: each.id ?? card(each.card) })),
        say: 'My turn - untapping.',
        tracks: { phase: 'draw', land_played: false, arrivedThisTurn: [] },
      };
    }
    case 'draw': {
      return { actions: [{ type: 'DRAW', pileId: ids.library }], say: 'Drawing for the turn.', tracks: { phase: 'main' } };
    }
    case 'play_land': {
      return { actions: [{ type: 'MOVE', pileableId: card(move.card), toPileId: ids.lands }],
        say: `Playing ${move.card}.`, tracks: { land_played: true } };
    }
    case 'cast': {
      // rules.mana: "Tap an untapped land you control to pay for a
      // spell." Never tapping the paying lands let one land pay for
      // every spell in a main phase (live bug, D157).
      const cost = [...state.me.hand, ...state.me.battlefield].find((each) => each.card === move.card)?.cost ?? '';
      const taps = landsToTap(cost, state.me.lands).map((id) => ({ type: 'ROTATE', pileableId: id }));
      return { actions: [...taps, { type: 'MOVE', pileableId: card(move.card), toPileId: ids.stack }],
        say: `Casting ${move.card} - on the stack.`, tracks: { arrived: move.card } };
    }
    case 'attack': {
      return { actions: [{ type: 'ROTATE', pileableId: card(move.card) }],
        say: `Attacking with ${move.card}.`, tracks: { phase: 'combat' } };
    }
    case 'block': {
      return { actions: [], say: `Blocking with ${move.card}.` };
    }
    case 'take_damage': {
      return { actions: [], say: 'Taking the damage - how much?' };
    }
    default: {
      return { actions: [], say: null };
    }
  }
}
