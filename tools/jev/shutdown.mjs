// D159: the two rules that keep `jev-table`'s Ctrl-C shutdown honest.
// Pure (the clock and the process table are passed in), so both are
// testable with no browser and no waiting.

/**
 * `function_`, run at most once: every caller - the SIGINT handler and the "every
 * bot finished" path alike - gets the SAME promise. Two shutdowns running
 * side by side both closing the table, the browser and the server was
 * observed to hang the exit.
 * `.started()` says whether it has been asked yet, so a caller can tell
 * "everyone left because Ctrl-C asked them to" from "they finished".
 * @template T
 * @param {() => Promise<T>} function_
 * @returns {(() => Promise<T>) & { started: () => boolean }}
 */
export function once(function_) {
  let promise = null;
  const run = () => {
    promise ??= function_();
    return promise;
  };
  run.started = () => promise !== null;
  return run;
}

/**
 * Waits until none of `pids` is alive, for at most `ms` - and returns the
 * moment they are all gone rather than sitting out the limit. A fixed
 * sleep after SIGTERM waited its whole length even when the bot had died
 * in milliseconds, which is exactly the "exit takes bonkers long" this
 * exists to end.
 * @param {{ pids: number[], isAlive: (pid: number) => boolean,
 *   sleep: (ms: number) => Promise<void>, ms: number, pollMs?: number }} input
 * @returns {Promise<number[]>} whoever is still standing at the limit
 */
export async function waitUntilDead({ pids, isAlive, sleep, ms, pollMs = 100 }) {
  let standing = pids.filter((pid) => isAlive(pid));
  for (let waited = 0; standing.length > 0 && waited < ms; waited += pollMs) {
    await sleep(pollMs);
    standing = standing.filter((pid) => isAlive(pid));
  }
  return standing;
}
