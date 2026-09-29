// Three call sites in main.js (the roster's "moving" flag, a remote
// cursor, a drag ghost) each restarted a per-player timeout that runs a
// cleanup callback when nothing refreshes it before it expires - the
// same shape, three copies of `Map` + `setTimeout`/`clearTimeout`. One
// factory now.
//
// The clock is injected (`setTimeout`/`clearTimeout`), same as
// `tools/jev/shutdown.mjs`'s own pattern, so this is testable with no
// real waiting - unlike the three copies it replaces, which had no test
// at all.

/**
 * @param {(id: string) => void} onStale called when `id` goes stale -
 *   nothing refreshed it within `ttlMs` of the last `refresh(id)`
 * @param {number} ttlMs
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [clock]
 */
export function createStaleTracker(onStale, ttlMs, clock = globalThis) {
  const timers = new Map();

  function cancel(id) {
    clock.clearTimeout(timers.get(id));
    timers.delete(id);
  }

  return {
    /**
    Restarts `id`'s timeout; `onStale(id)` fires in `ttlMs` unless refreshed again first.
    */
    refresh(id) {
      cancel(id);
      timers.set(id, clock.setTimeout(() => { timers.delete(id); onStale(id); }, ttlMs));
    },
    /**
    Stops tracking `id` with no callback - the sender said outright that it stopped.
    */
    cancel,
    /**
    Stops tracking `id` and runs `onStale(id)` now, same effect as letting it expire.
    */
    fireNow(id) {
      cancel(id);
      onStale(id);
    },
  };
}
