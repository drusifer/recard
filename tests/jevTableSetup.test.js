// D159: what the host does once everyone is seated, and how each bot is
// started, both worked out from the table file - pure, so no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps, botArguments } from '../tools/jev/tableSetup.mjs';

const seated = [{ id: 'a1', name: 'Ann' }, { id: 'b2', name: 'Bob' }];
const rtg = {
  deal: 7, score: 20,
  opening: { say: ['Roll for first'], each_seat: ['{name}, roll:', '/roll d20'] },
};

test('deal, then a starting score per seat, then the opening - in that order', () => {
  assert.deepEqual(setupSteps(rtg, { seated, deckId: 'deck-1' }), [
    { act: { type: 'DEAL', pileId: 'deck-1', cardsPerPlayer: 7 } },
    { act: { type: 'SET_SCORE', targetPlayerId: 'a1', value: 20 } },
    { act: { type: 'SET_SCORE', targetPlayerId: 'b2', value: 20 } },
    { say: 'Roll for first' },
    { say: 'Ann, roll:' }, { say: '/roll d20' },
    { say: 'Bob, roll:' }, { say: '/roll d20' },
  ]);
});

test('a game that deals nothing and scores nothing does neither', () => {
  const steps = setupSteps({ deal: null, score: null, opening: { say: [], each_seat: [] } }, { seated, deckId: 'd' });
  assert.deepEqual(steps, []);
  assert.equal(setupSteps({ ...rtg, deal: 0, score: null, opening: { say: [], each_seat: [] } }, { seated, deckId: 'd' }).length, 0,
    'a deal of 0 is no deal');
});

test('one seat has nobody to open against, so the opening is skipped', () => {
  const steps = setupSteps(rtg, { seated: [seated[0]], deckId: 'd' });
  assert.equal(steps.some((step) => step.say), false);
  assert.equal(steps.length, 2, 'the deal and the one score still happen');
});

test('a bot is started with the game, its player, the table, the deck, and the game\'s own step limit', () => {
  assert.deepEqual(botArguments({ game: 'rtg', strategy: 'rules', code: 'C1', baseUrl: 'https://table.test', deckId: 'deck-1', table: { steps: 40, seat_args: [] }, seat: 0 }),
    ['--game', 'rtg', '--strategy', 'rules', '--code', 'C1', '--url', 'https://table.test', '--deck', 'deck-1', '--steps', '40']);
});

test('no step limit is passed when the game has none', () => {
  const argv = botArguments({ game: 'gin', strategy: 'jev-cagey', code: 'C', baseUrl: 'https://table.test', deckId: 'd', table: { steps: null, seat_args: [] }, seat: 0 });
  assert.equal(argv.includes('--steps'), false);
});

test('each seat gets its own flags, by seating order', () => {
  const table = { steps: null, seat_args: [{ first: 'bot' }, { first: 'opponent', hands: 2 }] };
  const base = { game: 'gin', strategy: 's', code: 'C', baseUrl: 'https://table.test', deckId: 'd', table };
  assert.deepEqual(botArguments({ ...base, seat: 0 }).slice(-2), ['--first', 'bot']);
  assert.deepEqual(botArguments({ ...base, seat: 1 }).slice(-4), ['--first', 'opponent', '--hands', '2']);
  assert.equal(botArguments({ ...base, seat: 2 }).includes('--first'), false, 'a seat past the list gets none');
});
