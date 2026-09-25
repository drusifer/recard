// US-131: every Jev game has a README generated from its own files, so the
// description and the statechart diagram cannot drift from what runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createMachine } from 'xstate';
import { mermaidOf, renderGameReadme, readmeFile } from '../tools/jev/gameReadme.mjs';
import { GAMES } from '../tools/jev/games.mjs';

const MACHINE = createMachine({
  initial: 'waiting',
  states: {
    waiting: { tags: ['safe'], on: { TABLE: 'looking' } },
    looking: {
      invoke: {
        src: 'look',
        onDone: [
          { target: 'moving', guard: { type: 'phase', params: { is: 'draw' } } },
          { target: 'waiting' },
        ],
      },
    },
    moving: { tags: ['move'], always: 'done' },
    done: { type: 'final' },
  },
});

test('the diagram starts at the initial state and ends at final states', () => {
  const diagram = mermaidOf(MACHINE);
  assert.match(diagram, /^stateDiagram-v2$/m);
  assert.match(diagram, /\[\*\] --> waiting/);
  assert.match(diagram, /done --> \[\*\]/);
});

test('every kind of transition becomes an edge, labelled by what triggers it', () => {
  const diagram = mermaidOf(MACHINE);
  assert.match(diagram, /waiting --> looking : TABLE/);
  assert.match(diagram, /looking --> moving : done \[phase is=draw\]/);
  assert.match(diagram, /looking --> waiting : done$/m);
  assert.match(diagram, /moving --> done : always/);
});

test('safe and move states are marked so a reader can see where a bot may leave', () => {
  const diagram = mermaidOf(MACHINE);
  assert.match(diagram, /class waiting safe/);
  assert.match(diagram, /class moving move/);
});

test('every game has a README, and it is exactly what its files generate - regenerate with `bobp make jev-readme`', () => {
  for (const game of Object.keys(GAMES)) {
    const written = readFileSync(new URL(`../games/${game}/README.md`, import.meta.url), 'utf8');
    assert.equal(written, renderGameReadme(game), `games/${game}/README.md is stale: run \`bobp make jev-readme\``);
  }
});

test('a README carries the description, the diagram, the players and the table setup', () => {
  for (const game of Object.keys(GAMES)) {
    const markdown = renderGameReadme(game);
    assert.match(markdown, /^# /m);
    assert.match(markdown, /```mermaid\nstateDiagram-v2/);
    assert.match(markdown, /## Players/);
    assert.match(markdown, new RegExp(`jev-table GAME=${game}`));
    assert.ok(readmeFile(game).endsWith(`games/${game}/README.md`));
  }
});

test('every state in every turn file says what it is for, so the README can explain the diagram', () => {
  for (const game of Object.keys(GAMES)) {
    const markdown = renderGameReadme(game);
    assert.doesNotMatch(markdown, /\(undocumented\)/, `${game}: a state has no description in turn.yaml`);
  }
});
