#!/usr/bin/env node
// Jev-judged anti-pattern verdicts for trace_annotate.py (direct user
// request: "update the tool to use jev for the rules" - every rule's
// detection in trace_annotate.py, not just the ones that need a cheap
// regex to find a CANDIDATE event: the actual yes/no of whether a
// candidate truly violates a rule's spirit is asked of Jev, same
// `judge.systemOne` call every other Jev player in this repo already
// makes (`tools/jev/decide.mjs`), just with one `noul` question per
// candidate instead of a whole turn's worth of game state.
//
// trace_annotate.py still does the CHEAP, MECHANICAL part itself (which
// events are even worth asking about - a grep match, a repeated file
// path, a script Write followed by a Bash run of it): that part is
// FACT, not judgment, and asking Jev "did this file get read 3 times"
// would be an API call to answer a question the trace already answers
// exactly. What was structural pattern-matching for "is this ACTUALLY
// the anti-pattern" is now a real judgment per candidate.
//
// Protocol: stdin is a JSON array of candidates -
//   { id: string|number, instructions: string, state: object }
// stdout is a JSON array of verdicts, same order -
//   { id, verdict: 'yes'|'no'|'unsure', noul: number }
// A judgment that errors (bad response shape, etc.) is reported as its
// own entry with `error` instead of `verdict` - one bad candidate does
// not sink the rest of the batch.
//
// No TYPESAFE_API_KEY, or any other startup failure, exits 1 with a
// one-line message on stderr - trace_annotate.py falls back to the
// mechanical-only result for every candidate rather than refusing to
// run at all (this is still meant to work for a project with no key
// configured, same as any other Jev player in this repo).
import { TypeSafeClient } from '@typesafe-ai/sdk';

// Inlined rather than imported from this project's own `tools/jev/
// escalate.mjs`: `agents/tools/` is the generic, project-agnostic half
// of bob-protocol (copied verbatim between sibling projects per the
// `trin` skill's own entry on this file) - it must not reach into a
// recard-specific path that another project copying this file won't
// have. Same threshold (`UNSURE=0.35`) as every other Jev player here.
const UNSURE = 0.35;
function verdictOf(noul, unsure = UNSURE) {
  if (noul >= 1 - unsure) return 'yes';
  if (noul <= unsure) return 'no';
  return 'unsure';
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function judgeOne(judge, candidate) {
  const { id, instructions, state } = candidate;
  try {
    const response = await judge.systemOne({ state, questions: { verdict: { type: 'noul', instructions } } });
    const noul = response.answers?.verdict?.noul;
    if (typeof noul !== 'number') throw new Error('no noul answer in response');
    return { id, verdict: verdictOf(noul), noul };
  } catch (error) {
    return { id, error: error.message };
  }
}

async function main() {
  let judge;
  try {
    judge = new TypeSafeClient();
  } catch (error) {
    process.stderr.write(`trace_judge: cannot start (${error.message}) - is TYPESAFE_API_KEY set?\n`);
    process.exit(1);
  }

  const text = await readStdin();
  let candidates;
  try {
    candidates = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`trace_judge: stdin was not valid JSON (${error.message})\n`);
    process.exit(1);
  }
  if (!Array.isArray(candidates)) {
    process.stderr.write('trace_judge: stdin must be a JSON array of candidates\n');
    process.exit(1);
  }

  // Sequential, not Promise.all: a batch can be large (one call per
  // candidate), and TypeSafe rate limits are per-account, not per-call -
  // same reason every other Jev player in this repo asks one thing at a
  // time rather than firing a burst.
  const results = [];
  for (const candidate of candidates) results.push(await judgeOne(judge, candidate));
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main();
