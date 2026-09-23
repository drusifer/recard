// US-127/D151/AC9-AC11: the bot is drawn in by what the table SAYS, and
// asks out loud when the table says nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnnouncement } from '../tools/rtg/table.mjs';
import { readAnswer } from '../tools/jev/table.mjs';

const said = (name, text, data) => ({ name, text, ...(data && { data }) });

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

test('the answers people actually give to a yes/no are read (C3)', () => {
  assert.equal(readAnswer({ text: "it's your turn, go ahead" }), true, 'the live stall\'s answer');
  assert.equal(readAnswer({ text: 'yes' }), true);
  assert.equal(readAnswer({ text: 'no, not yet' }), false);
});
