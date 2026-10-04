// games/gin/scoring.yaml, loaded and actually run - the statechart
// sibling of tests/jevMachine.test.js (turn.yaml's own), proving the
// file's states/transitions/library names are correct AND that a real
// run produces the right running totals and game-over call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createActor, waitFor } from 'xstate';
import { loadScoring, parseScoring } from '../tools/gin/scoreMachine.mjs';
import { ginScoreLibrary } from '../tools/gin/scoreLibrary.mjs';

const FILE = new URL('../games/gin/scoring.yaml', import.meta.url);

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)] });
const hand = (text) => text.split(' ').map((short) => card(short));

function startMachine(logged = [], target = 100) {
  const { machine } = loadScoring(FILE.pathname, { library: ginScoreLibrary({ log: (line) => { logged.push(line); } }) });
  const actor = createActor(machine, { input: { target } });
  actor.start();
  return actor;
}

test('games/gin/scoring.yaml loads - every guard/action/actor name is real', () => {
  const { config } = loadScoring(FILE.pathname, { library: ginScoreLibrary({}) });
  assert.equal(config.initial, 'waiting_for_hand');
});

test('an unknown library name is refused at load, naming the file and the bad name', () => {
  const text = readFileSync(FILE.pathname, 'utf8').replace('src: gin_score', 'src: gin_scoer');
  assert.throws(() => parseScoring(text, { file: 'games/gin/scoring.yaml', library: ginScoreLibrary({}) }),
    /games\/gin\/scoring\.yaml.*no actor "gin_scoer".*did you mean "gin_score"/s);
});

test('a knock below target: points are awarded, the game waits for the next hand', async () => {
  const logged = [];
  const actor = startMachine(logged);
  actor.send({
    type: 'HAND_OVER',
    knockerId: 'A', opponentId: 'B', outcome: 'knock',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // deadwood 5
    opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h'), // deadwood 57, no layoff
  });
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && Object.keys(snapshot.context.totals).length > 0);
  assert.deepEqual(actor.getSnapshot().context.totals, { A: 52 });
  assert.match(logged[0], /hand scored: A \+52 \(knock\)/);
});

test('a gin that reaches the target ends the game, in the final state', async () => {
  const logged = [];
  const actor = startMachine(logged, 50); // the hand below scores 82 - past target on the first hand
  actor.send({
    type: 'HAND_OVER',
    knockerId: 'A', opponentId: 'B', outcome: 'gin',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5c'), // deadwood 0
    opponentHand: hand('6c Kd Qs Jh 9h 8d 4h'), // deadwood 57, gin forbids layoff -> 57 + 25 = 82
  });
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  assert.deepEqual(actor.getSnapshot().context.totals, { A: 82 });
  assert.match(logged.at(-1), /game over: A wins with 82 \(target 50\)/);
});

test('two hands accumulate the SAME player\'s total across HAND_OVERs, not overwrite it', async () => {
  const actor = startMachine([], 80); // one hand (52) stays below; two (104) crosses it
  const first = { type: 'HAND_OVER', knockerId: 'A', opponentId: 'B', outcome: 'knock',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h') }; // A +52
  actor.send(first);
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && snapshot.context.totals.A === 52);
  actor.send(first); // same shape, same winner A - +52 again
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  assert.equal(actor.getSnapshot().context.totals.A, 104, 'accumulated, not overwritten');
});
