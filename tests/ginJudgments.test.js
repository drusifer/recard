import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ginRequest, askJev, THREAT_LEVELS } from '../tools/gin/judgments.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';

const SUITS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const card = (short) => ({ id: `${short.slice(0, -1)}-${SUITS[short.at(-1)]}-0`, rank: short.slice(0, -1), suit: SUITS[short.at(-1)] });
const cards = (text) => (text ? text.split(' ').map((short) => card(short)) : []);
const observation = (phase = 'discard') => ({
  handNumber: 1, phase, outcome: null, hand: cards(phase === 'discard' ? 'Ah 2h 3h 9c 9d 9s Js Qs 5d 7c Kd' : 'Ah 2h 3h 9c 9d 9s Js Qs 5d 7c'),
  discardPile: cards('4c 8h'), stockCount: 25, stockDrawn: 7, opponentHandSize: 10,
  opponentDiscards: cards('Kc 8h'), opponentTook: cards('4c'), myDiscards: cards('Qd'), takenFromDiscard: null,
});

// A scripted judge: records every request, answers like the real API.
function fakeJudge(answer) {
  const requests = [];
  return {
    requests,
    async systemOne(request) {
      requests.push(request);
      return { model: 'jev-test', usage: { input_tokens: 1, output_tokens: 1 }, answers: answer(request) };
    },
  };
}

test('ginRequest: one threat Score plus one Noul per top discard candidate, all over one public state', () => {
  const obs = observation();
  const { state, questions } = ginRequest(obs, computeFacts(obs));
  assert.equal(questions.opponent_threat.type, 'score');
  assert.deepEqual(questions.opponent_threat.criteria, THREAT_LEVELS);
  const helps = Object.keys(questions).filter((id) => id.startsWith('helps_'));
  assert.equal(helps.length, 4, 'the four best discards are judged, speculatively');
  assert.match(questions.helps_0.instructions, /King of diamonds|7 of clubs|5 of diamonds|Queen of spades|Jack of spades/);
  assert.deepEqual(state.opponent.tookFromDiscardPile, ['4 of clubs']);
  assert.deepEqual(state.opponent.discarded, ['King of clubs', '8 of hearts']);
  assert.equal(state.stock.remaining, 25);
});

test('askJev: exactly one request per decision, answers mapped to typed judgments by card id', async () => {
  const obs = observation();
  const facts = computeFacts(obs);
  const judge = fakeJudge((request) => Object.fromEntries(Object.keys(request.questions).map((id, index) => [id,
    id === 'opponent_threat'
      ? { type: 'score', score: 2.6, confidence: 0.7, probabilities: {}, legend: {} }
      : { type: 'noul', noul: index / 10 }])));
  const judgments = await askJev(judge, obs, facts);
  assert.equal(judge.requests.length, 1);
  assert.equal(judgments.threat, 2.6);
  assert.equal(judgments.threatConfidence, 0.7);
  const candidateIds = facts.discards.slice(0, 4).map((option) => option.card.id);
  assert.deepEqual(Object.keys(judgments.helps), candidateIds);
  assert.equal(judgments.helps[candidateIds[0]], 0.1);
});

test('askJev: no request outside the discard phase - there is no judgment to make', async () => {
  const judge = fakeJudge(() => ({}));
  const obs = observation('draw');
  assert.equal(await askJev(judge, obs, computeFacts(obs)), null);
  assert.equal(judge.requests.length, 0);
});
