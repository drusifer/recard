// US-129/D154-shaped: War's turn is computed, not judged (there is
// nothing to decide - `games/war/questions.yaml`), so these drive
// `WarBot` directly against a fake table, the same level `ginBot.test.js`
// tests Gin at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WarBot } from '../tools/war/bot.mjs';
import { FakeWarTable } from './helpers/warFakeTable.mjs';

test('real bug, found live: seated before the DEAL step converts piles to `deck` kind - waits, does not declare done', async () => {
  // Before `DEAL`/`applyPlayerPileKind` runs, War's player piles are
  // still whatever kind they started as (not yet `deck`) - exactly the
  // shape a bot sees if its own seat starts looking before the host's
  // setup step finishes (US-129 live finding: this used to read as "0
  // cards left" and end the run with zero moves ever made).
  const peer = {
    myId: async () => 'ME',
    view: async () => ({ piles: [
      { id: 'hand:ME', kind: 'hand', ownerId: 'ME', cards: [] },
      { id: 'hand:HOST', kind: 'hand', ownerId: 'HOST', cards: [] },
      { id: 'table', kind: 'plain', ownerId: null, cards: [] },
    ] }),
  };
  const bot = new WarBot({ peer });
  const look = await bot.look();
  assert.equal(look.phase, 'wait', 'no deck-kind pile exists yet - wait for the deal, do not call it done');
});

test('an ordinary round: higher card wins, winner collects both face-up', async () => {
  const table = new FakeWarTable({ mine: 'Kc', theirs: '5h' });
  const bot = new WarBot({ peer: table });

  const flip = await bot.step();
  assert.equal(flip.phase, 'flip');
  assert.equal(flip.isWarContinuation, false);
  assert.deepEqual(flip.actions.map((a) => a.type), ['MOVE', 'FLIP']);
  assert.equal(table.piles.table.at(-1).faceUp, true);

  // The opponent's own bot/person flips their card.
  table.act({ type: 'MOVE', pileableId: '5-hearts-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: '5-hearts-0' }, 'HOST');

  const look = await bot.look();
  assert.equal(look.phase, 'collect', 'King beats 5 - I collect');

  const collect = await bot.step();
  assert.equal(collect.phase, 'collect');
  assert.equal(collect.winner, 'me');
  assert.equal(table.piles.table.length, 0, 'the pot is cleared');
  assert.equal(table.piles['deck:ME'].length, 2, 'won both cards');
  assert.ok(table.piles['deck:ME'].every((card) => card.faceUp === false), 'collected cards go back face-down');
});

test('the loser never collects - it just waits', async () => {
  const table = new FakeWarTable({ mine: '5h', theirs: 'Kc' });
  const bot = new WarBot({ peer: table });
  await bot.step(); // flips the 5
  table.act({ type: 'MOVE', pileableId: 'K-clubs-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: 'K-clubs-0' }, 'HOST');

  const look = await bot.look();
  assert.equal(look.phase, 'wait');
  const step = await bot.step();
  assert.equal(step.actions.length, 0, 'a wait does nothing to the table');
});

test('a tie triggers the war procedure: 3 face-down + 1 face-up each, then the higher wins the whole pot', async () => {
  // Both start with a 7, then four more cards each behind it (deck TOP
  // is the LAST card in the fixture string - matches D21's own convention).
  const table = new FakeWarTable({ mine: '2c 3c 4c Ac 7h', theirs: '2d 3d 4d Kd 7s' });
  const bot = new WarBot({ peer: table });

  await bot.step(); // my 7h
  table.act({ type: 'MOVE', pileableId: '7-spades-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: '7-spades-0' }, 'HOST');

  const tied = await bot.look();
  assert.equal(tied.phase, 'flip');
  assert.equal(tied.isWarContinuation, true, '7h and 7s tie');

  const war = await bot.step();
  assert.equal(war.isWarContinuation, true);
  assert.equal(war.cards.length, 4, '3 face-down + 1 face-up');
  assert.equal(table.piles.table.filter((c) => c.faceUp).length, 3, 'the tied pair stays face-up, plus my new war card');

  // The opponent plays their own war cards: Kd face-up beats my Ac... wait, Ace is high in War.
  table.act({ type: 'MOVE', pileableId: '4-diamonds-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'MOVE', pileableId: '3-diamonds-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'MOVE', pileableId: '2-diamonds-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'MOVE', pileableId: 'K-diamonds-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: 'K-diamonds-0' }, 'HOST');

  const resolved = await bot.look();
  assert.equal(resolved.phase, 'collect', 'Ace beats King - I collect the whole 10-card pot');
  const collect = await bot.step();
  assert.equal(collect.cards.length, 10);
  assert.equal(table.piles['deck:ME'].length, 10);
  assert.ok(table.piles['deck:ME'].every((card) => card.faceUp === false), 'the war\'s face-up cards go back face-down too');
});

test('done once MY deck is empty at a round boundary (lost, pot already settled)', async () => {
  const table = new FakeWarTable({ mine: '2c', theirs: 'Kh' });
  const bot = new WarBot({ peer: table });
  await bot.step(); // flips my only card (2c); my deck is now empty
  table.act({ type: 'MOVE', pileableId: 'K-hearts-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: 'K-hearts-0' }, 'HOST');
  let look = await bot.look();
  assert.equal(look.phase, 'wait', 'opponent won this round - still waiting for THEM to collect, not done yet');

  table.piles.table = []; // the opponent's own bot collects the pot
  look = await bot.look();
  assert.equal(look.phase, 'done', 'pot settled, my deck is empty - nothing left for me to do');
});

test('done once the OPPONENT has no cards left, at a round boundary', async () => {
  const table = new FakeWarTable({ mine: 'Kc 2c', theirs: '5h' });
  const bot = new WarBot({ peer: table });
  await bot.step(); // flips my top (2c); I still have Kc behind it
  table.act({ type: 'MOVE', pileableId: '5-hearts-0', toPileId: 'table' }, 'HOST');
  table.act({ type: 'FLIP', pileableId: '5-hearts-0' }, 'HOST'); // their only card - deck:HOST is now empty
  let look = await bot.look();
  assert.equal(look.phase, 'wait', 'opponent won this round - still waiting for their collect, not done yet');

  table.piles.table = []; // the opponent's own bot collects the pot
  look = await bot.look();
  assert.equal(look.phase, 'done', 'I still have a card, but the opponent has none left to ever flip again');
});
