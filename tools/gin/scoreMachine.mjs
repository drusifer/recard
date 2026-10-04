// A scoring file (`games/gin/scoring.yaml`) becomes a running machine -
// the scoring sibling of `tools/jev/machine.mjs`'s turn compiler, not a
// reuse of it: that compiler hard-requires a reachable `safe`-tagged
// state (`requireReachableSafeState` - "a bot asked to leave never
// could" otherwise) and reserves a `LEFT` final state, because a TURN
// is about one seated bot's own live moves, always interruptible. A
// scoring file has no bot, no seat, no mid-game "leave" to be safe
// about - it is the whole game's running total, computed after each
// hand already ended. Forcing a fake `safe` tag onto a scoring state
// just to satisfy that check would be a lie the file tells for the
// compiler's benefit, not a real property of what it describes.
//
// What DOES carry over, and does here too: every name a scoring file
// uses - guard, action, actor - is checked against its library at load,
// named errors with a "did you mean" (`unknown()`, imported from the
// turn compiler so the two tools read the same at a glance, not two
// independently-maintained wordings of the same idea).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { setup, assign, fromPromise } from 'xstate';
import { unknown } from '../jev/machine.mjs';

/**
 * @typedef {{ guards?: Record<string, {fn:Function}>, actions?: Record<string, {fn?:Function, assign?:Function}>,
 *   actors: Record<string, {fn:Function}> }} ScoreLibrary
 */

/**
 * Loads a scoring file from disk. See `parseScoring`.
 * @param {string} file
 * @param {{ library: ScoreLibrary }} options
 */
export function loadScoring(file, options) {
  return parseScoring(readFileSync(file, 'utf8'), { ...options, file: path.relative(process.cwd(), file) });
}

/**
 * Checks and compiles a scoring file's text.
 * @param {string} text YAML
 * @param {{ file: string, library: ScoreLibrary }} options
 * @returns {{ config: object, machine: import('xstate').AnyStateMachine }}
 */
/**
 * A single name or a list of them (how `entry`/`actions` may be
 * written), always as a list - `[]` when absent.
 */
const namesOf = (maybeList) => (maybeList === undefined ? [] : [maybeList].flat());

export function parseScoring(text, { file, library }) {
  const config = YAML.parse(text);
  const fail = (where, message) => { throw new Error(`${file}: ${where}: ${message}`); };
  if (!config?.states || !config.initial) fail('(top)', 'a scoring file needs `initial` and `states`');
  if (!Object.hasOwn(config.states, config.initial)) fail('initial', unknown('state', config.initial, Object.keys(config.states)));

  const guards = library.guards ?? {};
  const actions = library.actions ?? {};
  const stateNames = Object.keys(config.states);
  const checkNamed = (where, plural, table, name) => {
    if (name !== undefined && !Object.hasOwn(table, name)) fail(where, unknown(plural.slice(0, -1), name, Object.keys(table)));
  };
  const checkTarget = (where, target) => {
    if (target !== undefined && !stateNames.includes(target)) fail(where, unknown('state', target, stateNames));
  };
  function checkOnEvents(where, state) {
    const events = Object.entries(state.on ?? {});
    for (const [event, transition] of events) {
      const target = typeof transition === 'string' ? transition : transition.target;
      checkTarget(`${where}.on.${event}`, target);
    }
  }
  function checkAlways(where, state) {
    const transitions = namesOf(state.always);
    for (const transition of transitions) {
      checkTarget(`${where}.always`, transition.target ?? transition);
      if (transition.guard) checkNamed(`${where}.always.guard`, 'guards', guards, transition.guard);
    }
  }
  function checkInvoke(where, state) {
    if (!state.invoke) return;
    checkNamed(`${where}.invoke.src`, 'actors', library.actors, state.invoke.src);
    if (!state.invoke.onDone) return;
    checkTarget(`${where}.invoke.onDone`, state.invoke.onDone.target);
    for (const action of namesOf(state.invoke.onDone.actions)) checkNamed(`${where}.invoke.onDone.actions`, 'actions', actions, action);
  }

  for (const [name, state] of Object.entries(config.states)) {
    const where = `states.${name}`;
    for (const action of namesOf(state.entry)) checkNamed(`${where}.entry`, 'actions', actions, action);
    checkOnEvents(where, state);
    checkAlways(where, state);
    checkInvoke(where, state);
  }

  // Every invoked actor gets `{ context, event }` as its input - the
  // same auto-wiring `tools/jev/machine.mjs`'s own compiler does (a
  // turn file author never writes this either), so `gin_score` can read
  // the triggering HAND_OVER event's payload without a scoring file
  // ever having to say so itself.
  const compiledStates = Object.fromEntries(Object.entries(config.states).map(([name, state]) => [
    name,
    state.invoke ? { ...state, invoke: { ...state.invoke, input: ({ context, event }) => ({ context, event }) } } : state,
  ]));

  const machine = setup({
    guards: Object.fromEntries(Object.entries(guards).map(([name, entry]) => [name, entry.fn])),
    actions: Object.fromEntries(Object.entries(actions).map(([name, entry]) => [name, entry.assign ? assign(entry.assign) : entry.fn])),
    actors: Object.fromEntries(Object.entries(library.actors).map(([name, entry]) => [name, fromPromise(entry.fn)])),
  }).createMachine({
    ...config,
    states: compiledStates,
    // Same convenience `tools/jev/machine.mjs`'s own compiler gives turn
    // files: `createActor(machine, { input })` overlays onto the file's
    // own `context` defaults (`TARGET=`-style CLI overrides), rather
    // than every scoring file needing its own merge logic.
    context: ({ input }) => ({ ...config.context, ...input }),
  });
  return { config, machine };
}
