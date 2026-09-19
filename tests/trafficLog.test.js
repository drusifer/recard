import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficLog } from '../src/trafficLog.js';

test('createTrafficLog: records direction, peer, message type and time, oldest first', () => {
  let clock = 1000;
  const log = createTrafficLog({ now: () => clock });
  log.record('out', 'host-peer', { type: 'action', action: { type: 'DRAW' } });
  clock = 1005;
  log.record('in', 'host-peer', { type: 'state', payload: {} });

  assert.deepEqual(log.entries().map(({ seq, at, direction, peer, type }) => ({ seq, at, direction, peer, type })), [
    { seq: 1, at: 1000, direction: 'out', peer: 'host-peer', type: 'action' },
    { seq: 2, at: 1005, direction: 'in', peer: 'host-peer', type: 'state' },
  ]);
  assert.deepEqual(log.entries()[0].message, { type: 'action', action: { type: 'DRAW' } });
});

test('createTrafficLog: bounded - keeps only the newest `capacity` entries, seq keeps counting', () => {
  const log = createTrafficLog({ capacity: 3 });
  for (let index = 0; index < 5; index++) log.record('in', 'p', { type: 'motion', index });
  assert.deepEqual(log.entries().map((entry) => entry.seq), [3, 4, 5]);
});

test('createTrafficLog: entries() filters by type, then takes the newest `limit`', () => {
  const log = createTrafficLog();
  log.record('in', 'p', { type: 'state' });
  log.record('in', 'p', { type: 'motion' });
  log.record('in', 'p', { type: 'state' });
  log.record('out', 'p', { type: 'state' });

  assert.deepEqual(log.entries({ type: 'state', limit: 2 }).map((entry) => entry.seq), [3, 4]);
  assert.deepEqual(log.entries({ limit: 1 }).map((entry) => entry.seq), [4]);
});
