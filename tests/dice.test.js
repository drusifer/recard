// Dice in table talk: "/roll [N]d[S] [xR]" - how many dice, how many
// sides, how many times - each with a sane default (one six-sided die,
// rolled once). The HOST rolls when it stamps the line, so a result can
// never be claimed by the sender - only produced by the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoll, rollDice, rollTalk, DICE_LIMITS } from '../src/dice.js';

test('the defaults are one six-sided die, rolled once', () => {
  assert.deepEqual(parseRoll('/roll'), { dice: 1, sides: 6, rolls: 1 });
});

test('dice, sides and rolls are each optional', () => {
  assert.deepEqual(parseRoll('/roll 2d6'), { dice: 2, sides: 6, rolls: 1 });
  assert.deepEqual(parseRoll('/roll d20'), { dice: 1, sides: 20, rolls: 1 });
  assert.deepEqual(parseRoll('/roll 3'), { dice: 3, sides: 6, rolls: 1 });
  assert.deepEqual(parseRoll('/roll 2d6 x3'), { dice: 2, sides: 6, rolls: 3 });
  assert.deepEqual(parseRoll('/roll x4'), { dice: 1, sides: 6, rolls: 4 });
  assert.deepEqual(parseRoll('  /ROLL 1D20  '), { dice: 1, sides: 20, rolls: 1 }, 'case and spacing do not matter');
});

test('a line that is not a roll is not one', () => {
  assert.equal(parseRoll('rolling for first?'), null);
  assert.equal(parseRoll('I /roll later'), null);
  assert.equal(parseRoll('/rolls'), null);
});

test('out-of-range or garbled rolls say what is allowed, instead of rolling', () => {
  assert.match(parseRoll('/roll 0d6').error, /dice must be 1 to 20/);
  assert.match(parseRoll('/roll 1d1').error, /sides must be 2 to 1000/);
  assert.match(parseRoll('/roll 2d6 x99').error, /rolls must be 1 to 10/);
  assert.match(parseRoll('/roll banana').error, /\/roll \[dice\]d\[sides\] \[x rolls\]/);
  assert.equal(DICE_LIMITS.dice.max, 20);
});

test('rolling uses the random source it is given, one value per die per roll', () => {
  const sequence = [0, 0.5, 0.999, 0.2, 0.4, 0.6];
  const random = () => sequence.shift();
  assert.deepEqual(rollDice({ dice: 2, sides: 6, rolls: 3 }, random), [[1, 4], [6, 2], [3, 4]]);
});

test('a roll line becomes the host\'s result: readable text plus the numbers as data', () => {
  const line = rollTalk('/roll 2d6 x2', () => 0.5);
  assert.equal(line.text, 'rolled 2d6 x2: 4 + 4 = 8 | 4 + 4 = 8');
  assert.deepEqual(line.data, { kind: 'dice', dice: 2, sides: 6, rolls: 2, results: [[4, 4], [4, 4]], totals: [8, 8] });
  assert.equal(rollTalk('/roll d20', () => 0).text, 'rolled 1d20: 1');
});

test('a bad roll is answered in words, and nothing is rolled', () => {
  const line = rollTalk('/roll 0d6', () => 0.5);
  assert.match(line.text, /^\/roll 0d6 - not rolled: dice must be 1 to 20/);
  assert.deepEqual(line.data, { kind: 'dice-error' });
});

test('an ordinary line is left alone', () => {
  assert.equal(rollTalk('hello', () => 0.5), null);
});

test('a roll too long to read in full is shown as its totals - numbers stay in data', () => {
  const line = rollTalk('/roll 20d1000 x10', () => 0.5, 500);
  assert.ok(line.text.length <= 500, `${line.text.length} characters`);
  assert.match(line.text, /^rolled 20d1000 x10 \(totals\): 10020 \| /);
  assert.equal(line.data.results.length, 10);
});
