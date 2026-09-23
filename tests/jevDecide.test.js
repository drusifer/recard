// US-128/D153: one decision, for any game - an optional read, a Choice
// over the options the GAME offers, an optional verify of the pick, and
// one escalation policy the game passes in. Tested on a made-up game so
// nothing here leans on Gin's or RtG's shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../tools/jev/decide.mjs';

const scripted = (...responses) => {
  const seen = [];
  return { seen, async systemOne(request) { seen.push(request); return { model: 'scripted', answers: responses[seen.length - 1] ?? {} }; } };
};
const chose = (id, confidence = 0.9) => ({ __pick__: { type: 'choice', choice: id, confidence, probabilities: { [id]: confidence } } });
const noul = (value) => ({ type: 'noul', noul: value });
const policy = (accepted) => {
  const asked = [];
  return { asked, async resolve(question) { asked.push(question); return { accepted, answered: accepted, why: accepted ? null : 'the table said no' }; } };
};
const choice = { key: '__pick__', instructions: 'Pick one.', criteria: { go: 'go on', stop: 'stop here' } };
const base = { judge: null, state: { me: 1 }, choice, fallback: 'stop', escalation: policy(false) };

test('a read is its own request, and its answers become state for the choice', async () => {
  const judge = scripted({ close: { type: 'score', score: 2 } }, chose('go'));
  const read = { questions: { close: { type: 'score' } }, into: (state, answers) => ({ ...state, read: { close: answers.close.score } }) };
  const result = await decide({ ...base, judge, read });
  assert.equal(judge.seen.length, 2);
  assert.deepEqual(judge.seen[0].questions, read.questions);
  assert.deepEqual(judge.seen[1].state.read, { close: 2 }, 'the choice sees the read');
  assert.equal(result.option, 'go');
});

test('without a read, the choice is the only request', async () => {
  const judge = scripted(chose('go'));
  const result = await decide({ ...base, judge });
  assert.equal(judge.seen.length, 1);
  assert.deepEqual(judge.seen[0].questions, { __pick__: { type: 'choice', instructions: 'Pick one.', criteria: choice.criteria } });
  assert.equal(result.option, 'go');
});

test('an answer naming an option that was not offered cannot take effect', async () => {
  const result = await decide({ ...base, judge: scripted(chose('cheat', 0.99)) });
  assert.equal(result.option, 'stop');
});

test('below the floor, the escalation decides - declined means the fallback, accepted keeps the pick', async () => {
  const declined = policy(false);
  const low = await decide({ ...base, judge: scripted(chose('go', 0.2)), floor: 0.5, escalation: declined });
  assert.equal(low.option, 'stop');
  assert.equal(low.belowFloor, true);
  assert.deepEqual(declined.asked, ['Pick one.']);
  const kept = await decide({ ...base, judge: scripted(chose('go', 0.2)), floor: 0.5, escalation: policy(true) });
  assert.equal(kept.option, 'go');
});

const verify = (id) => (id === 'go' ? { state: { proposed: id }, questions: { allowed: {}, safe: {} }, question: 'Can I go?' } : null);

test('verify: a clear no blocks the pick, names the rule, and asks nobody', async () => {
  const asked = policy(true);
  const result = await decide({ ...base, judge: scripted(chose('go'), { allowed: noul(0.9), safe: noul(0.05) }), verify, escalation: asked });
  assert.equal(result.option, 'stop');
  assert.deepEqual(result.blocked, { rule: 'safe', why: 'the rule says no' });
  assert.deepEqual(asked.asked, []);
});

test('verify: unsure rules are escalated ONCE, together, and the answer is abided by', async () => {
  const yes = policy(true);
  const kept = await decide({ ...base, judge: scripted(chose('go'), { allowed: noul(0.5), safe: noul(0.5) }), verify, escalation: yes });
  assert.deepEqual(yes.asked, ['Can I go?']);
  assert.equal(kept.option, 'go');
  assert.deepEqual(kept.asked, { rules: ['allowed', 'safe'], answered: true });
  const refused = await decide({ ...base, judge: scripted(chose('go'), { allowed: noul(0.5), safe: noul(0.9) }), verify });
  assert.equal(refused.option, 'stop');
  assert.deepEqual(refused.blocked, { rule: 'allowed', why: 'the table said no' });
});

test('verify: a pick with nothing to check is played without another request', async () => {
  const judge = scripted(chose('stop'));
  const result = await decide({ ...base, judge, verify });
  assert.equal(judge.seen.length, 1);
  assert.equal(result.option, 'stop');
});
