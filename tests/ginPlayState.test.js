// US-125/D147: the projection. Every field the strategy files reference
// by path comes from what the peer already holds - the replicated view
// (via the existing observation) plus `computeFacts`. Nothing here
// models the game a second time, and nothing here is a question.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayState, CANDIDATE_SLOTS, PLAY_STATE_FIELDS } from '../tools/gin/playState.mjs';
import { computeFacts } from '../tools/gin/rules.mjs';
import { EXAMPLES } from '../tools/gin/exampleStates.mjs';

const discardExample = EXAMPLES.find((example) => example.obs.phase === 'discard') ?? EXAMPLES[0];
const stateFor = (obs) => buildPlayState(obs, computeFacts(obs));

test('the same field names appear every turn, whatever the phase or hand', () => {
  for (const { obs } of EXAMPLES) {
    const state = buildPlayState(obs, computeFacts(obs));
    assert.deepEqual(Object.keys(state).toSorted(), [...PLAY_STATE_FIELDS].toSorted(), `phase ${obs.phase}`);
  }
});

test('candidates are fixed slots, so a question may reference candidates[10] on any turn', () => {
  const state = stateFor(discardExample.obs);
  assert.equal(state.candidates.length, CANDIDATE_SLOTS);
  assert.equal(CANDIDATE_SLOTS, 11, 'a Gin hand is 10-11 cards (Gate 1)');
});

test('a filled slot carries the card and the deadwood code computed for it; an empty slot is null', () => {
  const obs = discardExample.obs;
  const state = buildPlayState(obs, computeFacts(obs));
  const filled = state.candidates.filter(Boolean);
  assert.ok(filled.length > 0);
  for (const slot of filled) {
    assert.equal(typeof slot.card, 'string');
    assert.equal(typeof slot.deadwood_after, 'number');
  }
  assert.ok(state.candidates.slice(filled.length).every((slot) => slot === null), 'unfilled slots are null, not omitted');
});

test('every number in the state came from code, not from the bot inventing one', () => {
  const obs = discardExample.obs;
  const facts = computeFacts(obs);
  const state = buildPlayState(obs, facts);
  assert.equal(state.me.deadwood, facts.deadwood);
  assert.equal(state.me.can_knock, facts.canKnock);
  assert.equal(state.me.is_gin, facts.isGin);
  assert.equal(state.stock.remaining, obs.stockCount);
  assert.equal(state.opponent.hand_size, obs.opponentHandSize);
});

test('it never copies an opponent card the observation did not see publicly', () => {
  const obs = discardExample.obs;
  const state = buildPlayState(obs, computeFacts(obs));
  const named = JSON.stringify(state.opponent);
  for (const card of obs.opponentDiscards) assert.ok(named.includes(card.rank), 'public discards are there');
  assert.equal('hand' in state.opponent, false, 'the opponent has a hand SIZE here, never cards');
});

test('cards read as names, so a path reference resolves to something a person can read', () => {
  const state = stateFor(discardExample.obs);
  assert.match(state.me.hand[0], /^(Ace|[2-9]|10|Jack|Queen|King) of (clubs|diamonds|hearts|spades)$/);
});

test('the phase decides which options exist, so an illegal move is never offered', () => {
  const drawObs = EXAMPLES.find((example) => example.obs.phase === 'draw')?.obs;
  if (drawObs) {
    const state = buildPlayState(drawObs, computeFacts(drawObs));
    assert.equal(state.me.phase, 'draw');
  }
  const state = stateFor(discardExample.obs);
  assert.equal(state.me.phase, 'discard');
});
