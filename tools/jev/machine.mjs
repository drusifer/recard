// US-129/D154: a turn file becomes a running machine.
//
// A game's turn is an XState v5 statechart written in YAML: states,
// the events and Jev verdicts that move between them, and names from
// the library (guards, actions, actors) - never code. This file is the
// only place that turns that data into behaviour, so it is also the one
// place that checks it: every mistake an author can make in a turn file
// is refused HERE, at load, naming the file, the path in it, the bad
// name and the nearest good one (Smith, US-129 Gate 1 C1). Two pieces of
// plumbing are never the author's to remember (Gate 2): a state that
// invokes something is `busy`, and a state tagged `safe` is where a bot
// asked to leave actually leaves.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { setup, assign, fromPromise } from 'xstate';

/**
 * The state a bot goes to when it leaves; reserved.
 */
export const LEFT = 'left';

/**
 * @typedef {{ doc: string, fn?: Function, assign?: Function }} LibraryEntry
 * @typedef {{ guards: Record<string, LibraryEntry>, actions: Record<string, LibraryEntry>,
 *   actors: Record<string, LibraryEntry> }} Library
 */

/**
 * Loads a turn file from disk. See `parseTurn`.
 * @param {string} file
 * @param {{ library: Library, questions: string[] }} options
 */
export function loadTurn(file, options) {
  // Shown as the author knows it (games/<game>/turn.yaml), like every
  // other game-file error.
  return parseTurn(readFileSync(file, 'utf8'), { ...options, file: path.relative(process.cwd(), file) });
}

/**
 * Checks and compiles a turn file's text.
 * @param {string} text YAML
 * @param {{ file: string, library: Library, questions: string[] }} options
 * @returns {{ config: object, machine: import('xstate').AnyStateMachine }}
 */
export function parseTurn(text, { file, library, questions }) {
  const config = YAML.parse(text);
  const fail = (where, message) => { throw new Error(`${file}: ${where}: ${message}`); };
  if (!config?.states || !config.initial) fail('(top)', 'a turn file needs `initial` and `states`');
  if (Object.hasOwn(config.states, LEFT)) fail(`states.${LEFT}`, `"${LEFT}" is reserved for a bot that has left the table`);
  if (!Object.hasOwn(config.states, config.initial)) fail('initial', unknown('state', config.initial, Object.keys(config.states)));

  const checker = { fail, library, questions: new Set(questions), states: Object.keys(config.states) };
  for (const [name, state] of Object.entries(config.states)) checkState(checker, `states.${name}`, state);
  requireReachableSafeState(config, fail);

  const compiled = compile(config);
  return { config: compiled, machine: buildMachine(compiled, library) };
}

// ---- checking ----

/**
 * "no <kind> <name>" plus the nearest known name, or the known names.
 */
export function unknown(kind, name, known) {
  const nearest = nearestName(name, known);
  const hint = nearest ? `did you mean "${nearest}"?` : `known: ${known.join(', ') || 'none'}`;
  return `no ${kind} "${name}" - ${hint}`;
}

/**
 * The known name closest to `name`, when one is close enough to be a typo.
 */
function nearestName(name, known) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of known) {
    const distance = editDistance(String(name), candidate);
    if (distance < bestDistance) [best, bestDistance] = [candidate, distance];
  }
  return bestDistance <= Math.max(2, Math.floor(String(name).length / 3)) ? best : null;
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

const typeOf = (reference) => (typeof reference === 'string' ? reference : reference?.type);
const asList = (value) => (Array.isArray(value) ? value : [value]);

function checkName(checker, where, kind, reference) {
  const plural = `${kind}s`;
  const name = typeOf(reference);
  if (!Object.hasOwn(checker.library[plural], name)) checker.fail(where, unknown(kind, name, Object.keys(checker.library[plural])));
  checkQuestions(checker, `${where}.params`, reference?.params);
}

/**
 * Any `question` / `questions` a file names must be in the game's questions file.
 */
function checkQuestions(checker, where, parameters) {
  if (!parameters) return;
  const named = [
    ...(parameters.question === undefined ? [] : [['question', parameters.question]]),
    ...(parameters.questions ?? []).map((name, index) => [`questions[${index}]`, name]),
  ];
  for (const [key, name] of named) {
    if (!checker.questions.has(name)) checker.fail(`${where}.${key}`, unknown('question', name, [...checker.questions]));
  }
}

function checkActions(checker, where, actions) {
  if (actions === undefined) return;
  for (const [index, action] of asList(actions).entries()) {
    checkName(checker, Array.isArray(actions) ? `${where}[${index}]` : where, 'action', action);
  }
}

function checkTransitions(checker, where, transitions) {
  if (transitions === undefined) return;
  const list = asList(transitions);
  for (const [index, transition] of list.entries()) {
    const at = Array.isArray(transitions) ? `${where}[${index}]` : where;
    const target = typeof transition === 'string' ? transition : transition?.target;
    if (target !== undefined && !checker.states.includes(target)) checker.fail(at, unknown('state', target, checker.states));
    if (typeof transition === 'object' && transition.guard !== undefined) checkName(checker, `${at}.guard`, 'guard', transition.guard);
    if (typeof transition === 'object') checkActions(checker, `${at}.actions`, transition.actions);
  }
}

function checkState(checker, where, state) {
  if (state?.states) checker.fail(where, 'nested states are not supported in a turn file - keep phases flat');
  const events = Object.entries(state?.on ?? {});
  for (const [event, transitions] of events) checkTransitions(checker, `${where}.on.${event}`, transitions);
  const delays = Object.entries(state?.after ?? {});
  for (const [delay, transitions] of delays) checkTransitions(checker, `${where}.after.${delay}`, transitions);
  checkTransitions(checker, `${where}.always`, state?.always);
  checkActions(checker, `${where}.entry`, state?.entry);
  checkActions(checker, `${where}.exit`, state?.exit);
  if (state?.invoke) {
    const { invoke } = state;
    if (!Object.hasOwn(checker.library.actors, invoke.src)) checker.fail(`${where}.invoke.src`, unknown('actor', invoke.src, Object.keys(checker.library.actors)));
    checkQuestions(checker, `${where}.invoke.with`, invoke.with);
    checkTransitions(checker, `${where}.invoke.onDone`, invoke.onDone);
    checkTransitions(checker, `${where}.invoke.onError`, invoke.onError);
  }
}

function targetsOf(state) {
  const all = [
    ...Object.values(state.on ?? {}), ...Object.values(state.after ?? {}),
    state.always, state.invoke?.onDone, state.invoke?.onError,
  ];
  return all.filter((each) => each !== undefined).flatMap((each) => asList(each))
    .map((transition) => (typeof transition === 'string' ? transition : transition?.target)).filter(Boolean);
}

function requireReachableSafeState(config, fail) {
  const seen = new Set([config.initial]);
  const queue = [config.initial];
  while (queue.length > 0) {
    const name = queue.shift();
    const targets = targetsOf(config.states[name]);
    for (const next of targets) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const isSafe = [...seen].some((name) => (config.states[name].tags ?? []).includes('safe'));
  if (!isSafe) fail('states', 'no reachable state is tagged "safe", so a bot asked to leave never could - tag the states where leaving is harmless');
}

// ---- compiling ----

function compile(config) {
  const states = {};
  for (const [name, state] of Object.entries(config.states)) {
    const tags = [...(state.tags ?? [])];
    const compiled = { ...state, tags };
    if (state.invoke) {
      if (!tags.includes('busy')) tags.push('busy');
      const { with: parameters = {}, ...invoke } = state.invoke;
      compiled.invoke = { ...invoke, input: ({ context, event }) => ({ ...parameters, context, event }) };
    }
    if (tags.includes('safe')) {
      compiled.always = [{ guard: 'asked_to_leave', target: LEFT }, ...(state.always === undefined ? [] : asList(state.always))];
    }
    states[name] = compiled;
  }
  states[LEFT] = { type: 'final' };
  return {
    ...config,
    context: ({ input }) => ({ ...config.context, ...input, leaving: false }),
    on: { ...config.on, QUIT: { actions: 'mark_leaving' } },
    states,
  };
}

function buildMachine(config, library) {
  const guards = { asked_to_leave: ({ context }) => context.leaving === true };
  for (const [name, entry] of Object.entries(library.guards)) guards[name] = entry.fn;
  const actions = { mark_leaving: assign({ leaving: true }) };
  for (const [name, entry] of Object.entries(library.actions)) actions[name] = entry.assign ? assign(entry.assign) : entry.fn;
  const actors = {};
  for (const [name, entry] of Object.entries(library.actors)) actors[name] = fromPromise(entry.fn);
  return setup({ guards, actions, actors }).createMachine(config);
}
