// US-120/D137: Gin Rummy strategies as ordered, typed rule sets. Each rule
// is a condition over the decision context (code facts + Jev judgments)
// and the decision it produces; the first rule that fires decides, and
// the trace records every rule tried. Policy stays in code - Jev only
// supplies judgments (judgments.mjs).

import { ginChance, ginOutsFor, KNOCK_LIMIT, unseenCards } from './rules.mjs';

/**
 * @typedef {import('./observe.mjs').GinObservation} GinObservation
 * @typedef {import('./rules.mjs').GinFacts} GinFacts
 * @typedef {import('./rules.mjs').DiscardOption} DiscardOption
 * @typedef {import('./judgments.mjs').GinJudgments} GinJudgments
 * @typedef {{ obs: GinObservation, facts: GinFacts, jev: GinJudgments|null }} DecisionContext
 * @typedef {{ type: 'draw', source: 'stock'|'discard' }} DrawDecision
 * @typedef {{ type: 'discard', cardId: string, declare: 'none'|'knock'|'gin' }} DiscardDecision
 * @typedef {DrawDecision|DiscardDecision} GinDecision
 * @typedef {{ name: string, phase: 'draw'|'discard', spec: string, when: (context: DecisionContext) => boolean, choose: (context: DecisionContext) => GinDecision }} GinRule
 * @typedef {{ name: string, description: string, usesJev: boolean, rules: GinRule[] }} GinStrategy
 */

const discard = (option, declare = 'none') => ({ type: 'discard', cardId: option.card.id, declare });

/**
 * The first item with the lowest score (so ties keep the list's order).
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} scoreOf
 * @returns {T}
 */
function argmin(items, scoreOf) {
  let best = items[0];
  for (const item of items) if (scoreOf(item) < scoreOf(best)) best = item;
  return best;
}

const OUTS_SLACK = 4;
const chaseCache = new WeakMap();

/**
 * The discard that keeps the most gin outs, among those within
 * `OUTS_SLACK` deadwood of the best - ties keep the least-deadwood
 * order. Shared by the knock-or-chase rule and the chasing discard, so
 * both reason about the same plan; computed once per decision.
 * @param {DecisionContext} context
 * @returns {{ option: DiscardOption, outs: number }}
 */
function chasePlan(context) {
  if (chaseCache.has(context)) return chaseCache.get(context);
  const best = context.facts.bestDiscard;
  const unseen = unseenCards(context.obs);
  let plan = { option: best, outs: context.facts.ginOuts };
  for (const option of context.facts.discards) {
    if (option === best || option.deadwoodAfter > best.deadwoodAfter + OUTS_SLACK) continue;
    const outs = ginOutsFor(context.obs.hand.filter((card) => card !== option.card), unseen);
    if (outs > plan.outs) plan = { option, outs };
  }
  chaseCache.set(context, plan);
  return plan;
}
const knockWithBest = (context) => discard(context.facts.bestDiscard, 'knock');

/**
 * How likely a discard is to feed the opponent: Jev's Noul when it was
 * asked about this card, else the code proxy - the share of the card's
 * possible 3-card melds still live (meldPaths / 6).
 */
const helpsOf = (context, option) => context.jev?.helps[option.card.id] ?? option.meldPaths / 6;

// ---- the rule catalog: draw rules -------------------------------------

export const takeUpcardIfMelds = () => ({
  name: 'takeUpcardIfMelds', phase: 'draw',
  spec: 'facts.upcard != null && facts.upcardMelds',
  when: (context) => context.facts.upcard !== null && context.facts.upcardMelds,
  choose: () => ({ type: 'draw', source: 'discard' }),
});

export const takeUpcardIfGain = (minGain = 5) => ({
  name: 'takeUpcardIfGain', phase: 'draw',
  spec: `facts.upcard != null && facts.upcardGain >= ${minGain}`,
  when: (context) => context.facts.upcard !== null && context.facts.upcardGain >= minGain,
  choose: () => ({ type: 'draw', source: 'discard' }),
});

export const drawStock = () => ({
  name: 'drawStock', phase: 'draw',
  spec: 'true',
  when: () => true,
  choose: () => ({ type: 'draw', source: 'stock' }),
});

// ---- discard rules: declaring -----------------------------------------

export const declareGin = () => ({
  name: 'declareGin', phase: 'discard',
  spec: 'facts.isGin  // also covers big gin: 11 melded always leaves a gin discard',
  when: (context) => context.facts.isGin,
  choose: (context) => discard(context.facts.bestDiscard, 'gin'),
});

export const knockWhenAble = () => ({
  name: 'knockWhenAble', phase: 'discard',
  spec: `facts.deadwood <= ${KNOCK_LIMIT}`,
  when: (context) => context.facts.canKnock,
  choose: knockWithBest,
});

export const knockEarlyStage = () => ({
  name: 'knockEarlyStage', phase: 'discard',
  spec: `facts.canKnock && facts.stage == 'early'  // obs.stockDrawn < 8`,
  when: (context) => context.facts.canKnock && context.facts.stage === 'early',
  choose: knockWithBest,
});

export const knockUnderThreat = (minThreat = 3) => ({
  name: 'knockUnderThreat', phase: 'discard',
  spec: `facts.canKnock && jev.threat >= ${minThreat}  // THREAT_LEVELS[${minThreat}]`,
  when: (context) => context.facts.canKnock && context.jev.threat >= minThreat,
  choose: knockWithBest,
});

export const knockLastChance = () => ({
  name: 'knockLastChance', phase: 'discard',
  spec: 'facts.canKnock && obs.stockCount <= 2  // a discard now ends a dead hand',
  when: (context) => context.facts.canKnock && context.facts.isLastChance,
  choose: knockWithBest,
});

export const knockIfGinUnlikely = (chaseChance = 0.25, draws = 3) => ({
  name: 'knockIfGinUnlikely', phase: 'discard',
  spec: `facts.canKnock && ginChance({ outs: chasePlan.outs, unseen: facts.unseen }, ${draws}) < ${chaseChance}`,
  when: (context) => context.facts.canKnock && ginChance({ outs: chasePlan(context).outs, unseen: context.facts.unseen }, draws) < chaseChance,
  choose: knockWithBest,
});

// ---- discard rules: choosing the card (always fire - a strategy's last rule) ----

export const discardLeastDeadwood = () => ({
  name: 'discardLeastDeadwood', phase: 'discard',
  spec: 'argmin(facts.discards, d => [d.deadwoodAfter, d.meldPaths, -value(d.card)])',
  when: () => true,
  choose: (context) => discard(context.facts.bestDiscard),
});

export const discardMaximizeOuts = () => ({
  name: 'discardMaximizeOuts', phase: 'discard',
  spec: `chasePlan.option  // argmax ginOuts(hand - d) over d.deadwoodAfter <= best + ${OUTS_SLACK}`,
  when: () => true,
  choose: (context) => discard(chasePlan(context).option),
});

export const discardByUtility = (weight = 8) => ({
  name: 'discardByUtility', phase: 'discard',
  spec: `argmin(facts.discards, d => d.deadwoodAfter + ${weight} * helps(d))  // helps = jev Noul, else meldPaths/6`,
  when: () => true,
  choose: (context) => discard(argmin(context.facts.discards, (option) => option.deadwoodAfter + weight * helpsOf(context, option))),
});

export const discardSafest = () => ({
  name: 'discardSafest', phase: 'discard',
  spec: 'argmin(facts.discards.filter(d => d.card.id in jev.helps), d => [jev.helps[d], d.deadwoodAfter])',
  when: () => true,
  choose: (context) => {
    const judged = context.facts.discards.filter((option) => Object.hasOwn(context.jev.helps, option.card.id));
    return discard(argmin(judged.length > 0 ? judged : context.facts.discards, (option) => helpsOf(context, option)));
  },
});

// ---- strategies ------------------------------------------------------------

/**
 * Lock in points: knock the moment deadwood allows (the most common expert default).
 */
export const knockEarly = ({ minGain = 5 } = {}) => ({
  name: 'knock-early',
  description: 'Knock as soon as deadwood is 10 or less; shed the highest deadwood. No Jev.',
  usesJev: false,
  rules: [takeUpcardIfMelds(), takeUpcardIfGain(minGain), drawStock(), declareGin(), knockWhenAble(), discardLeastDeadwood()],
});

/**
 * Chase gin only while it is realistic (>= 25% over 1-3 draws) and the opponent is not close.
 */
export const ginHunter = ({ chaseChance = 0.25, draws = 3, minThreat = 3 } = {}) => ({
  name: 'gin-hunter',
  description: `Hold for gin while the chance over ${draws} draws is at least ${chaseChance * 100}%; knock under threat or at the last chance. Hides its plan: takes the upcard only to meld.`,
  usesJev: true,
  rules: [takeUpcardIfMelds(), drawStock(), declareGin(), knockUnderThreat(minThreat), knockLastChance(), knockIfGinUnlikely(chaseChance, draws), discardMaximizeOuts()],
});

/**
 * AAAI MCCFR-informed: knock early; later only under threat or at the end; discard by own deadwood + opponent utility.
 */
export const equilibrium = ({ minThreat = 3, weight = 8, minGain = 5 } = {}) => ({
  name: 'equilibrium',
  description: 'Knock in the early stage (< 8 stock draws); after that only under threat or at the last chance. Discards minimise own deadwood + weighted opponent usefulness.',
  usesJev: true,
  rules: [takeUpcardIfMelds(), takeUpcardIfGain(minGain), drawStock(), declareGin(), knockEarlyStage(), knockUnderThreat(minThreat), knockLastChance(), discardByUtility(weight)],
});

/**
 * Safety first: knock whenever possible; never feed the opponent if Jev can tell.
 */
export const defensive = () => ({
  name: 'defensive',
  description: 'Knock whenever possible; otherwise throw the card Jev rates least useful to the opponent, even at some deadwood cost.',
  usesJev: true,
  rules: [takeUpcardIfMelds(), drawStock(), declareGin(), knockWhenAble(), discardSafest()],
});

export const STRATEGIES = Object.fromEntries([knockEarly(), ginHunter(), equilibrium(), defensive()].map((strategy) => [strategy.name, strategy]));

/**
 * Runs the strategy's rules for this phase in order; the first that fires decides.
 * @param {GinStrategy} strategy
 * @param {DecisionContext} context
 * @returns {{ decision: GinDecision, trace: Array<{ rule: string, fired: boolean }> }}
 */
export function decide(strategy, context) {
  if (context.obs.phase === 'discard' && strategy.usesJev && !context.jev) throw new Error(`${strategy.name} needs Jev judgments for a discard decision`);
  const trace = [];
  for (const rule of strategy.rules) {
    if (rule.phase !== context.obs.phase) continue;
    const fired = rule.when(context);
    trace.push({ rule: rule.name, fired });
    if (fired) return { decision: rule.choose(context), trace };
  }
  throw new Error(`${strategy.name} has no rule for the ${context.obs.phase} phase`);
}
