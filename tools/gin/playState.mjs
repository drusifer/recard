// US-125/D147: the state every Jev strategy question refers to by path.
//
// This is a PROJECTION, not a model: every field is a rename of
// something the peer already holds - the replicated view (through the
// existing `GinTracker` observation, D137) and `computeFacts`'s exact
// numbers. It introduces no second source of truth, replicates nothing
// new, and reads nothing from disk.
//
// The field NAMES are fixed - `me.deadwood` means the same thing on
// every turn of every hand - because a strategy file is static and
// refers to them by path. Only the values change. That is the whole
// point: the questions never have to be rebuilt.

/** Fixed slots, so a strategy may reference `candidates[10]` on any
 *  turn (Gate 1: a Gin hand is 10-11 cards). Slots this turn does not
 *  fill are `null`, and their answers are discarded by the runner. */
export const CANDIDATE_SLOTS = 11;

/** The top-level shape, asserted by tests so it cannot drift from the
 *  paths the strategy files are written against. */
export const PLAY_STATE_FIELDS = ['rules', 'me', 'candidates', 'opponent', 'stock', 'upcard'];

const COURT = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const cardName = (card) => (card ? `${COURT[card.rank] ?? card.rank} of ${card.suit}` : null);

/**
 * @param {import('./observe.mjs').GinObservation} obs
 * @param {import('./rules.mjs').GinFacts} facts
 */
export function buildPlayState(obs, facts) {
  const candidates = Array.from({ length: CANDIDATE_SLOTS }, (_, index) => {
    const option = facts.discards?.[index];
    if (!option) return null;
    return { card: cardName(option.card), deadwood_after: option.deadwoodAfter };
  });

  return {
    rules: {
      knock_limit: 10,
      meld: 'A set of 3-4 cards of one rank, or a run of 3+ consecutive cards in one suit (ace low).',
      scoring: 'Deadwood is the total value of cards in no meld. Knock at 10 or fewer; gin is 0.',
    },
    me: {
      phase: obs.phase,
      hand: obs.hand.map((card) => cardName(card)),
      melds: facts.melds?.map((meld) => meld.cards.map((card) => cardName(card)).join(', ')) ?? [],
      deadwood: facts.deadwood,
      can_knock: facts.canKnock,
      is_gin: facts.isGin,
      discarded: obs.myDiscards.map((card) => cardName(card)),
    },
    candidates,
    opponent: {
      // A SIZE, never cards: the observation itself refuses to copy an
      // opponent card that was not seen publicly, and this keeps that.
      hand_size: obs.opponentHandSize,
      discarded: obs.opponentDiscards.map((card) => cardName(card)),
      took_from_discard: obs.opponentTook.map((card) => cardName(card)),
    },
    stock: { remaining: obs.stockCount, drawn_so_far: obs.stockDrawn },
    upcard: obs.discardPile.at(-1)?.faceDown ? null : cardName(obs.discardPile.at(-1)),
  };
}
