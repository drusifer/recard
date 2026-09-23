// US-128/D153: one decision, for any game's Jev player (unifies Gin's
// read-then-move, D150, and RtG's step-then-verify, D151).
//
//   1. read   (optional) - questions whose answers become STATE for the
//                          choice; a separate request, because questions
//                          in one request cannot see each other.
//   2. choice            - one Choice over the options the GAME offers.
//                          An option not offered cannot be chosen at any
//                          confidence: that is the real constraint.
//   3. verify (optional) - Nouls on the pick. A clear no blocks it; the
//                          unsure ones are escalated once, together.
//
// What an unconvinced answer becomes is the game's escalation policy
// (`escalate.mjs`), passed in - not decided here.

import { verdictOf, UNSURE } from './escalate.mjs';

/**
 * @typedef {{ questions: object, into: (state: object, answers: object) => object }} ReadStep
 * @typedef {{ key: string, instructions: string, criteria: Record<string, string> }} ChoiceStep
 * @typedef {(option: string, state: object) => ({ state: object, questions: object, question: string }|null)} VerifyStep
 */

/**
 * @param {{ judge: { systemOne: Function }, state: object, read?: ReadStep, choice: ChoiceStep,
 *   floor?: number, verify?: VerifyStep, escalation: import('./escalate.mjs').EscalationPolicy,
 *   fallback: string, unsure?: number }} input
 */
export async function decide({ judge, state, read, choice, floor = 0, verify, escalation, fallback, unsure = UNSURE }) {
  const readResponse = read ? await judge.systemOne({ state, questions: read.questions }) : null;
  const readAnswers = read ? readResponse.answers ?? {} : null;
  const withRead = read ? read.into(state, readAnswers) : state;

  const question = { type: 'choice', instructions: choice.instructions, criteria: choice.criteria };
  const response = await judge.systemOne({ state: withRead, questions: { [choice.key]: question } });
  const answer = response.answers?.[choice.key];
  const isBelowFloor = (answer?.confidence ?? 0) < floor;
  const isOffered = Boolean(answer?.choice) && Object.hasOwn(choice.criteria, answer.choice);
  const isAccepted = !isBelowFloor || await acceptedBy(escalation, choice.instructions);
  const picked = isOffered && isAccepted ? answer.choice : fallback;

  const result = {
    picked, option: picked, state: withRead, model: response.model ?? null, question,
    answers: { read: readAnswers, choice: answer ?? null, verify: null },
    confidence: answer?.confidence ?? null, distribution: answer?.probabilities ?? null, belowFloor: isBelowFloor,
    checks: {}, asked: null, blocked: null,
  };
  const check = verify?.(picked, withRead);
  if (!check) return result;

  const verifyResponse = await judge.systemOne({ state: check.state, questions: check.questions });
  const verdicts = verifyResponse.answers ?? {};
  result.answers.verify = verdicts;
  const uncertain = [];
  for (const [rule, verdict] of Object.entries(verdicts)) {
    result.checks[rule] = verdict.noul;
    const reading = verdictOf(verdict.noul, unsure);
    if (reading === 'no') return blockedBy(result, rule, 'the rule says no', fallback);
    if (reading === 'unsure') uncertain.push(rule);
  }
  if (uncertain.length === 0) return result;
  const outcome = await escalation.resolve(check.question);
  result.asked = { rules: uncertain, answered: outcome.answered };
  return outcome.accepted ? result : blockedBy(result, uncertain[0], outcome.why, fallback);
}

async function acceptedBy(escalation, question) {
  const outcome = await escalation.resolve(question);
  return outcome.accepted;
}

function blockedBy(result, rule, why, fallback) {
  return { ...result, option: fallback, blocked: { rule, why } };
}
