// An in-memory War table speaking the harness peer interface (view/act/
// myId/say) with just the reducer actions a War bot uses. Unlike
// `ginFakeTable.mjs`'s MOVE (which always sets `faceUp: true` - every
// Gin move comes out of a hand, D43's own auto-reveal), this one
// deliberately does NOT touch `faceUp` on MOVE: War's cards come out of
// a hidden `deck`-kind pile, which gets no such auto-reveal, and the
// whole point of the bot's own FLIP calls is proving that distinction.
const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short, isFaceUp = false) => ({
  pileableType: 'card', id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`,
  rank: short.slice(0, -1), suit: SUITS[short.at(-1)], faceUp: isFaceUp,
});
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);

export class FakeWarTable {
  /**
   * @param {{ mine: string, theirs: string }} options top card is the LAST in the string
   */
  constructor({ mine, theirs }) {
    this.piles = { 'deck:ME': cards(mine), 'deck:HOST': cards(theirs), table: [] };
    this.talk = [];
    this.actions = [];
  }

  myId() { return 'ME'; }

  view() {
    const pile = (id, kind, ownerId) => ({ id, kind, ownerId, cards: this.piles[id].map((each) => ({ ...each })) });
    return {
      piles: [
        pile('deck:ME', 'deck', 'ME'),
        pile('deck:HOST', 'deck', 'HOST'),
        pile('table', 'plain', null),
      ],
    };
  }

  #take(id) {
    for (const cardsHere of Object.values(this.piles)) {
      const index = cardsHere.findIndex((each) => each.id === id);
      if (index !== -1) return cardsHere.splice(index, 1)[0];
    }
    throw new Error(`Card ${id} is not in any pile`);
  }

  act(action, by = 'ME') {
    this.actions.push({ by, ...action });
    switch (action.type) {
      case 'MOVE': {
        this.piles[action.toPileId].push(this.#take(action.pileableId)); // faceUp untouched (D43: only a `hand` source/target auto-reveals)
        break;
      }
      case 'FLIP': {
        const found = Object.values(this.piles).flat().find((each) => each.id === action.pileableId);
        found.faceUp = !found.faceUp;
        break;
      }
      default: {
        throw new Error(`FakeWarTable does not model ${action.type}`);
      }
    }
  }

  say(text, data) { this.talk.push({ text, data }); }

  /**
   * `act()` above is synchronous, so a real wait is never needed here -
   * this only exists so `WarBot`'s own confirm-after-every-action calls
   * (`#actAndConfirm`, added after a real live race was found - see
   * `bot.mjs`'s own header) have something to call against a fake table
   * too, same contract as the real harness peer's `waitForView`.
   */
  async waitForView(predicate, argument) {
    if (!predicate(this.view(), argument)) throw new Error('FakeWarTable: waitForView predicate never became true');
    return this.view();
  }
}
