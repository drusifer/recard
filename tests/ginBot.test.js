import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GinBot, summaryLine } from '../tools/gin/bot.mjs';
import { knockEarly, defensive } from '../tools/gin/strategies.mjs';

import { FakeTable } from './helpers/ginFakeTable.mjs';

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

test('nextMove waits until the opponent has drawn and discarded, then says it is a move', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly(), firstPlayer: 'opponent' });
  setTimeout(() => {
    table.act({ type: 'DRAW', pileId: 'deck' }, 'HOST');
    table.act({ type: 'MOVE', pileableId: 'K-spades-0', toPileId: 'table' }, 'HOST');
  }, 20);
  assert.equal(await bot.nextMove(), 'move');
  const draw = await bot.step();
  assert.equal(draw.phase, 'draw');
  assert.deepEqual(draw.observation.opponentDiscards.map((each) => each.id), ['K-spades-0']);
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
  // US-121: every decision is narrated now, so the draw speaks first
  // and the knock is the last line - still ONE line for the knock.
  assert.equal(table.talk.length, 2);
  assert.match(table.talk.at(-1).text, /^Knock! .* deadwood 4/);
  assert.equal(table.talk.at(-1).data.declare, 'knock');
  assert.equal(table.talk.at(-1).data.deadwood, 4);
  assert.equal(table.talk.at(-1).data.melds.length, 3);
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

// ---- US-121/D142: every decision is narrated on table talk ----

test('an ordinary draw is said at the table, with the whole decision record attached', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  const record = await bot.step();

  assert.equal(table.talk.length, 1, 'one line per decision');
  const [line] = table.talk;
  assert.match(line.text, /^Drew from stock/, 'the text is the move in a few words');
  assert.equal(line.data.kind, 'bot-decision');
  assert.equal(line.data.strategy, record.strategy);
  assert.equal(line.data.iteration, record.iteration);
  assert.equal(line.data.decision.type, 'draw');
  assert.ok(line.data.trace.some((step) => step.fired), 'the rule that fired travels with it');
  assert.equal(typeof line.data.facts.deadwood, 'number', 'the facts the rules read travel too');
});

test('a discard says which card, by name', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  await bot.step();
  table.talk.length = 0;
  await bot.step();

  assert.equal(table.talk.length, 1);
  assert.match(table.talk[0].text, /^Discarded [0-9AJQK]+[\u2660\u2663\u2665\u2666]$/);
  assert.equal(table.talk[0].data.decision.type, 'discard');
});

test('a waiting turn says nothing - the table is not narrated at, only decided at', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly(), firstPlayer: 'opponent' });
  await bot.step();
  assert.deepEqual(table.talk, []);
});

test('a knock still reads as a knock, and carries the decision record on the same line', async () => {
  const table = new FakeTable({ mine: 'Ah 2h 3h 9c 9d 9s Js Qs Ks 5d', theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  await bot.step();
  table.talk.length = 0;
  await bot.step();

  assert.equal(table.talk.length, 1, 'a knock is not said twice');
  const [line] = table.talk;
  assert.match(line.text, /^Knock!/);
  assert.equal(line.data.kind, 'bot-decision');
  assert.equal(line.data.declare, 'knock');
  assert.ok(line.data.decision, 'the decision record rides along with the announcement');
  assert.equal(line.data.melds.length, 3, 'the knock details are still there');
});

test('a bot asked to leave stops BETWEEN turns, never half-way through one', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  let leave = false;
  const shouldStop = () => leave;

  // It is this bot's turn: asked to leave, it stops without acting.
  leave = true;
  assert.equal(await bot.nextMove({ shouldStop }), 'done');
  assert.equal(table.piles['hand:ME'].length, 10, 'it drew nothing on the way out');

  // Not asked, it plays as usual.
  leave = false;
  assert.equal(await bot.nextMove({ shouldStop }), 'move');
});

test('asked to leave AFTER drawing, it still discards first - a turn is draw and discard (C4)', async () => {
  const table = new FakeTable({ mine: HEAVY, theirs: THEIRS, stock: STOCK });
  const bot = new GinBot({ peer: table, strategy: knockEarly() });
  let leave = false;
  const shouldStop = () => leave;
  assert.equal(await bot.nextMove({ shouldStop }), 'move');
  await bot.step(); // drew: 11 cards
  leave = true;
  assert.equal(await bot.nextMove({ shouldStop }), 'move', 'the discard is still owed');
  await bot.step();
  assert.equal(table.piles['hand:ME'].length, 10, 'it never walks away holding 11 cards');
  assert.equal(await bot.nextMove({ shouldStop }), 'done');
});
