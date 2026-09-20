// US-121/D142: the bubble's history is the talk log, filtered by who
// said it - this is that filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionsBySpeaker, latestThought } from '../src/botThoughts.js';

const decision = (seq, from, text, extra = {}) => ({
  seq, from, name: from, text, data: { kind: 'bot-decision', iteration: seq, decision: { type: 'draw' }, ...extra },
});

test('a bot\'s decisions come back in order, under its own name', () => {
  const talk = [decision(1, 'k1', 'Drew from stock'), { seq: 2, from: 'k2', name: 'Alice', text: 'hi there' }, decision(3, 'k1', 'Discarded 9♣')];
  const bySpeaker = decisionsBySpeaker(talk);
  assert.deepEqual([...bySpeaker.keys()], ['k1']);
  assert.deepEqual(bySpeaker.get('k1').decisions.map((d) => d.text), ['Drew from stock', 'Discarded 9♣']);
  assert.equal(bySpeaker.get('k1').name, 'k1');
});

test('two bots keep two separate histories', () => {
  const bySpeaker = decisionsBySpeaker([decision(1, 'k1', 'a'), decision(2, 'k2', 'b'), decision(3, 'k1', 'c')]);
  assert.deepEqual(bySpeaker.get('k1').decisions.map((d) => d.text), ['a', 'c']);
  assert.deepEqual(bySpeaker.get('k2').decisions.map((d) => d.text), ['b']);
});

test('plain table talk is not a thought', () => {
  assert.equal(decisionsBySpeaker([{ seq: 1, from: 'k1', name: 'Alice', text: 'your turn' }]).size, 0);
});

test('the collapsed bubble shows the latest move, or nothing at all before the first', () => {
  const { decisions } = decisionsBySpeaker([decision(1, 'k1', 'Drew from stock'), decision(2, 'k1', 'Discarded 9♣')]).get('k1');
  assert.equal(latestThought(decisions), 'Discarded 9♣');
  assert.equal(latestThought([]), null);
  assert.equal(latestThought(undefined), null);
});

test('the full record travels with each entry, for the expanded view', () => {
  const talk = [decision(1, 'k1', 'Drew from stock', { judgments: { threat: 2.5 }, trace: [{ rule: 'takeUpcardIfMelds', fired: true }] })];
  const [entry] = decisionsBySpeaker(talk).get('k1').decisions;
  assert.equal(entry.judgments.threat, 2.5);
  assert.deepEqual(entry.trace, [{ rule: 'takeUpcardIfMelds', fired: true }]);
});
