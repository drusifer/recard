import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GinBot, summaryLine } from '../tools/gin/bot.mjs';
import { knockEarly, defensive } from '../tools/gin/strategies.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ pileableType: 'card', id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)], faceUp: true });
const cards = (text) => text.split(' ').map((short) => card(short));

class TimeoutError extends Error {
  name = 'TimeoutError';
}

/**
 * An in-memory table speaking the harness peer interface (view/act/myId/
 * waitForView/say) with just the reducer actions a Gin bot uses.
 */
class FakeTable {
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

const HEAVY = 'Ah 3c 5d 7s 9h Jc Kd 2s 4h 6c';
const THEIRS = '2c 4c 6d 8d 10h Qc Ks As 3d 5c';
// Stock top is the LAST card (pop). Keep it low so knocking math is predictable.
const STOCK = '8c 8h Qh Qd 10s 10c 4s';

test('one turn: draw from stock, then discard; then it waits for the opponent without acting', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });

  const draw = await bot.step();
  assert.equal(draw.phase, 'draw');
  assert.deepEqual(draw.decision, { type: 'draw', source: 'stock' });
  assert.deepEqual(draw.actions, [{ type: 'DRAW', pileId: 'deck' }]);
  assert.equal(table.piles['hand:ME'].length, 11);

  const discard = await bot.step();
  assert.equal(discard.phase, 'discard');
  assert.equal(discard.decision.declare, 'none');
  assert.equal(table.piles.table.at(-1).id, discard.decision.cardId);
  assert.equal(table.piles['hand:ME'].length, 10);

  const idle = await bot.step();
  assert.equal(idle.phase, 'wait');
  assert.equal(idle.decision, null);
  assert.deepEqual(idle.actions, []);
});

test('waitForTurn returns once the opponent has drawn and discarded', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly(), firstPlayer: 'opponent' });
  setTimeout(() => {
    table.act({ type: 'DRAW', pileId: 'deck' }, 'HOST');
    table.act({ type: 'MOVE', pileableId: 'K-spades-0', toPileId: 'table' }, 'HOST');
  }, 20);
  const obs = await bot.waitForTurn({ timeoutMs: 2000 });
  assert.equal(obs.phase, 'draw');
  assert.deepEqual(obs.opponentDiscards.map((each) => each.id), ['K-spades-0']);
});

test('a knock is a face-down discard, announced on table talk with melds and deadwood', async () => {
  // A-2-3 hearts, three 9s, J-Q-K spades + 5d; it draws the 4s and throws the 5d.
  const table = new FakeTable({ mine: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d', theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  await bot.step(); // draws the 4s
  const knock = await bot.step();

  assert.equal(knock.decision.declare, 'knock');
  assert.deepEqual(knock.actions.map((action) => action.type), ['MOVE', 'FLIP']);
  assert.equal(table.piles.table.at(-1).faceUp, false, 'the knock card lies face down');
  assert.equal(table.talk.length, 1);
  assert.match(table.talk[0].text, /^Knock! .* deadwood 4/);
  assert.equal(table.talk[0].data.declare, 'knock');
  assert.equal(table.talk[0].data.deadwood, 4);
  assert.equal(table.talk[0].data.melds.length, 3);
  assert.match(summaryLine(knock), /hand 1 discard: KNOCK 5♦ \(knockWhenAble\) \| deadwood 4/, 'card names, not ids');

  const after = await bot.step();
  assert.equal(after.phase, 'hand-over');
  assert.equal(after.decision, null);
});

test('a Jev strategy asks the judge once per discard decision and never for a draw', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const requests = [];
  const judge = {
    async systemOne(request) {
      requests.push(request);
      const answers = Object.fromEntries(Object.keys(request.questions).map((id) => [id,
        id === 'opponent_threat' ? { type: 'score', score: 0.5, confidence: 0.9 } : { type: 'noul', noul: 0.3 }]));
      return { model: 'jev-fake', answers, usage: {} };
    },
  };
  const bot = new GinBot({ peer: table, strategy: defensive(), judge });
  const draw = await bot.step();
  assert.equal(requests.length, 0);
  assert.equal(draw.judgments, null);
  const discard = await bot.step();
  assert.equal(requests.length, 1);
  assert.equal(discard.judgments.threat, 0.5);
  assert.equal(discard.judgments.model, 'jev-fake');
});

test('a bot with no hand yet (joined before the deal) waits rather than drawing', async () => {
  const table = new FakeTable({ mine: 'Ah', theirs: THEIRS, stock: STOCK });
  table.piles['hand:ME'] = [];
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  const record = await bot.step();
  assert.equal(record.phase, 'wait');
  assert.deepEqual(table.actions, []);
});
