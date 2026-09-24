import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTalkLog, makeTalkMessage, MAX_TALK_TEXT, hostLine } from '../src/tableTalk.js';

test('makeTalkMessage: trims text, carries optional structured data, refuses an empty line', () => {
  assert.deepEqual(makeTalkMessage('  knock!  '), { type: 'talk', text: 'knock!' });
  assert.deepEqual(makeTalkMessage('Knock', { deadwood: 4 }), { type: 'talk', text: 'Knock', data: { deadwood: 4 } });
  assert.throws(() => makeTalkMessage(' '.repeat(3)), /empty/);
  assert.equal(makeTalkMessage('x'.repeat(MAX_TALK_TEXT + 50)).text.length, MAX_TALK_TEXT);
});

test('createTalkLog: host-stamped entries in arrival order, bounded to the newest', () => {
  let clock = 100;
  const log = createTalkLog({ limit: 2, now: () => clock });
  log.add({ from: 'p1', name: 'Ann', text: 'hi' });
  clock = 105;
  log.add({ from: 'p2', name: 'Bot (defensive)', text: 'Knock', data: { deadwood: 3 } });
  clock = 110;
  log.add({ from: 'p1', name: 'Ann', text: 'nice' });
  assert.deepEqual(log.entries().map(({ seq, at, name, text }) => ({ seq, at, name, text })), [
    { seq: 2, at: 105, name: 'Bot (defensive)', text: 'Knock' },
    { seq: 3, at: 110, name: 'Ann', text: 'nice' },
  ]);
  assert.deepEqual(log.entries()[0].data, { deadwood: 3 });
});

test('createTalkLog: a relayed entry keeps the host\'s seq and time, so every peer shows one order', () => {
  const log = createTalkLog({ now: () => 999 });
  log.add({ seq: 7, at: 50, from: 'p1', name: 'Ann', text: 'hi' });
  assert.deepEqual(log.entries(), [{ seq: 7, at: 50, from: 'p1', name: 'Ann', text: 'hi' }]);
});

// ---- dice: the HOST rolls, when it stamps the line ----


test('a "/roll" line is replaced by the host\'s own roll', () => {
  const line = hostLine({ type: 'talk', text: '/roll 2d6' }, () => 0.5);
  assert.equal(line.text, 'rolled 2d6: 4 + 4 = 8');
  assert.equal(line.data.kind, 'dice');
});

test('nobody can claim a roll: dice data sent with a line is dropped', () => {
  const claimed = hostLine({ type: 'talk', text: 'I rolled a 20!', data: { kind: 'dice', results: [[20]] } }, () => 0.5);
  assert.deepEqual(claimed, { type: 'talk', text: 'I rolled a 20!' });
});

test('an ordinary line passes through untouched', () => {
  const line = { type: 'talk', text: 'your turn', data: { kind: 'bot-decision' } };
  assert.equal(hostLine(line, () => 0.5), line);
});
