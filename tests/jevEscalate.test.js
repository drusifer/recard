// US-128/D153: one escalation policy for every judgment that comes back
// unconvinced - a move's constraint, a Choice below its floor, and (P5)
// whose turn it is. What happens next is configuration, not a second
// hand-written path: that is how the D152 stall got written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictOf, askTable, floorFallback } from '../tools/jev/escalate.mjs';

test('a Noul is a yes, a no, or unsure - with the same band everywhere', () => {
  assert.equal(verdictOf(0.9), 'yes');
  assert.equal(verdictOf(0.65), 'yes', 'the band edge counts as convinced');
  assert.equal(verdictOf(0.34), 'no');
  assert.equal(verdictOf(0.35), 'no', 'the other edge too');
  assert.equal(verdictOf(0.5), 'unsure');
  assert.equal(verdictOf(0.5, 0.1), 'unsure');
  assert.equal(verdictOf(0.8, 0.1), 'unsure', 'a tighter band asks more often');
});

test('asking the table: a clear yes is accepted, and it asked once in the words given', async () => {
  const asked = [];
  const outcome = await askTable(async (question) => { asked.push(question); return true; }).resolve('Is it my turn now?');
  assert.deepEqual(asked, ['Is it my turn now?']);
  assert.deepEqual(outcome, { accepted: true, answered: true, why: null });
});

test('asking the table: a no, or silence, is not accepted - and says which it was', async () => {
  assert.deepEqual(await askTable(async () => false).resolve('Can I?'), { accepted: false, answered: false, why: 'the table said no' });
  assert.deepEqual(await askTable(async () => null).resolve('Can I?'), { accepted: false, answered: null, why: 'nobody answered' });
});

test('asking the table with no way to ask is silence, not a yes', async () => {
  assert.deepEqual(await askTable().resolve('Can I?'), { accepted: false, answered: null, why: 'nobody answered' });
});

test('the confidence floor never accepts, and asks nobody', async () => {
  assert.deepEqual(await floorFallback().resolve('anything'), { accepted: false, answered: null, why: 'below the confidence floor' });
});
