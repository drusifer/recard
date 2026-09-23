// US-128/D153: the question-file discipline every game's Jev player lives
// by (D147) - prose refers to state by path, never by value. Game-
// agnostic, so it lives in `tools/jev/` and each game's loader uses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInstruction, rejectLiterals, resolvePath } from '../tools/jev/strategyFile.mjs';

test('an instruction naming a card is rejected - the card belongs in state', () => {
  assert.match(checkInstruction('Should I discard the 5 of hearts?'), /card/i);
  assert.equal(checkInstruction('Would the opponent likely meld `candidates[0].card`?'), null);
});

test('an instruction carrying a number is rejected - the number belongs in state', () => {
  assert.match(checkInstruction('I can knock at 10 or fewer deadwood. Should I?'), /number/i);
  assert.equal(checkInstruction('Given `rules.knock_limit` and `me.deadwood`, should I knock?'), null);
});

test('a file is rejected naming WHERE its first literal is, so the author can find it', () => {
  assert.throws(() => rejectLiterals([['move', 'Pick one.'], ['move.criteria.discard', 'Throw the 5 of hearts.']]),
    /^Error: move\.criteria\.discard names a card/);
  assert.doesNotThrow(() => rejectLiterals([['move', 'Pick one of `candidates`.']]));
});

test('a path reaches into objects and indexed arrays, and a missing step is undefined', () => {
  const state = { me: { deadwood: 7 }, candidates: [{ card: 'Ace of spades' }, null] };
  assert.equal(resolvePath(state, 'me.deadwood'), 7);
  assert.equal(resolvePath(state, 'candidates[0].card'), 'Ace of spades');
  assert.equal(resolvePath(state, 'candidates[1].card'), undefined);
  assert.equal(resolvePath(state, 'opponent.hand_size'), undefined);
});
