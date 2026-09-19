// US-120/D137: turns successive Recard views into a public-information
// Gin observation. Recard's guest view carries the opponent's REAL hand;
// nothing here ever copies an opponent card the bot did not see
// publicly (a discard, or a discard-pile card they took).
//
// Works from snapshot DIFFS, not events: a bot waiting for its turn can
// miss an intermediate state (the opponent's draw and discard can land
// in one snapshot), so every update compares against the last one.

/**
 * @typedef {import('./cards.mjs').GinCard} GinCard
 * @typedef {'draw'|'discard'|'wait'|'hand-over'} GinPhase
 * @typedef {{
 *   handNumber: number, phase: GinPhase, outcome: 'knock'|'dead'|null,
 *   hand: GinCard[], discardPile: Array<GinCard|{ faceDown: true }>,
 *   stockCount: number, stockDrawn: number, opponentHandSize: number,
 *   opponentDiscards: GinCard[], opponentTook: GinCard[], myDiscards: GinCard[],
 *   takenFromDiscard: string|null,
 * }} GinObservation
 */

const DEAD_HAND_STOCK = 2;

const trim = ({ id, rank, suit }) => ({ id, rank, suit });

function snapshot(view, myId) {
  const pile = (predicate) => view.piles.find((each) => predicate(each));
  return {
    stock: pile((each) => each.id === 'deck')?.cards.length ?? 0,
    table: pile((each) => each.id === 'table')?.cards ?? [],
    mine: view.myHand,
    opponentHandSize: pile((each) => each.kind === 'hand' && each.id !== `hand:${myId}`)?.cards.length ?? 0,
  };
}

export class GinTracker {
  handNumber = 0;
  previous;
  initialStock = 0;
  /**
   * @type {'bot'|'opponent'}
   */
  turn;
  /**
   * @type {'knock'|'dead'|null}
   */
  outcome = null;
  history = { opponentDiscards: [], opponentTook: [], myDiscards: [] };
  takenFromDiscard = null;

  /**
   * @param {{ myId: string, firstPlayer: 'bot'|'opponent' }} options
   */
  constructor({ myId, firstPlayer }) {
    this.myId = myId;
    this.firstPlayer = firstPlayer;
    this.turn = firstPlayer;
  }

  #newHand(snap) {
    // A table seen before its deal is not a hand yet.
    if (snap.mine.length > 0) this.handNumber += 1;
    this.initialStock = snap.stock;
    this.turn = this.firstPlayer;
    this.outcome = null;
    this.history = { opponentDiscards: [], opponentTook: [], myDiscards: [] };
    this.takenFromDiscard = null;
  }

  #diff(before, after) {
    this.#recordTaken(before, after);
    const beforeIds = new Set(before.table.map((card) => card.id));
    const mineBefore = new Set(before.mine.map((card) => card.id));
    const added = after.table.filter((card) => !beforeIds.has(card.id));
    for (const discard of added) this.#recordDiscard(discard, mineBefore.has(discard.id));
    if (after.table.at(-1)?.faceUp === false) this.outcome = 'knock';
    else if (added.length > 0 && after.stock <= DEAD_HAND_STOCK) this.outcome = 'dead';
  }

  // A discard-pile card that left the pile went to me or to the opponent -
  // either way its identity was public.
  #recordTaken(before, after) {
    const afterIds = new Set(after.table.map((card) => card.id));
    const mineNow = new Set(after.mine.map((card) => card.id));
    for (const taken of before.table) {
      if (afterIds.has(taken.id)) continue;
      if (mineNow.has(taken.id)) this.takenFromDiscard = taken.id;
      else this.history.opponentTook.push(trim(taken));
    }
  }

  #recordDiscard(discard, isMine) {
    // A face-down discard is a knock: its identity is not public.
    const isPublic = discard.faceUp !== false;
    if (isMine) {
      if (isPublic) this.history.myDiscards.push(trim(discard));
      this.takenFromDiscard = null;
      this.turn = 'opponent';
      return;
    }
    if (isPublic) this.history.opponentDiscards.push(trim(discard));
    this.history.opponentTook = this.history.opponentTook.filter((card) => card.id !== discard.id);
    this.turn = 'bot';
  }

  #phase(snap) {
    if (this.outcome) return 'hand-over';
    if (snap.mine.length === 0) return 'wait';
    if (snap.mine.length === 11) return 'discard';
    return this.turn === 'bot' ? 'draw' : 'wait';
  }

  /**
   * @returns {GinObservation}
   */
  update(view) {
    const snap = snapshot(view, this.myId);
    // A new hand: the first look, a redeal (the stock grows back), or my
    // own deal arriving after I joined an undealt table.
    const isDealt = snap.mine.length > 0 && this.previous?.mine.length === 0;
    if (isDealt || !this.previous || snap.stock > this.previous.stock) this.#newHand(snap);
    else this.#diff(this.previous, snap);
    this.previous = snap;
    return {
      handNumber: this.handNumber,
      phase: this.#phase(snap),
      outcome: this.outcome,
      hand: snap.mine.map((card) => trim(card)),
      discardPile: snap.table.map((card) => (card.faceUp === false ? { faceDown: true } : trim(card))),
      stockCount: snap.stock,
      stockDrawn: this.initialStock - snap.stock,
      opponentHandSize: snap.opponentHandSize,
      opponentDiscards: [...this.history.opponentDiscards],
      opponentTook: [...this.history.opponentTook],
      myDiscards: [...this.history.myDiscards],
      takenFromDiscard: this.takenFromDiscard,
    };
  }
}
