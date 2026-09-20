// US-123/D144: colours are derived from the replicated roster, so every
// screen agrees without colour ever going on the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForIndex, colorForPlayer, PLAYER_COLORS } from '../src/playerColors.js';

const roster = (...ids) => ids.map((id) => ({ id }));

test('each seat has its own colour, and they are all distinct', () => {
  const used = PLAYER_COLORS.map((_, index) => colorForIndex(index));
  assert.equal(new Set(used).size, PLAYER_COLORS.length);
});

test('the same person is the same colour on every screen - it comes from the shared roster', () => {
  const players = roster('alice', 'bob', 'carol');
  assert.equal(colorForPlayer(players, 'bob'), colorForPlayer([...players], 'bob'));
  assert.notEqual(colorForPlayer(players, 'alice'), colorForPlayer(players, 'bob'));
});

test('more people than colours wrap rather than fading into near-duplicates', () => {
  assert.equal(colorForIndex(PLAYER_COLORS.length), PLAYER_COLORS[0]);
});

test('someone not on the roster has no colour, rather than an invented one', () => {
  assert.equal(colorForPlayer(roster('alice'), 'ghost'), null);
  assert.equal(colorForPlayer(undefined, 'alice'), null);
});

test('a spectator has a colour too - they move cards like anyone else (US-124)', () => {
  const players = [{ id: 'alice' }, { id: 'sam', role: 'spectator' }];
  assert.ok(colorForPlayer(players, 'sam'));
});
