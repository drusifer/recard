// US-128/D153: hearing the table, for any game. Promoted out of `rtg/`
// (US-127), where it was game-agnostic already - only RtG's own words
// ("attack", "untap") stay behind in `rtg/table.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAskTable, readAnswer, trackChange, askPeer } from '../tools/jev/table.mjs';

const said = (name, text) => ({ name, text });

test('a quiet table with a changed state gets asked - but only after a wait', () => {
  const base = { lastStateChangeAt: 1000, lastTalkAt: null, turnKnown: false, quietMs: 8000 };
  assert.equal(shouldAskTable({ ...base, now: 3000 }), false, 'not immediately - people are slower than state');
  assert.equal(shouldAskTable({ ...base, now: 9500 }), true);
});

test('no question when the bot already knows whose turn it is', () => {
  assert.equal(shouldAskTable({ lastStateChangeAt: 1000, lastTalkAt: null, turnKnown: true, now: 99_999 }), false);
});

test('no question when somebody already spoke after the change', () => {
  assert.equal(shouldAskTable({ lastStateChangeAt: 1000, lastTalkAt: 1200, turnKnown: false, now: 99_999 }), false);
});

test('a yes is a yes, a no is a no, and anything else settles nothing', () => {
  assert.equal(readAnswer(said('Drew', 'yes go ahead')), true);
  assert.equal(readAnswer(said('Drew', "no, you can't")), false);
  assert.equal(readAnswer(said('Drew', 'hmm')), null, 'unsettled is not a no');
});

test('a refusal is never read as permission ("you can\'t" contains "you can")', () => {
  for (const refusal of ["no, you can't", "you cannot attack with that", "that's not allowed", "nope"]) {
    assert.equal(readAnswer({ text: refusal }), false, refusal);
  }
});

test('trackChange only stamps a NEW seq - comparing seq to a timestamp directly never equals, which was the live bug', () => {
  const first = trackChange({ seq: null, changedAt: null }, 3, 1000);
  assert.deepEqual(first, { seq: 3, changedAt: 1000 });
  const same = trackChange(first, 3, 5000);
  assert.deepEqual(same, first, 'the same seq again does not restamp the time');
  const next = trackChange(same, 4, 5000);
  assert.deepEqual(next, { seq: 4, changedAt: 5000 });
});

// ---- US-128: asking the table and hearing the answer ----


/**
 * A table where `reply(question)` answers whatever the bot says.
 */
function tableThatAnswers(reply, speaker = 'Drew') {
  const talk = [{ name: 'Drew', text: 'yes, earlier chat' }];
  return {
    talk: async () => [...talk],
    say: async (text) => {
      talk.push({ name: 'bot', text });
      const answer = reply(text);
      if (answer) talk.push({ name: speaker, text: answer });
    },
  };
}

test('asking hears the answer given AFTER the question - the live bug was an ask that could never hear one', async () => {
  const peer = tableThatAnswers(() => "it's your turn, go ahead");
  assert.equal(await askPeer({ peer, name: 'bot', question: 'Is it my turn now?', timeoutMs: 500, pollMs: 5 }), true);
});

test('asking ignores what was said before the question, and the bot\'s own words', async () => {
  const peer = tableThatAnswers(() => null);
  assert.equal(await askPeer({ peer, name: 'bot', question: 'yes?', timeoutMs: 50, pollMs: 5 }), null, 'silence, not the old "yes"');
});

test('asking reads a refusal as a no', async () => {
  const peer = tableThatAnswers(() => 'no, not yet');
  assert.equal(await askPeer({ peer, name: 'bot', question: 'Is it my turn now?', timeoutMs: 500, pollMs: 5 }), false);
});
