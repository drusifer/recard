import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gameMasterAddress, gameMasterName, parseInvite, inviteStatusText, hasArrived, runInvite,
  INVITE_ANSWER_MS, INVITE_ARRIVAL_MS,
} from '../src/gameMasterInvite.js';

test('a game master address is its lowercased name under one prefix (D175)', () => {
  assert.equal(gameMasterAddress('patch'), 'recard-gm-patch');
  assert.equal(gameMasterAddress('Patch'), gameMasterAddress('patch'), 'C3: capitalisation never changes who you reach');
});

test('a game master name is 1-32 of [a-z0-9-] after lowercasing; anything else is null', () => {
  assert.equal(gameMasterName('Pi-Patch-2'), 'pi-patch-2');
  for (const bad of ['', 'Game Master', 'patch!', 'x'.repeat(33), undefined]) {
    assert.equal(gameMasterName(bad), null, JSON.stringify(bad));
  }
  assert.equal(gameMasterName('x'.repeat(32)), 'x'.repeat(32));
});

test('parseInvite: a name, a usage reply, or not an invite at all', () => {
  assert.deepEqual(parseInvite('/invite patch'), { name: 'patch' });
  assert.deepEqual(parseInvite('  /invite   Patch  '), { name: 'patch' });
  assert.ok(parseInvite('/invite').usage, 'C3: a bare /invite gets a usage line');
  assert.ok(parseInvite('/invite two words').usage);
  assert.ok(parseInvite('/invite bad!name').usage);
  assert.equal(parseInvite('I will invite patch later'), null, 'ordinary chat never summons anything');
  assert.equal(parseInvite('/invitepatch'), null);
  assert.equal(parseInvite('/roll 2d6'), null);
});

test('every status reads as a line, and the failures say how to recover (Gate 2)', () => {
  assert.match(inviteStatusText('inviting', 'patch'), /inviting patch/);
  assert.match(inviteStatusText('accepted', 'patch'), /patch/);
  assert.match(inviteStatusText('no-answer', 'patch'), /--name patch/);
  assert.match(inviteStatusText('never-arrived', 'patch'), /same Recard version/);
  assert.throws(() => inviteStatusText('bogus', 'patch'));
});

test('the bounds are the ones D175 states', () => {
  assert.equal(INVITE_ANSWER_MS, 15_000);
  assert.equal(INVITE_ARRIVAL_MS, 90_000);
});

test('hasArrived: a jev-ready from that name, said after the given seq', () => {
  const talk = [
    { seq: 1, name: 'patch', data: { kind: 'jev-ready' } },
    { seq: 5, name: 'Bob', data: { kind: 'jev-ready' } },
    { seq: 7, name: 'Patch', text: 'hello' },
  ];
  assert.equal(hasArrived(talk, 'patch', 2), false, 'an earlier jev-ready is a previous visit, not this one');
  assert.equal(hasArrived([...talk, { seq: 9, name: 'Patch', data: { kind: 'jev-ready' } }], 'patch', 2), true);
});

/**
 * A clock whose timers fire only when the test says so.
 */
function manualClock() {
  const timers = [];
  return {
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); },
    fire: () => {
      for (const { callback } of timers) callback();
      timers.length = 0;
    },
    timers,
  };
}

test('runInvite: inviting, then no-answer when nobody picks up', async () => {
  const posted = [];
  await runInvite({ name: 'patch', post: (status) => { posted.push(status); }, dial: async () => 'no-answer',
    arrived: () => false, timings: { answerMs: 1, arrivalMs: 1 }, clock: manualClock() });
  assert.deepEqual(posted, ['inviting', 'no-answer']);
});

test('runInvite: accepted, then never-arrived only if no jev-ready by the arrival bound', async () => {
  for (const [arrives, expected] of [[false, ['inviting', 'accepted', 'never-arrived']], [true, ['inviting', 'accepted']]]) {
    const posted = [];
    const clock = manualClock();
    let dialledWith;
    await runInvite({ name: 'patch', post: (status) => { posted.push(status); }, dial: async (ms) => { dialledWith = ms; return 'accepted'; },
      arrived: () => arrives, timings: { answerMs: 15, arrivalMs: 90 }, clock });
    assert.equal(dialledWith, 15, 'the answer bound is what the dial waits');
    assert.deepEqual(clock.timers.map(({ ms }) => ms), [90]);
    clock.fire();
    assert.deepEqual(posted, expected);
  }
});
