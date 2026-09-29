// The stale-timer tracker main.js's motion code shares (roster "moving",
// remote cursor, drag ghost). A fake clock (same injection main.js uses
// for the real one) makes the TTL itself testable with no real waiting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaleTracker } from '../src/staleTimers.js';

function fakeClock() {
  let now = 0;
  const pending = new Map();
  let nextId = 1;
  return {
    clock: {
      setTimeout(function_, ms) {
        const id = nextId++;
        pending.set(id, { at: now + ms, function_ });
        return id;
      },
      clearTimeout(id) { pending.delete(id); },
    },
    // Fires every timer due by `now + ms`, in the order they were set.
    advance(ms) {
      now += ms;
      const due = [...pending].filter(([, timer]) => timer.at <= now).toSorted((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of due) {
        pending.delete(id);
        timer.function_();
      }
    },
    pendingCount() { return pending.size; },
  };
}

test('going stale: refresh, then nothing more - onStale fires once, at the TTL', () => {
  const { clock, advance } = fakeClock();
  const stale = [];
  const tracker = createStaleTracker((id) => { stale.push(id); }, 100, clock);
  tracker.refresh('alice');
  advance(99);
  assert.deepEqual(stale, []);
  advance(1);
  assert.deepEqual(stale, ['alice']);
});

test('refreshing again before the TTL restarts the clock instead of stacking a second callback', () => {
  const { clock, advance, pendingCount } = fakeClock();
  const stale = [];
  const tracker = createStaleTracker((id) => { stale.push(id); }, 100, clock);
  tracker.refresh('alice');
  advance(60);
  tracker.refresh('alice');
  advance(60);
  assert.deepEqual(stale, [], 'the first timeout was replaced, not left to also fire at 100');
  assert.equal(pendingCount(), 1);
  advance(40);
  assert.deepEqual(stale, ['alice']);
});

test('cancel stops tracking with no callback - an explicit stop is not a stale event', () => {
  const { clock, advance } = fakeClock();
  const stale = [];
  const tracker = createStaleTracker((id) => { stale.push(id); }, 100, clock);
  tracker.refresh('alice');
  tracker.cancel('alice');
  advance(1000);
  assert.deepEqual(stale, []);
});

test('fireNow runs the callback immediately and cancels the pending timeout', () => {
  const { clock, advance } = fakeClock();
  const stale = [];
  const tracker = createStaleTracker((id) => { stale.push(id); }, 100, clock);
  tracker.refresh('alice');
  tracker.fireNow('alice');
  assert.deepEqual(stale, ['alice']);
  advance(1000);
  assert.deepEqual(stale, ['alice'], 'the cancelled timeout does not fire a second time');
});

test('each id is tracked independently - one going stale does not touch another', () => {
  const { advance, clock } = fakeClock();
  const stale = [];
  const tracker = createStaleTracker((id) => { stale.push(id); }, 100, clock);
  tracker.refresh('alice');
  advance(50);
  tracker.refresh('bob');
  advance(50);
  assert.deepEqual(stale, ['alice'], 'alice was due at 100, bob refreshed at 50 so is due at 150');
  advance(50);
  assert.deepEqual(stale, ['alice', 'bob']);
});
