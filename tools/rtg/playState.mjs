// US-127/D151: what an RtG table looks like to a player, as the fixed
// schema every constraint and the step question refer to by path.
//
// A projection of the replicated view, like Gin's (D147): hands, piles,
// life from the Score panel, tapped state from a card's `orientation`
// (Recard taps by rotating - `cardTransforms.js`). Nothing here is a
// second source of truth.
//
// Arithmetic stays here rather than in a question (standing rule): what
// mana is available, what a spell costs, who is at what life. A
// constraint judges timing and permission over these numbers, never
// computes one.

import { parseManaCost } from './cardSchema.mjs';

const TAPPED = 'landscape';

const describe = (card) => ({
  card: card.name ?? card.id,
  type: card.type ?? null,
  cost: card.cost ?? '',
  cmc: card.cmc ?? parseManaCost(card.cost ?? '').cmc,
  colors: card.colors ?? [],
  ...(card.power === undefined ? {} : { power: card.power, toughness: card.toughness }),
  tapped: card.orientation === TAPPED,
});

const isLand = (card) => /land/i.test(card.type ?? '');

/** Mana available right now: one per untapped land, by colour. Code's
 *  job, not a question's - "can I pay for this" is arithmetic. */
export function manaAvailable(lands) {
  const untapped = lands.filter((card) => !card.tapped);
  const byColor = {};
  for (const land of untapped) for (const color of land.colors) byColor[color] = (byColor[color] ?? 0) + 1;
  return { total: untapped.length, by_color: byColor };
}

/** Whether `mana` covers `cost` - generic pips first, then coloured. */
export function canPay(cost, mana) {
  const { cmc, symbols } = parseManaCost(cost ?? '');
  if (cmc > mana.total) return false;
  const need = {};
  for (const symbol of symbols) if (/^[WUBRG]$/.test(symbol)) need[symbol] = (need[symbol] ?? 0) + 1;
  return Object.entries(need).every(([color, count]) => (mana.by_color[color] ?? 0) >= count);
}

const pileOf = (view, kind, ownerId) => view.piles.find((pile) => pile.kind === kind
  && (ownerId === undefined || pile.ownerId === ownerId))?.cards ?? [];

/**
 * @param {object} view the replicated view this peer already holds
 * @param {string} myId
 * @param {{ is_mine: boolean, phase: string, land_played: boolean, attackers: string[] }} turn
 *   what the bot knows about the turn - tracked from table talk (D151),
 *   since Recard has no turn or priority concept of its own.
 */
export function buildRtgState(view, myId, turn) {
  const opponentId = view.players.find((player) => player.id !== myId)?.id ?? null;
  const myLands = [...pileOf(view, 'lands', myId), ...pileOf(view, 'battlefield', myId).filter((c) => isLand(c))].map(describe);
  const myBattlefield = pileOf(view, 'battlefield', myId).map(describe).filter((c) => !isLand(c));
  const mana = manaAvailable(myLands);

  return {
    me: {
      hand: view.myHand.map(describe),
      battlefield: myBattlefield,
      lands: myLands,
      untapped_lands: mana,
      graveyard: pileOf(view, 'discard', myId).map(describe),
      exile: pileOf(view, 'exile', myId).map(describe),
      life: view.scores?.[myId] ?? null,
    },
    opponent: {
      hand_size: view.otherHandCounts?.[opponentId] ?? 0,
      battlefield: pileOf(view, 'battlefield', opponentId).map(describe),
      lands: pileOf(view, 'lands', opponentId).map(describe),
      graveyard: pileOf(view, 'discard', opponentId).map(describe),
      life: opponentId ? view.scores?.[opponentId] ?? null : null,
    },
    stack: pileOf(view, 'stack', null).map(describe),
    turn: {
      is_mine: turn.is_mine === true,
      phase: turn.phase ?? 'unknown',
      land_played: turn.land_played === true,
      attackers: turn.attackers ?? [],
    },
  };
}
