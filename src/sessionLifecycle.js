/**
 * A guest's connection to the host, as a real machine instead of three
 * flags (`isReconnecting`, `reconnectAttempt`, `isSessionEnded`) whose
 * legal combinations and transitions were implicit in which functions
 * happened to check which flag.
 *
 * This borrows XState's SHAPE (explicit states, named events, one
 * transition table) rather than the `xstate` package itself: `src/` is
 * loaded straight by the browser with no bundler and no import map
 * (`index.html` has exactly one third-party browser dependency, PeerJS,
 * brought in as a CDN `<script>` global - never an ES import of an npm
 * package) - unlike `games/<game>/turn.yaml`, which `tools/jev/
 * machine.mjs` runs from Node, where `xstate` resolves normally. Also
 * unlike that layer: nobody but an engineer ever touches reconnect
 * logic, so there is no author-facing YAML to write either - only the
 * machine itself earns its keep here.
 *
 * `live`: connected (or host, which never reconnects the same way -
 * this machine only ever matters on the guest side).
 * `reconnecting`: the host was lost; `context.attempt` counts retries
 * (0 until the first is scheduled), read against `RECONNECT_DELAYS_MS`
 * by `main.js`'s own `scheduleReconnect` to decide the next delay or
 * give up - that backoff schedule is a presentation detail, kept where
 * it already lived, not duplicated into this machine.
 * `ended` (final): over, for good. Reachable from EITHER state - a
 * `session-ended` message from the host can arrive while still `live`,
 * not only after the retry budget is spent. Once here, every event is
 * ignored, which is what replaces the old `if (isSessionEnded) return;`
 * guards scattered through `main.js`.
 */
const TRANSITIONS = {
  live: {
    HOST_LOST: { target: 'reconnecting', assign: () => ({ attempt: 0 }) },
  },
  reconnecting: {
    RETRY: { assign: (context) => ({ attempt: context.attempt + 1 }) },
    RECONNECTED: { target: 'live', assign: () => ({ attempt: 0 }) },
  },
  // `ended` has no entry: a `final` state, matching every other state's
  // shape below (`ROOT_EVENTS` handles the one event ended never sees
  // again - itself).
};
const ROOT_EVENTS = { SESSION_ENDED: { target: 'ended' } };

/**
 * @returns {{ send: (event: { type: string }) => void,
 *   matches: (state: 'live'|'reconnecting'|'ended') => boolean,
 *   context: () => { attempt: number } }}
 */
export function createSessionLifecycle() {
  let state = 'live';
  let context = { attempt: 0 };

  return {
    send(event) {
      if (state === 'ended') return; // final: nothing reopens it
      const transition = ROOT_EVENTS[event.type] ?? TRANSITIONS[state][event.type];
      if (!transition) return; // not handled from the current state - a no-op, not an error
      if (transition.assign) context = transition.assign(context);
      if (transition.target) state = transition.target;
    },
    matches: (candidate) => state === candidate,
    context: () => context,
  };
}
