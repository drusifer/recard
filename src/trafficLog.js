/**
 * US-119: a bounded record of every protocol message a `Session` sends
 * or receives - transport observability, read by the harness MCP server
 * (`window.__recardHarness.traffic()`). Pure, so it is unit-tested here
 * rather than through PeerJS (see session.js's own header for why the
 * transport itself is not).
 *
 * Messages are stored by reference, not copied: every one already
 * crosses a data channel as a serialized snapshot, and nothing mutates a
 * sent or received message afterwards.
 */
export const DEFAULT_TRAFFIC_CAPACITY = 500;

export function createTrafficLog({ capacity = DEFAULT_TRAFFIC_CAPACITY, now = Date.now } = {}) {
  const buffer = [];
  let seq = 0;
  return {
    record(direction, peer, message) {
      seq += 1;
      buffer.push({ seq, at: now(), direction, peer, type: message?.type, message });
      if (buffer.length > capacity) buffer.shift();
    },
    /**
     * Oldest first; `type` filters before `limit` keeps the newest N.
     */
    entries({ type, limit } = {}) {
      const matching = type ? buffer.filter((entry) => entry.type === type) : [...buffer];
      return limit ? matching.slice(-limit) : matching;
    },
  };
}
