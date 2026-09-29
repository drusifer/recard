// D163: a guest's connection to the host, as a real machine - so the
// legal states/transitions main.js's reconnect flags used to leave
// implicit (three flags, no single place saying which combinations were
// valid) are checked here directly, with no network and no timers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionLifecycle } from '../src/sessionLifecycle.js';

test('starts live, with no attempts made yet', () => {
  const session = createSessionLifecycle();
  assert.ok(session.matches('live'));
  assert.equal(session.context().attempt, 0);
});

test('losing the host moves to reconnecting, attempt reset to 0', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'HOST_LOST' });
  assert.ok(session.matches('reconnecting'));
  assert.equal(session.context().attempt, 0);
});

test('RETRY counts attempts up, one per call, staying in reconnecting', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'HOST_LOST' });
  session.send({ type: 'RETRY' });
  assert.equal(session.context().attempt, 1);
  session.send({ type: 'RETRY' });
  session.send({ type: 'RETRY' });
  assert.equal(session.context().attempt, 3);
  assert.ok(session.matches('reconnecting'));
});

test('RECONNECTED returns to live and clears the attempt count', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'HOST_LOST' });
  session.send({ type: 'RETRY' });
  session.send({ type: 'RETRY' });
  session.send({ type: 'RECONNECTED' });
  assert.ok(session.matches('live'));
  assert.equal(session.context().attempt, 0);
});

test('a second HOST_LOST while already reconnecting does not restart the count', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'HOST_LOST' });
  session.send({ type: 'RETRY' });
  session.send({ type: 'RETRY' });
  session.send({ type: 'HOST_LOST' }); // a stray/duplicate event - only `live` handles it
  assert.equal(session.context().attempt, 2, 'a second HOST_LOST is not handled mid-reconnect');
});

test('SESSION_ENDED reaches ended from live directly - a host can end it without ever being lost first', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'SESSION_ENDED' });
  assert.ok(session.matches('ended'));
});

test('SESSION_ENDED reaches ended from reconnecting too - the retry budget spent, or nothing to retry with', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'HOST_LOST' });
  session.send({ type: 'RETRY' });
  session.send({ type: 'SESSION_ENDED' });
  assert.ok(session.matches('ended'));
});

test('ended is terminal: nothing reopens it, in either direction', () => {
  const session = createSessionLifecycle();
  session.send({ type: 'SESSION_ENDED' });
  session.send({ type: 'HOST_LOST' });
  assert.ok(session.matches('ended'));
  session.send({ type: 'RECONNECTED' });
  assert.ok(session.matches('ended'));
});

test('an unhandled event is a no-op, not an error - e.g. RETRY while still live', () => {
  const session = createSessionLifecycle();
  assert.doesNotThrow(() => session.send({ type: 'RETRY' }));
  assert.ok(session.matches('live'));
});
