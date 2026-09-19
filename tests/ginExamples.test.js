import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, evaluateExamples } from '../tools/gin/exampleStates.mjs';
import { STRATEGIES } from '../tools/gin/strategies.mjs';

test('every example state is evaluated by every strategy, with the rule that decided it', async () => {
  const results = await evaluateExamples();
  assert.equal(results.length, EXAMPLES.length);
  for (const result of results) {
    assert.deepEqual(Object.keys(result.decisions), Object.keys(STRATEGIES));
    for (const { decision, decidedBy } of Object.values(result.decisions)) {
      assert.ok(decision.type === 'draw' || decision.type === 'discard');
      assert.ok(decidedBy);
    }
    // Draw decisions ask Jev nothing; every discard's answers are labelled
    // as assumed when no judge is passed - never passed off as Jev.
    if (result.judgments) assert.equal(result.judgments.source, 'assumed');
    else assert.equal(result.jevQuestions.length, 0);
  }
});
