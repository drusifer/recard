// US-129/D154: a turn file is loaded, checked and compiled before any
// bot sits down. Every mistake an author can make in one is refused AT
// LOAD, naming the file, where in it, the bad name and the nearest good
// one (Smith Gate 1 C1) - never discovered by a bot stuck at a table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, waitFor } from 'xstate';
import { parseTurn } from '../tools/jev/machine.mjs';

const noop = { doc: 'test entry', fn: () => {} };
const library = {
  guards: { verdict: { doc: 'the verdict is params.is', fn: ({ event }, parameters) => event.output === parameters.is } },
  actions: { say: noop },
  actors: { judge: { doc: 'asks a question', fn: async ({ input }) => input.answer ?? 'yes' } },
};
const questions = ['their_turn_is_over', 'step'];
const load = (text) => parseTurn(text, { file: 'games/test/turn.yaml', library, questions });

const GOOD = `
initial: waiting
states:
  waiting:
    tags: [safe]
    on:
      TABLE: judging
  judging:
    invoke:
      src: judge
      with: { question: their_turn_is_over }
      onDone:
        - { target: mine, guard: { type: verdict, params: { is: 'yes' } } }
        - { target: waiting }
  mine:
    tags: [move]
    on:
      STEP: { target: waiting, actions: [say] }
`;

test('a correct turn file loads into a machine', () => {
  const { machine } = load(GOOD);
  assert.equal(machine.config.initial, 'waiting');
});

test('a transition to a state that does not exist is refused, with the nearest name', () => {
  assert.throws(() => load(GOOD.replace('TABLE: judging', 'TABLE: judgin')),
    /games\/test\/turn\.yaml: states\.waiting\.on\.TABLE: no state "judgin" - did you mean "judging"\?/);
});

test('an unknown guard, action or actor is refused, naming what the library does have', () => {
  assert.throws(() => load(GOOD.replace('type: verdict', 'type: verdic')),
    /states\.judging\.invoke\.onDone\[0\]\.guard: no guard "verdic" - did you mean "verdict"\?/);
  assert.throws(() => load(GOOD.replace('actions: [say]', 'actions: [shout]')),
    /states\.mine\.on\.STEP\.actions\[0\]: no action "shout"/);
  assert.throws(() => load(GOOD.replace('src: judge', 'src: jugde')),
    /states\.judging\.invoke\.src: no actor "jugde" - did you mean "judge"\?/);
});

test('a question the questions file does not have is refused', () => {
  assert.throws(() => load(GOOD.replace('question: their_turn_is_over', 'question: their_turn_over')),
    /states\.judging\.invoke\.with\.question: no question "their_turn_over" - did you mean "their_turn_is_over"\?/);
});

test('a state that invokes is busy without the author saying so (Gate 2)', () => {
  const { machine } = load(GOOD);
  assert.ok(machine.config.states.judging.tags.includes('busy'));
  assert.ok(!(machine.config.states.waiting.tags ?? []).includes('busy'));
});

test('with no reachable safe state, the file is refused - a bot that cannot leave (Gate 2)', () => {
  assert.throws(() => load(GOOD.replace('tags: [safe]', 'tags: []')), /no reachable state is tagged "safe"/);
});

test('asked to leave, the machine leaves from a safe state and nowhere else', async () => {
  const { machine } = load(GOOD);
  const actor = createActor(machine).start();
  actor.send({ type: 'TABLE' }); // -> judging -> mine (not safe)
  await waitFor(actor, (snapshot) => !snapshot.hasTag('busy'));
  actor.send({ type: 'QUIT' });
  assert.equal(actor.getSnapshot().value, 'mine', 'a move in progress is not abandoned');
  actor.send({ type: 'STEP' }); // back to waiting, which is safe
  assert.equal(actor.getSnapshot().status, 'done');
});

test('`with` reaches the actor as input, alongside the machine context', async () => {
  const seen = [];
  const spying = { ...library, actors: { judge: { doc: 'spy', fn: async ({ input }) => { seen.push(input); return 'no'; } } } };
  const { machine } = parseTurn(GOOD.replace('initial: waiting', 'initial: waiting\ncontext: { steps: 3 }'),
    { file: 'x.yaml', library: spying, questions });
  const actor = createActor(machine).start();
  actor.send({ type: 'TABLE' });
  await waitFor(actor, (snapshot) => !snapshot.hasTag('busy'));
  assert.equal(seen[0].question, 'their_turn_is_over');
  assert.equal(seen[0].context.steps, 3);
});
