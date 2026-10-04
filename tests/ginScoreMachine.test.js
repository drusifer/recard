// games/gin/scoring.yaml, loaded and actually run - the statechart
// sibling of tests/jevMachine.test.js (turn.yaml's own), proving the
// file's states/transitions/library names are correct AND that a real
// run produces the right running totals and game-over call. Direct
// user request: the scoring RULES (undercut? gin? which bonus?) are
// this file's own named states now, not one function - these tests
// exercise each of those states (gin/knock/undercut) explicitly, not
// just the end-to-end total.
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

function sendHand(actor, payload) {
  actor.send({ type: 'HAND_OVER', ...payload });
}

test('games/gin/scoring.yaml loads - every guard/action/actor name is real', () => {
  const { config } = loadScoring(FILE.pathname, { library: ginScoreLibrary({}) });
  assert.equal(config.initial, 'waiting_for_hand');
});

test('an unknown library name is refused at load, naming the file and the bad name', () => {
  const text = readFileSync(FILE.pathname, 'utf8').replace('src: gin_measure', 'src: gin_measrue');
  assert.throws(() => parseScoring(text, { file: 'games/gin/scoring.yaml', library: ginScoreLibrary({}) }),
    /games\/gin\/scoring\.yaml.*no actor "gin_measrue".*did you mean "gin_measure"/s);
});

test('a clean knock below target: the knocker gets the deadwood DIFFERENCE, no bonus; game waits for the next hand', async () => {
  const logged = [];
  const actor = startMachine(logged);
  sendHand(actor, {
    knockerId: 'A', opponentId: 'B', outcome: 'knock',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), // deadwood 5
    opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h'), // deadwood 57, no layoff
  });
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && Object.keys(snapshot.context.totals).length > 0);
  assert.deepEqual(actor.getSnapshot().context.totals, { A: 52 }, '57 - 5, no bonus');
  assert.match(logged[0], /hand measured: knocker 5 deadwood, opponent 57 after 0 laid off/);
});

test('gin that reaches the target: the knocker gets the opponent\'s FULL deadwood plus the gin bonus, game ends', async () => {
  const logged = [];
  const actor = startMachine(logged, 50); // the hand below scores 82 - past target on the first hand
  sendHand(actor, {
    knockerId: 'A', opponentId: 'B', outcome: 'gin',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5c'), // deadwood 0
    opponentHand: hand('6c Kd Qs Jh 9h 8d 4h'), // deadwood 57, gin forbids layoff -> 57 + 25 = 82
  });
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  assert.deepEqual(actor.getSnapshot().context.totals, { A: 82 });
  assert.match(logged.at(-1), /game over: A wins with 82 \(target 50\)/);
});

test('undercut: a knock whose opponent lays off to AT OR BELOW the knocker\'s own deadwood flips the win - the OPPONENT scores, plus the undercut bonus', async () => {
  const actor = startMachine();
  sendHand(actor, {
    knockerId: 'A', opponentId: 'B', outcome: 'knock',
    knockerHand: hand('7h 7s 7d 2c 3c 4c Kd'), // deadwood 10 (Kd)
    opponentHand: hand('8h 8s 8d 9c 10c Jc Qc'), // melds to 0 on its own - undercuts without even needing a layoff
  });
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && Object.keys(snapshot.context.totals).length > 0);
  const totals = actor.getSnapshot().context.totals;
  assert.deepEqual(totals, { B: 35 }, '(10 - 0) + the 25 undercut bonus, credited to B (the opponent), not A (the knocker)');
  assert.equal(totals.A, undefined, 'the knocker who got undercut scores nothing for this hand');
});

test('gin can never route through undercut, even if the opponent\'s own hand happens to also meld to 0', async () => {
  const actor = startMachine();
  sendHand(actor, {
    knockerId: 'A', opponentId: 'B', outcome: 'gin',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5c'), // deadwood 0 - gin
    opponentHand: hand('8h 8s 8d 9c 10c Jc Qc'), // ALSO melds to 0 - would read as "undercut" by raw <= comparison alone
  });
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && Object.keys(snapshot.context.totals).length > 0);
  // checking_gin runs BEFORE checking_undercut (the file's own structural guarantee,
  // not an arithmetic coincidence) - so this is gin_award_gin (knocker A +25), never
  // gin_award_undercut (which would have credited B instead).
  assert.deepEqual(actor.getSnapshot().context.totals, { A: 25 }, 'gin: opponent deadwood (0) + the 25 gin bonus, to the KNOCKER');
});

test('two hands accumulate the SAME player\'s total across HAND_OVERs, not overwrite it', async () => {
  const actor = startMachine([], 80); // one hand (52) stays below; two (104) crosses it
  const first = { knockerId: 'A', opponentId: 'B', outcome: 'knock',
    knockerHand: hand('7h 7s 7d 2c 3c 4c 5s'), opponentHand: hand('Kd Qs Jh 9c 8d 6h 4h') }; // A +52
  sendHand(actor, first);
  await waitFor(actor, (snapshot) => snapshot.value === 'waiting_for_hand' && snapshot.context.totals.A === 52);
  sendHand(actor, first); // same shape, same winner A - +52 again
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  assert.equal(actor.getSnapshot().context.totals.A, 104, 'accumulated, not overwritten');
});
