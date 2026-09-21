// US-127/D151/AC9-AC11: the bot is drawn in by what the table SAYS, and
// asks out loud when the table says nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnnouncement, shouldAskTable, readAnswer, WHOSE_TURN } from '../tools/rtg/table.mjs';

const said = (name, text, data) => ({ name, text, ...(data ? { data } : {}) });

test('"your turn" hands the bot the turn, at its start', () => {
  assert.deepEqual(readAnnouncement(said('Drew', 'ok, your turn'), 'bot'),
    { is_mine: true, phase: 'untap', land_played: false, attackers: [] });
});

test('an attack announcement draws the bot in to block', () => {
  const read = readAnnouncement(said('Drew', 'attacking with the Ogre'), 'bot');
  assert.equal(read.phase, 'combat');
  assert.deepEqual(read.attackers, ['an attacker'], 'unnamed still gets a block decision');
});

test('a bot opponent names its attackers in data, and those are used', () => {
  const read = readAnnouncement(said('other-bot', 'Attacking with two.', { attackers: ['Ogre', 'Goblin'] }), 'bot');
  assert.deepEqual(read.attackers, ['Ogre', 'Goblin']);
});

test('the bot ignores its own narration - it is not news', () => {
  assert.equal(readAnnouncement(said('bot', 'attacking with the Wolf'), 'bot'), null);
});

test('ordinary chat says nothing about the turn', () => {
  assert.equal(readAnnouncement(said('Drew', 'nice draw'), 'bot'), null);
});

test('a quiet table with a changed state gets asked - but only after a wait', () => {
  const base = { lastStateChangeAt: 1000, lastTalkAt: null, turnKnown: false, quietMs: 8000 };
  assert.equal(shouldAskTable({ ...base, now: 3000 }), false, 'not immediately - people are slower than state');
  assert.equal(shouldAskTable({ ...base, now: 9500 }), true);
});

test('no question when the bot already knows whose turn it is', () => {
  assert.equal(shouldAskTable({ lastStateChangeAt: 1000, lastTalkAt: null, turnKnown: true, now: 99999 }), false);
});

test('no question when somebody already spoke after the change', () => {
  assert.equal(shouldAskTable({ lastStateChangeAt: 1000, lastTalkAt: 1200, turnKnown: false, now: 99999 }), false);
});

test('the question is plain words a person can answer', () => {
  assert.match(WHOSE_TURN, /whose turn/i);
  assert.match(WHOSE_TURN, /attacking/i);
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
