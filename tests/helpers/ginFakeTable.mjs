// The in-memory Gin table both the rule-list and the question-file bot
// tests drive (US-120, US-125). Extracted from `ginBot.test.js` when a
// second suite needed it - one table, not two copies.
const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ pileableType: 'card', id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)], faceUp: true });
const cards = (text) => text.split(' ').map((short) => card(short));

export class TimeoutError extends Error {
  name = 'TimeoutError';
}

/**
 * An in-memory table speaking the harness peer interface (view/act/myId/
 * waitForView/say) with just the reducer actions a Gin bot uses.
 */
export class FakeTable {
  constructor({ mine, theirs, stock }) {
    this.piles = { deck: cards(stock), table: [], 'hand:ME': cards(mine), 'hand:HOST': cards(theirs) };
    this.talk = [];
    this.actions = [];
  }

  myId() { return 'ME'; }

  view() {
    const pile = (id, kind) => ({ id, kind, cards: this.piles[id].map((each) => ({ ...each })) });
    return {
      myHand: this.piles['hand:ME'].map((each) => ({ ...each })),
      piles: [pile('deck', 'deck'), pile('table', 'plain'), pile('hand:HOST', 'hand'), pile('hand:ME', 'hand')],
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
      case 'DRAW': {
        this.piles[`hand:${by}`].push(this.piles.deck.pop());
        break;
      }
      case 'MOVE': {
        this.piles[action.toPileId].push({ ...this.#take(action.pileableId), faceUp: true });
        break;
      }
      case 'FLIP': {
        const flipped = this.piles.table.find((each) => each.id === action.pileableId);
        flipped.faceUp = !flipped.faceUp;
        break;
      }
      default: {
        throw new Error(`FakeTable does not model ${action.type}`);
      }
    }
  }

  async waitForView(predicate, argument, { timeout = 200 } = {}) {
    const deadline = Date.now() + timeout;
    while (!predicate(this.view(), argument)) {
      if (Date.now() > deadline) throw new TimeoutError('timeout');
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    return this.view();
  }

  say(text, data) { this.talk.push({ text, data }); }
}


export { card, cards };
