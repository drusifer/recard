// D159: how to stand up a table for a game is DATA (games/<game>/table.yaml),
// checked at load like every other game file (D154): a mistake names the
// file, the path in it, and the nearest good name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseTable, loadTable } from '../tools/jev/tableFile.mjs';
import { GAMES, gameDirectory } from '../tools/jev/games.mjs';

const players = ['rules', 'aggressive'];
const parse = (text) => parseTable(text, { file: 'games/x/table.yaml', players });

test('a table file needs only a preset - everything else is optional', () => {
  assert.deepEqual(parse('preset: Some Game'), {
    preset: 'Some Game', players: [], deal: null, score: null, steps: null,
    opening: { say: [], each_seat: [] }, seat_args: [],
  });
});

test('every field loads as written', () => {
  const table = parse([
    'preset: Some Game',
    'players: [rules, aggressive]',
    'deal: 7',
    'score: 20',
    'steps: 40',
    'opening:',
    '  say: [Roll for first]',
    '  each_seat: ["{name}, roll:", /roll d20]',
    'seat_args:',
    '  - { first: bot }',
    '  - { first: opponent, hands: 2 }',
  ].join('\n'));
  assert.deepEqual(table.players, ['rules', 'aggressive']);
  assert.equal(table.deal, 7);
  assert.equal(table.score, 20);
  assert.equal(table.steps, 40);
  assert.deepEqual(table.opening, { say: ['Roll for first'], each_seat: ['{name}, roll:', '/roll d20'] });
  assert.deepEqual(table.seat_args, [{ first: 'bot' }, { first: 'opponent', hands: 2 }]);
});

test('no preset is refused, naming the file', () => {
  assert.throws(() => parse('deal: 7'), /games\/x\/table\.yaml: preset: a table file needs `preset`/);
});

test('an unknown key is refused with the nearest real one', () => {
  assert.throws(() => parse('preset: G\ndael: 7'), /games\/x\/table\.yaml: dael: no key "dael" - did you mean "deal"\?/);
});

test('a player the game does not have is refused, by position', () => {
  assert.throws(() => parse('preset: G\nplayers: [rules, nope]'), /players\[1\]: no player "nope"/);
});

test('numbers must be whole and in range, and say which field', () => {
  assert.throws(() => parse('preset: G\ndeal: -1'), /deal: must be a whole number >= 0/);
  assert.throws(() => parse('preset: G\ndeal: seven'), /deal: must be a whole number >= 0/);
  assert.throws(() => parse('preset: G\nscore: 2.5'), /score: must be a whole number/);
  assert.throws(() => parse('preset: G\nsteps: 0'), /steps: must be a whole number >= 1/);
});

test('an opening is lines of text, and only the two known lists', () => {
  assert.throws(() => parse('preset: G\nopening: hello'), /opening: must be a map/);
  assert.throws(() => parse('preset: G\nopening:\n  say: hello'), /opening\.say: must be a list of text/);
  assert.throws(() => parse('preset: G\nopening:\n  each_seat: [1]'), /opening\.each_seat\[0\]: must be text/);
  assert.throws(() => parse('preset: G\nopening:\n  sey: [a]'), /opening\.sey: no key "sey" - did you mean "say"\?/);
});

test('seat_args is one map of flags per seat, of plain values', () => {
  assert.throws(() => parse('preset: G\nseat_args: {first: bot}'), /seat_args: must be a list/);
  assert.throws(() => parse('preset: G\nseat_args: [bot]'), /seat_args\[0\]: must be a map of flag: value/);
  assert.throws(() => parse('preset: G\nseat_args: [{first: [a]}]'), /seat_args\[0\]\.first: must be text or a number/);
});

test('a missing file says which game needs one', () => {
  assert.throws(() => loadTable('games/none/table.yaml', { players }), /games\/none\/table\.yaml: .*a game needs a table file to host a table/s);
});

test('a file is named as the author knows it - relative, like every other game-file error (D154) - even when loaded by absolute path', () => {
  const absolute = path.resolve('games/none/table.yaml');
  assert.throws(() => loadTable(absolute, { players }), (error) => error.message.startsWith('games/none/table.yaml: '));
});

test('every registered game ships a table file its own players satisfy', async () => {
  for (const [game, load] of Object.entries(GAMES)) {
    const { adapter } = await load();
    const table = loadTable(`${gameDirectory(game)}/table.yaml`, { players: Object.keys(adapter.strategies()) });
    assert.ok(table.preset, `${game} names a preset`);
    assert.ok(table.players.length >= 2, `${game} defaults to a table of bots that can play each other`);
  }
});
