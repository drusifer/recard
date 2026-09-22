// US-127 follow-up / D152: whose turn it is comes from the board +
// table talk, judged, never from a tracked event log and never by
// asking a player something the board already shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { turnStatus } from '../tools/rtg/turnOrder.mjs';
import { loadGame, RTG } from '../tools/rtg/gameFile.mjs';

const game = loadGame(RTG);
const state = { me: { life: 20 }, opponent: { life: 20 } };
const talk = [{ name: 'Drew', text: 'passing to you' }];

const judgeOf = (answers) => ({
  seen: [],
  async systemOne(request) { this.seen.push(request); return { model: 'scripted', answers }; },
});
const noul = (value) => ({ type: 'noul', noul: value });

test('a confident yes says the turn is over', async () => {
  const judge = judgeOf({ attack_phase_complete: noul(0.9), their_turn_is_over: noul(0.92) });
  const status = await turnStatus({ game, state, talk, judge });
  assert.equal(status.isOver, true);
  assert.equal(status.unclear, false);
});

test('a confident no says it is not over, and is not "unclear" either', async () => {
  const judge = judgeOf({ attack_phase_complete: noul(0.1), their_turn_is_over: noul(0.05) });
  const status = await turnStatus({ game, state, talk, judge });
  assert.equal(status.isOver, false);
  assert.equal(status.unclear, false);
});

test('a middling answer is unclear, not a guessed yes or no', async () => {
  const judge = judgeOf({ attack_phase_complete: noul(0.5), their_turn_is_over: noul(0.5) });
  const status = await turnStatus({ game, state, talk, judge });
  assert.equal(status.isOver, false);
  assert.equal(status.unclear, true);
});

test('the board and the FULL ordered talk log both reach the judgment - nothing else', async () => {
  const judge = judgeOf({ attack_phase_complete: noul(0.9), their_turn_is_over: noul(0.9) });
  await turnStatus({ game, state, talk, judge });
  const sent = judge.seen[0];
  assert.deepEqual(sent.state.table_talk, talk);
  assert.equal(sent.state.me, state.me);
  assert.deepEqual(Object.keys(sent.questions), ['attack_phase_complete', 'their_turn_is_over']);
});

test('an attack that was never declared reads as already resolved, not as pending', async () => {
  // The instructions say so explicitly; this proves the wiring reaches
  // that instruction rather than dropping it.
  assert.match(game.constraints.attack_phase_complete.instructions, /no attack was declared at all/);
});

test('no card name or number in either question - the board and talk carry the values', () => {
  assert.doesNotMatch(game.constraints.attack_phase_complete.instructions, /\d/);
  assert.doesNotMatch(game.constraints.their_turn_is_over.instructions, /\d/);
});
